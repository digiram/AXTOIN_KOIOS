/**
 * Path prefixes proxied to `@starter/api` during Vite dev when `VITE_API_BASE_URL` is unset
 * (same-origin `fetch` / WebSocket). Must stay aligned with top-level route mounts in
 * `apps/api/src/index.ts` (`app.register(..., { prefix })` and root `registerStripeWebhookRoutes`).
 */
export const DEV_API_PROXY_PATH_FIRST_SEGMENTS = [
    "auth",
    "account",
    "platform",
    "tenant",
    "profile",
    "webhooks"
];
/** `server.proxy` path pattern (matches first segment, any subpath). */
export const devApiProxyPathRegex = `^/(${DEV_API_PROXY_PATH_FIRST_SEGMENTS.join("|")})`;
//# sourceMappingURL=dev-api-proxy-paths.js.map