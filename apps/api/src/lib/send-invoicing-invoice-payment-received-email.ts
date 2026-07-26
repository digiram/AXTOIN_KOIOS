/**
 * Invoice payment received confirmation email.
 *
 * Sends a payment confirmation to the customer after a recorded payment; skips
 * silently when the email moment is disabled or no customer email exists.
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
  invoicingEmailMomentIsEnabled,
  resolveInvoicingIssuerSnapshot
} from "@starter/shared";

import { loadInvoicingEmailLogoDataUrl } from "./entity-photo-storage.js";
import {
  buildInvoicingInvoicePaymentReceivedEmailSubject,
  renderInvoicingInvoicePaymentReceivedEmailHtml
} from "./invoicing-invoice-payment-received-email.js";
import { mailboxEmbeddedSentEmailForStorage } from "./mailbox-embedded-sent-email.js";
import { sendInvoicingHtmlEmail } from "./send-invoicing-html-email.js";

export type SendInvoicingInvoicePaymentReceivedEmailResult =
  | { ok: true; sent: true }
  | { ok: true; sent: false; skippedReason: string }
  | { ok: false; status: 404 | 502 | 503; error: string; message: string };

export const sendInvoicingInvoicePaymentReceivedEmail = async (params: {
  tenantId: string;
  invoiceId: string;
  actorUserId: string | null;
  amountPaidMinor: number;
  paymentDate: string;
  reference?: string | null;
  to?: string | null;
  log: FastifyBaseLogger;
}): Promise<SendInvoicingInvoicePaymentReceivedEmailResult> => {
  const { tenantId, invoiceId, actorUserId, amountPaidMinor, paymentDate, reference, log } = params;
  const invoice = await getInvoiceById(tenantId, invoiceId);
  if (!invoice) {
    return { ok: false, status: 404, error: "not_found", message: "Invoice not found." };
  }

  const to = params.to?.trim() ?? invoice.customerSnapshot.email?.trim();
  if (!to) {
    log.warn({ tenantId, invoiceId }, "invoice payment received email skipped: customer has no email address");
    return { ok: true, sent: false, skippedReason: "no_customer_email" };
  }

  const cfg = await ensureInvoicingTenantConfiguration(tenantId);
  if (!invoicingEmailMomentIsEnabled(cfg, "payment_received")) {
    log.info({ tenantId, invoiceId }, "invoice payment received email skipped: moment disabled");
    return { ok: true, sent: false, skippedReason: "disabled" };
  }
  const issuerSnapshot = resolveInvoicingIssuerSnapshot(invoice.issuerSnapshot, cfg.issuerSnapshot);
  const displayNumber = formatInvoicingInvoiceDisplayNumber(invoice.documentNumber, invoice.revision);
  const subject = buildInvoicingInvoicePaymentReceivedEmailSubject({
    displayNumber,
    companyName: issuerSnapshot.companyName ?? null
  });

  let html: string;
  try {
    html = await renderInvoicingInvoicePaymentReceivedEmailHtml({
      displayNumber,
      documentDate: invoice.documentDate,
      dueDate: invoice.dueDate,
      currencyCode: invoice.currencyCode,
      amountPaidMinor,
      paymentDate,
      reference,
      issuerSnapshot,
      customerSnapshot: invoice.customerSnapshot,
      footerText: invoice.footerText,
      documentThemeColor: cfg.documentThemeColor,
      logoDataUrl: await loadInvoicingEmailLogoDataUrl(tenantId, cfg.companyLogoRelPath)
    });
  } catch (err) {
    log.error({ err, tenantId, invoiceId }, "invoice payment received email HTML render failed");
    return {
      ok: false,
      status: 502,
      error: "render_error",
      message: "Could not build the payment confirmation email."
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
    log.warn({ err, tenantId, invoiceId, source }, "invoice payment received email SMTP send failed");
    return {
      ok: false,
      status: 502,
      error: "mail_error",
      message: "Could not send the payment confirmation email. Check SMTP settings and try again."
    };
  }

  await insertInvoicingAuditEvent({
    tenantId,
    eventKind: "invoice_payment_received_email_sent",
    documentKind: "invoice",
    documentId: invoiceId,
    actorUserId,
    payload: {
      to,
      subject,
      smtpSource: source,
      amountPaidMinor,
      paymentDate,
      ...(reference?.trim() ? { reference: reference.trim() } : {})
    }
  });

  if (actorUserId) {
    try {
      await deliverInternalMailboxMessage({
        tenantId,
        recipientUserId: actorUserId,
        source: "invoicing",
        subject: `Payment confirmation sent for invoice ${displayNumber}`,
        bodyHtml: `<p>You sent a full payment confirmation for invoice <strong>${displayNumber}</strong> to <strong>${to}</strong>.</p>`,
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
        "internal mailbox notification skipped after invoice payment received email send"
      );
    }
  }

  return { ok: true, sent: true };
};
