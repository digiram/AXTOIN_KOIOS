/**
 * BullMQ producer for invoicing lifecycle jobs (`{prod|dev}-invoicing-lifecycle`).
 */

import { INVOICING_LIFECYCLE_SCAN_JOB_NAME } from "@starter/shared";
import { createLogger } from "@starter/logger";

import { getJobProducer } from "./job-queue/index.js";

const log = createLogger("api-invoicing-lifecycle-queue");

export const resolveInvoicingLifecycleQueueName = (): string =>
  `${process.env.NODE_ENV === "production" ? "prod" : "dev"}-invoicing-lifecycle`;

/** Enqueue a daily scan; fan-out is handled in the worker. */
export const enqueueInvoicingLifecycleScan = async (): Promise<{ jobId: string }> => {
  const { id: jobId } = await getJobProducer().add(
    resolveInvoicingLifecycleQueueName(),
    INVOICING_LIFECYCLE_SCAN_JOB_NAME,
    { requestedAt: new Date().toISOString() },
    {
      jobId: `invoicing-lifecycle-scan:${new Date().toISOString().slice(0, 13)}`,
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 86_400 }
    }
  );
  log.info({ jobId }, "invoicing-lifecycle scan enqueued");
  return { jobId };
};
