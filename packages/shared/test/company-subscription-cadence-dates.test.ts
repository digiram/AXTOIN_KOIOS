/**
 * Tests for company subscription billing cadence date math.
 *
 * Under test: `../src/company-subscription-cadence-dates.js`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { addBillingCadenceToIsoDate, deriveRenewalAndEndFromStart } from "../src/company-subscription-cadence-dates.js";

describe("company subscription cadence dates", () => {
  it("adds one month for monthly cadence", () => {
    assert.equal(addBillingCadenceToIsoDate("2026-01-15", { cadenceKind: "monthly" }), "2026-02-15");
  });

  it("adds one month from month end", () => {
    assert.equal(addBillingCadenceToIsoDate("2026-01-31", { cadenceKind: "monthly" }), "2026-02-28");
  });

  it("adds custom interval", () => {
    assert.equal(
      addBillingCadenceToIsoDate("2026-03-01", {
        cadenceKind: "custom",
        cadenceIntervalCount: 2,
        cadenceIntervalUnit: "week"
      }),
      "2026-03-15"
    );
  });

  it("derives renewal and end from start", () => {
    assert.deepEqual(deriveRenewalAndEndFromStart("2026-05-19", { cadenceKind: "monthly" }), {
      renewalDate: "2026-06-19",
      endDate: "2026-06-19"
    });
  });
});
