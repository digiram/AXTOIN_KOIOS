/**
 * Database job producer adapter.
 *
 * Enqueues and inspects background jobs via the `background_jobs` table when
 * `usesDatabaseBackend()` is true (no Redis required).
 *
 * Responsibilities:
 * - Map enqueue options to SQL retention and dedupe fields
 * - Convert `BackgroundJobRow` records to `JobSnapshot` for admin APIs
 * - Support dedupe-key lookups and finished-job cleanup
 */

import {
  BACKGROUND_JOB_ACTIVE_STATUSES,
  BACKGROUND_JOB_TERMINAL_STATUSES,
  enqueueBackgroundJob,
  getBackgroundJobByDedupeKey,
  getBackgroundJobByDedupeKeyAnyStatus,
  getBackgroundJobById,
  listBackgroundJobsForQueueByStatuses,
  removeFinishedBackgroundJobByDedupeKey,
  type BackgroundJobRow,
  type BackgroundJobStatus
} from "@starter/db";

import {
  retentionSecFromRemoveOnComplete,
  retentionSecFromRemoveOnFail,
  type JobEnqueueOptions,
  type JobProducer,
  type JobSnapshot
} from "./types.js";

const ACTIVE_BULL_STATES = new Set(["active", "waiting", "delayed", "prioritized", "wait"]);

const rowToSnapshot = (row: BackgroundJobRow): JobSnapshot => {
  let data: unknown = null;
  let returnvalue: unknown = null;
  try {
    data = JSON.parse(row.payload);
  } catch {
    data = row.payload;
  }
  if (row.result) {
    try {
      returnvalue = JSON.parse(row.result);
    } catch {
      returnvalue = row.result;
    }
  }
  return {
    id: row.dedupeKey ?? row.id,
    name: row.jobName,
    state: row.status,
    data,
    returnvalue,
    failedReason: row.error,
    processedOn: row.processedAt ? row.processedAt.getTime() : null,
    finishedOn: row.finishedAt ? row.finishedAt.getTime() : null,
    attemptsMade: row.attempts,
    timestamp: row.createdAt.getTime()
  };
};

/** Creates a `JobProducer` backed by SQL `background_jobs` rows. */
export const createDatabaseJobProducer = (): JobProducer => ({
  add: async (queueName, jobName, data, options) => {
    const completedRetentionSec = retentionSecFromRemoveOnComplete(options?.removeOnComplete);
    const failedRetentionSec = retentionSecFromRemoveOnFail(options?.removeOnFail);
    const { id } = await enqueueBackgroundJob({
      queueName,
      jobName,
      payload: data,
      dedupeKey: options?.jobId,
      priority: options?.priority,
      maxAttempts: options?.attempts ?? 3,
      completedRetentionSec,
      failedRetentionSec
    });
    return { id: options?.jobId ?? id };
  },
  getJob: async (queueName, jobId) => {
    const byDedupe = await getBackgroundJobByDedupeKeyAnyStatus(queueName, jobId);
    if (byDedupe) return rowToSnapshot(byDedupe);
    const byId = await getBackgroundJobById(jobId);
    if (!byId || byId.queueName !== queueName) return null;
    return rowToSnapshot(byId);
  },
  getJobsByStates: async (queueName, states) => {
    const wantActive = states.some((s) => ACTIVE_BULL_STATES.has(s));
    const wantTerminal = states.some((s) => s === "completed" || s === "failed");
    const statuses: BackgroundJobStatus[] = [];
    if (wantActive) statuses.push(...BACKGROUND_JOB_ACTIVE_STATUSES);
    if (wantTerminal) statuses.push(...BACKGROUND_JOB_TERMINAL_STATUSES);
    const rows = await listBackgroundJobsForQueueByStatuses(queueName, statuses);
    return rows.map(rowToSnapshot);
  },
  removeFinishedJob: async (queueName, jobId) => {
    await removeFinishedBackgroundJobByDedupeKey(queueName, jobId);
  },
  isJobActive: async (queueName, jobId) => {
    const row = await getBackgroundJobByDedupeKey(queueName, jobId);
    return row != null;
  }
});