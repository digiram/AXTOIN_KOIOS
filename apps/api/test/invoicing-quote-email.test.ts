/**
 * Quote email HTML — `src/lib/invoicing-quote-email.ts`.
 *
 * Asserts rendered HTML for outbound invoicing quote emails.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { renderInvoicingDocumentEmailHtml } from "../src/lib/invoicing-quote-email.js";

describe("renderInvoicingDocumentEmailHtml (quote)", () => {
  it("renders quote number and customer block in compiled HTML", async () => {
    const html = await renderInvoicingDocumentEmailHtml({
      kind: "quote",
      displayNumber: "Q-2026-AB12CD34",
      documentDate: "2026-06-14",
      quoteExpiryDate: "2026-07-14",
      currencyCode: "EUR",
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
      subtotalExcludingTaxMinor: 10_000,
      discountTotalMinor: 0,
      taxTotalMinor: 2_100,
      totalIncludingTaxMinor: 12_100,
      notes: "Thank you for your interest.",
      termsText: "Net 30 days.",
      footerText: "",
      lineItems: [
        {
          description: "Consulting day",
          sku: "CONS-1",
          quantity: 2,
          unitLabel: "day",
          unitPriceMinor: 5_000,
          taxRateBps: 2100,
          lineTotalMinor: 10_000
        }
      ],
      taxRateOptions: [{ label: "21%", rateBps: 2100 }],
      documentThemeColor: "purple"
    });

    assert.match(html, /Q-2026-AB12CD34/);
    assert.match(html, /Customer Co/);
    assert.match(html, /Consulting day/);
    assert.match(html, /<!DOCTYPE html>/i);
    assert.match(html, /billing@acme\.test/);
    assert.match(html, /VAT ID/);
    assert.match(html, /cid:invoicing-footer-email@starter/);
    assert.match(html, /cid:invoicing-footer-vat@starter/);
    assert.doesNotMatch(html, /data:image\/svg\+xml/i);
    assert.match(html, /text-align:left/i);
    assert.match(html, /Main Street 1/);
    assert.doesNotMatch(html, /background-color:#[0-9a-f]{6}[^>]*>AC</i);
  });

  it("left-aligns company block and omits logo placeholder when no logo is configured", async () => {
    const html = await renderInvoicingDocumentEmailHtml({
      kind: "quote",
      displayNumber: "Q-2026-TZBZF8U8",
      documentDate: "2026-06-14",
      quoteExpiryDate: "2026-07-14",
      currencyCode: "EUR",
      issuerSnapshot: {
        companyName: "AXTONITNOW",
        companyAddress: "Somewherestreet 269\n1011AX, Amsterdam",
        companyPhone: null,
        companyEmail: null,
        vatIdentificationNumber: null,
        chamberOfCommerceNumber: null,
        bankAccountNumber: null
      },
      customerSnapshot: {
        organizationName: "Microsoft",
        contactName: "Bill Gates",
        email: "ramli.somers@outlook.com",
        phone: "123456785",
        addressLine1: "Address line 1",
        addressLine2: "Address line 2",
        postalCode: "Postal code",
        city: "City",
        state: "State / province",
        country: "Country"
      },
      subtotalExcludingTaxMinor: 20_000,
      discountTotalMinor: 0,
      taxTotalMinor: 4_200,
      totalIncludingTaxMinor: 24_200,
      notes: "Note (customer-visible)",
      termsText: "General terms & conditions apply.",
      footerText: "",
      lineItems: [
        {
          description: "Playstation",
          sku: null,
          quantity: 1,
          unitLabel: "unit",
          unitPriceMinor: 20_000,
          taxRateBps: 2100,
          lineTotalMinor: 24_200
        }
      ],
      taxRateOptions: [{ label: "21%", rateBps: 2100 }],
      documentThemeColor: "green",
      logoDataUrl: null
    });

    assert.match(html, /AXTONITNOW/);
    assert.match(html, /Somewherestreet 269/);
    assert.match(html, /1011AX, Amsterdam/);
    assert.match(html, /max-width:720px/i);
    assert.match(html, /Payment terms &amp; conditions/);
    assert.doesNotMatch(html, /Payment terms &amp;amp; conditions/);
    assert.match(html, /colspan="4"/i);
    assert.match(html, /background-color:#ffffff/i);
    assert.match(html, /€ 242\.00/);
    assert.doesNotMatch(html, /242,00\s*€/);
  });

  it("renders offer email with offer-specific header metadata", async () => {
    const html = await renderInvoicingDocumentEmailHtml({
      kind: "offer",
      displayNumber: "O-2026-AB12CD34.0",
      documentDate: "2026-06-14",
      offerExpiryDate: "2026-07-14",
      currencyCode: "EUR",
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
      subtotalExcludingTaxMinor: 10_000,
      discountTotalMinor: 0,
      taxTotalMinor: 2_100,
      totalIncludingTaxMinor: 12_100,
      notes: "",
      termsText: "Net 30 days.",
      footerText: "",
      lineItems: [],
      taxRateOptions: [{ label: "21%", rateBps: 2100 }],
      documentThemeColor: "purple"
    });

    assert.match(html, /OFFER/);
    assert.match(html, /Offer number O-2026-AB12CD34\.0/);
    assert.match(html, /€ 121\.00/);
  });

  it("renders accept and reject links for offers when response links are provided", async () => {
    const html = await renderInvoicingDocumentEmailHtml({
      kind: "offer",
      displayNumber: "O-2026-AB12CD34.0",
      documentDate: "2026-06-14",
      offerExpiryDate: "2026-07-14",
      currencyCode: "EUR",
      issuerSnapshot: { companyName: "Acme BV" },
      customerSnapshot: { organizationName: "Customer Co" },
      subtotalExcludingTaxMinor: 10_000,
      discountTotalMinor: 0,
      taxTotalMinor: 2_100,
      totalIncludingTaxMinor: 12_100,
      notes: "",
      termsText: "",
      footerText: "",
      lineItems: [],
      taxRateOptions: [],
      documentThemeColor: "purple",
      responseLinks: {
        acceptUrl: "https://app.example.com/offer/respond/secret-token?decision=accept",
        rejectUrl: "https://app.example.com/offer/respond/secret-token?decision=reject"
      }
    });

    assert.match(html, /Accept offer/);
    assert.match(html, /Reject offer/);
    assert.match(html, /decision=accept/);
    assert.match(html, /decision=reject/);
    const responseIndex = html.indexOf("Respond to this offer");
    const offerDocumentIndex = html.indexOf("Offer number O-2026-AB12CD34.0");
    assert.ok(responseIndex >= 0 && offerDocumentIndex > responseIndex, "response card should appear above offer document");
  });

  it("omits customer response links when responseLinks are not provided", async () => {
    const html = await renderInvoicingDocumentEmailHtml({
      kind: "offer",
      displayNumber: "O-2026-AB12CD34.0",
      documentDate: "2026-06-14",
      offerExpiryDate: "2026-07-14",
      currencyCode: "EUR",
      issuerSnapshot: { companyName: "Acme BV" },
      customerSnapshot: { organizationName: "Customer Co" },
      subtotalExcludingTaxMinor: 10_000,
      discountTotalMinor: 0,
      taxTotalMinor: 2_100,
      totalIncludingTaxMinor: 12_100,
      notes: "",
      termsText: "",
      footerText: "",
      lineItems: [],
      taxRateOptions: [],
      documentThemeColor: "purple",
      responseLinks: null
    });

    assert.doesNotMatch(html, /Accept offer/);
    assert.doesNotMatch(html, /Reject offer/);
    assert.doesNotMatch(html, /Respond to this offer/);
  });
});
