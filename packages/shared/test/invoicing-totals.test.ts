/**
 * Tests for invoicing line-item total and tax aggregation helpers.
 *
 * Under test: `../src/invoicing-totals.js`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sumInvoicingDocumentTotalsFromStoredLines } from "../src/invoicing-totals.js";

describe("sumInvoicingDocumentTotalsFromStoredLines", () => {
  it("subtracts payment credit lines from document totals", () => {
    const totals = sumInvoicingDocumentTotalsFromStoredLines([
      {
        lineSubtotalMinor: 10_000,
        lineTaxMinor: 2_100,
        lineTotalMinor: 12_100,
        discountMinor: 0,
        taxRateBps: 2100
      },
      {
        lineSubtotalMinor: -3_000,
        lineTaxMinor: 0,
        lineTotalMinor: -3_000,
        discountMinor: 0,
        taxRateBps: 0
      }
    ]);

    assert.equal(totals.subtotalExcludingTaxMinor, 7_000);
    assert.equal(totals.taxTotalMinor, 2_100);
    assert.equal(totals.totalIncludingTaxMinor, 9_100);
    assert.deepEqual(totals.taxBreakdown, [{ taxRateBps: 2100, taxMinor: 2_100 }]);
  });
});
