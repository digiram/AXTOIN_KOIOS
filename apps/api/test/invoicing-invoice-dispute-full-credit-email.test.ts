/**
 * Invoice dispute full-credit email HTML — `src/lib/invoicing-invoice-dispute-full-credit-email.ts`.
 *
 * Asserts rendered HTML for full-credit dispute resolution notifications.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildInvoicingInvoiceDisputeFullCreditEmailSubject,
  renderInvoicingInvoiceDisputeFullCreditEmailHtml
} from "../src/lib/invoicing-invoice-dispute-full-credit-email.js";

describe("renderInvoicingInvoiceDisputeFullCreditEmailHtml", () => {
  const baseInput = {
    displayNumber: "I-2026-AB12CD34.0",
    revisedDisplayNumber: "I-2026-AB12CD34.1",
    documentDate: "2026-06-14",
    currencyCode: "EUR",
    creditedAmountMinor: 12_100,
    creditDate: "2026-06-20",
    note: "We agreed to waive the disputed amount in full.",
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

  it("renders full credit confirmation with note and credit summary", async () => {
    const html = await renderInvoicingInvoiceDisputeFullCreditEmailHtml(baseInput);

    assert.match(html, /<!DOCTYPE html>/i);
    assert.match(html, /Credit applied/i);
    assert.match(html, /Confirmation/);
    assert.match(html, /Note/);
    assert.match(html, /background:#f5f5f4/);
    assert.match(html, /Credit summary/);
    assert.match(html, /Original amount/);
    assert.match(html, /Credit applied/);
    assert.match(html, /Total remaining/);
    assert.match(html, /fully credited/i);
    assert.match(html, /I-2026-AB12CD34\.1/);
    assert.match(html, /zero balance/i);
    assert.match(html, /€ 121\.00/);
    assert.match(html, /€ 0\.00/);
  });

  it("builds a subject with invoice number and company name", () => {
    const subject = buildInvoicingInvoiceDisputeFullCreditEmailSubject({
      displayNumber: "I-2026-AB12CD34.0",
      companyName: "Acme BV"
    });
    assert.match(subject, /Full credit applied/);
    assert.match(subject, /I-2026-AB12CD34\.0/);
    assert.match(subject, /Acme BV/);
  });
});
