/**
 * Enqueue helpers for the SQL-backed queue strategy.
 *
 * Thin wrappers around `@starter/db` enqueue APIs with shared retention and retry
 * defaults from `@starter/shared` mailbox job settings.
 *
 * Responsibilities:
 * - Insert jobs with dedupe keys, priority, and retention windows
 * - Detect active jobs and clear finished dedupe rows for mailbox fan-out
 *
 * Security:
 * - Callers must not embed secrets in job payloads; rows are stored as JSON text
 */

import {
  enqueueBackgroundJob,
  getBackgroundJobByDedupeKey,
  listActiveBackgroundJobsForQueue,
  removeFinishedBackgroundJobByDedupeKey
} from "@starter/db";
import { mailboxSyncJobDefaults } from "@starter/shared";

/** Options mirroring BullMQ job add opts for the database adapter. */
export type DbJobEnqueueOptions = {
  jobId?: string;
  priority?: number;
  completedRetentionSec?: number;
  failedRetentionSec?: number;
  maxAttempts?: number;
};

/**
 * Inserts a background job row for local queue polling.
 *
 * @returns Stable row id (dedupe key when provided, otherwise generated id).
 */
export const dbEnqueueJob = async (
  queueName: string,
  jobName: string,
  data: unknown,
  options?: DbJobEnqueueOptions
): Promise<{ id: string }> => {
  const completedRetentionSec =
    options?.completedRetentionSec ??
    (typeof mailboxSyncJobDefaults.removeOnComplete === "object"
      ? mailboxSyncJobDefaults.removeOnComplete.age
      : undefined);
  const failedRetentionSec =
    options?.failedRetentionSec ??
    (typeof mailboxSyncJobDefaults.removeOnFail === "object" ? mailboxSyncJobDefaults.removeOnFail.age : undefined);

  return enqueueBackgroundJob({
    queueName,
    jobName,
    payload: data,
    dedupeKey: options?.jobId,
    priority: options?.priority,
    maxAttempts: options?.maxAttempts ?? mailboxSyncJobDefaults.attempts,
    completedRetentionSec,
    failedRetentionSec
  });
};

/** Returns whether an active/waiting row exists for the dedupe key. */
export const dbIsJobActive = async (queueName: string, jobId: string): Promise<boolean> => {
  const row = await getBackgroundJobByDedupeKey(queueName, jobId);
  return row != null;
};

/** Removes a terminal job row so the same dedupe key can be re-enqueued. */
export const dbClearFinishedJob = async (queueName: string, jobId: string): Promise<void> => {
  await removeFinishedBackgroundJobByDedupeKey(queueName, jobId);
};

/**
 * Returns whether a mailbox account sync is already queued or running.
 *
 * Checks stable account job id and scans active rows for matching `accountId`.
 */
export const dbIsAccountMailSyncActive = async (
  queueName: string,
  accountId: string,
  accountJobName: string
): Promise<boolean> => {
  const { mailboxSyncAccountJobId } = await import("@starter/shared");
  if (await dbIsJobActive(queueName, mailboxSyncAccountJobId(accountId))) return true;
  const rows = await listActiveBackgroundJobsForQueue(queueName, accountJobName);
  return rows.some((row) => (JSON.parse(row.payload) as { accountId?: string }).accountId === accountId);
};
