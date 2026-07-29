/**
 * API listen port resolution.
 *
 * Reads `API_PORT` from environment with an optional PaaS `PORT` fallback and a
 * documented default for local dev.
 *
 * Responsibilities:
 * - Parse and validate TCP port from env strings
 * - Prefer `API_PORT`, then platform `PORT` (Hostinger / many PaaS inject `PORT`)
 * - Fall back to {@link DEFAULT_API_LISTEN_PORT} when both unset or invalid
 *
 * Related:
 * - `apps/api` Fastify bootstrap; `.env.example`; Hostinger deploy runbook
 */
/** Default Fastify listen port when `API_PORT` and `PORT` are unset (matches `.env.example`). */
export const DEFAULT_API_LISTEN_PORT = 3500;

const parsePositivePort = (s: string | undefined): number | null => {
  if (s == null) return null;
  const t = s.trim();
  if (!t) return null;
  const n = Number.parseInt(t, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
};

/**
 * TCP port for `@starter/api` (Fastify).
 * Prefer **`API_PORT`** in repo-root `.env`. When unset, use platform **`PORT`** (Hostinger).
 */
export function resolveApiListenPort(
  apiPort: string | undefined,
  platformPort?: string | undefined
): number {
  return (
    parsePositivePort(apiPort) ?? parsePositivePort(platformPort) ?? DEFAULT_API_LISTEN_PORT
  );
}

/**
 * Optional TCP port for the worker health HTTP server.
 * Prefer **`WORKER_PORT`**, then platform **`PORT`**. Returns `null` when both unset
 * so local `pnpm dev:worker` does not bind a port unless configured.
 */
export function resolveWorkerHealthListenPort(
  workerPort: string | undefined,
  platformPort?: string | undefined
): number | null {
  return parsePositivePort(workerPort) ?? parsePositivePort(platformPort);
}
