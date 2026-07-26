/**
 * Invoicing lifecycle jobs and date-driven state transitions.
 *
 * BullMQ job names, reminder kinds, and pure helpers for quote expiry, offer
 * expiration, overdue invoices, and payment reminder scheduling.
 *
 * Responsibilities:
 * - Export worker job identifiers for invoicing lifecycle queue
 * - Compute due dates, reminder windows, and eligibility flags from tenant config
 *
 * Related:
 * - `docs/invoicing-quoting-module.md`
 * - `invoicing.ts`, `invoicing-email-moments.ts`
 *
 * Notes:
 * - Job payloads use IDs only; customer PII resolved in worker/API layers.
 */
import { addDaysUtc } from "./subscription-billing.js";
import {
  DEFAULT_QUOTE_VALIDITY_DAYS,
  isOfferPendingDecision,
  quoteExpiryDateFromValidityDays,
  quoteValidityDaysFromDates,
  resolveInvoicingPaymentTermDays,
  type InvoicingOfferStatus
} from "./invoicing.js";

/** BullMQ job: daily scan fan-out for quote flags, offer expiry, overdue, reminders. */
export const INVOICING_LIFECYCLE_SCAN_JOB_NAME = "invoicing-lifecycle-scan";

export const INVOICING_EXPIRE_OFFER_JOB_NAME = "invoicing-expire-offer";

export const INVOICING_MARK_INVOICE_OVERDUE_JOB_NAME = "invoicing-mark-invoice-overdue";

export const INVOICING_PAYMENT_REMINDER_JOB_NAME = "invoicing-payment-reminder";

export const INVOICING_PAYMENT_REMINDER_EMAIL_JOB_NAME = "invoicing-payment-reminder-email";

export const INVOICING_PAYMENT_REMINDER_KINDS = ["first", "second"] as const;
export type InvoicingPaymentReminderKind = (typeof INVOICING_PAYMENT_REMINDER_KINDS)[number];

/** BullMQ / SQL job payload for payment-reminder email sends (IDs only — no customer PII). */
export type InvoicingPaymentReminderEmailJobPayload = {
  tenantId: string;
  invoiceId: string;
  reminderKind: InvoicingPaymentReminderKind;
};

export const todayIsoDateUtc = (): string => new Date().toISOString().slice(0, 10);

export const isoDateFromTimestamp = (d: Date): string => d.toISOString().slice(0, 10);

export const addDaysToIsoDate = (isoDate: string, days: number): string => {
  const d = new Date(`${isoDate}T12:00:00.000Z`);
  return addDaysUtc(d, Math.max(0, Math.floor(days))).toISOString().slice(0, 10);
};

/** Due date for a standard sent invoice: finalized calendar date + net payment term. */
export const computeInvoiceDueDateFromFinalizedAt = (
  finalizedAt: Date,
  paymentTermDays: number
): string => addDaysToIsoDate(isoDateFromTimestamp(finalizedAt), paymentTermDays);

/** Due date for a partial-payment revision when sent: payment anchor + net payment term. */
export const computeInvoiceDueDateFromPartialAnchor = (
  partialPaymentAnchorDate: string,
  paymentTermDays: number
): string => addDaysToIsoDate(partialPaymentAnchorDate, paymentTermDays);

export const isQuoteSoftExpired = (
  quoteExpiryDate: string | null | undefined,
  today: string = todayIsoDateUtc()
): boolean => {
  const trimmed = quoteExpiryDate?.trim();
  return Boolean(trimmed && trimmed < today);
};

export const isOfferPastValidity = (
  offerExpiryDate: string | null | undefined,
  today: string = todayIsoDateUtc()
): boolean => isQuoteSoftExpired(offerExpiryDate, today);

/** Customer may accept/reject via emailed deep link while the offer awaits decision and remains within validity. */
export const isInvoicingOfferCustomerResponseAllowed = (
  status: InvoicingOfferStatus,
  offerExpiryDate: string | null | undefined,
  today?: string
): boolean => isOfferPendingDecision(status) && !isOfferPastValidity(offerExpiryDate, today);

export const formatInvoicingPublicOfferDecisionProof = (input: {
  responderName: string;
  comment: string;
}): string => `${input.responderName.trim()}: ${input.comment.trim()}`;

