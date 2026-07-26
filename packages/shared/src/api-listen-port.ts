/**
 * API listen port resolution.
 *
 * Reads `API_PORT` from environment with a documented default for local dev.
 *
 * Responsibilities:
 * - Parse and validate TCP port from env string
 * - Fall back to {@link DEFAULT_API_LISTEN_PORT} when unset or invalid
 *
 * Related:
 * - `apps/api` Fastify bootstrap; `.env.example`
 */
/** Default Fastify listen port when `API_PORT` is unset (matches `.env.example`). */
export const DEFAULT_API_LISTEN_PORT = 3500;

const parsePositivePort = (s: string | undefined): number | null => {
  if (s == null) return null;
  const t = s.trim();
  if (!t) return null;
  const n = Number.parseInt(t, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
};

/** TCP port for `@starter/api` (Fastify). Set **`API_PORT`** in repo-root `.env`. */
export function resolveApiListenPort(apiPort: string | undefined): number {
  return parsePositivePort(apiPort) ?? DEFAULT_API_LISTEN_PORT;
}
