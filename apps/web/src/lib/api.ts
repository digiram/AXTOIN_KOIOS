/**
 * Backend origin. `vite.config.ts` injects `import.meta.env.VITE_API_BASE_URL` from repo-root `.env`:
 * - Explicit `VITE_API_BASE_URL` → used as-is (origin only; `/v1` is appended below).
 * - **Development** without that var → `""` (same origin); Vite proxies `/v1`, `/webhooks`, probes to the API.
 * - **Production** build without that var → `http://localhost:<API_PORT>` (override at build time for deploys).
 *
 * All application JSON routes are under `/v1` (see `apps/api/src/app.ts`).
 */

const apiOrigin = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3500").replace(/\/$/, "");

/** Versioned API base (`/v1` or `https://api.example.com/v1`). */
export const API_BASE_URL = apiOrigin ? `${apiOrigin}/v1` : "/v1";

/** True when the SPA talks to the API via same-origin Vite proxy (`API_BASE_URL` is relative). */
export const API_SAME_ORIGIN = API_BASE_URL.startsWith("/");

export const refreshTokenInCookieEnabled = (): boolean => {
  const raw = import.meta.env.VITE_REFRESH_TOKEN_IN_COOKIE?.trim().toLowerCase();
  if (raw === "false" || raw === "0") return false;
  if (raw === "true" || raw === "1") return true;
  return import.meta.env.PROD;
};

const CSRF_COOKIE_NAME = "starter_csrf";

const readCsrfCookie = (): string | undefined => {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE_NAME}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
};

/** Merge auth-friendly defaults (credentials + CSRF) when cookie refresh mode is on. */
export const withApiFetchInit = (init: RequestInit = {}): RequestInit => {
  if (!refreshTokenInCookieEnabled()) return init;
  const headers = new Headers(init.headers);
  const csrf = readCsrfCookie();
  if (csrf) headers.set("X-CSRF-Token", csrf);
  return { ...init, headers, credentials: "include" };
};

/** WebSocket base URL aligned with `API_BASE_URL` (includes `/v1` path prefix). */
export const apiWebSocketBaseUrl = (): string => {
  if (API_BASE_URL.startsWith("http")) {
    const u = new URL(API_BASE_URL);
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    return u.href.replace(/\/$/, "");
  }
  const proto = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = typeof window !== "undefined" ? window.location.host : "localhost";
  return `${proto}//${host}${API_BASE_URL}`;
};

/** Safe for any environment — no URLs, status codes, or infrastructure hints. */
export const API_USER_UNREACHABLE_MESSAGE =
  "Sign-in is temporarily unavailable. Please try again later.";

const API_DEV_START_HINT =
  "From the repo root run pnpm dev (API only) or pnpm dev:all (web + API + worker). The API must listen on the same API_PORT as in repo-root .env; restart Vite after changing it. The @starter/web ready lines in the Vite terminal show the proxy target. `pnpm dev:all` runs `db:migrate` once then starts all services; the API also auto-migrates in development on boot. Same-origin fetches retry several seconds on Vite proxy 502/504; HTTP 503 from the API usually means an app dependency (e.g. Redis) — see the JSON message body. If 502 persists, confirm the API process is up and the Vite terminal is not logging ECONNREFUSED to the proxy target.";

/**
 * Message when the API cannot be reached. Detailed troubleshooting is dev-only (production never leaks HTTP status or URLs).
 */
export const formatApiUnreachableMessage = (apiBaseUrl: string, httpStatus?: number): string => {
  if (!import.meta.env.DEV) return API_USER_UNREACHABLE_MESSAGE;
  return `Could not reach the API${apiBaseUrl ? ` at ${apiBaseUrl}` : ""}${
    httpStatus != null ? ` (HTTP ${httpStatus})` : ""
  }. ${API_DEV_START_HINT}`;
};

/** For UI that distinguishes auth transport failures from invalid credentials. */
export const isApiUnreachableAuthMessage = (message: string): boolean =>
  message === API_USER_UNREACHABLE_MESSAGE ||
  (import.meta.env.DEV && message.startsWith("Could not reach the API"));