/** Valid-until date when an offer is sent for the first time. */
export const resolveOfferExpiryDateForSend = (
  sendDate: string,
  offerExpiryDate: string | null | undefined,
  defaultQuoteValidityDays: number | null | undefined
): string => {
  const trimmed = offerExpiryDate?.trim();
  if (trimmed) return trimmed;
  const days =
    defaultQuoteValidityDays != null && Number.isFinite(defaultQuoteValidityDays)
      ? Math.max(0, Math.floor(defaultQuoteValidityDays))
      : DEFAULT_QUOTE_VALIDITY_DAYS;
  return quoteExpiryDateFromValidityDays(sendDate, days);
};

export const defaultOfferExpiryDateForSend = (
  sendDate: string = todayIsoDateUtc(),
  defaultQuoteValidityDays: number | null | undefined = null
): string => resolveOfferExpiryDateForSend(sendDate, null, defaultQuoteValidityDays);

/** Net payment term days when an invoice is sent for the first time. */
export const resolvePaymentTermDaysForFinalize = (
  paymentTermDays: number | null | undefined,
  sourceQuotePaymentTermDays: number | null | undefined,
  configurationDefault: number | null | undefined
): number =>
  resolveInvoicingPaymentTermDays(
    paymentTermDays ?? sourceQuotePaymentTermDays,
    configurationDefault
  );

/** Due date and net payment term when an invoice is sent (mirrors offer validity on send). */
export const resolveInvoiceDueDateForSend = (
  sendDate: string,
  dueDate: string | null | undefined,
  paymentTermDays: number | null | undefined,
  sourceQuotePaymentTermDays: number | null | undefined,
  configurationDefault: number | null | undefined
): { dueDate: string; paymentTermDays: number } => {
  const trimmedDue = dueDate?.trim();
  if (trimmedDue) {
    return {
      dueDate: trimmedDue,
      paymentTermDays: quoteValidityDaysFromDates(sendDate, trimmedDue)
    };
  }
  const resolvedDays = resolvePaymentTermDaysForFinalize(
    paymentTermDays,
    sourceQuotePaymentTermDays,
    configurationDefault
  );
  return {
    dueDate: addDaysToIsoDate(sendDate, resolvedDays),
    paymentTermDays: resolvedDays
  };
};

export const defaultInvoiceDueDateForSend = (
  sendDate: string = todayIsoDateUtc(),
  sourceQuotePaymentTermDays: number | null | undefined = null,
  configurationDefault: number | null | undefined = null
): string =>
  resolveInvoiceDueDateForSend(sendDate, null, null, sourceQuotePaymentTermDays, configurationDefault).dueDate;

export type InvoicingReminderScheduleConfiguration = {
  paymentReminderFirstOffsetDays: number;
  paymentReminderSecondOffsetDays: number;
};

export const DEFAULT_INVOICING_REMINDER_FIRST_OFFSET_DAYS = 0;
export const DEFAULT_INVOICING_REMINDER_SECOND_OFFSET_DAYS = 7;

export const resolveInvoicingReminderOffsets = (
  configuration: Partial<InvoicingReminderScheduleConfiguration> | null | undefined
): InvoicingReminderScheduleConfiguration => ({
  paymentReminderFirstOffsetDays:
    configuration?.paymentReminderFirstOffsetDays != null &&
    Number.isFinite(configuration.paymentReminderFirstOffsetDays)
      ? Math.floor(configuration.paymentReminderFirstOffsetDays)
      : DEFAULT_INVOICING_REMINDER_FIRST_OFFSET_DAYS,
  paymentReminderSecondOffsetDays:
    configuration?.paymentReminderSecondOffsetDays != null &&
    Number.isFinite(configuration.paymentReminderSecondOffsetDays)
      ? Math.max(0, Math.floor(configuration.paymentReminderSecondOffsetDays))
      : DEFAULT_INVOICING_REMINDER_SECOND_OFFSET_DAYS
});

/** Calendar date when a reminder kind should fire (relative to due date). */
export const invoicingPaymentReminderTriggerDate = (
  dueDate: string,
  kind: InvoicingPaymentReminderKind,
  offsets: InvoicingReminderScheduleConfiguration
): string => {
  if (kind === "first") {
    return addDaysToIsoDate(dueDate, offsets.paymentReminderFirstOffsetDays);
  }
  return addDaysToIsoDate(dueDate, offsets.paymentReminderSecondOffsetDays);
};

export const invoicePaymentTermDaysResolved = (
  documentDays: number | null | undefined,
  configurationDefault: number | null | undefined
): number => resolveInvoicingPaymentTermDays(documentDays, configurationDefault);
