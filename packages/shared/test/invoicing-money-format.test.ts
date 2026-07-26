/**
 * Tests for invoicing money display formatting helpers.
 *
 * Under test: `../src/invoicing.js`, `../src/regional-date-format.js`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatInvoicingMoneyMinor } from "../src/invoicing.js";

describe("formatInvoicingMoneyMinor", () => {
  it("places the currency symbol on the left with a space (en-US)", () => {
    assert.equal(formatInvoicingMoneyMinor(12_100, "EUR", "en-US"), "€ 121.00");
    assert.equal(formatInvoicingMoneyMinor(12_100, "USD", "en-US"), "$ 121.00");
  });

  it("keeps the symbol on the left while using locale separators", () => {
    assert.equal(formatInvoicingMoneyMinor(1_234_567, "EUR", "de-DE"), "€ 12.345,67");
    assert.equal(formatInvoicingMoneyMinor(1_234_567, "EUR", "fr-FR"), "€ 12\u202f345,67");
  });
});
