/**
 * Invoicing document outbound email orchestration.
 *
 * Renders, sends, and audits quote/offer/invoice emails plus internal mailbox
 * notifications for tenant invoicing routes.
 *
 * Responsibilities:
 * - Load document rows and tenant invoicing configuration
 * - Guard disabled email moments and invalid document states
 * - Render MJML HTML, send via tenant or platform SMTP
 * - Record audit events and optional internal mailbox copies
 *
 * Related:
 * - `routes/tenant-invoicing.ts` — HTTP entrypoints
 * - `docs/invoicing-quoting-module.md` — product rules
 *
 * Security:
 * - All repository calls scoped by `tenantId`
 */

import type { FastifyBaseLogger } from "fastify";

import {
  ensureInvoicingTenantConfiguration,
  deliverInternalMailboxMessage,
  getInvoiceById,
  getOfferById,
  getQuoteById,
  insertInvoicingAuditEvent,
  issueInvoicingOfferResponseToken,
  listInvoiceLineItems,
  listOfferLineItems,
  listQuoteLineItems,
  resolveEffectiveSmtpForTenant,
  sendInvoice
} from "@starter/db";
import {
  canSendInvoiceEmail,
  canSendOfferEmail,
  canSendQuoteEmail,
  defaultInvoicingTermsTextForKind,
  formatInvoicingInvoiceDisplayNumber,
  formatInvoicingOfferDisplayNumber,
  isInvoicingOfferCustomerResponseAllowed,
  resolveInvoicingIssuerSnapshot,
  type InvoicingDocumentKind,
  type InvoicingSendDocumentEmailBodyInput
} from "@starter/shared";

import { loadInvoicingEmailLogoDataUrl } from "./entity-photo-storage.js";
import {
  buildInvoicingPublicOfferResponseUrl,
  resolvePublicAppOrigin
} from "./public-app-origin.js";
import {
  buildInvoicingDocumentEmailSubject,
  renderInvoicingDocumentEmailHtml,
  type InvoicingDocumentEmailRenderInput
} from "./invoicing-quote-email.js";
import { invoicingDocumentEmailDisabledForConfiguration } from "./invoicing-email-moment-guard.js";
import { mailboxEmbeddedSentEmailForStorage } from "./mailbox-embedded-sent-email.js";
import { sendInvoicingHtmlEmail } from "./send-invoicing-html-email.js";

export type SendInvoicingDocumentEmailResult =
  | { ok: true }
  | { ok: false; status: 400 | 404 | 409 | 502 | 503; error: string; message: string };

const AUDIT_EVENT_BY_KIND = {
  quote: "quote_email_sent",
  offer: "offer_email_sent",
  invoice: "invoice_email_sent"
} as const;

const NOT_FOUND_MESSAGE: Record<InvoicingDocumentKind, string> = {
  quote: "Quote not found.",
  offer: "Offer not found.",
  invoice: "Invoice not found."
};

const RENDER_ERROR_MESSAGE: Record<InvoicingDocumentKind, string> = {
  quote: "Could not build the quote email.",
  offer: "Could not build the offer email.",
  invoice: "Could not build the invoice email."
};

const SEND_ERROR_MESSAGE: Record<InvoicingDocumentKind, string> = {
  quote: "Could not send the quote email. Check SMTP settings and try again.",
  offer: "Could not send the offer email. Check SMTP settings and try again.",
  invoice: "Could not send the invoice email. Check SMTP settings and try again."
};

const DOCUMENT_PATH: Record<InvoicingDocumentKind, string> = {
  quote: "quotes",
  offer: "offers",
  invoice: "invoices"
};

const mapLineItems = (
  lines: Awaited<ReturnType<typeof listQuoteLineItems>>
): InvoicingDocumentEmailRenderInput["lineItems"] =>
  lines.map((line) => ({
    description: line.description,
    sku: line.sku,
    quantity: line.quantity,
    unitLabel: line.unitLabel,
    unitPriceMinor: line.unitPriceMinor,
    taxRateBps: line.taxRateBps,
    lineTotalMinor: line.lineTotalMinor
  }));

