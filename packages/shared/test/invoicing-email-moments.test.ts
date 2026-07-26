/**
 * Tests for invoicing email moment keys, defaults, and configuration resolution.
 *
 * Under test: `../src/invoicing-email-moments.js`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  invoicingDocumentKindToEmailMomentKey,
  parseInvoicingEmailMomentsOverrides,
  resolveInvoicingEmailMomentsEnabled,
  serializeInvoicingEmailMomentsForApi
} from "../src/invoicing-email-moments.js";

describe("invoicing email moments", () => {
  it("defaults all moments to enabled", () => {
    const enabled = resolveInvoicingEmailMomentsEnabled({});
    assert.equal(enabled.quote_sent, true);
    assert.equal(enabled.payment_reminder, true);
    assert.equal(serializeInvoicingEmailMomentsForApi(enabled).length, 10);
  });

  it("honours legacy paymentRemindersEnabled when payment_reminder is not stored", () => {
    const enabled = resolveInvoicingEmailMomentsEnabled({
      emailMomentsEnabled: {},
      paymentRemindersEnabled: false
    });
    assert.equal(enabled.payment_reminder, false);
    assert.equal(enabled.invoice_sent, true);
  });

  it("stored overrides take precedence over legacy payment reminders", () => {
    const enabled = resolveInvoicingEmailMomentsEnabled({
      emailMomentsEnabled: { payment_reminder: true },
      paymentRemindersEnabled: false
    });
    assert.equal(enabled.payment_reminder, true);
  });

  it("parses partial JSON overrides safely", () => {
    assert.deepEqual(parseInvoicingEmailMomentsOverrides('{"quote_sent":false,"unknown":true}'), {
      quote_sent: false
    });
  });

  it("maps document kinds to email moment keys", () => {
    assert.equal(invoicingDocumentKindToEmailMomentKey("quote"), "quote_sent");
    assert.equal(invoicingDocumentKindToEmailMomentKey("offer"), "offer_sent");
    assert.equal(invoicingDocumentKindToEmailMomentKey("invoice"), "invoice_sent");
  });
});
