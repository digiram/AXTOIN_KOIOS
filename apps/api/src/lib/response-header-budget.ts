/**
 * Response-header byte budget guard.
 *
 * **Why:** some hosts (shared hosting / certain reverse proxies — e.g. Hostinger) enforce a hard
 * **per-response header size limit** and silently drop or 5xx responses whose serialized headers exceed
 * it. Bloated headers (verbose CSP, large cookies, accumulated custom headers) are the usual cause.
 *
 * This module keeps the API honest:
 * - {@link measureResponseHeaderBytes} — pure helper used by the runtime hook **and** the CI guard test.
 * - {@link createResponseHeaderBudgetHook} — Fastify `onSend` hook that logs a warning when a response's
 *   headers exceed the budget, so bloat surfaces in logs/tests instead of as opaque host failures.
 *
 * The hook is intentionally **warn-only**: stripping security headers or failing closed would turn header
 * bloat into a worse outage. Real enforcement is keeping headers lean (compact CSP, small cookies) plus the
 * guard test in `test/response-header-budget.test.ts` that fails CI if the live app regresses.
 */

import type { FastifyReply, FastifyRequest } from "fastify";

/** Conservative default; many shared hosts cap response headers around 8 KB. Override via env. */
export const DEFAULT_RESPONSE_HEADER_MAX_BYTES = 8 * 1024;

/** Floor so a misconfigured env value can never disable the guard with an absurdly small/invalid number. */
const MIN_RESPONSE_HEADER_MAX_BYTES = 512;

type HeaderValue = number | string | string[] | undefined;

export const resolveResponseHeaderMaxBytes = (
  raw: string | undefined = process.env.RESPONSE_HEADER_MAX_BYTES
): number => {
  const trimmed = raw?.trim();
  if (!trimmed) return DEFAULT_RESPONSE_HEADER_MAX_BYTES;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < MIN_RESPONSE_HEADER_MAX_BYTES) {
    return DEFAULT_RESPONSE_HEADER_MAX_BYTES;
  }
  return Math.floor(parsed);
};

/** Bytes a single `Name: value\r\n` header line contributes on the wire. */
const headerLineBytes = (name: string, value: string): number =>
  Buffer.byteLength(name) + 2 /* ": " */ + Buffer.byteLength(value) + 2 /* CRLF */;

export type ResponseHeaderMeasurement = {
  totalBytes: number;
  largest: { name: string; bytes: number } | null;
};

/**
 * Approximate serialized byte size of a set of response headers. Array values (e.g. `set-cookie`) are
 * counted as one line per entry, mirroring how they are emitted on the wire.
 */
export const measureResponseHeaderBytes = (
  headers: Record<string, HeaderValue>
): ResponseHeaderMeasurement => {
  let totalBytes = 0;
  let largest: { name: string; bytes: number } | null = null;

  for (const [name, raw] of Object.entries(headers)) {
    if (raw === undefined) continue;
    const values = Array.isArray(raw) ? raw : [String(raw)];
    let bytesForHeader = 0;
    for (const value of values) {
      bytesForHeader += headerLineBytes(name, String(value));
    }
    totalBytes += bytesForHeader;
    if (!largest || bytesForHeader > largest.bytes) {
      largest = { name, bytes: bytesForHeader };
    }
  }

  return { totalBytes, largest };
};

/**
 * Build the `onSend` hook. Added at the root Fastify scope so it applies to every response.
 */
export const createResponseHeaderBudgetHook = (
  maxBytes: number = resolveResponseHeaderMaxBytes()
) => {
  return async function responseHeaderBudgetHook(
    request: FastifyRequest,
    reply: FastifyReply,
    payload: unknown
  ): Promise<unknown> {
    const { totalBytes, largest } = measureResponseHeaderBytes(
      reply.getHeaders() as Record<string, HeaderValue>
    );
    if (totalBytes > maxBytes) {
      request.log.warn({
        msg: "Response headers exceed configured byte budget — some hosts reject bloated headers (keep CSP/cookies lean)",
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        totalHeaderBytes: totalBytes,
        budgetBytes: maxBytes,
        largestHeader: largest?.name,
        largestHeaderBytes: largest?.bytes
      });
    }
    return payload;
  };
};
