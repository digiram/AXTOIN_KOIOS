/**
 * Tests for platform subscription catalog plan schemas.
 *
 * Under test: `../src/platform-subscriptions.js`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  platformSubscriptionPaymentsExportQuerySchema,
  platformSubscriptionPaymentsListQuerySchema,
  platformSubscriptionPlanAuditListQuerySchema,
  platformSubscriptionPlanCreateBodySchema,
  platformSubscriptionPlanSetDisabledBodySchema,
  platformSubscriptionSettingsPutBodySchema
} from "../src/platform-subscriptions.js";

describe("platformSubscriptionSettingsPutBodySchema", () => {
  it("rejects empty body", () => {
    assert.equal(platformSubscriptionSettingsPutBodySchema.safeParse({}).success, false);
  });

  it("accepts subscriptionsEnabled only", () => {
    const r = platformSubscriptionSettingsPutBodySchema.safeParse({ subscriptionsEnabled: true });
    assert.equal(r.success, true);
  });

  it("accepts subscriptionCurrencyCode only", () => {
    const r = platformSubscriptionSettingsPutBodySchema.safeParse({ subscriptionCurrencyCode: "EUR" });
    assert.equal(r.success, true);
  });

  it("accepts both fields", () => {
    const r = platformSubscriptionSettingsPutBodySchema.safeParse({
      subscriptionsEnabled: false,
      subscriptionCurrencyCode: "USD"
    });
    assert.equal(r.success, true);
  });
});

describe("platformSubscriptionPlanCreateBodySchema", () => {
  const validBase = {
    tierName: "Pro",
    durationUnit: "month" as const,
    durationCount: 1,
    priceCents: 1000,
    allowCancelAnytime: false,
    billingScope: "tenant" as const
  };

  it("accepts body without currencyCode (server applies platform currency)", () => {
    const r = platformSubscriptionPlanCreateBodySchema.safeParse(validBase);
    assert.equal(r.success, true);
  });

  it("rejects legacy currencyCode field (strict)", () => {
    const r = platformSubscriptionPlanCreateBodySchema.safeParse({
      ...validBase,
      currencyCode: "USD"
    });
    assert.equal(r.success, false);
  });

  it("accepts optional trialDays and allowTierChangeNextPeriod", () => {
    const r = platformSubscriptionPlanCreateBodySchema.safeParse({
      ...validBase,
      trialDays: 14,
      allowTierChangeNextPeriod: false
    });
    assert.equal(r.success, true);
  });
});

describe("platformSubscriptionPlanSetDisabledBodySchema", () => {
  it("accepts disabled boolean", () => {
    const r = platformSubscriptionPlanSetDisabledBodySchema.safeParse({ disabled: true });
    assert.equal(r.success, true);
  });

  it("rejects missing disabled", () => {
    assert.equal(platformSubscriptionPlanSetDisabledBodySchema.safeParse({}).success, false);
  });
});

describe("platformSubscriptionPaymentsListQuerySchema", () => {
  it("applies default limit and offset", () => {
    const r = platformSubscriptionPaymentsListQuerySchema.safeParse({});
    assert.equal(r.success, true);
    if (r.success) {
      assert.equal(r.data.limit, 50);
      assert.equal(r.data.offset, 0);
    }
  });

  it("rejects limit above 200", () => {
    assert.equal(platformSubscriptionPaymentsListQuerySchema.safeParse({ limit: 201 }).success, false);
  });

  it("accepts tenant and status", () => {
    const r = platformSubscriptionPaymentsListQuerySchema.safeParse({
      tenantId: "00000000-0000-4000-8000-000000000001",
      status: "paid",
      limit: 100,
      offset: 10
    });
    assert.equal(r.success, true);
  });
});

describe("platformSubscriptionPaymentsExportQuerySchema", () => {
  it("accepts filter fields only", () => {
    const r = platformSubscriptionPaymentsExportQuerySchema.safeParse({
      tenantId: "00000000-0000-4000-8000-000000000002",
      status: "due"
    });
    assert.equal(r.success, true);
  });

  it("rejects extra keys (strict)", () => {
    const r = platformSubscriptionPaymentsExportQuerySchema.safeParse({ limit: 50 });
    assert.equal(r.success, false);
  });
});

describe("platformSubscriptionPlanAuditListQuerySchema", () => {
  it("defaults limit and offset", () => {
    const r = platformSubscriptionPlanAuditListQuerySchema.safeParse({});
    assert.equal(r.success, true);
    if (r.success) {
      assert.equal(r.data.limit, 50);
      assert.equal(r.data.offset, 0);
    }
  });
});
