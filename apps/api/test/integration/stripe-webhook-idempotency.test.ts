/**
 * Integration tests for Stripe webhook idempotency claims in `@starter/db`.
 *
 * Requires database; gated by `RUN_INTEGRATION_TESTS`.
 */

import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import { claimStripeWebhookEvent, releaseStripeWebhookEvent } from "@starter/db";

import { canRunIntegrationTests, ensureIntegrationMigrations } from "./helpers.js";

const describeIntegration = (await canRunIntegrationTests()) ? describe : describe.skip;

describeIntegration("integration: stripe webhook idempotency", () => {
  before(async () => {
    await ensureIntegrationMigrations();
  });

  it("claimStripeWebhookEvent allows first claim and rejects duplicate", async () => {
    const eventId = `evt_test_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const first = await claimStripeWebhookEvent(eventId, "payment_intent.succeeded");
    assert.equal(first, true);
    const second = await claimStripeWebhookEvent(eventId, "payment_intent.succeeded");
    assert.equal(second, false);
    await releaseStripeWebhookEvent(eventId);
    const third = await claimStripeWebhookEvent(eventId, "payment_intent.succeeded");
    assert.equal(third, true);
  });
});
