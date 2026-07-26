/**
 * Auth token HTTP response helper.
 *
 * Builds the JSON body for login, register, and refresh responses and sets
 * HttpOnly refresh-token and CSRF cookies when cookie mode is enabled.
 *
 * Responsibilities:
 * - Set refresh-token and CSRF cookies on successful auth
 * - Omit refresh token from JSON body when cookie transport is active
 * - Include MFA enrollment hints when present
 *
 * Security:
 * - Refresh tokens never duplicated in body when `refreshTokenInCookieEnabled()`
 */

import type { FastifyReply } from "fastify";

import { issueCsrfCookie, refreshTokenInCookieEnabled, setRefreshTokenCookie } from "./auth-cookies.js";
import { newCsrfToken } from "../plugins/csrf.js";

/** Wire-format fields returned by auth routes after successful token issuance. */
export type AuthTokenPayload = {
  accessToken: string;
  refreshToken: string;
  tenantId?: string;
  role: string;
  mfaEnrollmentDue?: boolean;
  mfaGraceExpiresAt?: string | null;
};

/** JSON body for login/register/refresh — omits refresh in body when HttpOnly cookie mode is on. */
export const sendAuthTokenResponse = (reply: FastifyReply, payload: AuthTokenPayload): Record<string, unknown> => {
  setRefreshTokenCookie(reply, payload.refreshToken);
  issueCsrfCookie(reply, newCsrfToken());

  const base: Record<string, unknown> = {
    accessToken: payload.accessToken,
    role: payload.role
  };
  if (payload.tenantId) base.tenantId = payload.tenantId;
  if (payload.mfaEnrollmentDue !== undefined) base.mfaEnrollmentDue = payload.mfaEnrollmentDue;
  if (payload.mfaGraceExpiresAt !== undefined) base.mfaGraceExpiresAt = payload.mfaGraceExpiresAt;

  if (!refreshTokenInCookieEnabled()) {
    base.refreshToken = payload.refreshToken;
  }
  return base;
};
