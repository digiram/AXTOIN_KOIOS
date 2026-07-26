/**
 * Database-backed job queue (`background_jobs`) — alternative to BullMQ when `QUEUE_STRATEGY=local`.
 */

import { randomUUID } from "node:crypto";

import { and, asc, count, desc, eq, inArray, isNotNull, lte, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { getDb } from "./client.js";
import * as mysql from "./mysql-schema.js";
import * as pg from "./pg-schema.js";
import { isMysqlDialect } from "./schema.js";

const mysqlDb = (): MySql2Database<typeof mysql> => getDb() as MySql2Database<typeof mysql>;
const pgDb = (): NodePgDatabase<typeof pg> => getDb() as NodePgDatabase<typeof pg>;

/** Drizzle `execute` on node-postgres may return `{ rows }` or a bare row array. */
export const rowsFromPgExecute = <T extends Record<string, unknown>>(result: unknown): T[] => {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows?: unknown }).rows;
    if (Array.isArray(rows)) return rows as T[];
  }
  return [];
};

export const BACKGROUND_JOB_ACTIVE_STATUSES = ["waiting", "active", "delayed"] as const;
export const BACKGROUND_JOB_TERMINAL_STATUSES = ["completed", "failed"] as const;

const BACKGROUND_JOB_ROW_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** `background_jobs.id` is a UUID; BullMQ-style dedupe keys (e.g. `mailbox-sync-account-…`) are not. */
export const isBackgroundJobRowId = (id: string): boolean => BACKGROUND_JOB_ROW_ID_RE.test(id);

export type BackgroundJobStatus =
  | (typeof BACKGROUND_JOB_ACTIVE_STATUSES)[number]
  | (typeof BACKGROUND_JOB_TERMINAL_STATUSES)[number]
  | "paused";

export type BackgroundJobRow = {
  id: string;
  queueName: string;
  jobName: string;
  payload: string;
  dedupeKey: string | null;
  status: BackgroundJobStatus;
  priority: number;
  attempts: number;
  maxAttempts: number;
  runAt: Date;
  lockedAt: Date | null;
  lockedBy: string | null;
  result: string | null;
  error: string | null;
  processedAt: Date | null;
  finishedAt: Date | null;
  purgeAfter: Date | null;
  completedRetentionSec: number | null;
  failedRetentionSec: number | null;
  createdAt: Date;
};

const MAX_PERSIST_TEXT_BYTES = 4096;

export const truncateJobPersistText = (value: string | null | undefined): string | null => {
  if (value == null || value === "") return null;
  const buf = Buffer.from(value, "utf8");
  if (buf.length <= MAX_PERSIST_TEXT_BYTES) return value;
  return buf.subarray(0, MAX_PERSIST_TEXT_BYTES).toString("utf8");
};

const mapPgRow = (row: typeof pg.backgroundJobs.$inferSelect): BackgroundJobRow => ({
  id: row.id,
  queueName: row.queueName,
  jobName: row.jobName,
  payload: row.payload,
  dedupeKey: row.dedupeKey,
  status: row.status as BackgroundJobStatus,
  priority: row.priority,
  attempts: row.attempts,
  maxAttempts: row.maxAttempts,
  runAt: row.runAt,
  lockedAt: row.lockedAt,
  lockedBy: row.lockedBy,
  result: row.result,
  error: row.error,
  processedAt: row.processedAt,
  finishedAt: row.finishedAt,
  purgeAfter: row.purgeAfter,
  completedRetentionSec: row.completedRetentionSec,
  failedRetentionSec: row.failedRetentionSec,
  createdAt: row.createdAt
});

const mapMysqlRow = (row: typeof mysql.backgroundJobs.$inferSelect): BackgroundJobRow => ({
  id: row.id,
  queueName: row.queueName,
  jobName: row.jobName,
  payload: row.payload,
  dedupeKey: row.dedupeKey,
  status: row.status as BackgroundJobStatus,
  priority: row.priority,
  attempts: row.attempts,
  maxAttempts: row.maxAttempts,
  runAt: row.runAt,
  lockedAt: row.lockedAt,
  lockedBy: row.lockedBy,
  result: row.result,
  error: row.error,
  processedAt: row.processedAt,
  finishedAt: row.finishedAt,
  purgeAfter: row.purgeAfter,
  completedRetentionSec: row.completedRetentionSec,
  failedRetentionSec: row.failedRetentionSec,
  createdAt: row.createdAt
});

