/**
 * Unit tests for worker queue naming contracts.
 *
 * Verifies email and subscription-billing queue prefixes stay aligned with
 * `apps/api` producers and exports renewal job name constants from `@starter/shared`.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  SUBSCRIPTION_BILLING_RENEWAL_CHARGE_JOB_NAME,
  SUBSCRIPTION_BILLING_RENEWAL_SCAN_JOB_NAME
} from "@starter/shared";

import { resolveSubscriptionBillingQueueName } from "../src/subscription-billing-worker.js";

/**
 * Documents the email queue prefix contract (must stay aligned with `apps/api/src/lib/email-queue.ts`).
 */
const emailQueueName = (nodeEnv: string | undefined) =>
  `${nodeEnv === "production" ? "prod" : "dev"}-email`;

describe("worker email queue naming", () => {
  it("uses dev-email outside production", () => {
    assert.equal(emailQueueName("development"), "dev-email");
    assert.equal(emailQueueName(undefined), "dev-email");
    assert.equal(emailQueueName("test"), "dev-email");
  });

  it("uses prod-email in production", () => {
    assert.equal(emailQueueName("production"), "prod-email");
  });
});

const subscriptionBillingQueueName = (nodeEnv: string | undefined) =>
  `${nodeEnv === "production" ? "prod" : "dev"}-subscription-billing`;

describe("worker subscription-billing queue naming", () => {
  it("matches api producer naming", () => {
    process.env.NODE_ENV = "development";
    assert.equal(subscriptionBillingQueueName("development"), "dev-subscription-billing");
    assert.equal(resolveSubscriptionBillingQueueName(), "dev-subscription-billing");
  });

  it("exports renewal job names for worker handlers", () => {
    assert.equal(SUBSCRIPTION_BILLING_RENEWAL_SCAN_JOB_NAME, "subscription-billing-renewal-scan");
    assert.equal(SUBSCRIPTION_BILLING_RENEWAL_CHARGE_JOB_NAME, "subscription-billing-renewal-charge");
  });
});
