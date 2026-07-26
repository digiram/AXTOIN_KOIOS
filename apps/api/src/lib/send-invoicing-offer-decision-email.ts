/**
 * Offer accept/reject decision notification email.
 *
 * Notifies the customer when an offer decision is recorded (accept or reject)
 * via staff action or public response link.
 */

import type { FastifyBaseLogger } from "fastify";

import {
  ensureInvoicingTenantConfiguration,
  getOfferById,
  insertInvoicingAuditEvent,
  resolveEffectiveSmtpForTenant
} from "@starter/db";
import { formatInvoicingOfferDisplayNumber, invoicingEmailMomentIsEnabled, resolveInvoicingIssuerSnapshot } from "@starter/shared";

import { loadInvoicingEmailLogoDataUrl } from "./entity-photo-storage.js";
import {
  buildInvoicingOfferDecisionEmailSubject,
  renderInvoicingOfferDecisionEmailHtml,
  type InvoicingOfferDecisionEmailChannel
} from "./invoicing-offer-decision-email.js";
import { sendInvoicingHtmlEmail } from "./send-invoicing-html-email.js";

export const sendInvoicingOfferDecisionEmail = async (params: {
  tenantId: string;
  offerId: string;
  decision: "accept" | "reject";
  channel: InvoicingOfferDecisionEmailChannel;
  actorUserId: string | null;
  detailText?: string | null;
  responderName?: string | null;
  log: FastifyBaseLogger;
}): Promise<{ sent: boolean; skippedReason?: string }> => {
  const { tenantId, offerId, decision, channel, actorUserId, detailText, responderName, log } = params;
  const cfg = await ensureInvoicingTenantConfiguration(tenantId);
  if (!invoicingEmailMomentIsEnabled(cfg, "offer_decision")) {
    log.info({ tenantId, offerId, decision }, "offer decision email skipped: moment disabled");
    return { sent: false, skippedReason: "disabled" };
  }
  const offer = await getOfferById(tenantId, offerId);
  if (!offer) {
    log.warn({ tenantId, offerId }, "offer decision email skipped: offer not found");
    return { sent: false, skippedReason: "offer_not_found" };
  }

  const to = offer.customerSnapshot.email?.trim();
  if (!to) {
    log.warn({ tenantId, offerId }, "offer decision email skipped: customer has no email address");
    return { sent: false, skippedReason: "no_customer_email" };
  }

  const issuerSnapshot = resolveInvoicingIssuerSnapshot(offer.issuerSnapshot, cfg.issuerSnapshot);
  const displayNumber = formatInvoicingOfferDisplayNumber(offer.documentNumber, offer.revision);
  const subject = buildInvoicingOfferDecisionEmailSubject({
    decision,
    displayNumber,
    companyName: issuerSnapshot.companyName ?? null
  });

  let html: string;
  try {
    html = await renderInvoicingOfferDecisionEmailHtml({
      decision,
      channel,
      displayNumber,
      documentDate: offer.documentDate,
      offerExpiryDate: offer.offerExpiryDate,
      currencyCode: offer.currencyCode,
      totalIncludingTaxMinor: offer.totalIncludingTaxMinor,
      issuerSnapshot,
      customerSnapshot: offer.customerSnapshot,
      footerText: offer.footerText,
      documentThemeColor: cfg.documentThemeColor,
      logoDataUrl: await loadInvoicingEmailLogoDataUrl(tenantId, cfg.companyLogoRelPath),
      responderName,
      detailText
    });
  } catch (err) {
    log.error({ err, tenantId, offerId, decision }, "offer decision email HTML render failed");
    return { sent: false, skippedReason: "render_error" };
  }

  const { row: smtp, source } = await resolveEffectiveSmtpForTenant(tenantId);
  if (!smtp?.smtpEnabled || !smtp.host.trim()) {
    log.warn({ tenantId, offerId, source }, "offer decision email skipped: SMTP unavailable");
    return { sent: false, skippedReason: "smtp_unavailable" };
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
    log.warn({ err, tenantId, offerId, decision, source }, "offer decision email SMTP send failed");
    return { sent: false, skippedReason: "mail_error" };
  }

  await insertInvoicingAuditEvent({
    tenantId,
    eventKind: "offer_decision_email_sent",
    documentKind: "offer",
    documentId: offerId,
    actorUserId,
    payload: {
      decision,
      channel,
      to,
      subject,
      smtpSource: source,
      ...(responderName?.trim() ? { responderName: responderName.trim() } : {}),
      ...(detailText?.trim() ? { detailText: detailText.trim() } : {})
    }
  });

  return { sent: true };
};