export type EnqueueBackgroundJobInput = {
  queueName: string;
  jobName: string;
  payload: unknown;
  dedupeKey?: string;
  priority?: number;
  maxAttempts?: number;
  runAt?: Date;
  completedRetentionSec?: number;
  failedRetentionSec?: number;
};

export const enqueueBackgroundJob = async (input: EnqueueBackgroundJobInput): Promise<{ id: string }> => {
  const id = randomUUID();
  const now = new Date();
  const payload = JSON.stringify(input.payload ?? null);
  const runAt = input.runAt ?? now;
  const values = {
    id,
    queueName: input.queueName,
    jobName: input.jobName,
    payload,
    dedupeKey: input.dedupeKey ?? null,
    status: "waiting" as const,
    priority: input.priority ?? 0,
    attempts: 0,
    maxAttempts: input.maxAttempts ?? 3,
    runAt,
    lockedAt: null as Date | null,
    lockedBy: null as string | null,
    result: null as string | null,
    error: null as string | null,
    processedAt: null as Date | null,
    finishedAt: null as Date | null,
    purgeAfter: null as Date | null,
    completedRetentionSec: input.completedRetentionSec ?? null,
    failedRetentionSec: input.failedRetentionSec ?? null,
    createdAt: now
  };

  if (isMysqlDialect()) {
    const db = mysqlDb();
    await db.insert(mysql.backgroundJobs).values(values);
    return { id };
  }
  const db = pgDb();
  const inserted = await db.insert(pg.backgroundJobs).values(values).returning({ id: pg.backgroundJobs.id });
  return { id: inserted[0]!.id };
};

export const getBackgroundJobByDedupeKey = async (
  queueName: string,
  dedupeKey: string
): Promise<BackgroundJobRow | null> => {
  const active = [...BACKGROUND_JOB_ACTIVE_STATUSES];
  if (isMysqlDialect()) {
    const db = mysqlDb();
    const rows = await db
      .select()
      .from(mysql.backgroundJobs)
      .where(
        and(
          eq(mysql.backgroundJobs.queueName, queueName),
          eq(mysql.backgroundJobs.dedupeKey, dedupeKey),
          inArray(mysql.backgroundJobs.status, active)
        )
      )
      .limit(1);
    const row = rows[0];
    return row ? mapMysqlRow(row) : null;
  }
  const db = pgDb();
  const rows = await db
    .select()
    .from(pg.backgroundJobs)
    .where(
      and(
        eq(pg.backgroundJobs.queueName, queueName),
        eq(pg.backgroundJobs.dedupeKey, dedupeKey),
        inArray(pg.backgroundJobs.status, active)
      )
    )
    .limit(1);
  const row = rows[0];
  return row ? mapPgRow(row) : null;
};

/** Lookup by dedupe key regardless of job status (includes completed/failed rows). */
export const getBackgroundJobByDedupeKeyAnyStatus = async (
  queueName: string,
  dedupeKey: string
): Promise<BackgroundJobRow | null> => {
  if (isMysqlDialect()) {
    const db = mysqlDb();
    const rows = await db
      .select()
      .from(mysql.backgroundJobs)
      .where(and(eq(mysql.backgroundJobs.queueName, queueName), eq(mysql.backgroundJobs.dedupeKey, dedupeKey)))
      .limit(1);
    const row = rows[0];
    return row ? mapMysqlRow(row) : null;
  }
  const db = pgDb();
  const rows = await db
    .select()
    .from(pg.backgroundJobs)
    .where(and(eq(pg.backgroundJobs.queueName, queueName), eq(pg.backgroundJobs.dedupeKey, dedupeKey)))
    .limit(1);
  const row = rows[0];
  return row ? mapPgRow(row) : null;
};

export const getBackgroundJobById = async (id: string): Promise<BackgroundJobRow | null> => {
  if (!isBackgroundJobRowId(id)) return null;
  if (isMysqlDialect()) {
    const db = mysqlDb();
    const rows = await db.select().from(mysql.backgroundJobs).where(eq(mysql.backgroundJobs.id, id)).limit(1);
    const row = rows[0];
    return row ? mapMysqlRow(row) : null;
  }
  const db = pgDb();
  const rows = await db.select().from(pg.backgroundJobs).where(eq(pg.backgroundJobs.id, id)).limit(1);
  const row = rows[0];
  return row ? mapPgRow(row) : null;
};

