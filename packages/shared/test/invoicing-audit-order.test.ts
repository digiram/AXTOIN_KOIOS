/**
 * Tests for invoicing audit event ordering and lifecycle transitions.
 *
 * Under test: `../src/invoicing-lifecycle.js`, `../src/invoicing.js`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { compareInvoicingAuditEventsByRecency } from "../src/invoicing.js";

describe("compareInvoicingAuditEventsByRecency", () => {
  it("orders partial-payment events by business sequence when timestamps match", () => {
    const sameInstant = "2026-06-14T10:00:00.000Z";
    const payment = { createdAt: sameInstant, eventKind: "invoice_payment_registered" };
    const revision = { createdAt: sameInstant, eventKind: "invoice_payment_revision_created" };

    assert.ok(compareInvoicingAuditEventsByRecency(payment, revision) > 0);
    assert.ok(compareInvoicingAuditEventsByRecency(revision, payment) < 0);
  });

  it("prefers a later timestamp over business sequence", () => {
    const payment = { createdAt: "2026-06-14T10:00:01.000Z", eventKind: "invoice_payment_registered" };
    const revision = { createdAt: "2026-06-14T10:00:00.000Z", eventKind: "invoice_payment_revision_created" };

    assert.ok(compareInvoicingAuditEventsByRecency(payment, revision) < 0);
  });

  it("orders quote-to-offer promotion before offer creation when timestamps match", () => {
    const sameInstant = "2026-06-14T10:00:00.000Z";
    const promoted = { createdAt: sameInstant, eventKind: "quote_promoted_to_offer" };
    const created = { createdAt: sameInstant, eventKind: "offer_created" };

    assert.ok(compareInvoicingAuditEventsByRecency(created, promoted) < 0);
    assert.ok(compareInvoicingAuditEventsByRecency(promoted, created) > 0);
  });

  it("orders promotion before invoice creation when timestamps match", () => {
    const sameInstant = "2026-06-14T10:00:00.000Z";
    const quotePromoted = { createdAt: sameInstant, eventKind: "quote_promoted_to_invoice" };
    const offerPromoted = { createdAt: sameInstant, eventKind: "offer_promoted_to_invoice" };
    const invoiceCreated = { createdAt: sameInstant, eventKind: "invoice_created" };

    assert.ok(compareInvoicingAuditEventsByRecency(invoiceCreated, quotePromoted) < 0);
    assert.ok(compareInvoicingAuditEventsByRecency(invoiceCreated, offerPromoted) < 0);
  });
});
