/**
 * Invoice dispute denied email HTML — `src/lib/invoicing-invoice-dispute-denied-email.ts`.
 *
 * Asserts rendered HTML for tenant dispute-denial notifications.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildInvoicingInvoiceDisputeDeniedEmailSubject,
  renderInvoicingInvoiceDisputeDeniedEmailHtml
} from "../src/lib/invoicing-invoice-dispute-denied-email.js";

describe("renderInvoicingInvoiceDisputeDeniedEmailHtml", () => {
  const baseInput = {
    displayNumber: "I-2026-AB12CD34.0",
    documentDate: "2026-06-14",
    currencyCode: "EUR",
    totalIncludingTaxMinor: 12_100,
    denialReason: "The hours billed match the signed statement of work.",
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

  it("renders denial confirmation with reason and invoice summary", async () => {
    const html = await renderInvoicingInvoiceDisputeDeniedEmailHtml(baseInput);

    assert.match(html, /<!DOCTYPE html>/i);
    assert.match(html, /Dispute denied/i);
    assert.match(html, /Confirmation/);
    assert.match(html, /Comment/);
    assert.match(html, /background:#f5f5f4/);
    assert.match(html, /Invoice summary/);
    assert.match(html, /has been denied/i);
    assert.doesNotMatch(html, /do not agree with the dispute/i);
    assert.match(html, /The hours billed match the signed statement of work\./);
    assert.match(html, /separate email with the updated invoice/i);
    assert.match(html, /€ 121\.00/);
  });

  it("builds denial-specific subjects", () => {
    assert.equal(
      buildInvoicingInvoiceDisputeDeniedEmailSubject({
        displayNumber: "I-2026-AB12CD34.0",
        companyName: "Acme BV"
      }),
      "Dispute denied for invoice I-2026-AB12CD34.0 — Acme BV"
    );
  });
});
