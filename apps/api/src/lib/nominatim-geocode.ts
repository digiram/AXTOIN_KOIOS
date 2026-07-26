/**
 * Forward geocode via Nominatim with cache-backed response storage (Redis or database; TTL via env).
 */

import { createHash } from "node:crypto";

import { ensurePlatformGeolocationSettingsRow } from "@starter/db";
import { createLogger } from "@starter/logger";

import { assertNominatimBaseUrlAllowed } from "./nominatim-base-url.js";
import { getCacheStore } from "./cache-store/index.js";

const log = createLogger("nominatim-geocode");

/** Bump version when upstream query shape changes so cache invalidates. */
const CACHE_NAMESPACE = "nominatim:search:v2";
const DEFAULT_NOMINATIM_CACHE_TTL_SECONDS = 180 * 24 * 60 * 60;
/** Guard rail for env typos (2 years). */
const MAX_NOMINATIM_CACHE_TTL_SECONDS = 730 * 24 * 60 * 60;
/** Stay under typical cache string limits; Nominatim JSON for small `limit` is far smaller. */
const MAX_CACHED_PAYLOAD_BYTES = 900_000;

export const nominatimCacheTtlSeconds = (): number => {
  const raw = process.env.NOMINATIM_CACHE_TTL_SECONDS;
  if (raw === undefined || raw.trim() === "") return DEFAULT_NOMINATIM_CACHE_TTL_SECONDS;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_NOMINATIM_CACHE_TTL_SECONDS;
  if (n < 60) return 60;
  if (n > MAX_NOMINATIM_CACHE_TTL_SECONDS) return MAX_NOMINATIM_CACHE_TTL_SECONDS;
  return Math.floor(n);
};

const normalizeForCacheKey = (q: string): string => q.trim().replace(/\s+/g, " ").toLowerCase();

const cacheKey = (normalizedQuery: string, limit: number): string =>
  createHash("sha256")
    .update(JSON.stringify({ v: 2, q: normalizedQuery, limit }))
    .digest("hex");

const httpError = (statusCode: number, message: string): Error =>
  Object.assign(new Error(message), { statusCode }) as Error & { statusCode: number };

/** Coalesce concurrent upstream fetches for the same cache key (cold cache / thundering herd). */
const upstreamInflight = new Map<string, Promise<{ results: unknown[] }>>();

/**
 * Nominatim `/search` JSON array; cached by normalized query + limit.
 */
export const nominatimSearchForward = async (args: { q: string; limit: number }): Promise<{ results: unknown[] }> => {
  const settings = await ensurePlatformGeolocationSettingsRow();
  if (!settings.nominatimEnabled) {
    throw httpError(503, "Geocoding (Nominatim) is disabled for this deployment.");
  }

  try {
    assertNominatimBaseUrlAllowed(settings.nominatimBaseUrl);
  } catch (e) {
    const status =
      e !== null && typeof e === "object" && "statusCode" in e && typeof (e as { statusCode: unknown }).statusCode === "number"
        ? (e as { statusCode: number }).statusCode
        : 400;
    const message = e instanceof Error ? e.message : "Invalid Nominatim base URL.";
    throw httpError(status, message);
  }

  const qTrim = args.q.trim();
  if (qTrim.length === 0) {
    throw httpError(400, "Query must not be empty.");
  }

  const limit = Math.min(10, Math.max(1, args.limit));
  const normalized = normalizeForCacheKey(qTrim);
  const key = cacheKey(normalized, limit);
  const ttl = nominatimCacheTtlSeconds();
  const store = getCacheStore();

  try {
    const cached = await store.get(CACHE_NAMESPACE, key);
    if (cached) {
      const parsed: unknown = JSON.parse(cached);
      if (Array.isArray(parsed)) {
        log.debug({ cacheKeyPrefix: key.slice(0, 24) }, "nominatim cache hit");
        return { results: parsed };
      }
    }
  } catch (err) {
    log.warn({ err }, "nominatim cache read failed; fetching upstream");
  }

  let pending = upstreamInflight.get(key);
  if (!pending) {
    pending = (async () => {
      const base = settings.nominatimBaseUrl.replace(/\/+$/, "");
      const url = new URL(`${base}/search`);
      url.searchParams.set("format", "json");
      url.searchParams.set("addressdetails", "1");
      url.searchParams.set("q", qTrim);
      url.searchParams.set("limit", String(limit));

      const contact = settings.nominatimContactEmail?.trim();
      const appId = process.env.NOMINATIM_APP_USER_AGENT?.trim() || "StarterTemplate";
      const userAgent = contact
        ? `${appId}/1.0 (contact: ${contact})`
        : `${appId}/1.0 (configure nominatim contact email in super-admin Integrations)`;

      let res: Response;
      try {
        res = await fetch(url.toString(), {
          headers: {
            "User-Agent": userAgent,
            Accept: "application/json"
          }
        });
      } catch (err) {
        log.warn({ err, url: url.origin + url.pathname }, "nominatim fetch failed");
        throw httpError(502, "Could not reach Nominatim.");
      }

      if (!res.ok) {
        log.warn({ status: res.status, url: url.origin + url.pathname }, "nominatim non-OK response");
        throw httpError(502, `Nominatim returned status ${res.status}.`);
      }

      let results: unknown;
      try {
        results = await res.json();
      } catch {
        throw httpError(502, "Invalid JSON from Nominatim.");
      }

      if (!Array.isArray(results)) {
        throw httpError(502, "Unexpected response shape from Nominatim.");
      }

      const payload = JSON.stringify(results);
      if (Buffer.byteLength(payload, "utf8") <= MAX_CACHED_PAYLOAD_BYTES) {
        try {
          await store.set(CACHE_NAMESPACE, key, payload, ttl);
        } catch (err) {
          log.warn({ err }, "nominatim cache set failed; response not cached");
        }
      }

      return { results };
    })().finally(() => {
      upstreamInflight.delete(key);
    });
    upstreamInflight.set(key, pending);
  }

  return pending;
};

export const readGeocodeErrorStatus = (err: unknown): number | undefined => {
  if (err !== null && typeof err === "object" && "statusCode" in err) {
    const c = (err as { statusCode: unknown }).statusCode;
    return typeof c === "number" && Number.isInteger(c) ? c : undefined;
  }
  return undefined;
};
