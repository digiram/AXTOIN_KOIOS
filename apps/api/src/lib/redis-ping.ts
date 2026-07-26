/**
 * Lightweight Redis reachability check for readiness probes.
 */

import { Redis } from "ioredis";

const redisUrlFromEnv = (): string => {
  const raw = process.env.REDIS_URL?.trim();
  return raw || "redis://localhost:6379";
};

export type RedisPingResult = {
  ok: boolean;
  error?: string;
};

export const pingRedis = async (): Promise<RedisPingResult> => {
  const client = new Redis(redisUrlFromEnv(), {
    maxRetriesPerRequest: 1,
    connectTimeout: 2_000,
    lazyConnect: true
  });
  try {
    await client.connect();
    const pong = await client.ping();
    if (pong !== "PONG") {
      return { ok: false, error: `unexpected ping response: ${String(pong)}` };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  } finally {
    try {
      client.disconnect();
    } catch {
      /* ignore */
    }
  }
};
