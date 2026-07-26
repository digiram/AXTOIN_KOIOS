/**
 * Platform job queue admin contracts.
 *
 * Known BullMQ queue IDs, job state filters, and test-job enqueue bodies for
 * the super-admin job monitor UI.
 *
 * Responsibilities:
 * - Export queue and job state enums aligned with BullMQ vocabulary
 * - Validate list query and test-job POST bodies
 *
 * Related:
 * - `queue-backend.ts`; worker job handlers in `apps/worker`
 */
import { z } from "zod";

import type { QueueStrategy } from "./queue-backend.js";

/** BullMQ job name used by `POST /platform/job-queues/:queueId/test-job` (worker must handle it). */
export const PLATFORM_QUEUE_TEST_JOB_NAME = "platform-queue-test";

/** Scans due subscriptions and enqueues per-subscription renewal jobs. */
export const SUBSCRIPTION_BILLING_RENEWAL_SCAN_JOB_NAME = "subscription-billing-renewal-scan";

/** Processes one subscription period renewal (idempotent ledger + period roll). */
export const SUBSCRIPTION_BILLING_RENEWAL_CHARGE_JOB_NAME = "subscription-billing-renewal-charge";

/** Known BullMQ queues exposed to the platform admin UI (extend when adding workers). */
export const platformJobQueueIdSchema = z.enum(["email", "subscription-billing", "invoicing-lifecycle", "mail-sync"]);

export type PlatformJobQueueId = z.infer<typeof platformJobQueueIdSchema>;

/** BullMQ job list states aligned with `Queue.getJobs` / `getJobCounts` vocabulary. */
export const platformJobConcreteStateSchema = z.enum([
  "waiting",
  "active",
  "delayed",
  "completed",
  "failed",
  "paused"
]);

export type PlatformJobConcreteState = z.infer<typeof platformJobConcreteStateSchema>;

/** Query filter: includes aggregate `all` (not a row-level BullMQ state). */
export const platformJobStateSchema = z.enum([
  "all",
  "waiting",
  "active",
  "delayed",
  "completed",
  "failed",
  "paused"
]);

export type PlatformJobState = z.infer<typeof platformJobStateSchema>;

/** `GET /platform/job-queues/:queueId/jobs` */
export const platformJobsListQuerySchema = z.object({
  state: platformJobStateSchema.default("waiting"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  start: z.coerce.number().int().min(0).default(0)
});

export type PlatformJobsListQueryInput = z.infer<typeof platformJobsListQuerySchema>;

/** `GET /platform/job-queues/:queueId/jobs` path params */
export const platformJobQueueIdParamsSchema = z.object({
  queueId: platformJobQueueIdSchema
});

export type PlatformJobQueueIdParams = z.infer<typeof platformJobQueueIdParamsSchema>;

/** `GET /platform/job-queues` */
export type PlatformJobQueuesResponse = {
  queues: Array<{
    id: PlatformJobQueueId;
    bullmqName: string;
    counts: {
      waiting: number;
      active: number;
      delayed: number;
      completed: number;
      failed: number;
      paused: number;
      prioritized: number;
      waitingChildren: number;
    };
  }>;
  queueStrategy: QueueStrategy;
};
