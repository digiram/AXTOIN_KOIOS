/**
 * Cache store type contract.
 *
 * Namespaced string key-value store with TTL support; implemented by Redis or
 * database backends via `cache-store/index.ts`.
 */

export type CacheStore = {
  get: (namespace: string, cacheKey: string) => Promise<string | null>;
  set: (namespace: string, cacheKey: string, value: string, ttlSec: number) => Promise<void>;
  del: (namespace: string, cacheKey: string) => Promise<void>;
};
