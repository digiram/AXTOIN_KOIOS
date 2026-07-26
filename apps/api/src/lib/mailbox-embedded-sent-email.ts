/**
 * Mailbox embedded sent-email storage adapter.
 *
 * Rewrites invoicing footer `cid:` image sources to browser-safe URLs before
 * persisting embedded sent-email HTML on internal mailbox notifications.
 */

import type { MailboxEmbeddedSentEmail } from "@starter/shared";

import { rewriteInvoicingEmailFooterCidsForBrowserPreview } from "./invoicing-email-footer-icons.js";

/** Store mailbox embedded email HTML with browser-safe image sources. */
export const mailboxEmbeddedSentEmailForStorage = async (
  email: MailboxEmbeddedSentEmail
): Promise<MailboxEmbeddedSentEmail> => ({
  ...email,
  bodyHtml: await rewriteInvoicingEmailFooterCidsForBrowserPreview(email.bodyHtml)
});
