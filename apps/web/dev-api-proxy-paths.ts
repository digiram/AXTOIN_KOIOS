/**
 * Path prefixes proxied to `@starter/api` during Vite dev when `VITE_API_BASE_URL` is unset
 * (same-origin `fetch` / WebSocket). Must stay aligned with `apps/api/src/app.ts` mounts.
 */
export const DEV_API_PROXY_PATH_FIRST_SEGMENTS = [
  "v1",
  "webhooks",
  "health",
  "ready",
  "metrics",
  "openapi.json",
  "docs"
] as const;

/** `server.proxy` path pattern (matches first segment, any subpath). */
export const devApiProxyPathRegex = `^/(${DEV_API_PROXY_PATH_FIRST_SEGMENTS.join("|")})`;
