/**
 * BullMQ producer for background jobs (paired with `apps/worker`).
 *
 * Queue naming **must stay aligned** with the worker: `{prod|dev}-email` so jobs are consumed.
 * Registration uses `enqueueWelcomeEmail` as a fire-and-forget step; if Redis is down locally,
 * registration still succeeds — only the async notification is skipped.
 */

import { PLATFORM_QUEUE_TEST_JOB_NAME } from "@starter/shared";
import { createLogger } from "@starter/logger";

import { getJobProducer } from "./job-queue/index.js";

const log = createLogger("api-queue");

export const resolveEmailQueueName = (): string =>
  `${process.env.NODE_ENV === "production" ? "prod" : "dev"}-email`;

export const enqueueWelcomeEmail = async (payload: { userId: string; tenantId: string }) => {
  try {
    await getJobProducer().add(resolveEmailQueueName(), "welcome-email", payload, {
      removeOnComplete: true
    });
    log.debug(
      { tenantId: payload.tenantId, userId: payload.userId },
      "Welcome-email job enqueued"
    );
  } catch (err) {
    log.warn(
      { err, tenantId: payload.tenantId },
      "Welcome-email enqueue failed - onboarding continues without background notification"
    );
  }
};

/** Super-admin probe: enqueue completes quickly; keep completed rows briefly for the jobs UI. */
export const enqueuePlatformQueueTestJob = async (): Promise<{ jobId: string }> => {
  const { id: jobId } = await getJobProducer().add(
    resolveEmailQueueName(),
    PLATFORM_QUEUE_TEST_JOB_NAME,
    { requestedAt: new Date().toISOString() },
    {
      removeOnComplete: { age: 300 },
      removeOnFail: { age: 86_400 }
    }
  );
  log.info({ jobId }, "platform-queue-test job enqueued");
  return { jobId };
};
