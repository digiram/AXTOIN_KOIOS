/**
 * Invoicing HTML email transport wrapper.
 *
 * Sends invoicing MJML HTML via SMTP with inline footer icon attachments so
 * `cid:` image sources resolve in mail clients.
 */

import { sendMailHtml, type PlatformSmtpRow, type SmtpPasswordScope } from "@starter/db";

import { getInvoicingEmailFooterIconAttachments } from "./invoicing-email-footer-icons.js";

/** Sends invoicing HTML with footer icon PNGs attached for `cid:` image sources. */
export const sendInvoicingHtmlEmail = async (opts: {
  row: PlatformSmtpRow;
  smtpScope?: SmtpPasswordScope;
  to: string;
  subject: string;
  html: string;
}): Promise<void> => {
  await sendMailHtml({
    ...opts,
    attachments: await getInvoicingEmailFooterIconAttachments()
  });
};
