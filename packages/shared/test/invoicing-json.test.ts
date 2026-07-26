/**
 * Tests for invoicing document JSON serialization invariants.
 *
 * Under test: `../src/invoicing.js`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canArchiveInvoice,
  canDemoteInvoiceToQuote,
  canDemoteOfferToQuote,
  canDisputeInvoice,
  canPromoteOfferToInvoice,
  canRegisterInvoicePayment,
  canResolveInvoiceDispute,
  canSendOfferEmail,
  canSendInvoiceEmail,
  canSendQuoteEmail,
  compareInvoicingRevisions,
  defaultInvoicingTermsTextForKind,
  formatInvoicingInvoiceDisplayNumber,
  formatInvoicingOfferDisplayNumber,
  formatInvoicingPaymentCreditLineDescription,
  formatInvoicingQuoteDocumentNumber,
  formatInvoicingStatus,
  invoicingAcceptOfferBodySchema,
  invoicingDisputeInvoiceBodySchema,
  invoicingRegisterInvoicePaymentBodySchema,
  invoicingRejectOfferBodySchema,
  isOfferPendingDecision,
  nextInvoicingOfferRevision,
  parseInvoicingJson,
  resolveInvoiceCustomerDisputeNoteFromAuditEvents,
  resolveInvoiceCustomerDisputeNoteForSidebar,
  resolveInvoiceDisputeResolutionFromAuditEvents,
  resolveInvoicingIssuerSnapshot,
  type InvoicingAuditEventRecencyInput
} from "../src/invoicing.js";

describe("parseInvoicingJson", () => {
  const fallback = { organizationId: "", organizationName: "" };

  it("parses JSON strings", () => {
    assert.deepEqual(parseInvoicingJson('{"organizationId":"a","organizationName":"Acme"}', fallback), {
      organizationId: "a",
      organizationName: "Acme"
    });
  });

  it("returns pre-parsed objects from PostgreSQL JSONB columns", () => {
    const snapshot = {
      organizationId: "a",
      organizationName: "Acme",
      contactId: "b",
      contactName: "Jane Doe"
    };
    assert.deepEqual(parseInvoicingJson(snapshot, fallback), snapshot);
  });

  it("falls back on invalid JSON strings", () => {
    assert.deepEqual(parseInvoicingJson("[object Object]", fallback), fallback);
  });
});

describe("resolveInvoicingIssuerSnapshot", () => {
  it("prefers document values and fills gaps from configuration", () => {
    assert.deepEqual(
      resolveInvoicingIssuerSnapshot(
        { companyName: "On Doc Ltd" },
        { companyName: "Config Co", companyPhone: "+31 20 123 4567" }
      ),
      { companyName: "On Doc Ltd", companyPhone: "+31 20 123 4567" }
    );
  });
});

describe("nextInvoicingOfferRevision", () => {
  it("increments from the initial revision when no prior revision exists", () => {
    assert.equal(nextInvoicingOfferRevision(null), "1");
    assert.equal(nextInvoicingOfferRevision(""), "1");
  });

  it("increments the last dotted segment", () => {
    assert.equal(nextInvoicingOfferRevision("0"), "1");
    assert.equal(nextInvoicingOfferRevision("1"), "2");
    assert.equal(nextInvoicingOfferRevision("1.2"), "1.3");
    assert.equal(nextInvoicingOfferRevision("1.2.3"), "1.2.4");
  });
});

describe("defaultInvoicingTermsTextForKind", () => {
  it("returns the configured default for each document kind", () => {
    const configuration = {
      defaultQuoteTermsText: "Quote terms",
      defaultOfferTermsText: "Offer terms",
      defaultInvoiceTermsText: "Invoice terms"
    };
    assert.equal(defaultInvoicingTermsTextForKind("quote", configuration), "Quote terms");
    assert.equal(defaultInvoicingTermsTextForKind("offer", configuration), "Offer terms");
    assert.equal(defaultInvoicingTermsTextForKind("invoice", configuration), "Invoice terms");
  });
});

describe("formatInvoicingInvoiceDisplayNumber", () => {
  it("appends revision when present", () => {
    assert.equal(formatInvoicingInvoiceDisplayNumber("INV-2026-0001", null), "INV-2026-0001");
    assert.equal(formatInvoicingInvoiceDisplayNumber("INV-2026-0001", "0"), "INV-2026-0001.0");
    assert.equal(formatInvoicingInvoiceDisplayNumber("INV-2026-0001", "1"), "INV-2026-0001.1");
  });
});

describe("formatInvoicingStatus", () => {
  it("returns concise labels for workflow statuses", () => {
    assert.equal(formatInvoicingStatus("quote_draft"), "Draft");
    assert.equal(formatInvoicingStatus("quote_converted_to_offer"), "Promoted");
    assert.equal(formatInvoicingStatus("offer_demoted"), "Demoted");
    assert.equal(formatInvoicingStatus("invoice_demoted"), "Demoted");
    assert.equal(formatInvoicingStatus("offer_converted_to_invoice"), "Promoted");
    assert.equal(formatInvoicingStatus("invoice_sent"), "Sent");
    assert.equal(formatInvoicingStatus("invoice_finalized"), "Sent");
    assert.equal(formatInvoicingStatus("invoice_partially_paid"), "Partially paid");
    assert.equal(formatInvoicingStatus("invoice_paid"), "Paid");
    assert.equal(formatInvoicingStatus("invoice_accredited"), "Accredited");
  });
});

describe("invoice payment workflow", () => {
  it("allows payment registration on sent and overdue invoices", () => {
    assert.equal(canRegisterInvoicePayment("invoice_sent"), true);
    assert.equal(canRegisterInvoicePayment("invoice_finalized"), true);
    assert.equal(canRegisterInvoicePayment("invoice_overdue"), true);
    assert.equal(canRegisterInvoicePayment("invoice_draft"), false);
    assert.equal(canRegisterInvoicePayment("invoice_paid"), false);
    assert.equal(canRegisterInvoicePayment("invoice_accredited"), false);
    assert.equal(canRegisterInvoicePayment("invoice_partially_paid"), false);
    assert.equal(canRegisterInvoicePayment("invoice_disputed"), false);
  });

  it("allows dispute on draft and outstanding sent and overdue invoices only", () => {
    assert.equal(canDisputeInvoice("invoice_draft"), true);
    assert.equal(canDisputeInvoice("invoice_sent"), true);
    assert.equal(canDisputeInvoice("invoice_finalized"), true);
    assert.equal(canDisputeInvoice("invoice_overdue"), true);
    assert.equal(canDisputeInvoice("invoice_partially_paid"), false);
    assert.equal(canDisputeInvoice("invoice_paid"), false);
    assert.equal(canDisputeInvoice("invoice_accredited"), false);
    assert.equal(canDisputeInvoice("invoice_disputed"), false);
    assert.equal(canDisputeInvoice("invoice_archived"), false);
  });

  it("allows archive only on paid, accredited, and partially paid invoices", () => {
    assert.equal(canArchiveInvoice("invoice_paid"), true);
    assert.equal(canArchiveInvoice("invoice_accredited"), true);
    assert.equal(canArchiveInvoice("invoice_partially_paid"), true);
    assert.equal(canArchiveInvoice("invoice_sent"), false);
    assert.equal(canArchiveInvoice("invoice_draft"), false);
    assert.equal(canArchiveInvoice("invoice_disputed"), false);
    assert.equal(canArchiveInvoice("invoice_archived"), false);
  });

  it("validates dispute invoice body", () => {
    assert.equal(
      invoicingDisputeInvoiceBodySchema.safeParse({
        disputedInformation: "Customer disputes the consulting hours on line 2."
      }).success,
      true
    );
    assert.equal(
      invoicingDisputeInvoiceBodySchema.safeParse({
        disputedInformation: "   "
      }).success,
      false
    );
  });

  it("formats payment credit line descriptions", () => {
    assert.equal(
      formatInvoicingPaymentCreditLineDescription({ paymentDate: "2026-06-13" }),
      "Payment received on 2026-06-13"
    );
    assert.equal(
      formatInvoicingPaymentCreditLineDescription({ paymentDate: "2026-06-13", reference: "TX-42" }),
      "Payment received on 2026-06-13 (TX-42)"
    );
  });

  it("validates register payment body", () => {
    assert.equal(
      invoicingRegisterInvoicePaymentBodySchema.safeParse({
        amountMinor: 1000,
        paymentDate: "2026-06-13"
      }).success,
      true
    );
    assert.equal(
      invoicingRegisterInvoicePaymentBodySchema.safeParse({
        amountMinor: 0,
        paymentDate: "2026-06-13"
      }).success,
      false
    );
  });
});

describe("offer decision workflow", () => {
  it("treats draft and sent as pending decision", () => {
    assert.equal(isOfferPendingDecision("offer_draft"), true);
    assert.equal(isOfferPendingDecision("offer_sent"), true);
    assert.equal(isOfferPendingDecision("offer_accepted"), false);
    assert.equal(isOfferPendingDecision("offer_rejected"), false);
  });

  it("allows invoice promotion only after acceptance", () => {
    assert.equal(canPromoteOfferToInvoice("offer_accepted"), true);
    assert.equal(canPromoteOfferToInvoice("offer_draft"), false);
    assert.equal(canPromoteOfferToInvoice("offer_sent"), false);
    assert.equal(canPromoteOfferToInvoice("offer_rejected"), false);
  });

  it("allows quote email only before promotion", () => {
    assert.equal(canSendQuoteEmail("quote_draft"), true);
    assert.equal(canSendQuoteEmail("quote_archived"), true);
    assert.equal(canSendQuoteEmail("quote_converted_to_offer"), false);
    assert.equal(canSendQuoteEmail("quote_converted_to_invoice"), false);
  });

  it("allows offer resend email only after send", () => {
    assert.equal(canSendOfferEmail("offer_draft"), false);
    assert.equal(canSendOfferEmail("offer_sent"), true);
    assert.equal(canSendOfferEmail("offer_accepted"), false);
    assert.equal(canSendOfferEmail("offer_rejected"), false);
    assert.equal(canSendOfferEmail("offer_converted_to_invoice"), false);
    assert.equal(canSendOfferEmail("offer_expired"), false);
  });

  it("allows invoice resend email only after send", () => {
    assert.equal(canSendInvoiceEmail("invoice_draft"), false);
    assert.equal(canSendInvoiceEmail("invoice_sent"), true);
    assert.equal(canSendInvoiceEmail("invoice_finalized"), true);
    assert.equal(canSendInvoiceEmail("invoice_overdue"), true);
    assert.equal(canSendInvoiceEmail("invoice_accredited"), true);
    assert.equal(canSendInvoiceEmail("invoice_disputed"), false);
    assert.equal(canSendInvoiceEmail("invoice_partially_paid"), false);
    assert.equal(canSendInvoiceEmail("invoice_paid"), false);
    assert.equal(canSendInvoiceEmail("invoice_archived"), false);
    assert.equal(canSendInvoiceEmail("invoice_demoted"), false);
  });

  it("allows demotion only while offer is still a draft", () => {
    assert.equal(canDemoteOfferToQuote("offer_draft"), true);
    assert.equal(canDemoteOfferToQuote("offer_sent"), false);
    assert.equal(canDemoteOfferToQuote("offer_accepted"), false);
    assert.equal(canDemoteOfferToQuote("offer_rejected"), false);
  });

  it("allows dispute resolution only while disputed and unresolved in the current cycle", () => {
    assert.equal(canResolveInvoiceDispute("invoice_disputed", null), true);
    assert.equal(canResolveInvoiceDispute("invoice_disputed", "acknowledged"), false);
    assert.equal(canResolveInvoiceDispute("invoice_sent", null), false);
  });

  it("ignores prior dispute resolutions when resolving the active dispute cycle", () => {
    const events: InvoicingAuditEventRecencyInput[] = [
      { eventKind: "invoice_disputed", createdAt: "2026-06-15T10:00:00Z", payload: { disputedInformation: "Second dispute" } },
      { eventKind: "invoice_sent", createdAt: "2026-06-14T10:00:00Z" },
      { eventKind: "invoice_dispute_denied", createdAt: "2026-06-13T10:00:00Z" },
      { eventKind: "invoice_disputed", createdAt: "2026-06-12T10:00:00Z", payload: { disputedInformation: "First dispute" } }
    ];

    assert.equal(resolveInvoiceDisputeResolutionFromAuditEvents(events), null);
    assert.equal(resolveInvoiceCustomerDisputeNoteFromAuditEvents(events), "Second dispute");
    assert.equal(canResolveInvoiceDispute("invoice_disputed", resolveInvoiceDisputeResolutionFromAuditEvents(events)), true);
  });

  it("resolves acknowledgment only for the current dispute cycle", () => {
    const events: InvoicingAuditEventRecencyInput[] = [
      { eventKind: "invoice_dispute_acknowledgment_email_sent", createdAt: "2026-06-16T10:00:00Z" },
      { eventKind: "invoice_disputed", createdAt: "2026-06-15T10:00:00Z" },
      { eventKind: "invoice_dispute_denied", createdAt: "2026-06-13T10:00:00Z" },
      { eventKind: "invoice_disputed", createdAt: "2026-06-12T10:00:00Z" }
    ];

    assert.equal(resolveInvoiceDisputeResolutionFromAuditEvents(events), "acknowledged");
  });

  it("hides sidebar customer notes after deny or acknowledge while audit history keeps them", () => {
    const events: InvoicingAuditEventRecencyInput[] = [
      { eventKind: "invoice_dispute_denied", createdAt: "2026-06-15T10:00:00Z" },
      {
        eventKind: "invoice_disputed",
        createdAt: "2026-06-14T10:00:00Z",
        payload: { disputedInformation: "First dispute" }
      }
    ];

    assert.equal(resolveInvoiceCustomerDisputeNoteFromAuditEvents(events), "First dispute");
    assert.equal(resolveInvoiceCustomerDisputeNoteForSidebar("invoice_draft", events), null);
    assert.equal(resolveInvoiceCustomerDisputeNoteForSidebar("invoice_disputed", events), null);

    const activeEvents: InvoicingAuditEventRecencyInput[] = [
      {
        eventKind: "invoice_disputed",
        createdAt: "2026-06-16T10:00:00Z",
        payload: { disputedInformation: "Open dispute" }
      },
      { eventKind: "invoice_dispute_denied", createdAt: "2026-06-13T10:00:00Z" },
      {
        eventKind: "invoice_disputed",
        createdAt: "2026-06-12T10:00:00Z",
        payload: { disputedInformation: "Old dispute" }
      }
    ];

    assert.equal(
      resolveInvoiceCustomerDisputeNoteForSidebar("invoice_disputed", activeEvents),
      "Open dispute"
    );
  });
});

describe("compareInvoicingRevisions", () => {
  it("orders dotted revisions numerically", () => {
    assert.equal(compareInvoicingRevisions("0", "1"), -1);
    assert.equal(compareInvoicingRevisions("1", "2"), -1);
    assert.equal(compareInvoicingRevisions("1.2", "1.3"), -1);
    assert.equal(compareInvoicingRevisions(null, "0"), 0);
  });
});

describe("formatInvoicingQuoteDocumentNumber", () => {
  it("formats prefix, year, and random id", () => {
    assert.equal(formatInvoicingQuoteDocumentNumber("QUO", 2026, "a1b2c3d4"), "QUO-2026-A1B2C3D4");
  });
});

describe("formatInvoicingOfferDisplayNumber", () => {
  it("appends revision when present", () => {
    assert.equal(formatInvoicingOfferDisplayNumber("OFF-2026-0001", null), "OFF-2026-0001");
    assert.equal(formatInvoicingOfferDisplayNumber("OFF-2026-0001", "0"), "OFF-2026-0001.0");
    assert.equal(formatInvoicingOfferDisplayNumber("OFF-2026-0001", "1.2.3"), "OFF-2026-0001.1.2.3");
  });
});

describe("invoicingAcceptOfferBodySchema", () => {
  it("requires non-empty acceptance proof", () => {
    assert.equal(invoicingAcceptOfferBodySchema.safeParse({ acceptanceProof: "Signed PDF on file" }).success, true);
    assert.equal(invoicingAcceptOfferBodySchema.safeParse({ acceptanceProof: "   " }).success, false);
    assert.equal(invoicingAcceptOfferBodySchema.safeParse({}).success, false);
  });
});

describe("invoicingRejectOfferBodySchema", () => {
  it("requires non-empty rejection reason", () => {
    assert.equal(invoicingRejectOfferBodySchema.safeParse({ reason: "Customer chose another vendor" }).success, true);
    assert.equal(invoicingRejectOfferBodySchema.safeParse({ reason: "   " }).success, false);
    assert.equal(invoicingRejectOfferBodySchema.safeParse({}).success, false);
  });
});