export const removeFinishedBackgroundJobByDedupeKey = async (
  queueName: string,
  dedupeKey: string
): Promise<void> => {
  const terminal = [...BACKGROUND_JOB_TERMINAL_STATUSES];
  if (isMysqlDialect()) {
    const db = mysqlDb();
    await db
      .delete(mysql.backgroundJobs)
      .where(
        and(
          eq(mysql.backgroundJobs.queueName, queueName),
          eq(mysql.backgroundJobs.dedupeKey, dedupeKey),
          inArray(mysql.backgroundJobs.status, terminal)
        )
      );
    return;
  }
  const db = pgDb();
  await db
    .delete(pg.backgroundJobs)
    .where(
      and(
        eq(pg.backgroundJobs.queueName, queueName),
        eq(pg.backgroundJobs.dedupeKey, dedupeKey),
        inArray(pg.backgroundJobs.status, terminal)
      )
    );
};

export const claimNextBackgroundJob = async (
  queueName: string,
  workerId: string
): Promise<BackgroundJobRow | null> => {
  const now = new Date();
  if (isMysqlDialect()) {
    const db = mysqlDb();
    return db.transaction(async (tx) => {
      const rows = await tx.execute(sql`
        SELECT id FROM background_jobs
        WHERE queue_name = ${queueName}
          AND status IN ('waiting', 'delayed')
          AND run_at <= ${now}
        ORDER BY priority ASC, run_at ASC, created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `);
      const raw = rows as unknown as { id: string }[] | [{ id: string }[]];
      const list = Array.isArray(raw[0]) ? raw[0] : (raw as { id: string }[]);
      const hit = list[0];
      if (!hit?.id) return null;
      await tx
        .update(mysql.backgroundJobs)
        .set({
          status: "active",
          lockedAt: now,
          lockedBy: workerId,
          processedAt: now,
          attempts: sql`${mysql.backgroundJobs.attempts} + 1`
        })
        .where(eq(mysql.backgroundJobs.id, hit.id));
      const updated = await tx
        .select()
        .from(mysql.backgroundJobs)
        .where(eq(mysql.backgroundJobs.id, hit.id))
        .limit(1);
      const row = updated[0];
      return row ? mapMysqlRow(row) : null;
    });
  }
  const db = pgDb();
  return db.transaction(async (tx) => {
    const claimed = await tx.execute(sql`
      WITH picked AS (
        SELECT id FROM background_jobs
        WHERE queue_name = ${queueName}
          AND status IN ('waiting', 'delayed')
          AND run_at <= ${now}
        ORDER BY priority ASC, run_at ASC, created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE background_jobs AS j
      SET
        status = 'active',
        locked_at = ${now},
        locked_by = ${workerId},
        processed_at = ${now},
        attempts = j.attempts + 1
      FROM picked
      WHERE j.id = picked.id
      RETURNING j.id
    `);
    const hit = rowsFromPgExecute<{ id: string }>(claimed)[0];
    if (!hit?.id) return null;
    const updated = await tx.select().from(pg.backgroundJobs).where(eq(pg.backgroundJobs.id, hit.id)).limit(1);
    const row = updated[0];
    return row ? mapPgRow(row) : null;
  });
};

export const completeBackgroundJob = async (input: {
  id: string;
  result: unknown;
  purgeAfter?: Date;
}): Promise<void> => {
  const now = new Date();
  const result = truncateJobPersistText(JSON.stringify(input.result ?? null));
  if (isMysqlDialect()) {
    const db = mysqlDb();
    const rows = await db
      .select({
        completedRetentionSec: mysql.backgroundJobs.completedRetentionSec
      })
      .from(mysql.backgroundJobs)
      .where(eq(mysql.backgroundJobs.id, input.id))
      .limit(1);
    const retentionSec = rows[0]?.completedRetentionSec;
    const purgeAfter =
      input.purgeAfter ??
      (retentionSec != null
        ? new Date(Date.now() + retentionSec * 1000)
        : new Date(Date.now() + 3600 * 1000));
    await db
      .update(mysql.backgroundJobs)
      .set({
        status: "completed",
        result,
        error: null,
        finishedAt: now,
        lockedAt: null,
        lockedBy: null,
        purgeAfter
      })
      .where(eq(mysql.backgroundJobs.id, input.id));
    return;
  }
  const db = pgDb();
  const rows = await db
    .select({
      completedRetentionSec: pg.backgroundJobs.completedRetentionSec
    })
    .from(pg.backgroundJobs)
    .where(eq(pg.backgroundJobs.id, input.id))
    .limit(1);
  const retentionSec = rows[0]?.completedRetentionSec;
  const purgeAfter =
    input.purgeAfter ??
    (retentionSec != null
      ? new Date(Date.now() + retentionSec * 1000)
      : new Date(Date.now() + 3600 * 1000));
  await db
    .update(pg.backgroundJobs)
    .set({
      status: "completed",
      result,
      error: null,
      finishedAt: now,
      lockedAt: null,
      lockedBy: null,
      purgeAfter
    })
    .where(eq(pg.backgroundJobs.id, input.id));
};

