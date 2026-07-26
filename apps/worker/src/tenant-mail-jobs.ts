/**
 * Tenant transactional email job handlers.
 *
 * Sends welcome and invoicing payment-reminder messages using effective tenant or
 * platform SMTP settings resolved from the database.
 *
 * Responsibilities:
 * - Resolve recipient email and SMTP transport per tenant
 * - Load platform welcome template HTML when configured
 * - Build reminder copy from invoicing document metadata
 *
 * Depends on:
 * - `@starter/db` mail and template helpers
 *
 * Security:
 * - Never log raw SMTP credentials; skip send when SMTP disabled
 * - Tenant id in payload must match resolved SMTP scope
 */

import {
  DEFAULT_WELCOME_BODY_HTML,
  buildInvoicingPaymentReminderEmailPayload,
  getPlatformEmailTemplateByKey,
  getUserEmailById,
  resolveEffectiveSmtpForTenant,
  sendMailHtml,
  type InvoicingPaymentReminderEmailJobPayload
} from "@starter/db";

type JobLogger = {
  warn: (obj: object, msg?: string) => void;
  error: (obj: object, msg?: string) => void;
};

/**
 * Sends the post-registration welcome email for a tenant user.
 *
 * @returns `{ sent: false, reason }` when email or SMTP is unavailable (non-throwing skip).
 * @throws When SMTP is configured but the send fails.
 */
export const sendWelcomeEmailJob = async (
  payload: { userId: string; tenantId: string },
  log: JobLogger
): Promise<{ sent: boolean; reason?: string }> => {
  const email = (await getUserEmailById(payload.userId))?.trim() ?? "";
  if (!email) {
    log.warn({ userId: payload.userId, tenantId: payload.tenantId }, "welcome-email skipped: user email missing");
    return { sent: false, reason: "missing_email" };
  }

  const { row, source } = await resolveEffectiveSmtpForTenant(payload.tenantId);
  if (!row?.smtpEnabled || !row.host.trim()) {
    log.warn(
      { tenantId: payload.tenantId, source },
      "welcome-email skipped: SMTP unavailable or disabled"
    );
    return { sent: false, reason: "smtp_unavailable" };
  }

  const welcome = await getPlatformEmailTemplateByKey("welcome");
  const html = welcome?.bodyHtml?.trim() || DEFAULT_WELCOME_BODY_HTML;
  const subject = welcome?.subject?.trim() || "Welcome";

  try {
    await sendMailHtml({
      row,
      smtpScope: source === "tenant" ? { tenantId: payload.tenantId } : {},
      to: email,
      subject,
      html
    });
    return { sent: true };
  } catch (err) {
    log.error({ err, tenantId: payload.tenantId, source }, "welcome-email send failed");
    throw err;
  }
};

/**
 * Sends a first or second payment reminder for an outstanding invoice.
 *
 * @param payload - Tenant-scoped invoice id and reminder kind from lifecycle worker.
 * @returns `{ sent: false, reason }` when recipient or SMTP is missing.
 * @throws When SMTP send fails after validation.
 */
export const sendInvoicingPaymentReminderEmailJob = async (
  payload: InvoicingPaymentReminderEmailJobPayload,
  log: JobLogger
): Promise<{ sent: boolean; reason?: string }> => {
  const emailPayload = await buildInvoicingPaymentReminderEmailPayload(
    payload.tenantId,
    payload.invoiceId,
    payload.reminderKind
  );
  if (!emailPayload) return { sent: false, reason: "missing_recipient" };

  const to = emailPayload.recipientEmail.trim();
  if (!to) return { sent: false, reason: "missing_recipient" };

  const { row, source } = await resolveEffectiveSmtpForTenant(payload.tenantId);
  if (!row?.smtpEnabled || !row.host.trim()) {
    log.warn(
      { tenantId: payload.tenantId, invoiceId: payload.invoiceId, source },
      "invoicing payment reminder skipped: SMTP unavailable or disabled"
    );
    return { sent: false, reason: "smtp_unavailable" };
  }

  const subject =
    emailPayload.reminderKind === "first"
      ? `Payment reminder: ${emailPayload.displayDocumentNumber}`
      : `Second payment reminder: ${emailPayload.displayDocumentNumber}`;
  const html = `<p>Dear ${emailPayload.customerName},</p><p>This is a ${
    emailPayload.reminderKind === "first" ? "friendly reminder" : "follow-up reminder"
  } that invoice <strong>${emailPayload.displayDocumentNumber}</strong> was due on ${emailPayload.dueDate}.</p><p>Outstanding balance: ${emailPayload.currencyCode} ${(emailPayload.outstandingMinor / 100).toFixed(2)}</p>`;

  try {
    await sendMailHtml({
      row,
      smtpScope: source === "tenant" ? { tenantId: payload.tenantId } : {},
      to,
      subject,
      html
    });
    return { sent: true };
  } catch (err) {
    log.error(
      { err, tenantId: payload.tenantId, invoiceId: payload.invoiceId, source },
      "invoicing payment reminder send failed"
    );
    throw err;
  }
};
