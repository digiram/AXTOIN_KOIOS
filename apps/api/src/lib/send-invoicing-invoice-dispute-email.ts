/**
 * Invoice dispute opened notification email.
 *
 * Sends the customer-facing email when a tenant records an invoice dispute,
 * with audit logging and optional internal mailbox notification.
 */

import type { FastifyBaseLogger } from "fastify";

import {
  deliverInternalMailboxMessage,
  ensureInvoicingTenantConfiguration,
  getInvoiceById,
  insertInvoicingAuditEvent,
  resolveEffectiveSmtpForTenant
} from "@starter/db";
import {
  formatInvoicingInvoiceDisplayNumber,
  INVOICING_EMAIL_MOMENT_DISABLED_MESSAGE,
  invoicingEmailMomentIsEnabled,
  resolveInvoicingIssuerSnapshot
} from "@starter/shared";

import { loadInvoicingEmailLogoDataUrl } from "./entity-photo-storage.js";
import {
  buildInvoicingInvoiceDisputeEmailSubject,
  renderInvoicingInvoiceDisputeEmailHtml
} from "./invoicing-invoice-dispute-email.js";
import { mailboxEmbeddedSentEmailForStorage } from "./mailbox-embedded-sent-email.js";
import { sendInvoicingHtmlEmail } from "./send-invoicing-html-email.js";

export type SendInvoicingInvoiceDisputeEmailResult =
  | { ok: true }
  | { ok: false; status: 404 | 409 | 502 | 503; error: string; message: string };

export const sendInvoicingInvoiceDisputeEmail = async (params: {
  tenantId: string;
  invoiceId: string;
  actorUserId: string | null;
  disputedInformation: string;
  to?: string | null;
  log: FastifyBaseLogger;
}): Promise<SendInvoicingInvoiceDisputeEmailResult> => {
  const { tenantId, invoiceId, actorUserId, disputedInformation, log } = params;
  const cfg = await ensureInvoicingTenantConfiguration(tenantId);
  if (!invoicingEmailMomentIsEnabled(cfg, "dispute_opened")) {
    return {
      ok: false,
      status: 409,
      error: "email_disabled",
      message: INVOICING_EMAIL_MOMENT_DISABLED_MESSAGE
    };
  }
  const invoice = await getInvoiceById(tenantId, invoiceId);
  if (!invoice) {
    return { ok: false, status: 404, error: "not_found", message: "Invoice not found." };
  }

  const to = params.to?.trim() ?? invoice.customerSnapshot.email?.trim();
  if (!to) {
    return {
      ok: false,
      status: 502,
      error: "validation_error",
      message: "Customer has no email address on this invoice."
    };
  }

  const issuerSnapshot = resolveInvoicingIssuerSnapshot(invoice.issuerSnapshot, cfg.issuerSnapshot);
  const displayNumber = formatInvoicingInvoiceDisplayNumber(invoice.documentNumber, invoice.revision);
  const subject = buildInvoicingInvoiceDisputeEmailSubject({
    displayNumber,
    companyName: issuerSnapshot.companyName ?? null
  });

  let html: string;
  try {
    html = await renderInvoicingInvoiceDisputeEmailHtml({
      displayNumber,
      documentDate: invoice.documentDate,
      dueDate: invoice.dueDate,
      paymentTermDays: invoice.paymentTermDays,
      currencyCode: invoice.currencyCode,
      totalIncludingTaxMinor: invoice.totalIncludingTaxMinor,
      disputedInformation,
      issuerSnapshot,
      customerSnapshot: invoice.customerSnapshot,
      footerText: invoice.footerText,
      documentThemeColor: cfg.documentThemeColor,
      logoDataUrl: await loadInvoicingEmailLogoDataUrl(tenantId, cfg.companyLogoRelPath)
    });
  } catch (err) {
    log.error({ err, tenantId, invoiceId }, "invoice dispute email HTML render failed");
    return {
      ok: false,
      status: 502,
      error: "render_error",
      message: "Could not build the invoice dispute email."
    };
  }

  const { row: smtp, source } = await resolveEffectiveSmtpForTenant(tenantId);
  if (!smtp?.smtpEnabled || !smtp.host.trim()) {
    return {
      ok: false,
      status: 503,
      error: "service_unavailable",
      message:
        source === "tenant"
          ? "SMTP delivery is disabled for this organization. Configure outbound email under System configuration."
          : "SMTP is not configured. Set up outbound email for your organization or ask a platform operator to configure platform SMTP."
    };
  }

  try {
    await sendInvoicingHtmlEmail({
      row: smtp,
      smtpScope: source === "tenant" ? { tenantId } : {},
      to,
      subject,
      html
    });
  } catch (err) {
    log.warn({ err, tenantId, invoiceId, source }, "invoice dispute email SMTP send failed");
    return {
      ok: false,
      status: 502,
      error: "mail_error",
      message: "Could not send the invoice dispute email. Check SMTP settings and try again."
    };
  }

  await insertInvoicingAuditEvent({
    tenantId,
    eventKind: "invoice_dispute_email_sent",
    documentKind: "invoice",
    documentId: invoiceId,
    actorUserId,
    payload: { to, subject, smtpSource: source, disputedInformation: disputedInformation.trim() }
  });

  if (actorUserId) {
    try {
      await deliverInternalMailboxMessage({
        tenantId,
        recipientUserId: actorUserId,
        source: "invoicing",
        subject: `Invoice ${displayNumber} dispute notification sent`,
        bodyHtml: `<p>You sent a dispute notification for invoice <strong>${displayNumber}</strong> to <strong>${to}</strong>.</p>`,
        actionUrl: `/admin/invoicing/invoices/${invoiceId}`,
        relatedEntityKind: "invoice",
        relatedEntityId: invoiceId,
        embeddedSentEmail: await mailboxEmbeddedSentEmailForStorage({
          kind: "invoice",
          displayNumber,
          to,
          subject,
          bodyHtml: html
        })
      });
    } catch (err) {
      log.warn({ err, tenantId, invoiceId }, "internal mailbox notification skipped after invoice dispute email send");
    }
  }

  return { ok: true };
};
