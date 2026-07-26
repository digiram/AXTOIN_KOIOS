/**
 * Tests for CRM primary address city normalization.
 *
 * Under test: `../src/crm.js`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatCrmPrimaryAddressCity } from "../src/crm.js";

describe("formatCrmPrimaryAddressCity", () => {
  it("uses primary typed row city", () => {
    const s = formatCrmPrimaryAddressCity({
      addresses: [
        {
          kind: "Work",
          addressLine1: "1 Main",
          addressLine2: null,
          houseNumber: null,
          postalCode: "12345",
          city: "Boston",
          state: "MA",
          country: "US",
          isPrimary: false
        },
        {
          kind: "HQ",
          addressLine1: "2 Oak",
          addressLine2: null,
          houseNumber: null,
          postalCode: null,
          city: "Cambridge",
          state: "MA",
          country: "US",
          isPrimary: true
        }
      ]
    });
    assert.equal(s, "Cambridge");
  });

  it("falls back to legacy city when no typed addresses", () => {
    assert.equal(
      formatCrmPrimaryAddressCity({
        addresses: [],
        city: "Berlin"
      }),
      "Berlin"
    );
  });
});
