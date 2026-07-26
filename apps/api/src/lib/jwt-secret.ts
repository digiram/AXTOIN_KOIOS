/**
 * Resolves HS256 signing secret for access JWTs.
 *
 * **Production:** `JWT_ACCESS_SECRET` is required and must meet minimum length (no predictable default).
 * **Non-production:** unset falls back to a fixed dev secret (logged once at warn level).
 */

/** Minimum length for `JWT_ACCESS_SECRET` when `NODE_ENV=production`. */
export const JWT_ACCESS_SECRET_MIN_LENGTH = 32;

export type ResolveJwtAccessSecretOptions = {
  nodeEnv: string;
  /** Used for the non-production fallback warning only. */
  logger?: { warn: (obj: object, msg?: string) => void };
};

/**
 * @throws Error when production is misconfigured (missing or too-short secret).
 */
export function resolveJwtAccessSecret(opts: ResolveJwtAccessSecretOptions): string {
  const raw = process.env.JWT_ACCESS_SECRET?.trim() ?? "";
  const isProd = opts.nodeEnv === "production";

  if (isProd) {
    if (raw.length < JWT_ACCESS_SECRET_MIN_LENGTH) {
      throw new Error(
        `JWT_ACCESS_SECRET must be set to at least ${JWT_ACCESS_SECRET_MIN_LENGTH} non-whitespace characters when NODE_ENV is production.`
      );
    }
    return raw;
  }

  if (raw.length > 0) {
    return raw;
  }

  opts.logger?.warn(
    { fallback: true },
    "JWT_ACCESS_SECRET is unset — using built-in development default (never deploy production without a strong secret)"
  );
  return "dev-access-secret";
}
