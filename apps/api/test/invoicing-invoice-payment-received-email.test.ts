/**
 * Invoice payment received email HTML — `src/lib/invoicing-invoice-payment-received-email.ts`.
 *
 * Asserts rendered HTML for payment-confirmation notifications.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildInvoicingInvoicePaymentReceivedEmailSubject,
  renderInvoicingInvoicePaymentReceivedEmailHtml
} from "../src/lib/invoicing-invoice-payment-received-email.js";

describe("renderInvoicingInvoicePaymentReceivedEmailHtml", () => {
  it("renders full payment confirmation with issuer footer details", async () => {
    const html = await renderInvoicingInvoicePaymentReceivedEmailHtml({
      displayNumber: "I-2026-AB12CD34.0",
      documentDate: "2026-06-14",
      dueDate: "2026-07-14",
      currencyCode: "EUR",
      amountPaidMinor: 12_100,
      paymentDate: "2026-06-20",
      reference: "WIRE-123",
      issuerSnapshot: {
        companyName: "Acme BV",
        companyAddress: "Main Street 1\nAmsterdam",
        companyPhone: "+31 20 123 4567",
        companyEmail: "billing@acme.test",
        vatIdentificationNumber: "NL123",
        chamberOfCommerceNumber: "12345678",
        bankAccountNumber: "NL00BANK0123456789"
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
      documentThemeColor: "purple"
    });

    assert.match(html, /Payment received/i);
    assert.match(html, /payment in full/i);
    assert.match(html, /WIRE-123/);
    assert.match(html, /billing@acme\.test/);
    assert.match(html, /€ 121\.00/);
  });

  it("builds payment confirmation subjects", () => {
    assert.equal(
      buildInvoicingInvoicePaymentReceivedEmailSubject({
        displayNumber: "I-2026-AB12CD34.0",
        companyName: "Acme BV"
      }),
      "Payment received for invoice I-2026-AB12CD34.0 — Acme BV"
    );
  });
});
