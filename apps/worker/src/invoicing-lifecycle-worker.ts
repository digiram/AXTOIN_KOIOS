/**
 * Invoicing lifecycle BullMQ worker and shared job processor.
 *
 * Scans for expiring offers, overdue invoices, and payment reminders; fans out
 * per-document jobs and enqueues reminder emails on the email queue.
 *
 * Responsibilities:
 * - Resolve `{prod|dev}-invoicing-lifecycle` queue name
 * - Batch scan → expire offer, mark overdue, schedule payment reminder
 * - Hand off reminder email payloads to `{prod|dev}-email` queue
 *
 * Security:
 * - All repo mutations require tenant id from job payload
 *
 * Related:
 * - [`docs/invoicing-quoting-module.md`](../../../docs/invoicing-quoting-module.md)
 */

import {
  INVOICING_EXPIRE_OFFER_JOB_NAME,
  INVOICING_LIFECYCLE_SCAN_JOB_NAME,
  INVOICING_MARK_INVOICE_OVERDUE_JOB_NAME,
  INVOICING_PAYMENT_REMINDER_EMAIL_JOB_NAME,
  INVOICING_PAYMENT_REMINDER_JOB_NAME
} from "@starter/shared";
import { Queue, Worker, type Job } from "bullmq";
import type { Redis } from "ioredis";
import { createLogger } from "@starter/logger";

import {
  expireOfferById,
  invoicingLifecycleJobId,
  listInvoicesDueForOverdue,
  listInvoicesDueForPaymentReminders,
  listOffersDueForExpiry,
  markInvoiceOverdueById,
  processInvoicingPaymentReminder
} from "@starter/db";

const log = createLogger("worker-invoicing-lifecycle");

/** BullMQ queue name for invoicing lifecycle scan and document jobs. */
export const resolveInvoicingLifecycleQueueName = (): string =>
  `${process.env.NODE_ENV === "production" ? "prod" : "dev"}-invoicing-lifecycle`;

const LIFECYCLE_SCAN_BATCH = 200;

const handleLifecycleScan = async (queue: Queue): Promise<{ enqueued: number }> => {
  let enqueued = 0;

  const offers = await listOffersDueForExpiry(LIFECYCLE_SCAN_BATCH);
  for (const row of offers) {
    await queue.add(
      INVOICING_EXPIRE_OFFER_JOB_NAME,
      { tenantId: row.tenantId, offerId: row.offerId },
      {
        jobId: invoicingLifecycleJobId("expire-offer", row.tenantId, row.offerId),
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 86_400 }
      }
    );
    enqueued += 1;
  }

  const overdue = await listInvoicesDueForOverdue(LIFECYCLE_SCAN_BATCH);
  for (const row of overdue) {
    await queue.add(
      INVOICING_MARK_INVOICE_OVERDUE_JOB_NAME,
      { tenantId: row.tenantId, invoiceId: row.invoiceId },
      {
        jobId: invoicingLifecycleJobId("mark-overdue", row.tenantId, row.invoiceId),
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 86_400 }
      }
    );
    enqueued += 1;
  }

  const reminders = await listInvoicesDueForPaymentReminders(LIFECYCLE_SCAN_BATCH);
  for (const row of reminders) {
    await queue.add(
      INVOICING_PAYMENT_REMINDER_JOB_NAME,
      {
        tenantId: row.tenantId,
        invoiceId: row.invoiceId,
        reminderKind: row.reminderKind
      },
      {
        jobId: invoicingLifecycleJobId(
          "payment-reminder",
          row.tenantId,
          row.invoiceId,
          row.reminderKind
        ),
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 86_400 }
      }
    );
    enqueued += 1;
  }

  log.info(
    { offers: offers.length, overdue: overdue.length, reminders: reminders.length, enqueued },
    "invoicing lifecycle scan fan-out complete"
  );
  return { enqueued };
};

const handleExpireOffer = async (job: Job): Promise<Record<string, unknown>> => {
  const { tenantId, offerId } = job.data as { tenantId: string; offerId: string };
  return expireOfferById(tenantId, offerId);
};

