/**
 * SQL-backed background job poller (`QUEUE_STRATEGY=local`).
 *
 * Claims rows from `background_jobs`, dispatches to the same handlers as BullMQ workers,
 * and runs periodic GC for completed jobs, cache entries, and stale locks.
 *
 * Responsibilities:
 * - Poll email, subscription-billing, invoicing-lifecycle, and mail-sync queues
 * - Route jobs to tenant mail senders and domain worker processors
 * - Expose `runOneDatabaseQueueJob` for integration tests
 *
 * Depends on:
 * - `@starter/db` claim/complete/fail helpers, `@starter/shared` queue defaults
 *
 * Security:
 * - Parsed job payloads are untrusted; handlers enforce tenant scope in repos
 */

import { hostname } from "node:os";

import {
  DATABASE_QUEUE_DEFAULTS,
  INVOICING_PAYMENT_REMINDER_EMAIL_JOB_NAME,
  PLATFORM_QUEUE_TEST_JOB_NAME
} from "@starter/shared";
import type { Queue } from "bullmq";
import {
  claimNextBackgroundJob,
  completeBackgroundJob,
  deleteExpiredCacheEntries,
  failBackgroundJob,
  purgeDueBackgroundJobs,
  releaseStaleBackgroundJobLocks,
  type BackgroundJobRow,
  type InvoicingPaymentReminderEmailJobPayload
} from "@starter/db";
import { createLogger, printDevServiceReady } from "@starter/logger";

import { DatabaseQueueAdapter } from "./database-queue-adapter.js";
import { processInvoicingLifecycleJob, resolveInvoicingLifecycleQueueName } from "./invoicing-lifecycle-worker.js";
import {
  processMailboxSyncJob,
  resolveMailboxSyncQueueName,
  schedulePeriodicMailboxSyncScan
} from "./mailbox-sync-worker.js";
import {
  processSubscriptionBillingJob,
  resolveSubscriptionBillingQueueName
} from "./subscription-billing-worker.js";
import {
  sendInvoicingPaymentReminderEmailJob,
  sendWelcomeEmailJob
} from "./tenant-mail-jobs.js";

const log = createLogger("worker-database");

const queuePrefix = process.env.NODE_ENV === "production" ? "prod" : "dev";
const emailQueueName = `${queuePrefix}-email`;

const workerId = `${hostname()}-${process.pid}`;

const parsePayload = (row: BackgroundJobRow): Record<string, unknown> => {
  try {
    return JSON.parse(row.payload) as Record<string, unknown>;
  } catch {
    return {};
  }
};

const dispatchEmailJob = async (row: BackgroundJobRow): Promise<Record<string, unknown>> => {
  const data = parsePayload(row);
  if (row.jobName === "welcome-email") {
    return sendWelcomeEmailJob(
      { tenantId: String(data.tenantId ?? ""), userId: String(data.userId ?? "") },
      log
    );
  }
  if (row.jobName === PLATFORM_QUEUE_TEST_JOB_NAME) {
    return { ok: true, probe: true };
  }
  if (row.jobName === INVOICING_PAYMENT_REMINDER_EMAIL_JOB_NAME) {
    return sendInvoicingPaymentReminderEmailJob(data as InvoicingPaymentReminderEmailJobPayload, log);
  }
  log.warn({ jobId: row.id, jobName: row.jobName }, "Unknown email job");
  return { handled: false };
};

const dispatchJob = async (row: BackgroundJobRow): Promise<Record<string, unknown>> => {
  const data = parsePayload(row);
  if (row.queueName === emailQueueName) {
    return dispatchEmailJob(row);
  }
  if (row.queueName === resolveSubscriptionBillingQueueName()) {
    const adapter = new DatabaseQueueAdapter(row.queueName) as unknown as Queue;
    return processSubscriptionBillingJob(row.jobName, data, adapter);
  }
  if (row.queueName === resolveInvoicingLifecycleQueueName()) {
    const lifecycleAdapter = new DatabaseQueueAdapter(row.queueName) as unknown as Queue;
    const emailAdapter = new DatabaseQueueAdapter(emailQueueName) as unknown as Queue;
    return processInvoicingLifecycleJob(row.jobName, data, lifecycleAdapter, emailAdapter);
  }
  if (row.queueName === resolveMailboxSyncQueueName()) {
    const adapter = new DatabaseQueueAdapter(row.queueName) as unknown as Queue;
    return processMailboxSyncJob(row.jobName, data, adapter);
  }
  throw new Error(`Unknown queue: ${row.queueName}`);
};

