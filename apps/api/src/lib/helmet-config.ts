/**
 * Helmet options for the Fastify API.
 *
 * **Hostinger / LiteSpeed:** In production, CSP must **not** be sent as an HTTP response header — the proxy
 * can return HTTP 503 even for a small policy. See `packages/shared/src/content-security-policy.ts` and
 * `docs/guidelines/security.md` (meta-only CSP for the web SPA).
 *
 * When CSP is allowed on HTTP headers (development, or `CSP_IN_META=off`), this module applies a compact API
 * policy (enough for same-origin Swagger UI at `/docs`).
 */

import type { FastifyHelmetOptions } from "@fastify/helmet";
import type { FastifyInstance } from "fastify";

import { API_CSP_DIRECTIVES, securityHeaders, shouldUseMetaCspOnly } from "@starter/shared";

export const buildHelmetOptions = (): FastifyHelmetOptions => {
  const metaOnly = shouldUseMetaCspOnly();

  return {
    contentSecurityPolicy: metaOnly
      ? false
      : {
          useDefaults: false,
          directives: API_CSP_DIRECTIVES
        },
    crossOriginOpenerPolicy: { policy: "same-origin" },
    frameguard: { action: "deny" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    hsts:
      process.env.NODE_ENV?.trim().toLowerCase() === "production"
        ? { maxAge: 31_536_000, includeSubDomains: true }
        : false,
    permittedCrossDomainPolicies: false
  };
};

/** Helmet does not expose Permissions-Policy in this version — align with {@link securityHeaders}. */
export const registerSupplementalSecurityHeaders = (app: FastifyInstance): void => {
  app.addHook("onSend", async (_request, reply, payload) => {
    const policy = securityHeaders({ surface: "api" })["Permissions-Policy"];
    if (policy && !reply.getHeader("permissions-policy")) {
      reply.header("Permissions-Policy", policy);
    }
    return payload;
  });
};