const handleMarkOverdue = async (job: Job): Promise<Record<string, unknown>> => {
  const { tenantId, invoiceId } = job.data as { tenantId: string; invoiceId: string };
  return markInvoiceOverdueById(tenantId, invoiceId);
};

const handlePaymentReminder = async (emailQueue: Queue, job: Job): Promise<Record<string, unknown>> => {
  const { tenantId, invoiceId, reminderKind } = job.data as {
    tenantId: string;
    invoiceId: string;
    reminderKind: "first" | "second";
  };
  const result = await processInvoicingPaymentReminder(tenantId, invoiceId, reminderKind);
  if (!result.sent || !result.emailJob) {
    return { sent: false, reason: result.reason ?? "skipped" };
  }

  const emailQueueName = `${process.env.NODE_ENV === "production" ? "prod" : "dev"}-email`;
  await emailQueue.add(INVOICING_PAYMENT_REMINDER_EMAIL_JOB_NAME, result.emailJob, {
    removeOnComplete: { age: 3600 },
    removeOnFail: { age: 86_400 }
  });

  return { sent: true, reminderKind, invoiceId };
};

/**
 * Dispatches invoicing lifecycle jobs; may enqueue follow-up email jobs.
 *
 * @param lifecycleQueue - Used for scan fan-out when processing via SQL adapter.
 * @param emailQueue - Target for payment reminder HTML sends.
 */
export const processInvoicingLifecycleJob = async (
  jobName: string,
  data: Record<string, unknown>,
  lifecycleQueue: Queue,
  emailQueue: Queue
): Promise<Record<string, unknown>> => {
  if (jobName === INVOICING_LIFECYCLE_SCAN_JOB_NAME) {
    return handleLifecycleScan(lifecycleQueue);
  }
  if (jobName === INVOICING_EXPIRE_OFFER_JOB_NAME) {
    return handleExpireOffer({ data } as Job);
  }
  if (jobName === INVOICING_MARK_INVOICE_OVERDUE_JOB_NAME) {
    return handleMarkOverdue({ data } as Job);
  }
  if (jobName === INVOICING_PAYMENT_REMINDER_JOB_NAME) {
    return handlePaymentReminder(emailQueue, { data } as Job);
  }
  log.warn({ jobName }, "Unknown invoicing-lifecycle job");
  return { handled: false };
};

/** Starts BullMQ worker for external Redis queue strategy. */
export const startInvoicingLifecycleWorker = (redis: Redis): Worker => {
  const queueName = resolveInvoicingLifecycleQueueName();
  const worker = new Worker(
    queueName,
    async (job) => {
      if (job.name === INVOICING_LIFECYCLE_SCAN_JOB_NAME) {
        const lifecycleQueue = new Queue(resolveInvoicingLifecycleQueueName(), { connection: redis });
        try {
          return await handleLifecycleScan(lifecycleQueue);
        } finally {
          await lifecycleQueue.close();
        }
      }
      if (job.name === INVOICING_EXPIRE_OFFER_JOB_NAME) {
        return handleExpireOffer(job);
      }
      if (job.name === INVOICING_MARK_INVOICE_OVERDUE_JOB_NAME) {
        return handleMarkOverdue(job);
      }
      if (job.name === INVOICING_PAYMENT_REMINDER_JOB_NAME) {
        const emailQueueName = `${process.env.NODE_ENV === "production" ? "prod" : "dev"}-email`;
        const emailQueue = new Queue(emailQueueName, { connection: redis });
        try {
          return await handlePaymentReminder(emailQueue, job);
        } finally {
          await emailQueue.close();
        }
      }
      log.warn({ jobId: job.id, jobName: job.name }, "Unknown invoicing-lifecycle job");
      return { handled: false };
    },
    { connection: redis, concurrency: 2 }
  );

  worker.on("failed", (job, err) => {
    log.error({ err, jobId: job?.id, jobName: job?.name }, "invoicing-lifecycle job failed");
  });

  return worker;
};
