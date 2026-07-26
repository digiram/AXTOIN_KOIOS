/**
 * Cache store backend factory.
 *
 * Selects Redis or database implementation based on `usesDatabaseBackend()` and
 * exposes a process-wide singleton for namespaced key-value caching.
 *
 * Responsibilities:
 * - Lazily construct the active `CacheStore`
 * - Reset singleton in tests after env changes
 */

import { usesDatabaseBackend } from "@starter/shared";

import { createDatabaseCacheStore } from "./database-store.js";
import { createRedisCacheStore } from "./redis-store.js";
import type { CacheStore } from "./types.js";

let cached: CacheStore | undefined;

/** Returns the process-wide `CacheStore` singleton. */
export const getCacheStore = (): CacheStore => {
  if (cached) return cached;
  cached = usesDatabaseBackend()
    ? createDatabaseCacheStore()
    : createRedisCacheStore(process.env.REDIS_URL ?? "redis://localhost:6379");
  return cached;
};

/** Test-only: clear singleton after env changes. */
export const resetCacheStoreForTests = (): void => {
  cached = undefined;
};

export type { CacheStore } from "./types.js";
