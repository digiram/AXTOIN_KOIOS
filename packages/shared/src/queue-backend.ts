/**
 * Single infrastructure knob: `QUEUE_STRATEGY` selects how the app runs its job queue **and** cache.
 *
 * - `local`    — SQL-backed queue + cache (`background_jobs` + `app_cache_entries` on Postgres, Supabase,
 *                or MySQL). No Redis required. Best for low load / single-node SQL hosts.
 * - `external` — BullMQ + Redis for the queue and cache (`REDIS_URL`). Best for higher load / multi-node.
 *                **Default** when `QUEUE_STRATEGY` is unset.
 *
 * Queue tuning (poll interval, retention, GC batch sizes, concurrency) intentionally uses the
 * built-in defaults below instead of individual env vars — add knobs only if a real need appears.
 */

export type QueueStrategy = "local" | "external";

/** Mirrors `packages/db` `DATABASE_DIALECT` without a package dependency. */
export type DatabaseDialect = "postgres" | "mysql" | "supabase";

export const databaseDialectFromEnv = (): DatabaseDialect => {
  const raw = (process.env.DATABASE_DIALECT ?? "").trim().toLowerCase();
  if (raw === "mysql") return "mysql";
  if (raw === "supabase") return "supabase";
  return "postgres";
};

/** `true` when the active SQL dialect has `background_jobs` / `app_cache_entries` tables. */
export const sqlDialectSupportsLocalQueue = (dialect: DatabaseDialect = databaseDialectFromEnv()): boolean =>
  dialect === "mysql" || dialect === "postgres" || dialect === "supabase";

export const queueStrategyFromEnv = (): QueueStrategy =>
  process.env.QUEUE_STRATEGY?.trim().toLowerCase() === "local" ? "local" : "external";

/** `true` when jobs + cache live in SQL (`QUEUE_STRATEGY=local` on a supported dialect). */
export const usesDatabaseBackend = (): boolean =>
  queueStrategyFromEnv() === "local" && sqlDialectSupportsLocalQueue();

/** `true` when jobs + cache use BullMQ/Redis (`QUEUE_STRATEGY=external`, the default). */
export const usesRedisBackend = (): boolean => queueStrategyFromEnv() === "external";

/**
 * Built-in tuning for the `local` (database) queue. Not env-configurable by design;
 * these defaults handle low-load deployments without extra configuration surface.
 */
export const DATABASE_QUEUE_DEFAULTS = {
  pollIntervalMs: 5_000,
  workerConcurrency: 1,
  gcIntervalMs: 300_000,
  completedRetentionSec: 3_600,
  failedRetentionSec: 86_400,
  staleLockMs: 600_000,
  jobGcBatchSize: 200,
  cacheGcBatchSize: 500
} as const;
