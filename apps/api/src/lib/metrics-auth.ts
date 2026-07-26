/**
 * Production `/metrics` is disabled unless `METRICS_BEARER_TOKEN` is set; callers must send `Authorization: Bearer …`.
 */

import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

const isProduction = (): boolean => process.env.NODE_ENV?.trim().toLowerCase() === "production";

export const metricsRouteEnabled = (): boolean => {
  if (!isProduction()) return true;
  return (process.env.METRICS_BEARER_TOKEN?.trim() ?? "").length > 0;
};

const bearerTokenFromHeader = (header: string | undefined): string | undefined => {
  const raw = header?.trim() ?? "";
  if (!raw.toLowerCase().startsWith("bearer ")) return undefined;
  const token = raw.slice(7).trim();
  return token.length > 0 ? token : undefined;
};

const tokensMatch = (provided: string, expected: string): boolean => {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

export const requireMetricsAuth = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  if (!isProduction()) return;

  const expected = process.env.METRICS_BEARER_TOKEN?.trim() ?? "";
  if (!expected) {
    return reply.code(404).send({ error: "not_found" });
  }

  const provided = bearerTokenFromHeader(request.headers.authorization);
  if (!provided || !tokensMatch(provided, expected)) {
    return reply.code(401).send({ error: "unauthorized", message: "Valid metrics bearer token required" });
  }
};