/** Sends quote, offer, or invoice email for the given document kind. */
export const sendInvoicingDocumentEmail = async (params: {
  tenantId: string;
  kind: InvoicingDocumentKind;
  documentId: string;
  actorUserId: string | null;
  body: InvoicingSendDocumentEmailBodyInput;
  log: FastifyBaseLogger;
}): Promise<SendInvoicingDocumentEmailResult> => {
  const { tenantId, kind, documentId, actorUserId, body, log } = params;
  const cfg = await ensureInvoicingTenantConfiguration(tenantId);
  const disabled = invoicingDocumentEmailDisabledForConfiguration(cfg, kind);
  if (disabled) return disabled;

  let renderInput: InvoicingDocumentEmailRenderInput;
  if (kind === "quote") {
    const quote = await getQuoteById(tenantId, documentId);
    if (!quote) {
      return { ok: false, status: 404, error: "not_found", message: NOT_FOUND_MESSAGE.quote };
    }
    if (!canSendQuoteEmail(quote.status)) {
      return {
        ok: false,
        status: 409,
        error: "invalid_state",
        message: "Promoted quotes cannot be emailed."
      };
    }
    const lineItems = await listQuoteLineItems(tenantId, documentId);
    const issuerSnapshot = resolveInvoicingIssuerSnapshot(quote.issuerSnapshot, cfg.issuerSnapshot);
    const displayNumber = quote.documentNumber ?? quote.temporaryReference ?? quote.id.slice(0, 8);
    renderInput = {
      kind,
      displayNumber,
      documentDate: quote.documentDate,
      quoteExpiryDate: quote.quoteExpiryDate,
      currencyCode: quote.currencyCode,
      issuerSnapshot,
      customerSnapshot: quote.customerSnapshot,
      subtotalExcludingTaxMinor: quote.subtotalExcludingTaxMinor,
      discountTotalMinor: quote.discountTotalMinor,
      taxTotalMinor: quote.taxTotalMinor,
      totalIncludingTaxMinor: quote.totalIncludingTaxMinor,
      notes: quote.notes,
      termsText: quote.termsText?.trim() ? quote.termsText : defaultInvoicingTermsTextForKind("quote", cfg),
      footerText: quote.footerText,
      lineItems: mapLineItems(lineItems),
      taxRateOptions: cfg.taxRateOptions,
      documentThemeColor: cfg.documentThemeColor,
      logoDataUrl: await loadInvoicingEmailLogoDataUrl(tenantId, cfg.companyLogoRelPath)
    };
  } else if (kind === "offer") {
    const offer = await getOfferById(tenantId, documentId);
    if (!offer) {
      return { ok: false, status: 404, error: "not_found", message: NOT_FOUND_MESSAGE.offer };
    }
    if (!canSendOfferEmail(offer.status)) {
      return {
        ok: false,
        status: 409,
        error: "invalid_state",
        message: "This offer must be sent before it can be re-emailed."
      };
    }
    const lineItems = await listOfferLineItems(tenantId, documentId);
    const issuerSnapshot = resolveInvoicingIssuerSnapshot(offer.issuerSnapshot, cfg.issuerSnapshot);
    const displayNumber = formatInvoicingOfferDisplayNumber(offer.documentNumber, offer.revision);
    let responseLinks: InvoicingDocumentEmailRenderInput["responseLinks"] = null;
    if (isInvoicingOfferCustomerResponseAllowed(offer.status, offer.offerExpiryDate)) {
      const origin = resolvePublicAppOrigin();
      if (origin) {
        const token = await issueInvoicingOfferResponseToken(tenantId, documentId);
        responseLinks = {
          acceptUrl: buildInvoicingPublicOfferResponseUrl(origin, token, "accept"),
          rejectUrl: buildInvoicingPublicOfferResponseUrl(origin, token, "reject")
        };
      } else {
        log.warn(
          { tenantId, offerId: documentId },
          "APP_PUBLIC_ORIGIN unset; offer accept/reject links omitted from email"
        );
      }
    }
    renderInput = {
      kind,
      displayNumber,
      documentDate: offer.documentDate,
      offerExpiryDate: offer.offerExpiryDate,
      currencyCode: offer.currencyCode,
      issuerSnapshot,
      customerSnapshot: offer.customerSnapshot,
      subtotalExcludingTaxMinor: offer.subtotalExcludingTaxMinor,
      discountTotalMinor: offer.discountTotalMinor,
      taxTotalMinor: offer.taxTotalMinor,
      totalIncludingTaxMinor: offer.totalIncludingTaxMinor,
      notes: offer.notes,
      termsText: offer.termsText?.trim() ? offer.termsText : defaultInvoicingTermsTextForKind("offer", cfg),
      footerText: offer.footerText,
      lineItems: mapLineItems(lineItems),
      taxRateOptions: cfg.taxRateOptions,
      documentThemeColor: cfg.documentThemeColor,
      logoDataUrl: await loadInvoicingEmailLogoDataUrl(tenantId, cfg.companyLogoRelPath),
      responseLinks
    };
  } else {
    const invoice = await getInvoiceById(tenantId, documentId);
    if (!invoice) {
      return { ok: false, status: 404, error: "not_found", message: NOT_FOUND_MESSAGE.invoice };
    }
    if (!canSendInvoiceEmail(invoice.status)) {
      return {
        ok: false,
        status: 409,
        error: "invalid_state",
        message: "This invoice must be sent before it can be re-emailed."
      };
    }
    const lineItems = await listInvoiceLineItems(tenantId, documentId);
    const issuerSnapshot = resolveInvoicingIssuerSnapshot(invoice.issuerSnapshot, cfg.issuerSnapshot);
    const displayNumber = formatInvoicingInvoiceDisplayNumber(invoice.documentNumber, invoice.revision);
    renderInput = {
      kind,
      displayNumber,
      documentDate: invoice.documentDate,
      sentOnDate: invoice.finalizedAt?.toISOString().slice(0, 10) ?? null,
      dueDate: invoice.dueDate,
      paymentTermDays: invoice.paymentTermDays,
      currencyCode: invoice.currencyCode,
      issuerSnapshot,
      customerSnapshot: invoice.customerSnapshot,
      subtotalExcludingTaxMinor: invoice.subtotalExcludingTaxMinor,
      discountTotalMinor: invoice.discountTotalMinor,
      taxTotalMinor: invoice.taxTotalMinor,
      totalIncludingTaxMinor: invoice.totalIncludingTaxMinor,
      notes: invoice.notes,
      termsText: invoice.termsText?.trim() ? invoice.termsText : defaultInvoicingTermsTextForKind("invoice", cfg),
      footerText: invoice.footerText,
      lineItems: mapLineItems(lineItems),
      taxRateOptions: cfg.taxRateOptions,
      documentThemeColor: cfg.documentThemeColor,
      logoDataUrl: await loadInvoicingEmailLogoDataUrl(tenantId, cfg.companyLogoRelPath)
    };
  }

  const subject =
    body.subject?.trim() ||
    buildInvoicingDocumentEmailSubject({
      kind,
      displayNumber: renderInput.displayNumber,
      companyName: renderInput.issuerSnapshot.companyName ?? null
    });

  let html: string;
  let mailboxPreviewHtml: string;
  try {
    html = await renderInvoicingDocumentEmailHtml(renderInput);
    mailboxPreviewHtml =
      kind === "offer" && renderInput.responseLinks
        ? await renderInvoicingDocumentEmailHtml({ ...renderInput, responseLinks: null })
        : html;
  } catch (err) {
    log.error({ err, tenantId, kind, documentId }, "invoicing document email HTML render failed");
    return {
      ok: false,
      status: 502,
      error: "render_error",
      message: RENDER_ERROR_MESSAGE[kind]
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
      to: body.to.trim(),
      subject,
      html
    });
  } catch (err) {
    log.warn({ err, tenantId, kind, documentId, source }, "invoicing document email SMTP send failed");
    return {
      ok: false,
      status: 502,
      error: "mail_error",
      message: SEND_ERROR_MESSAGE[kind]
    };
  }

  await insertInvoicingAuditEvent({
    tenantId,
    eventKind: AUDIT_EVENT_BY_KIND[kind],
    documentKind: kind,
    documentId,
    actorUserId,
    payload: { to: body.to.trim(), subject, smtpSource: source }
  });

  if (actorUserId) {
    const kindLabel = kind.charAt(0).toUpperCase() + kind.slice(1);
    try {
      await deliverInternalMailboxMessage({
        tenantId,
        recipientUserId: actorUserId,
        source: "invoicing",
        subject: `${kindLabel} ${renderInput.displayNumber} sent`,
        bodyHtml: `<p>You sent ${kind} <strong>${renderInput.displayNumber}</strong> to <strong>${body.to.trim()}</strong>.</p>`,
        actionUrl: `/admin/invoicing/${DOCUMENT_PATH[kind]}/${documentId}`,
        relatedEntityKind: kind,
        relatedEntityId: documentId,
        embeddedSentEmail: await mailboxEmbeddedSentEmailForStorage({
          kind,
          displayNumber: renderInput.displayNumber,
          to: body.to.trim(),
          subject,
          bodyHtml: mailboxPreviewHtml
        })
      });
    } catch (err) {
      log.warn({ err, tenantId, kind, documentId }, "internal mailbox notification skipped after document email send");
    }
  }

  return { ok: true };
};

