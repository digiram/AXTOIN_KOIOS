/**
 * DevApiProxyWarmup.
 *
 * Development-only fetch wrapper that retries same-origin Vite proxy requests while the API process
 * is still binding `API_PORT` after `pnpm dev:all`.
 *
 * Responsibilities:
 * - Detect Vite proxy 502/504 upstream-down responses
 * - Backoff retry before surfacing unreachable API errors
 *
 * Notes:
 * - No-op outside dev same-origin proxy mode
 */
import { API_BASE_URL } from "./api.js";

/**
 * When the Vite dev proxy cannot connect to Fastify, it answers with **502** (and sometimes **504**).
 * Do **not** treat **503** here: the API uses 503 for application errors (e.g. Redis unavailable) after
 * the TCP connection succeeds — retrying would hide the real problem and add long delays.
 */
export function isViteDevProxyUpstreamDownStatus(status: number): boolean {
  return status === 502 || status === 504;
}

/**
 * Waits long enough for typical `pnpm dev:all` API boot (plugins, bootstrap, optional migrations) before giving up.
 * Sum ≈ 12.6s after the first failed response, plus fetch latency.
 */
const RETRY_DELAYS_MS = [300, 600, 1200, 2000, 3500, 5000];

/**
 * With `pnpm dev:all`, Vite is often ready before Fastify has bound `API_PORT`, so the first same-origin
 * proxied request can briefly return **502/504**. Retry with backoff before surfacing "API unreachable".
 */
export async function fetchWithDevProxyWarmup(
  url: string,
  init?: RequestInit
): Promise<Response> {
  let res = await fetch(url, init);
  if (!(import.meta.env.DEV && !API_BASE_URL)) {
    return res;
  }
  for (const ms of RETRY_DELAYS_MS) {
    if (!isViteDevProxyUpstreamDownStatus(res.status)) {
      return res;
    }
    await new Promise((r) => setTimeout(r, ms));
    res = await fetch(url, init);
  }
  return res;
}
