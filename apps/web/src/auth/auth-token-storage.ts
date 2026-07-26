/**
 * AuthTokenStorage.
 *
 * Browser-side token persistence for the SPA session: access JWT in memory only; refresh via HttpOnly
 * cookie (production default) or sessionStorage in dev.
 *
 * Responsibilities:
 * - Hold access token in module memory (never localStorage/sessionStorage)
 * - Read/write refresh token according to `refreshTokenInCookieEnabled`
 * - Migrate legacy sessions that stored access JWT in sessionStorage
 *
 * Security:
 * - Access tokens are XSS-sensitive — memory-only reduces exfiltration window
 * - Refresh tokens use HttpOnly cookies in production cookie mode
 */
import { refreshTokenInCookieEnabled } from "../lib/api.js";
import { STORAGE_ACCESS, STORAGE_REFRESH } from "../lib/constants.js";

/** In-memory access JWT — never written to sessionStorage/localStorage (XSS mitigation). */
let memoryAccessToken: string | null = null;

/** Returns the in-memory access JWT, or null when logged out. */
export const getMemoryAccessToken = (): string | null => memoryAccessToken;

/** Refresh token: HttpOnly cookie in production cookie mode; otherwise sessionStorage only (no localStorage mirror). */
export const getStoredRefreshToken = (): string | null => {
  if (refreshTokenInCookieEnabled()) return null;
  return sessionStorage.getItem(STORAGE_REFRESH);
};

/**
 * Writes access and refresh tokens after login or refresh.
 *
 * Side effects: updates memory; may write sessionStorage when cookie refresh mode is off.
 */
export const persistTokens = (accessToken: string, refreshToken: string) => {
  memoryAccessToken = accessToken;

  if (refreshTokenInCookieEnabled()) {
    sessionStorage.removeItem(STORAGE_ACCESS);
    sessionStorage.removeItem(STORAGE_REFRESH);
    localStorage.removeItem(STORAGE_REFRESH);
    return;
  }

  sessionStorage.removeItem(STORAGE_ACCESS);
  if (refreshToken) {
    sessionStorage.setItem(STORAGE_REFRESH, refreshToken);
  }
  localStorage.removeItem(STORAGE_REFRESH);
};

/** Clears in-memory access token and all refresh-token storage surfaces. */
export const clearStoredTokens = () => {
  memoryAccessToken = null;
  sessionStorage.removeItem(STORAGE_ACCESS);
  sessionStorage.removeItem(STORAGE_REFRESH);
  localStorage.removeItem(STORAGE_REFRESH);
};

/** One-time migration: legacy sessions stored access JWT in sessionStorage. */
export const consumeLegacyStoredAccessToken = (): string | null => {
  const legacy = sessionStorage.getItem(STORAGE_ACCESS);
  if (legacy) sessionStorage.removeItem(STORAGE_ACCESS);
  return legacy;
};
