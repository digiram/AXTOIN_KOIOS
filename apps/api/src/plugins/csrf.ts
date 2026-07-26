/**
 * Double-submit CSRF for cookie-backed refresh when `REFRESH_TOKEN_IN_COOKIE` is enabled.
 */

import { randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { CSRF_COOKIE_NAME, refreshTokenInCookieEnabled } from "../lib/auth-cookies.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const normalizePath = (url: string): string => {
  const p = url.split("?")[0] ?? url;
  return p.startsWith("/v1") ? p.slice(3) || "/" : p;
};

const csrfExemptPaths = (url: string): boolean => {
  const path = normalizePath(url);
  return path.startsWith("/webhooks/") || path.startsWith("/public/") || path === "/health" || path === "/ready" || path === "/metrics";
};

export const registerCsrfProtection = async (app: FastifyInstance): Promise<void> => {
  app.addHook("preHandler", async (request, reply) => {
    if (!refreshTokenInCookieEnabled()) return;
    if (SAFE_METHODS.has(request.method)) return;
    if (csrfExemptPaths(request.url.split("?")[0] ?? request.url)) return;

    const cookieToken = request.cookies?.[CSRF_COOKIE_NAME];
    const headerToken = request.headers["x-csrf-token"];
    if (typeof cookieToken !== "string" || typeof headerToken !== "string") {
      return reply.code(403).send({ error: "csrf_missing", message: "CSRF token required." });
    }
    const a = Buffer.from(cookieToken);
    const b = Buffer.from(headerToken);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return reply.code(403).send({ error: "csrf_invalid", message: "CSRF token invalid." });
    }
  });
};

export const newCsrfToken = (): string => randomBytes(32).toString("base64url");
