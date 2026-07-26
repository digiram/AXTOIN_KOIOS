/**
 * Tests for customer offer accept/reject response validation.
 *
 * Under test: `../src/invoicing.js`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  INVOICING_OFFER_RESPONSE_TOKEN_BYTE_LENGTH,
  invoicingPublicOfferDecisionBodySchema
} from "../src/invoicing.js";
import {
  formatInvoicingPublicOfferDecisionProof,
  isInvoicingOfferCustomerResponseAllowed
} from "../src/invoicing-lifecycle.js";

describe("isInvoicingOfferCustomerResponseAllowed", () => {
  it("allows draft and sent offers before validity lapses", () => {
    assert.equal(isInvoicingOfferCustomerResponseAllowed("offer_sent", "2099-01-01", "2026-06-14"), true);
    assert.equal(isInvoicingOfferCustomerResponseAllowed("offer_draft", "2099-01-01", "2026-06-14"), true);
  });

  it("denies accepted, rejected, and expired offers", () => {
    assert.equal(isInvoicingOfferCustomerResponseAllowed("offer_accepted", "2099-01-01", "2026-06-14"), false);
    assert.equal(isInvoicingOfferCustomerResponseAllowed("offer_rejected", "2099-01-01", "2026-06-14"), false);
    assert.equal(isInvoicingOfferCustomerResponseAllowed("offer_sent", "2020-01-01", "2026-06-14"), false);
  });
});

describe("formatInvoicingPublicOfferDecisionProof", () => {
  it("combines responder name and comment", () => {
    assert.equal(
      formatInvoicingPublicOfferDecisionProof({ responderName: "Jane Doe", comment: "Approved as discussed." }),
      "Jane Doe: Approved as discussed."
    );
  });
});

describe("invoicingPublicOfferDecisionBodySchema", () => {
  it("requires a non-empty trimmed name and comment", () => {
    const invalid = invoicingPublicOfferDecisionBodySchema.safeParse({
      decision: "accept",
      responderName: "   ",
      comment: "   "
    });
    assert.equal(invalid.success, false);
    if (!invalid.success) {
      assert.equal(invalid.error.flatten().fieldErrors.responderName?.[0], "Your name is required");
      assert.equal(invalid.error.flatten().fieldErrors.comment?.[0], "A comment is required");
    }

    const valid = invoicingPublicOfferDecisionBodySchema.safeParse({
      decision: "reject",
      responderName: "Jane Doe",
      comment: "Not proceeding this quarter."
    });
    assert.equal(valid.success, true);
  });
});

describe("INVOICING_OFFER_RESPONSE_TOKEN_BYTE_LENGTH", () => {
  it("uses a high-entropy default", () => {
    assert.equal(INVOICING_OFFER_RESPONSE_TOKEN_BYTE_LENGTH, 48);
  });
});
