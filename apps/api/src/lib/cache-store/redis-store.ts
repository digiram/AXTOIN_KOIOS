/**
 * Redis cache store adapter.
 *
 * Implements `CacheStore` with ioredis; failures degrade to cache miss rather
 * than throwing to callers.
 *
 * Responsibilities:
 * - Namespace keys as `{namespace}:{cacheKey}`
 * - Apply TTL on set operations
 * - Swallow connection errors (best-effort cache)
 */

import { Redis } from "ioredis";

import type { CacheStore } from "./types.js";

const keyFor = (namespace: string, cacheKey: string): string => `${namespace}:${cacheKey}`;

/** Creates a Redis-backed `CacheStore` at the given connection URL. */
export const createRedisCacheStore = (redisUrl: string): CacheStore => {
  const redis = new Redis(redisUrl, { maxRetriesPerRequest: 1, lazyConnect: true });

  return {
    get: async (namespace, cacheKey) => {
      try {
        await redis.connect().catch(() => undefined);
        return redis.get(keyFor(namespace, cacheKey));
      } catch {
        return null;
      }
    },
    set: async (namespace, cacheKey, value, ttlSec) => {
      try {
        await redis.connect().catch(() => undefined);
        await redis.set(keyFor(namespace, cacheKey), value, "EX", ttlSec);
      } catch {
        /* cache miss on failure */
      }
    },
    del: async (namespace, cacheKey) => {
      try {
        await redis.connect().catch(() => undefined);
        await redis.del(keyFor(namespace, cacheKey));
      } catch {
        /* ignore */
      }
    }
  };
};
