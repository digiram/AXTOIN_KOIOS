/**
 * Access and refresh token issuance.
 *
 * Signs short-lived access JWTs and persists hashed refresh tokens for auth flows.
 *
 * Responsibilities:
 * - Build access JWT claims including token version and module roles
 * - Insert refresh token rows with 30-day sliding expiry
 * - Pair access and refresh tokens for login/register/refresh responses
 *
 * Security:
 * - Access tokens include monotonic `v` claim tied to `users.access_token_version`
 * - Refresh tokens stored as hashes only
 */

import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";

import type { TenantModuleRolesMap } from "@starter/shared";

import { insertRefreshToken } from "@starter/db";

import { moduleRolesClaimValue } from "./access-token-context.js";
import { hashRefreshToken } from "./tokens.js";

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Input fields required to sign an access JWT. */
export type AccessTokenSignInput = {
  userId: string;
  email: string;
  role: string;
  /** Monotonic row counter; must match `users.access_token_version` for the access JWT to be accepted. */
  accessTokenVersion: number;
  tenantId?: string | null;
  /** Per-module roles for realm members (`tenant_user`); omitted for tenant admins. */
  moduleRoles?: TenantModuleRolesMap;
};

/** Signs a short-lived access JWT including claim `v` (access token version). */
export const signAccessToken = (app: FastifyInstance, input: AccessTokenSignInput): string => {
  const payload: Record<string, string> = {
    sub: input.userId,
    email: input.email,
    role: input.role,
    typ: "access",
    v: String(Math.max(0, Math.floor(input.accessTokenVersion)))
  };
  if (input.tenantId) {
    payload.tenantId = input.tenantId;
  }
  const mr = moduleRolesClaimValue(input.moduleRoles ?? {});
  if (mr) {
    payload.mr = mr;
  }
  return app.jwt.sign(payload, { expiresIn: "15m" });
};

/**
 * Issues a new access/refresh token pair and persists the refresh token hash.
 *
 * @returns Wire tokens for the auth response helper.
 */
export const issueTokens = async (app: FastifyInstance, input: AccessTokenSignInput) => {
  const accessToken = signAccessToken(app, input);
  const refreshToken = randomBytes(32).toString("base64url");
  await insertRefreshToken({
    userId: input.userId,
    tenantId: input.tenantId ?? null,
    tokenHash: hashRefreshToken(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS)
  });
  return { accessToken, refreshToken };
};