export const failBackgroundJob = async (input: {
  id: string;
  error: string;
  retryAt?: Date;
  purgeAfter?: Date;
}): Promise<void> => {
  const now = new Date();
  const error = truncateJobPersistText(input.error) ?? "unknown error";
  if (isMysqlDialect()) {
    const db = mysqlDb();
    const rows = await db
      .select({ attempts: mysql.backgroundJobs.attempts, maxAttempts: mysql.backgroundJobs.maxAttempts })
      .from(mysql.backgroundJobs)
      .where(eq(mysql.backgroundJobs.id, input.id))
      .limit(1);
    const row = rows[0];
    if (!row) return;
    const willRetry = row.attempts < row.maxAttempts && input.retryAt != null;
    const failedRetentionSec = (
      await db
        .select({ failedRetentionSec: mysql.backgroundJobs.failedRetentionSec })
        .from(mysql.backgroundJobs)
        .where(eq(mysql.backgroundJobs.id, input.id))
        .limit(1)
    )[0]?.failedRetentionSec;
    const purgeAfter =
      input.purgeAfter ??
      (failedRetentionSec != null
        ? new Date(Date.now() + failedRetentionSec * 1000)
        : new Date(Date.now() + 86_400 * 1000));
    await db
      .update(mysql.backgroundJobs)
      .set({
        status: willRetry ? "delayed" : "failed",
        error,
        runAt: willRetry ? input.retryAt! : row.attempts >= row.maxAttempts ? now : input.retryAt ?? now,
        finishedAt: willRetry ? null : now,
        lockedAt: null,
        lockedBy: null,
        purgeAfter: willRetry ? null : purgeAfter
      })
      .where(eq(mysql.backgroundJobs.id, input.id));
    return;
  }
  const db = pgDb();
  const rows = await db
    .select({ attempts: pg.backgroundJobs.attempts, maxAttempts: pg.backgroundJobs.maxAttempts })
    .from(pg.backgroundJobs)
    .where(eq(pg.backgroundJobs.id, input.id))
    .limit(1);
  const row = rows[0];
  if (!row) return;
  const willRetry = row.attempts < row.maxAttempts && input.retryAt != null;
  const failedRetentionSec = (
    await db
      .select({ failedRetentionSec: pg.backgroundJobs.failedRetentionSec })
      .from(pg.backgroundJobs)
      .where(eq(pg.backgroundJobs.id, input.id))
      .limit(1)
  )[0]?.failedRetentionSec;
  const purgeAfter =
    input.purgeAfter ??
    (failedRetentionSec != null
      ? new Date(Date.now() + failedRetentionSec * 1000)
      : new Date(Date.now() + 86_400 * 1000));
  await db
    .update(pg.backgroundJobs)
    .set({
      status: willRetry ? "delayed" : "failed",
      error,
      runAt: willRetry ? input.retryAt! : now,
      finishedAt: willRetry ? null : now,
      lockedAt: null,
      lockedBy: null,
      purgeAfter: willRetry ? null : purgeAfter
    })
    .where(eq(pg.backgroundJobs.id, input.id));
};

export const purgeDueBackgroundJobs = async (limit: number): Promise<number> => {
  const batch = Math.max(1, Math.min(limit, 5000));
  const now = new Date();
  if (isMysqlDialect()) {
    const db = mysqlDb();
    const result = await db.execute(
      sql`DELETE FROM background_jobs WHERE purge_after IS NOT NULL AND purge_after <= ${now} LIMIT ${batch}`
    );
    return Number((result as { affectedRows?: number }).affectedRows ?? 0);
  }
  const db = pgDb();
  const result = await db.execute(
    sql`DELETE FROM background_jobs WHERE purge_after IS NOT NULL AND purge_after <= ${now} AND id IN (
      SELECT id FROM background_jobs WHERE purge_after IS NOT NULL AND purge_after <= ${now} LIMIT ${batch}
    )`
  );
  return Number((result as { rowCount?: number }).rowCount ?? 0);
};

