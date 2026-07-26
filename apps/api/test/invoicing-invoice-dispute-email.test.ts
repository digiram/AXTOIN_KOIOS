/**
 * Invoice dispute opened email HTML — `src/lib/invoicing-invoice-dispute-email.ts`.
 *
 * Asserts rendered HTML when a customer opens an invoice dispute.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildInvoicingInvoiceDisputeEmailSubject,
  renderInvoicingInvoiceDisputeEmailHtml
} from "../src/lib/invoicing-invoice-dispute-email.js";

describe("renderInvoicingInvoiceDisputeEmailHtml", () => {
  const baseInput = {
    displayNumber: "I-2026-AB12CD34.0",
    documentDate: "2026-06-14",
    dueDate: "2026-07-14",
    paymentTermDays: 30,
    currencyCode: "EUR",
    totalIncludingTaxMinor: 12_100,
    disputedInformation: "Customer disputes the consulting hours on line 2.",
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

  it("renders dispute confirmation with disputed information and invoice summary", async () => {
    const html = await renderInvoicingInvoiceDisputeEmailHtml(baseInput);

    assert.match(html, /<!DOCTYPE html>/i);
    assert.match(html, /Invoice disputed/i);
    assert.match(html, /Confirmation/);
    assert.match(html, /Invoice summary/);
    assert.doesNotMatch(html, /Dispute recorded/i);
    assert.match(html, /I-2026-AB12CD34\.0/);
    assert.match(html, /Customer note/);
    assert.match(html, /background:#f5f5f4/);
    assert.doesNotMatch(html, /Customer<br\/>note/i);
    assert.match(html, /Customer disputes the consulting hours on line 2\./);
    assert.match(html, /€ 121\.00/);
  });

  it("builds dispute-specific subjects", () => {
    assert.equal(
      buildInvoicingInvoiceDisputeEmailSubject({
        displayNumber: "I-2026-AB12CD34.0",
        companyName: "Acme BV"
      }),
      "Invoice I-2026-AB12CD34.0 disputed — Acme BV"
    );
    assert.equal(
      buildInvoicingInvoiceDisputeEmailSubject({
        displayNumber: "I-2026-AB12CD34.0",
        companyName: null
      }),
      "Invoice I-2026-AB12CD34.0 disputed"
    );
  });
});