/**
 * Claims and processes at most one job from a SQL-backed queue.
 *
 * @param queueName - BullMQ-compatible queue name (e.g. `dev-email`).
 * @returns `true` when a job was claimed (even if processing failed).
 */
export const runOneDatabaseQueueJob = async (queueName: string): Promise<boolean> => {
  const row = await claimNextBackgroundJob(queueName, workerId);
  if (!row) return false;

  try {
    const result = await dispatchJob(row);
    await completeBackgroundJob({ id: row.id, result });
    log.debug({ jobId: row.id, jobName: row.jobName, queueName }, "database job completed");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const retryDelayMs = 30_000 * Math.max(1, row.attempts);
    const willRetry = row.attempts < row.maxAttempts;
    await failBackgroundJob({
      id: row.id,
      error: message,
      retryAt: willRetry ? new Date(Date.now() + retryDelayMs) : undefined
    });
    log.error({ err, jobId: row.id, jobName: row.jobName, queueName }, "database job failed");
  }
  return true;
};

const pollQueue = async (queueName: string, concurrency: number): Promise<void> => {
  for (let i = 0; i < concurrency; i += 1) {
    await runOneDatabaseQueueJob(queueName);
  }
};

const runMaintenance = async (): Promise<void> => {
  const purgedJobs = await purgeDueBackgroundJobs(DATABASE_QUEUE_DEFAULTS.jobGcBatchSize);
  const purgedCache = await deleteExpiredCacheEntries(DATABASE_QUEUE_DEFAULTS.cacheGcBatchSize);
  const released = await releaseStaleBackgroundJobLocks(DATABASE_QUEUE_DEFAULTS.staleLockMs);
  if (purgedJobs > 0 || purgedCache > 0 || released > 0) {
    log.info({ purgedJobs, purgedCache, released }, "database queue maintenance");
  }
};

/**
 * Starts interval pollers and maintenance for all local-strategy queues.
 *
 * @param bootStartedAt - Epoch ms captured at worker boot for dev readiness banner.
 *
 * Side effects: `setInterval` poll loops, mailbox periodic scan, dev process registry mark.
 */
export const startDatabaseWorkers = (bootStartedAt: number): void => {
  const pollMs = DATABASE_QUEUE_DEFAULTS.pollIntervalMs;
  const concurrency = DATABASE_QUEUE_DEFAULTS.workerConcurrency;
  const gcMs = DATABASE_QUEUE_DEFAULTS.gcIntervalMs;
  const queueNames = [
    emailQueueName,
    resolveSubscriptionBillingQueueName(),
    resolveInvoicingLifecycleQueueName(),
    resolveMailboxSyncQueueName()
  ];

  log.info(
    {
      queueStrategy: "local",
      pollMs,
      concurrency,
      gcMs,
      completedRetentionSec: DATABASE_QUEUE_DEFAULTS.completedRetentionSec,
      failedRetentionSec: DATABASE_QUEUE_DEFAULTS.failedRetentionSec,
      queues: queueNames
    },
    "Database job poller started"
  );

  const mailboxAdapter = new DatabaseQueueAdapter(resolveMailboxSyncQueueName()) as unknown as Queue;
  schedulePeriodicMailboxSyncScan(mailboxAdapter);

  for (const queueName of queueNames) {
    setInterval(() => {
      void pollQueue(queueName, concurrency).catch((err) => {
        log.error({ err, queueName }, "database queue poll failed");
      });
    }, pollMs);
  }

  setInterval(() => {
    void runMaintenance().catch((err) => log.error({ err }, "database queue maintenance failed"));
  }, gcMs);

  void runMaintenance();

  if ((process.env.NODE_ENV ?? "development") !== "production") {
    printDevServiceReady("@starter/worker", Date.now() - bootStartedAt, [
      { label: "Queue strategy", value: "local (database)" },
      { label: "Poll interval", value: `${pollMs}ms` }
    ]);
    void import("../../../scripts/dev-process-registry.mjs").then((m) =>
      m.markDevProcessReady({ pid: process.pid })
    );
  }
};
