/**
 * Resilient fetch wrapper for Google mailbox APIs.
 *
 * Applies IPv4-first DNS and a connect timeout so Gmail/Calendar OAuth and sync calls fail
 * fast with actionable network errors instead of hanging on IPv6 or slow routes.
 *
 * Responsibilities:
 * - `googleFetch` — timed fetch with IPv4-first DNS and wrapped network errors
 *
 * Security:
 * - Callers must not log full Authorization headers or response bodies containing tokens.
 */

import dns from "node:dns";

const GOOGLE_FETCH_TIMEOUT_MS = 30_000;

let dnsOrderConfigured = false;

const ensureIpv4First = (): void => {
  if (dnsOrderConfigured) return;
  dnsOrderConfigured = true;
  try {
    dns.setDefaultResultOrder("ipv4first");
  } catch {
    // unavailable on older Node builds
  }
};

const networkErrorCode = (err: unknown): string | undefined => {
  const cause = err instanceof Error && "cause" in err ? err.cause : err;
  if (cause && typeof cause === "object" && "code" in cause) {
    return String((cause as { code?: unknown }).code);
  }
  return undefined;
};

const wrapGoogleFetchError = (err: unknown, context: string): Error => {
  if (err instanceof Error && err.name === "AbortError") {
    return new Error(
      `${context}: request timed out after ${GOOGLE_FETCH_TIMEOUT_MS / 1000}s. Retry the connection.`
    );
  }

  const code = networkErrorCode(err);
  if (code === "ETIMEDOUT" || code === "ECONNREFUSED" || code === "ENOTFOUND") {
    return new Error(
      `${context}: could not reach Google (${code}). Check internet, VPN/firewall, then retry.`
    );
  }

  if (err instanceof TypeError && err.message === "fetch failed") {
    return new Error(
      `${context}: network request failed${code ? ` (${code})` : ""}. Check internet connection and retry.`
    );
  }

  return err instanceof Error ? err : new Error(`${context}: ${String(err)}`);
};

/** Outbound fetch to Google APIs with IPv4-first DNS and a connect timeout. */
export const googleFetch = async (url: string, init?: RequestInit): Promise<Response> => {
  ensureIpv4First();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GOOGLE_FETCH_TIMEOUT_MS);
  const hostname = new URL(url).hostname;
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    throw wrapGoogleFetchError(err, `Google API request to ${hostname}`);
  } finally {
    clearTimeout(timeout);
  }
};