export const sendInvoicingQuoteEmail = async (params: {
  tenantId: string;
  quoteId: string;
  actorUserId: string | null;
  body: InvoicingSendDocumentEmailBodyInput;
  log: FastifyBaseLogger;
}): Promise<SendInvoicingDocumentEmailResult> =>
  sendInvoicingDocumentEmail({
    tenantId: params.tenantId,
    kind: "quote",
    documentId: params.quoteId,
    actorUserId: params.actorUserId,
    body: params.body,
    log: params.log
  });

export const sendInvoicingOfferEmail = async (params: {
  tenantId: string;
  offerId: string;
  actorUserId: string | null;
  body: InvoicingSendDocumentEmailBodyInput;
  log: FastifyBaseLogger;
}): Promise<SendInvoicingDocumentEmailResult> =>
  sendInvoicingDocumentEmail({
    tenantId: params.tenantId,
    kind: "offer",
    documentId: params.offerId,
    actorUserId: params.actorUserId,
    body: params.body,
    log: params.log
  });

export const sendInvoicingInvoiceEmail = async (params: {
  tenantId: string;
  invoiceId: string;
  actorUserId: string | null;
  body: InvoicingSendDocumentEmailBodyInput;
  log: FastifyBaseLogger;
}): Promise<SendInvoicingDocumentEmailResult> =>
  sendInvoicingDocumentEmail({
    tenantId: params.tenantId,
    kind: "invoice",
    documentId: params.invoiceId,
    actorUserId: params.actorUserId,
    body: params.body,
    log: params.log
  });

