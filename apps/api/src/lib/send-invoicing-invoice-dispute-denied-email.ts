/**
 * Invoice dispute denial email.
 *
 * Sends the customer-facing email when a tenant denies an invoice dispute with
 * an explanation for the customer.
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
  buildInvoicingInvoiceDisputeDeniedEmailSubject,
  renderInvoicingInvoiceDisputeDeniedEmailHtml
} from "./invoicing-invoice-dispute-denied-email.js";
import { mailboxEmbeddedSentEmailForStorage } from "./mailbox-embedded-sent-email.js";
import { sendInvoicingHtmlEmail } from "./send-invoicing-html-email.js";

export type SendInvoicingInvoiceDisputeDeniedEmailResult =
  | { ok: true }
  | { ok: false; status: 404 | 409 | 502 | 503; error: string; message: string };

export const sendInvoicingInvoiceDisputeDeniedEmail = async (params: {
  tenantId: string;
  invoiceId: string;
  actorUserId: string | null;
  denialReason: string;
  to?: string | null;
  log: FastifyBaseLogger;
}): Promise<SendInvoicingInvoiceDisputeDeniedEmailResult> => {
  const { tenantId, invoiceId, actorUserId, denialReason, log } = params;
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

  const cfg = await ensureInvoicingTenantConfiguration(tenantId);
  if (!invoicingEmailMomentIsEnabled(cfg, "dispute_denied")) {
    return {
      ok: false,
      status: 409,
      error: "email_disabled",
      message: INVOICING_EMAIL_MOMENT_DISABLED_MESSAGE
    };
  }
  const issuerSnapshot = resolveInvoicingIssuerSnapshot(invoice.issuerSnapshot, cfg.issuerSnapshot);
  const displayNumber = formatInvoicingInvoiceDisplayNumber(invoice.documentNumber, invoice.revision);
  const subject = buildInvoicingInvoiceDisputeDeniedEmailSubject({
    displayNumber,
    companyName: issuerSnapshot.companyName ?? null
  });

  let html: string;
  try {
    html = await renderInvoicingInvoiceDisputeDeniedEmailHtml({
      displayNumber,
      documentDate: invoice.documentDate,
      currencyCode: invoice.currencyCode,
      totalIncludingTaxMinor: invoice.totalIncludingTaxMinor,
      denialReason,
      issuerSnapshot,
      customerSnapshot: invoice.customerSnapshot,
      footerText: invoice.footerText,
      documentThemeColor: cfg.documentThemeColor,
      logoDataUrl: await loadInvoicingEmailLogoDataUrl(tenantId, cfg.companyLogoRelPath)
    });
  } catch (err) {
    log.error({ err, tenantId, invoiceId }, "invoice dispute denial email HTML render failed");
    return {
      ok: false,
      status: 502,
      error: "render_error",
      message: "Could not build the dispute denial email."
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
    log.warn({ err, tenantId, invoiceId, source }, "invoice dispute denial email SMTP send failed");
    return {
      ok: false,
      status: 502,
      error: "mail_error",
      message: "Could not send the dispute denial email. Check SMTP settings and try again."
    };
  }

  await insertInvoicingAuditEvent({
    tenantId,
    eventKind: "invoice_dispute_denial_email_sent",
    documentKind: "invoice",
    documentId: invoiceId,
    actorUserId,
    payload: {
      to,
      subject,
      smtpSource: source,
      denialReason: denialReason.trim()
    }
  });

  if (actorUserId) {
    try {
      await deliverInternalMailboxMessage({
        tenantId,
        recipientUserId: actorUserId,
        source: "invoicing",
        subject: `Invoice ${displayNumber} dispute denial sent`,
        bodyHtml: `<p>You sent a dispute denial explanation for invoice <strong>${displayNumber}</strong> to <strong>${to}</strong>.</p>`,
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
      log.warn(
        { err, tenantId, invoiceId },
        "internal mailbox notification skipped after invoice dispute denial email send"
      );
    }
  }

  return { ok: true };
};
