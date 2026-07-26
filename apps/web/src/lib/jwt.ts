/**
 * JwtClientHelpers.
 *
 * Client-side JWT payload helpers for SPA routing and session refresh timing. Signature verification
 * happens only on the API — these utilities decode the middle segment for UI decisions.
 *
 * Responsibilities:
 * - Decode access-token payload without crypto verification
 * - Normalize role claim to `UserRole`
 * - Detect expiry with configurable clock skew
 *
 * Security:
 * - Never use decoded claims for authorization — API enforces tenant scope and roles
 */
import { userRoleSchema, type UserRole } from "@starter/shared";

/** Decoded access JWT payload shape used by the web session layer. */
export type JwtAccessPayload = {
  sub: string;
  /** Present for realm tokens; absent for platform super-admin JWTs. */
  tenantId?: string;
  email: string;
  role?: string;
  /** Access-token version (invalidated after password / MFA enrollment reset). */
  v?: string;
  /** JSON map of module → role for realm members. */
  mr?: string;
  exp?: number;
};

/** Reads JWT payload (middle segment) without verifying the signature — OK for UI routing only. */
export const decodeAccessPayload = (accessToken: string): JwtAccessPayload | null => {
  try {
    const part = accessToken.split(".")[1];
    if (!part) return null;
    const json = globalThis.atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as JwtAccessPayload;
  } catch {
    return null;
  }
};

/** Coerces a raw role claim to a valid `UserRole`, defaulting to `tenant_user`. */
export const normalizeRole = (raw: string | undefined): UserRole => {
  const r = userRoleSchema.safeParse(raw ?? "tenant_user");
  return r.success ? r.data : "tenant_user";
};

/**
 * Returns true when the access token is expired or missing `exp`, with optional skew buffer.
 *
 * @param skewMs - Treat token as expired this many ms before actual `exp` (default 15s).
 */
export const isAccessTokenExpired = (accessToken: string, skewMs = 15_000): boolean => {
  const p = decodeAccessPayload(accessToken);
  if (!p?.exp) return true;
  return p.exp * 1000 <= Date.now() + skewMs;
};
