/**
 * Tests for quote/offer/invoice lifecycle transitions and date helpers.
 *
 * Under test: `../src/invoicing-lifecycle.js`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  addDaysToIsoDate,
  computeInvoiceDueDateFromFinalizedAt,
  computeInvoiceDueDateFromPartialAnchor,
  defaultInvoiceDueDateForSend,
  invoicingPaymentReminderTriggerDate,
  isQuoteSoftExpired,
  resolveInvoicingReminderOffsets,
  resolveInvoiceDueDateForSend,
  resolveOfferExpiryDateForSend,
  resolvePaymentTermDaysForFinalize
} from "../src/invoicing-lifecycle.js";
import { resolveInvoicingPaymentTermDays } from "../src/invoicing.js";

describe("invoicing lifecycle date helpers", () => {
  it("computes due date from finalized timestamp", () => {
    const finalizedAt = new Date("2026-06-13T15:30:00.000Z");
    assert.equal(computeInvoiceDueDateFromFinalizedAt(finalizedAt, 30), "2026-07-13");
  });

  it("computes due date from partial payment anchor", () => {
    assert.equal(computeInvoiceDueDateFromPartialAnchor("2026-06-01", 14), "2026-06-15");
  });

  it("detects soft quote expiry", () => {
    assert.equal(isQuoteSoftExpired("2026-06-01", "2026-06-13"), true);
    assert.equal(isQuoteSoftExpired("2026-06-30", "2026-06-13"), false);
    assert.equal(isQuoteSoftExpired(null, "2026-06-13"), false);
  });

  it("resolves offer expiry on first send", () => {
    assert.equal(resolveOfferExpiryDateForSend("2026-06-01", "2026-07-01", null), "2026-07-01");
    assert.equal(
      resolveOfferExpiryDateForSend("2026-06-01", null, 10),
      addDaysToIsoDate("2026-06-01", 10)
    );
  });

  it("resolves payment term days on first invoice send", () => {
    assert.equal(resolvePaymentTermDaysForFinalize(21, null, 30), 21);
    assert.equal(resolvePaymentTermDaysForFinalize(null, 14, 30), 14);
    assert.equal(resolvePaymentTermDaysForFinalize(null, null, 30), 30);
    assert.equal(resolvePaymentTermDaysForFinalize(null, null, null), resolveInvoicingPaymentTermDays(null, null));
  });

  it("computes reminder trigger dates from tenant offsets", () => {
    const offsets = resolveInvoicingReminderOffsets({
      paymentReminderFirstOffsetDays: 0,
      paymentReminderSecondOffsetDays: 7
    });
    assert.equal(invoicingPaymentReminderTriggerDate("2026-06-30", "first", offsets), "2026-06-30");
    assert.equal(invoicingPaymentReminderTriggerDate("2026-06-30", "second", offsets), "2026-07-07");
  });

  it("resolves invoice due date and payment term on send", () => {
    assert.deepEqual(
      resolveInvoiceDueDateForSend("2026-06-01", "2026-07-01", null, null, 30),
      { dueDate: "2026-07-01", paymentTermDays: 30 }
    );
    assert.deepEqual(
      resolveInvoiceDueDateForSend("2026-06-01", null, 14, null, 30),
      { dueDate: "2026-06-15", paymentTermDays: 14 }
    );
    assert.deepEqual(
      resolveInvoiceDueDateForSend("2026-06-01", null, null, 21, 30),
      { dueDate: "2026-06-22", paymentTermDays: 21 }
    );
  });

  it("defaults invoice due date from tenant payment term", () => {
    assert.equal(defaultInvoiceDueDateForSend("2026-06-01", null, 30), "2026-07-01");
  });
});
