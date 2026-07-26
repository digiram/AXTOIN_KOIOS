/**
 * BullMQ producer for subscription renewal billing (`{prod|dev}-subscription-billing`).
 * Worker handlers live in `apps/worker`.
 */

import {
  SUBSCRIPTION_BILLING_RENEWAL_CHARGE_JOB_NAME,
  SUBSCRIPTION_BILLING_RENEWAL_SCAN_JOB_NAME
} from "@starter/shared";
import { createLogger } from "@starter/logger";

import { subscriptionRenewalJobId } from "@starter/db";

import { getJobProducer } from "./job-queue/index.js";

const log = createLogger("api-subscription-billing-queue");

export const resolveSubscriptionBillingQueueName = (): string =>
  `${process.env.NODE_ENV === "production" ? "prod" : "dev"}-subscription-billing`;

/** Enqueue a scan job (cron / super-admin); fan-out is handled in the worker. */
export const enqueueSubscriptionBillingRenewalScan = async (): Promise<{ jobId: string }> => {
  const { id: jobId } = await getJobProducer().add(
    resolveSubscriptionBillingQueueName(),
    SUBSCRIPTION_BILLING_RENEWAL_SCAN_JOB_NAME,
    { requestedAt: new Date().toISOString() },
    {
      jobId: `renewal-scan:${new Date().toISOString().slice(0, 13)}`,
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 86_400 }
    }
  );
  log.info({ jobId }, "subscription-billing renewal scan enqueued");
  return { jobId };
};

export const enqueueSubscriptionRenewalCharge = async (payload: {
  subscriptionId: string;
  tenantId: string;
  periodStartIso: string;
}): Promise<void> => {
  const periodStart = new Date(payload.periodStartIso);
  await getJobProducer().add(
    resolveSubscriptionBillingQueueName(),
    SUBSCRIPTION_BILLING_RENEWAL_CHARGE_JOB_NAME,
    payload,
    {
      jobId: subscriptionRenewalJobId(payload.subscriptionId, periodStart),
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 86_400 }
    }
  );
};