export const releaseStaleBackgroundJobLocks = async (maxLockAgeMs: number): Promise<number> => {
  const cutoff = new Date(Date.now() - maxLockAgeMs);
  if (isMysqlDialect()) {
    const db = mysqlDb();
    const result = await db
      .update(mysql.backgroundJobs)
      .set({
        status: "waiting",
        lockedAt: null,
        lockedBy: null
      })
      .where(and(eq(mysql.backgroundJobs.status, "active"), lte(mysql.backgroundJobs.lockedAt, cutoff)));
    return Number((result as unknown as { affectedRows?: number }).affectedRows ?? 0);
  }
  const db = pgDb();
  const updated = await db
    .update(pg.backgroundJobs)
    .set({
      status: "waiting",
      lockedAt: null,
      lockedBy: null
    })
    .where(and(eq(pg.backgroundJobs.status, "active"), lte(pg.backgroundJobs.lockedAt, cutoff)))
    .returning({ id: pg.backgroundJobs.id });
  return updated.length;
};

export const countBackgroundJobsByStatus = async (
  queueName: string
): Promise<Record<string, number>> => {
  const statuses = ["waiting", "active", "delayed", "completed", "failed", "paused"] as const;
  const out: Record<string, number> = {};
  if (isMysqlDialect()) {
    const db = mysqlDb();
    for (const status of statuses) {
      const rows = await db
        .select({ c: count() })
        .from(mysql.backgroundJobs)
        .where(and(eq(mysql.backgroundJobs.queueName, queueName), eq(mysql.backgroundJobs.status, status)));
      out[status] = Number(rows[0]?.c ?? 0);
    }
    return out;
  }
  const db = pgDb();
  for (const status of statuses) {
    const rows = await db
      .select({ c: count() })
      .from(pg.backgroundJobs)
      .where(and(eq(pg.backgroundJobs.queueName, queueName), eq(pg.backgroundJobs.status, status)));
    out[status] = Number(rows[0]?.c ?? 0);
  }
  return out;
};

export const listBackgroundJobs = async (input: {
  queueName: string;
  state: string;
  start: number;
  limit: number;
}): Promise<BackgroundJobRow[]> => {
  const offset = Math.max(0, input.start);
  const limit = Math.max(1, Math.min(input.limit, 100));
  if (isMysqlDialect()) {
    const db = mysqlDb();
    const where =
      input.state === "all"
        ? eq(mysql.backgroundJobs.queueName, input.queueName)
        : and(eq(mysql.backgroundJobs.queueName, input.queueName), eq(mysql.backgroundJobs.status, input.state));
    const rows = await db
      .select()
      .from(mysql.backgroundJobs)
      .where(where)
      .orderBy(desc(mysql.backgroundJobs.createdAt))
      .limit(limit)
      .offset(offset);
    return rows.map(mapMysqlRow);
  }
  const db = pgDb();
  const where =
    input.state === "all"
      ? eq(pg.backgroundJobs.queueName, input.queueName)
      : and(eq(pg.backgroundJobs.queueName, input.queueName), eq(pg.backgroundJobs.status, input.state));
  const rows = await db
    .select()
    .from(pg.backgroundJobs)
    .where(where)
    .orderBy(desc(pg.backgroundJobs.createdAt))
    .limit(limit)
    .offset(offset);
  return rows.map(mapPgRow);
};

export const listBackgroundJobsForQueueByStatuses = async (
  queueName: string,
  statuses: readonly BackgroundJobStatus[],
  jobName?: string
): Promise<BackgroundJobRow[]> => {
  if (statuses.length === 0) return [];
  const statusList = [...statuses];
  if (isMysqlDialect()) {
    const db = mysqlDb();
    const rows = await db
      .select()
      .from(mysql.backgroundJobs)
      .where(
        and(
          eq(mysql.backgroundJobs.queueName, queueName),
          inArray(mysql.backgroundJobs.status, statusList),
          jobName ? eq(mysql.backgroundJobs.jobName, jobName) : undefined
        )
      )
      .orderBy(asc(mysql.backgroundJobs.priority), asc(mysql.backgroundJobs.runAt))
      .limit(200);
    return rows.map(mapMysqlRow);
  }
  const db = pgDb();
  const rows = await db
    .select()
    .from(pg.backgroundJobs)
    .where(
      and(
        eq(pg.backgroundJobs.queueName, queueName),
        inArray(pg.backgroundJobs.status, statusList),
        jobName ? eq(pg.backgroundJobs.jobName, jobName) : undefined
      )
    )
    .orderBy(asc(pg.backgroundJobs.priority), asc(pg.backgroundJobs.runAt))
    .limit(200);
  return rows.map(mapPgRow);
};

export const listActiveBackgroundJobsForQueue = async (
  queueName: string,
  jobName?: string
): Promise<BackgroundJobRow[]> =>
  listBackgroundJobsForQueueByStatuses(queueName, BACKGROUND_JOB_ACTIVE_STATUSES, jobName);
