/**
 * Tests for UTC subscription period boundary and v1 plan eligibility helpers.
 *
 * Under test: `../src/subscription-billing.js`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { addDaysUtc, addMonthsUtc, isV1SubscriberPlan } from "../src/subscription-billing.js";

describe("subscription-billing", () => {
  it("addDaysUtc adds calendar days in UTC", () => {
    const start = new Date(Date.UTC(2026, 0, 28, 12, 0, 0));
    const next = addDaysUtc(start, 4);
    assert.equal(next.getUTCMonth(), 1);
    assert.equal(next.getUTCDate(), 1);
  });

  it("addMonthsUtc rolls anchor in UTC with day clamp", () => {
    const start = new Date(Date.UTC(2024, 0, 31, 12, 0, 0));
    const next = addMonthsUtc(start, 1);
    assert.equal(next.getUTCMonth(), 1);
    assert.equal(next.getUTCDate(), 29);
  });

  it("isV1SubscriberPlan accepts monthly count 1 only", () => {
    assert.equal(isV1SubscriberPlan("month", 1), true);
    assert.equal(isV1SubscriberPlan("year", 1), false);
    assert.equal(isV1SubscriberPlan("month", 3), false);
  });
});
