/**
 * Invoicing email footer icons — `src/lib/invoicing-email-footer-icons.ts`.
 *
 * Asserts inline SVG/icon markup embedded in transactional invoicing emails.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getInvoicingEmailFooterIconAttachments,
  invoicingEmailFooterIconSrc,
  rewriteInvoicingEmailFooterCidsForBrowserPreview
} from "../src/lib/invoicing-email-footer-icons.js";

describe("invoicing email footer icons", () => {
  it("renders Lucide icons as cid PNG attachments for email clients", async () => {
    assert.equal(invoicingEmailFooterIconSrc("phone"), "cid:invoicing-footer-phone@starter");

    const attachments = await getInvoicingEmailFooterIconAttachments();
    assert.equal(attachments.length, 5);
    for (const attachment of attachments) {
      assert.equal(attachment.contentDisposition, "inline");
      assert.equal(attachment.contentType, "image/png");
      assert.match(String(attachment.cid), /^invoicing-footer-/);
      assert.ok(Buffer.isBuffer(attachment.content));
      assert.ok(attachment.content.length > 100);
    }
  });

  it("rewrites cid footer icons to data URLs for browser HTML previews", async () => {
    const html = `<img src="${invoicingEmailFooterIconSrc("phone")}" /><img src="${invoicingEmailFooterIconSrc("email")}" />`;
    const preview = await rewriteInvoicingEmailFooterCidsForBrowserPreview(html);
    assert.doesNotMatch(preview, /cid:invoicing-footer-/);
    assert.match(preview, /data:image\/png;base64,/);
  });
});
