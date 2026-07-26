/**
 * Invoice dispute acknowledged email HTML — `src/lib/invoicing-invoice-dispute-acknowledged-email.ts`.
 *
 * Asserts rendered HTML for tenant dispute-acknowledgement notifications.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { renderInvoicingInvoiceDisputeAcknowledgedEmailHtml } from "../src/lib/invoicing-invoice-dispute-acknowledged-email.js";

describe("renderInvoicingInvoiceDisputeAcknowledgedEmailHtml", () => {
  const baseInput = {
    displayNumber: "I-2026-AB12CD34.0",
    documentDate: "2026-06-14",
    dueDate: "2026-07-14",
    currencyCode: "EUR",
    totalIncludingTaxMinor: 12_100,
    companyResponse: "We agree the hours on line 2 were overstated.",
    outstandingPaymentPlan: "We will issue a credit note for the difference within 5 business days.",
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

  it("renders acknowledgment confirmation and company notes in gray cards", async () => {
    const html = await renderInvoicingInvoiceDisputeAcknowledgedEmailHtml(baseInput);

    assert.match(html, /<!DOCTYPE html>/i);
    assert.match(html, /Dispute acknowledged/i);
    assert.match(html, /has been acknowledged/i);
    assert.match(html, /Company response/);
    assert.match(html, /Outstanding payment/);
    assert.match(html, /We agree the hours on line 2 were overstated\./);
    assert.match(html, /credit note for the difference/);
    assert.match(html, /background:#f5f5f4/);
    assert.doesNotMatch(html, /Outstanding payment:/i);
  });
});
