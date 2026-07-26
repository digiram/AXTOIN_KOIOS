/**
 * Database-backed cache store.
 *
 * Implements the `CacheStore` interface using the `cache_entries` table when
 * the deployment uses a database-only backend (no Redis).
 */

import { deleteCacheEntry, getCacheEntry, setCacheEntry } from "@starter/db";

import type { CacheStore } from "./types.js";

/** Creates a `CacheStore` backed by SQL `cache_entries` rows. */
export const createDatabaseCacheStore = (): CacheStore => ({
  get: getCacheEntry,
  set: async (namespace, cacheKey, value, ttlSec) => {
    await setCacheEntry({
      namespace,
      cacheKey,
      payload: value,
      expiresAt: new Date(Date.now() + ttlSec * 1000)
    });
  },
  del: deleteCacheEntry
});
