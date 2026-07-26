/**
 * Subscription billing BullMQ worker and shared job processor.
 *
 * Scans subscriptions due for renewal and enqueues per-subscription charge jobs.
 * Charge handler delegates to `@starter/db` renewal logic (PSP integration).
 *
 * Responsibilities:
 * - Resolve `{prod|dev}-subscription-billing` queue name
 * - Fan-out renewal scan batch to charge jobs with dedupe ids
 * - Surface failures for BullMQ retry semantics
 *
 * Security:
 * - `tenantId` on charge jobs must match subscription row during processing
 *
 * Related:
 * - [`docs/company-subscriptions-module.md`](../../../docs/company-subscriptions-module.md) (realm billing glossary)
 */

import {
  SUBSCRIPTION_BILLING_RENEWAL_CHARGE_JOB_NAME,
  SUBSCRIPTION_BILLING_RENEWAL_SCAN_JOB_NAME
} from "@starter/shared";
import { Queue, Worker, type Job } from "bullmq";
import type { Redis } from "ioredis";
import { createLogger } from "@starter/logger";

import {
  listSubscriptionsDueForRenewal,
  processSubscriptionRenewal,
  subscriptionRenewalJobId
} from "@starter/db";

const log = createLogger("worker-subscription-billing");

/** BullMQ queue name for realm subscription renewal jobs. */
export const resolveSubscriptionBillingQueueName = (): string =>
  `${process.env.NODE_ENV === "production" ? "prod" : "dev"}-subscription-billing`;

const RENEWAL_SCAN_BATCH = 200;

const handleRenewalScan = async (queue: Queue): Promise<{ enqueued: number }> => {
  const due = await listSubscriptionsDueForRenewal(RENEWAL_SCAN_BATCH);
  let enqueued = 0;
  for (const row of due) {
    const jobId = subscriptionRenewalJobId(row.id, row.currentPeriodEnd);
    await queue.add(
      SUBSCRIPTION_BILLING_RENEWAL_CHARGE_JOB_NAME,
      {
        subscriptionId: row.id,
        tenantId: row.tenantId,
        periodStartIso: row.currentPeriodEnd.toISOString()
      },
      {
        jobId,
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 86_400 }
      }
    );
    enqueued += 1;
  }
  log.info({ due: due.length, enqueued }, "subscription renewal scan fan-out complete");
  return { enqueued };
};

const handleRenewalCharge = async (job: Job): Promise<Record<string, unknown>> => {
  const { subscriptionId, tenantId } = job.data as {
    subscriptionId: string;
    tenantId: string;
  };
  const result = await processSubscriptionRenewal(subscriptionId, tenantId);
  if (!result.ok) {
    throw new Error(`renewal failed: ${result.error}`);
  }
  if ("skipped" in result && result.skipped) {
    return { skipped: true, reason: result.reason };
  }
  if ("paymentId" in result) {
    return { paymentId: result.paymentId, subscriptionId: result.subscription.id };
  }
  return { skipped: true };
};

/**
 * Processes subscription billing jobs (scan fan-out or renewal charge).
 *
 * @param queue - Used for scan fan-out when processing scan job via SQL adapter.
 */
export const processSubscriptionBillingJob = async (
  jobName: string,
  data: Record<string, unknown>,
  queue: Queue
): Promise<Record<string, unknown>> => {
  if (jobName === SUBSCRIPTION_BILLING_RENEWAL_SCAN_JOB_NAME) {
    return handleRenewalScan(queue);
  }
  if (jobName === SUBSCRIPTION_BILLING_RENEWAL_CHARGE_JOB_NAME) {
    return handleRenewalCharge({ data } as Job);
  }
  log.warn({ jobName }, "Unknown subscription-billing job");
  return { handled: false };
};

/** Starts BullMQ worker for external Redis queue strategy. */
export const startSubscriptionBillingWorker = (redis: Redis): Worker => {
  const queueName = resolveSubscriptionBillingQueueName();
  const worker = new Worker(
    queueName,
    async (job) => {
      if (job.name === SUBSCRIPTION_BILLING_RENEWAL_SCAN_JOB_NAME) {
        const queue = new Queue(resolveSubscriptionBillingQueueName(), { connection: redis });
        try {
          return await handleRenewalScan(queue);
        } finally {
          await queue.close();
        }
      }
      if (job.name === SUBSCRIPTION_BILLING_RENEWAL_CHARGE_JOB_NAME) {
        return handleRenewalCharge(job);
      }
      log.warn({ jobId: job.id, jobName: job.name }, "Unknown subscription-billing job");
      return { handled: false };
    },
    { connection: redis, concurrency: 2 }
  );

  worker.on("failed", (job, err) => {
    log.error({ err, jobId: job?.id, jobName: job?.name }, "subscription-billing job failed");
  });

  return worker;
};
