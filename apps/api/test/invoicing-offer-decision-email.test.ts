/**
 * Offer decision email HTML — `src/lib/invoicing-offer-decision-email.ts`.
 *
 * Asserts rendered HTML for customer accept/decline offer notifications.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildInvoicingOfferDecisionEmailSubject,
  renderInvoicingOfferDecisionEmailHtml
} from "../src/lib/invoicing-offer-decision-email.js";

describe("renderInvoicingOfferDecisionEmailHtml", () => {
  const baseInput = {
    displayNumber: "O-2026-AB12CD34.0",
    documentDate: "2026-06-14",
    offerExpiryDate: "2026-07-14",
    currencyCode: "EUR",
    totalIncludingTaxMinor: 12_100,
    issuerSnapshot: {
      companyName: "Acme BV",
      companyAddress: "Main Street 1\nAmsterdam",
      companyPhone: null,
      companyEmail: "billing@acme.test",
      vatIdentificationNumber: "NL123",
      chamberOfCommerceNumber: null,
      bankAccountNumber: null
    },
    customerSnapshot: {
      organizationName: "Customer Co",
      contactName: "Jane Doe",
      email: "jane@customer.test",
      phone: null,
      addressLine1: "Client road 9",
      addressLine2: null,
      postalCode: "1000",
      city: "Brussels",
      state: null,
      country: "Belgium"
    },
    footerText: "Thank you for your business.",
    documentThemeColor: "purple" as const
  };

  it("renders public acceptance confirmation with response details", async () => {
    const html = await renderInvoicingOfferDecisionEmailHtml({
      ...baseInput,
      decision: "accept",
      channel: "public_offer_link",
      responderName: "Jane Doe",
      detailText: "Approved as discussed."
    });

    assert.match(html, /<!DOCTYPE html>/i);
    assert.match(html, /Offer accepted/i);
    assert.match(html, /O-2026-AB12CD34\.0/);
    assert.match(html, /Customer Co/);
    assert.match(html, /Approved as discussed\./);
    assert.match(html, /Responded by Jane Doe\./);
    assert.match(html, /Comment/);
    assert.match(html, /background:#f5f5f4/);
    assert.match(html, /Offer summary/);
    assert.match(html, /Confirmation/);
    assert.doesNotMatch(html, />Response</);
    assert.doesNotMatch(html, />Reason</);
    assert.match(html, /€ 121\.00/);
    assert.match(html, /billing@acme\.test/);
    assert.match(html, /VAT ID/);
  });

  it("renders internal rejection confirmation with reason", async () => {
    const html = await renderInvoicingOfferDecisionEmailHtml({
      ...baseInput,
      decision: "reject",
      channel: "internal",
      detailText: "Customer chose another vendor."
    });

    assert.match(html, /Offer rejected/i);
    assert.match(html, /has been declined/i);
    assert.match(html, /Customer chose another vendor\./);
    assert.match(html, /Offer summary/);
    assert.doesNotMatch(html, />Reason</);
  });

  it("builds decision-specific subjects", () => {
    assert.equal(
      buildInvoicingOfferDecisionEmailSubject({
        decision: "accept",
        displayNumber: "O-2026-AB12CD34.0",
        companyName: "Acme BV"
      }),
      "Offer O-2026-AB12CD34.0 accepted — Acme BV"
    );
    assert.equal(
      buildInvoicingOfferDecisionEmailSubject({
        decision: "reject",
        displayNumber: "O-2026-AB12CD34.0",
        companyName: null
      }),
      "Offer O-2026-AB12CD34.0 declined"
    );
  });
});
