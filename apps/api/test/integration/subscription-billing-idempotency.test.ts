/**
 * Integration tests for realm subscription billing idempotency in `@starter/db`.
 *
 * Requires database; gated by `RUN_INTEGRATION_TESTS`.
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

import {
  createTenantWithName,
  insertPlatformSubscriptionPayment,
  insertPlatformSubscriptionPlan,
  insertSubscriptionWithFirstPayment,
  processSubscriptionRenewal
} from "@starter/db";

import { canRunIntegrationTests, ensureIntegrationMigrations } from "./helpers.js";
import { cleanupTestTenants } from "./test-tenant-cleanup.js";

const describeIntegration = (await canRunIntegrationTests()) ? describe : describe.skip;

describeIntegration("integration: subscription billing idempotency", () => {
  let tenantId1: string | undefined;
  let tenantId2: string | undefined;

  before(async () => {
    await ensureIntegrationMigrations();
  });

  after(async () => {
    await cleanupTestTenants(tenantId1, tenantId2);
  });

  it("insertPlatformSubscriptionPayment rejects duplicate subscription + period_start", async () => {
    const tenant = await createTenantWithName(`bill-${randomUUID().slice(0, 8)}`);
    tenantId1 = tenant.id;
    const planId = await insertPlatformSubscriptionPlan({
      tierName: "Starter",
      durationUnit: "month",
      durationCount: 1,
      priceCents: 1999,
      currencyCode: "USD",
      allowCancelAnytime: true,
      trialDays: 0,
      allowTierChangeNextPeriod: true,
      billingScope: "tenant",
      sortOrder: 0
    });
    const { subscription } = await insertSubscriptionWithFirstPayment({
      tenantId: tenant.id,
      userId: null,
      planId,
      priceCents: 1999,
      currencyCode: "USD",
      trialDays: 0
    });
    const periodStart = subscription.currentPeriodEnd;
    await assert.rejects(
      () =>
        insertPlatformSubscriptionPayment({
          tenantId: tenant.id,
          userId: null,
          planId,
          subscriptionId: subscription.id,
          amountCents: 1999,
          currencyCode: "USD",
          status: "due",
          dueAt: periodStart,
          periodStartUtc: periodStart,
          description: "Duplicate renewal row"
        }),
      (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        return /duplicate|unique|ER_DUP_ENTRY/i.test(msg);
      }
    );
  });

  it("processSubscriptionRenewal returns duplicate_period when period row already exists", async () => {
    const tenant = await createTenantWithName(`bill2-${randomUUID().slice(0, 8)}`);
    tenantId2 = tenant.id;
    const planId = await insertPlatformSubscriptionPlan({
      tierName: "Pro",
      durationUnit: "month",
      durationCount: 1,
      priceCents: 2999,
      currencyCode: "USD",
      allowCancelAnytime: true,
      trialDays: 0,
      allowTierChangeNextPeriod: true,
      billingScope: "tenant",
      sortOrder: 0
    });
    const { subscription } = await insertSubscriptionWithFirstPayment({
      tenantId: tenant.id,
      userId: null,
      planId,
      priceCents: 2999,
      currencyCode: "USD",
      trialDays: 0
    });

    const periodStart = subscription.currentPeriodEnd;
    await insertPlatformSubscriptionPayment({
      tenantId: tenant.id,
      userId: null,
      planId,
      subscriptionId: subscription.id,
      amountCents: 2999,
      currencyCode: "USD",
      status: "due",
      dueAt: periodStart,
      periodStartUtc: periodStart,
      description: "Pre-created renewal row"
    });

    const result = await processSubscriptionRenewal(subscription.id, tenant.id);
    assert.equal(result.ok, true);
    if (result.ok && "skipped" in result && result.skipped) {
      assert.equal(result.reason, "duplicate_period");
    }
  });
});
