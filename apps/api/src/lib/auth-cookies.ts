/**
 * Optional HttpOnly refresh-token cookies (opt-in via `REFRESH_TOKEN_IN_COOKIE=true`).
 * Requires `CORS_CREDENTIALS=true` and explicit `CORS_ORIGINS` for browser SPAs.
 */

import type { FastifyReply } from "fastify";

export const REFRESH_COOKIE_NAME = "starter_refresh";
export const CSRF_COOKIE_NAME = "starter_csrf";

const isSecureCookie = (): boolean =>
  process.env.NODE_ENV === "production" || process.env.COOKIE_SECURE === "true";

export const refreshTokenInCookieEnabled = (): boolean => {
  const raw = process.env.REFRESH_TOKEN_IN_COOKIE?.trim().toLowerCase();
  if (raw === "false" || raw === "0") return false;
  if (raw === "true" || raw === "1") return true;
  return process.env.NODE_ENV?.trim().toLowerCase() === "production";
};

export const setRefreshTokenCookie = (reply: FastifyReply, refreshToken: string): void => {
  if (!refreshTokenInCookieEnabled()) return;
  reply.setCookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60
  });
};

export const clearRefreshTokenCookie = (reply: FastifyReply): void => {
  if (!refreshTokenInCookieEnabled()) return;
  reply.clearCookie(REFRESH_COOKIE_NAME, { path: "/" });
};

export const clearCsrfCookie = (reply: FastifyReply): void => {
  if (!refreshTokenInCookieEnabled()) return;
  reply.clearCookie(CSRF_COOKIE_NAME, { path: "/" });
};

export const readRefreshTokenFromRequest = (request: {
  cookies?: Record<string, string | undefined>;
  body?: unknown;
}): string | undefined => {
  const fromCookie = request.cookies?.[REFRESH_COOKIE_NAME]?.trim();
  if (fromCookie) return fromCookie;
  const body = request.body as { refreshToken?: string } | undefined;
  const fromBody = body?.refreshToken?.trim();
  return fromBody || undefined;
};

export const issueCsrfCookie = (reply: FastifyReply, token: string): void => {
  if (!refreshTokenInCookieEnabled()) return;
  reply.setCookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    secure: isSecureCookie(),
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60
  });
};
