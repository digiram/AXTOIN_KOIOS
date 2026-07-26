/**
 * Tests for company subscription monthly cost normalization.
 *
 * Under test: `../src/company-subscription-recurring-cost.js`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  amountMinorPerMonth,
  planMonthlyCostMinor,
  planSeatMultiplier,
  sumPlansMonthlyCostMinor
} from "../src/company-subscription-recurring-cost.js";

describe("company subscription recurring cost", () => {
  it("normalizes monthly cadence unchanged", () => {
    assert.equal(amountMinorPerMonth(12_000, { cadenceKind: "monthly" }), 12_000);
  });

  it("normalizes yearly to monthly", () => {
    assert.equal(amountMinorPerMonth(12_000, { cadenceKind: "yearly" }), 1_000);
  });

  it("normalizes quarterly to monthly", () => {
    assert.equal(amountMinorPerMonth(3_000, { cadenceKind: "quarterly" }), 1_000);
  });

  it("normalizes custom bi-weekly", () => {
    assert.equal(
      amountMinorPerMonth(2_000, {
        cadenceKind: "custom",
        cadenceIntervalCount: 2,
        cadenceIntervalUnit: "week"
      }),
      Math.round((2_000 * (52 / 2)) / 12)
    );
  });

  it("uses licensed seat count as multiplier", () => {
    assert.equal(planSeatMultiplier(5, 2), 5);
    assert.equal(planSeatMultiplier(null, 3), 3);
    assert.equal(planSeatMultiplier(null, 0), 1);
  });

  it("computes plan monthly cost per seat times seats", () => {
    assert.equal(
      planMonthlyCostMinor({ amountMinor: 1_000, cadenceKind: "monthly", seatCount: 4 }),
      4_000
    );
  });

  it("sums seated plan costs with seat multipliers", () => {
    assert.equal(
      sumPlansMonthlyCostMinor([
        { amountMinor: 1_000, cadenceKind: "monthly", seatCount: 2 },
        { amountMinor: 12_000, cadenceKind: "yearly", seatCount: 1 }
      ]),
      3_000
    );
  });
});