export type FinalizeAndEmailInvoicingInvoiceResult = SendInvoicingDocumentEmailResult;

/** Marks a draft invoice as sent, then emails the customer. */
export const finalizeAndEmailInvoicingInvoice = async (params: {
  tenantId: string;
  invoiceId: string;
  actorUserId: string | null;
  sendOpts?: {
    dueDate?: string | null;
    paymentTermDays?: number | null;
    statusAfterSend?: "invoice_sent" | "invoice_accredited";
  };
  to?: string | null;
  subject?: string | null;
  log: FastifyBaseLogger;
  emailFailureSuffix?: string;
}): Promise<FinalizeAndEmailInvoicingInvoiceResult> => {
  const { tenantId, invoiceId, actorUserId, sendOpts, log, emailFailureSuffix } = params;
  const invoice = await getInvoiceById(tenantId, invoiceId);
  if (!invoice) {
    return { ok: false, status: 404, error: "not_found", message: NOT_FOUND_MESSAGE.invoice };
  }
  if (invoice.status !== "invoice_draft") {
    return {
      ok: false,
      status: 409,
      error: "invalid_state",
      message: "Invoice must be a draft to send."
    };
  }

  const to = params.to?.trim() ?? invoice.customerSnapshot.email?.trim();
  if (!to) {
    return {
      ok: false,
      status: 400,
      error: "validation_error",
      message: "Add a customer email address before sending this invoice."
    };
  }

  const sent = await sendInvoice(tenantId, invoiceId, actorUserId, {
    dueDate: sendOpts?.dueDate,
    paymentTermDays: sendOpts?.paymentTermDays ?? invoice.paymentTermDays,
    statusAfterSend: sendOpts?.statusAfterSend
  });
  if (!sent) {
    return {
      ok: false,
      status: 409,
      error: "invalid_state",
      message: "Invoice must be a draft to send."
    };
  }

  const emailOutcome = await sendInvoicingInvoiceEmail({
    tenantId,
    invoiceId,
    actorUserId,
    body: {
      to,
      ...(params.subject?.trim() ? { subject: params.subject.trim() } : {})
    },
    log
  });
  if (!emailOutcome.ok) {
    const suffix =
      emailFailureSuffix ??
      "The invoice was marked as sent; use Resend invoice to try again.";
    return {
      ...emailOutcome,
      message: `${emailOutcome.message} ${suffix}`
    };
  }

  return { ok: true };
};
