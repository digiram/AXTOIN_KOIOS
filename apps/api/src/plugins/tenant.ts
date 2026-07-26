/**
 * Fastify pre-handler that verifies the **access JWT** and copies identity onto `request`.
 *
 * JWT payload:
 * - `sub`: user id
 * - `email`, `role`: `super_admin` | `tenant_admin` | `tenant_user`
 * - `tenantId`: present for realm sessions; absent for platform super admins
 * - `v`: access-token version (must match `users.access_token_version` — bumped on password / MFA enrollment reset)
 */

import type { FastifyReply, FastifyRequest } from "fastify";

import { parseModuleRolesClaim } from "@starter/shared";

import { getUserAccessTokenVersionById } from "@starter/db";

type JwtPayload = {
  sub: string;
  email: string;
  role?: string;
  tenantId?: string;
  /** `access` for API sessions; `mfa_step` is login-only and must not authorize tenant routes. */
  typ?: string;
  v?: string;
  /** JSON map of module → role (`manager` | `user` | `viewer`). */
  mr?: string;
};

const tokenVersionFromPayload = (v: unknown): number => {
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.floor(v));
  if (typeof v === "string") {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }
  return 0;
};

export const requireTenantContext = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    await request.jwtVerify();
    const payload = request.user as JwtPayload;
    if (payload.typ != null && payload.typ !== "access") {
      return reply.code(401).send({
        error: "unauthorized",
        message: "Valid access token required"
      });
    }
    const current = await getUserAccessTokenVersionById(payload.sub);
    if (current === undefined) {
      return reply.code(401).send({ error: "unauthorized", message: "Valid access token required" });
    }
    if (tokenVersionFromPayload(payload.v) !== current) {
      return reply.code(401).send({
        error: "unauthorized",
        message: "Session invalidated. Sign in again."
      });
    }
    request.userId = payload.sub;
    if (payload.tenantId) {
      request.tenantId = payload.tenantId;
    } else {
      request.tenantId = undefined;
    }
    request.role = payload.role ?? "tenant_user";
    request.moduleRoles = parseModuleRolesClaim(payload.mr);
  } catch {
    return reply.code(401).send({ error: "unauthorized", message: "Valid access token required" });
  }
};
