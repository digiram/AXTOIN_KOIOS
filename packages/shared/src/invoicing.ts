/**
 * Invoicing and quoting module contracts.
 *
 * Central Zod schemas for quotes, offers, invoices, line items, disputes,
 * customer offer responses, tenant configuration, and document lifecycle enums.
 *
 * Responsibilities:
 * - Validate CRUD bodies and list queries for all invoicing document kinds
 * - Export status enums, payment term helpers, and money/date utilities
 *
 * Related:
 * - `docs/invoicing-quoting-module.md`
 * - `invoicing-totals.ts`, `invoicing-lifecycle.ts`, `invoicing-email-moments.ts`
 *
 * Security:
 * - Tenant-scoped; public offer response routes use separate token auth on API.
 */
import { z } from "zod";

import { invoicingEmailMomentsPatchSchema } from "./invoicing-email-moments.js";
import { addDaysUtc } from "./subscription-billing.js";

/** Default quote validity from document date when expiry is omitted. */
export const DEFAULT_QUOTE_VALIDITY_DAYS = 30;

/** Default payment term (net days) when not set on a document or in tenant configuration. */
export const DEFAULT_PAYMENT_TERM_DAYS = 30;

export const resolveInvoicingPaymentTermDays = (
  documentDays: number | null | undefined,
  configurationDefault: number | null | undefined
): number => {
  if (documentDays != null && Number.isFinite(documentDays) && documentDays >= 0) {
    return Math.floor(documentDays);
  }
  if (configurationDefault != null && Number.isFinite(configurationDefault) && configurationDefault >= 0) {
    return Math.floor(configurationDefault);
  }
  return DEFAULT_PAYMENT_TERM_DAYS;
};

export const formatInvoicingPaymentTermDays = (days: number): string => {
  const n = Math.max(0, Math.floor(days));
  return n === 1 ? "1 day" : `${n} days`;
};

export const defaultQuoteExpiryDate = (documentDate: string): string => {
  const d = new Date(`${documentDate}T12:00:00.000Z`);
  return addDaysUtc(d, DEFAULT_QUOTE_VALIDITY_DAYS).toISOString().slice(0, 10);
};

/** Whole days from document date through quote expiry (0 when expiry is on or before document date). */
export const quoteValidityDaysFromDates = (documentDate: string, expiryDate: string): number => {
  const start = new Date(`${documentDate}T12:00:00.000Z`);
  const end = new Date(`${expiryDate}T12:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return DEFAULT_QUOTE_VALIDITY_DAYS;
  const diffDays = Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  return Math.max(0, diffDays);
};

export const quoteExpiryDateFromValidityDays = (documentDate: string, validityDays: number): string => {
  const days = Number.isFinite(validityDays) ? Math.max(0, Math.floor(validityDays)) : DEFAULT_QUOTE_VALIDITY_DAYS;
  const d = new Date(`${documentDate}T12:00:00.000Z`);
  return addDaysUtc(d, days).toISOString().slice(0, 10);
};

export const resolveQuoteExpiryDate = (
  documentDate: string,
  quoteExpiryDate: string | null | undefined
): string => {
  const trimmed = quoteExpiryDate?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : defaultQuoteExpiryDate(documentDate);
};

/** Configurable tax rate option for line items. */
export const invoicingTaxRateOptionSchema = z.object({
  label: z.string().trim().min(1).max(64),
  rateBps: z.number().int().min(0).max(100_000)
});

export type InvoicingTaxRateOption = z.infer<typeof invoicingTaxRateOptionSchema>;

export const invoicingTaxRateOptionsSchema = z.array(invoicingTaxRateOptionSchema).min(1).max(32);

export const DEFAULT_INVOICING_TAX_RATE_OPTIONS: InvoicingTaxRateOption[] = [
  { label: "21%", rateBps: 2100 },
  { label: "9%", rateBps: 900 },
  { label: "0%", rateBps: 0 }
];

export const INVOICING_DOCUMENT_KINDS = ["quote", "offer", "invoice"] as const;
export type InvoicingDocumentKind = (typeof INVOICING_DOCUMENT_KINDS)[number];
export const invoicingDocumentKindSchema = z.enum(INVOICING_DOCUMENT_KINDS);

export const INVOICING_DOCUMENT_THEME_COLORS = [
  "purple",
  "red",
  "green",
  "blue",
  "gray",
  "black_yellow"
] as const;
export type InvoicingDocumentThemeColor = (typeof INVOICING_DOCUMENT_THEME_COLORS)[number];
export const invoicingDocumentThemeColorSchema = z.enum(INVOICING_DOCUMENT_THEME_COLORS);

export const invoicingDocumentThemeColorLabel = (color: InvoicingDocumentThemeColor): string => {
  switch (color) {
    case "purple":
      return "Purple";
    case "red":
      return "Red";
    case "green":
      return "Green";
    case "blue":
      return "Blue";
    case "gray":
      return "Gray";
    case "black_yellow":
      return "Black & yellow";
    default:
      return color;
  }
};

export const INVOICING_QUOTE_STATUSES = [
  "quote_draft",
  "quote_converted_to_offer",
  "quote_converted_to_invoice",
  "quote_archived"
] as const;
export type InvoicingQuoteStatus = (typeof INVOICING_QUOTE_STATUSES)[number];
export const invoicingQuoteStatusSchema = z.enum(INVOICING_QUOTE_STATUSES);

export const INVOICING_OFFER_STATUSES = [
  "offer_draft",
  "offer_sent",
  "offer_accepted",
  "offer_rejected",
  "offer_converted_to_invoice",
  "offer_demoted",
  "offer_archived",
  "offer_expired"
] as const;
export type InvoicingOfferStatus = (typeof INVOICING_OFFER_STATUSES)[number];
export const invoicingOfferStatusSchema = z.enum(INVOICING_OFFER_STATUSES);

export const INVOICING_INVOICE_STATUSES = [
  "invoice_draft",
  "invoice_sent",
  "invoice_overdue",
  "invoice_paid",
  "invoice_accredited",
  "invoice_partially_paid",
  "invoice_archived",
  "invoice_disputed",
  "invoice_dispute_acknowledged",
  "invoice_demoted",
  /** @deprecated Use `invoice_sent`. Kept for unmigrated rows and audit history. */
  "invoice_finalized"
] as const;
export type InvoicingInvoiceStatus = (typeof INVOICING_INVOICE_STATUSES)[number];
export const invoicingInvoiceStatusSchema = z.enum(INVOICING_INVOICE_STATUSES);

export const INVOICING_CATALOG_ITEM_KINDS = ["service", "product"] as const;
export const invoicingCatalogItemKindSchema = z.enum(INVOICING_CATALOG_ITEM_KINDS);

export const INVOICING_LINE_KINDS = ["manual", "catalog", "payment"] as const;
export const invoicingLineKindSchema = z.enum(INVOICING_LINE_KINDS);

const isoDateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

const currencyCode = z
  .string()
  .trim()
  .length(3)
  .transform((s) => s.toUpperCase());

const amountMinor = z.number().int().min(0);
const quantity = z.number().positive().max(999_999_999);
const taxRateBps = z.number().int().min(0).max(100_000).optional().nullable();

export const invoicingCustomerSnapshotSchema = z
  .object({
    organizationId: z.string().uuid(),
    organizationName: z.string().trim().min(1).max(512),
    contactId: z.string().uuid().optional().nullable(),
    contactName: z.string().trim().max(512).optional().nullable(),
    email: z.string().trim().max(320).optional().nullable(),
    phone: z.string().trim().max(64).optional().nullable(),
    addressLine1: z.string().trim().max(512).optional().nullable(),
    addressLine2: z.string().trim().max(512).optional().nullable(),
    postalCode: z.string().trim().max(32).optional().nullable(),
    city: z.string().trim().max(128).optional().nullable(),
    state: z.string().trim().max(128).optional().nullable(),
    country: z.string().trim().max(128).optional().nullable()
  })
  .strict();

export type InvoicingCustomerSnapshot = z.infer<typeof invoicingCustomerSnapshotSchema>;

export const formatInvoicingCustomerBillingAddress = (
  snapshot: Partial<
    Pick<
      InvoicingCustomerSnapshot,
      "addressLine1" | "addressLine2" | "postalCode" | "city" | "state" | "country"
    >
  >
): string | null => {
  const lines = [
    snapshot.addressLine1?.trim(),
    snapshot.addressLine2?.trim(),
    [snapshot.postalCode?.trim(), snapshot.city?.trim()].filter(Boolean).join(" ").trim() || undefined,
    snapshot.state?.trim(),
    snapshot.country?.trim()
  ].filter((line): line is string => Boolean(line && line.length > 0));
  return lines.length > 0 ? lines.join("\n") : null;
};

export const formatInvoicingMoneyMinor = (
  minor: number,
  currencyCode: string,
  locale = "en-US"
): string => {
  const major = minor / 100;
  const currency = currencyCode.trim();
  if (!currency) return major.toFixed(2);
  try {
    const parts = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol"
    }).formatToParts(major);
    const symbol = parts.find((part) => part.type === "currency")?.value.trim() || currency;
    const negative = parts.some((part) => part.type === "minusSign");
    const numeric = parts
      .filter((part) => part.type !== "currency" && part.type !== "minusSign" && part.type !== "plusSign")
      .map((part) => part.value)
      .join("")
      .trim();
    const amount = `${symbol} ${numeric}`;
    return negative ? `-${amount}` : amount;
  } catch {
    return `${currency} ${major.toFixed(2)}`;
  }
};

export const formatInvoicingIsoDate = (isoYmd: string): string => {
  const trimmed = isoYmd.trim();
  if (!trimmed) return "—";
  const d = new Date(`${trimmed}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return trimmed;
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(d);
};

export const escapeInvoicingEmailHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Issuer (your company) details snapshotted onto commercial documents. */
export const invoicingIssuerSnapshotSchema = z
  .object({
    companyName: z.string().trim().max(512).optional(),
    companyEmail: z.string().trim().max(320).optional(),
    companyPhone: z.string().trim().max(64).optional(),
    companyAddress: z.string().trim().max(2000).optional(),
    vatIdentificationNumber: z.string().trim().max(64).optional(),
    chamberOfCommerceNumber: z.string().trim().max(64).optional(),
    bankAccountNumber: z.string().trim().max(64).optional()
  })
  .strict();

export type InvoicingIssuerSnapshot = z.infer<typeof invoicingIssuerSnapshotSchema>;

export const invoicingTaxBreakdownEntrySchema = z.object({
  taxRateBps: z.number().int().min(0),
  taxMinor: amountMinor
});

export type InvoicingTaxBreakdownEntry = z.infer<typeof invoicingTaxBreakdownEntrySchema>;

export const invoicingLineItemInputSchema = z.object({
  id: z.string().uuid().optional(),
  sortOrder: z.number().int().min(0).optional(),
  catalogItemId: z.string().uuid().optional().nullable(),
  lineKind: invoicingLineKindSchema.optional(),
  description: z.string().trim().min(1).max(4000),
  sku: z.string().trim().max(64).optional().nullable(),
  quantity,
  unitLabel: z.string().trim().min(1).max(32).default("unit"),
  unitPriceMinor: amountMinor,
  discountMinor: amountMinor.optional().default(0),
  taxRateBps
});

export type InvoicingLineItemInput = z.infer<typeof invoicingLineItemInputSchema>;

export type InvoicingLineTotalsInput = Pick<
  InvoicingLineItemInput,
  "quantity" | "unitPriceMinor" | "discountMinor" | "taxRateBps"
>;

export const invoicingQuoteCreateSchema = z
  .object({
    crmOrganizationId: z.string().uuid().optional().nullable(),
    crmContactId: z.string().uuid().optional().nullable(),
    currencyCode,
    documentDate: isoDateString,
    quoteExpiryDate: isoDateString.optional().nullable(),
    paymentTermDays: z.number().int().min(0).max(3650).optional().nullable(),
    notes: z.string().max(8000).optional().default(""),
    internalNotes: z.string().max(8000).optional().default(""),
    footerText: z.string().max(16000).optional().default(""),
    lineItems: z.array(invoicingLineItemInputSchema).min(1).max(200)
  })
  .strict();

export type InvoicingQuoteCreateInput = z.infer<typeof invoicingQuoteCreateSchema>;

export const invoicingQuotePatchSchema = invoicingQuoteCreateSchema
  .partial()
  .extend({
    lineItems: z.array(invoicingLineItemInputSchema).min(1).max(200).optional()
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: "Provide at least one field to update" });

export type InvoicingQuotePatchInput = z.infer<typeof invoicingQuotePatchSchema>;

export const invoicingQuoteIdParamsSchema = z.object({ quoteId: z.string().uuid() }).strict();

export const invoicingOfferIdParamsSchema = z.object({ offerId: z.string().uuid() }).strict();

export const invoicingInvoiceIdParamsSchema = z.object({ invoiceId: z.string().uuid() }).strict();

export const invoicingCatalogItemIdParamsSchema = z.object({ itemId: z.string().uuid() }).strict();

export const invoicingDocumentsListQuerySchema = z
  .object({
    kind: invoicingDocumentKindSchema.optional(),
    status: z.string().trim().max(64).optional(),
    q: z.string().trim().max(200).optional(),
    customerQ: z.string().trim().max(200).optional(),
    contactQ: z.string().trim().max(200).optional(),
    documentDateFrom: isoDateString.optional(),
    documentDateTo: isoDateString.optional(),
    expiredOnly: z
      .union([z.literal("true"), z.literal("false"), z.boolean()])
      .optional()
      .transform((v) => v === true || v === "true"),
    totalMinorMin: z.coerce.number().int().min(0).optional(),
    totalMinorMax: z.coerce.number().int().min(0).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional()
  })
  .strict()
  .superRefine((body, ctx) => {
    if (
      body.documentDateFrom &&
      body.documentDateTo &&
      body.documentDateFrom > body.documentDateTo
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "documentDateFrom must be on or before documentDateTo",
        path: ["documentDateTo"]
      });
    }
    if (
      body.totalMinorMin !== undefined &&
      body.totalMinorMax !== undefined &&
      body.totalMinorMin > body.totalMinorMax
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "totalMinorMin must not exceed totalMinorMax",
        path: ["totalMinorMax"]
      });
    }
  });

export type InvoicingDocumentsListQueryInput = z.infer<typeof invoicingDocumentsListQuerySchema>;

export const invoicingCatalogItemCreateSchema = z
  .object({
    itemKind: invoicingCatalogItemKindSchema.optional().default("service"),
    sku: z.string().trim().max(64).optional().nullable(),
    name: z.string().trim().min(1).max(512),
    description: z.string().max(8000).optional().default(""),
    unitLabel: z.string().trim().min(1).max(32).default("unit"),
    unitPriceMinor: amountMinor,
    currencyCode,
    taxRateBps,
    isActive: z.boolean().optional().default(true)
  })
  .strict();

export type InvoicingCatalogItemCreateInput = z.infer<typeof invoicingCatalogItemCreateSchema>;

export const invoicingCatalogItemPatchSchema = invoicingCatalogItemCreateSchema.partial().strict().refine(
  (b) => Object.keys(b).length > 0,
  { message: "Provide at least one field to update" }
);

export type InvoicingCatalogItemPatchInput = z.infer<typeof invoicingCatalogItemPatchSchema>;

export const invoicingCatalogListQuerySchema = z
  .object({
    q: z.string().trim().max(200).optional(),
    activeOnly: z
      .union([z.literal("true"), z.literal("false"), z.boolean()])
      .optional()
      .transform((v) => v === true || v === "true"),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).optional()
  })
  .strict();

export type InvoicingCatalogListQueryInput = z.infer<typeof invoicingCatalogListQuerySchema>;

export const invoicingConfigurationPutSchema = z
  .object({
    quoteNumberPrefix: z.string().trim().min(1).max(16).optional(),
    offerNumberPrefix: z.string().trim().min(1).max(16).optional(),
    invoiceNumberPrefix: z.string().trim().min(1).max(16).optional(),
    numberPadding: z.number().int().min(2).max(8).optional(),
    yearlyReset: z.boolean().optional(),
    allowDirectQuoteToInvoice: z.boolean().optional(),
    requireQuoteExpiryDate: z.boolean().optional(),
    allowCustomerFacingQuotes: z.boolean().optional(),
    defaultQuoteValidityDays: z.number().int().min(1).max(3650).optional().nullable(),
    defaultPaymentTermDays: z.number().int().min(0).max(3650).optional().nullable(),
    paymentReminderFirstOffsetDays: z.number().int().min(-365).max(365).optional(),
    paymentReminderSecondOffsetDays: z.number().int().min(0).max(365).optional(),
    paymentRemindersEnabled: z.boolean().optional(),
    emailMoments: invoicingEmailMomentsPatchSchema.optional(),
    autoExpireOffersEnabled: z.boolean().optional(),
    quoteExpiryWarningsEnabled: z.boolean().optional(),
    allowManualLineItems: z.boolean().optional(),
    allowDiscounts: z.boolean().optional(),
    issuerSnapshot: invoicingIssuerSnapshotSchema.partial().optional(),
    defaultQuoteTermsText: z.string().max(16000).optional(),
    defaultOfferTermsText: z.string().max(16000).optional(),
    defaultInvoiceTermsText: z.string().max(16000).optional(),
    defaultFooterText: z.string().max(16000).optional(),
    taxRateOptions: invoicingTaxRateOptionsSchema.optional(),
    documentThemeColor: invoicingDocumentThemeColorSchema.optional()
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: "Provide at least one field to update" });

export type InvoicingConfigurationPutInput = z.infer<typeof invoicingConfigurationPutSchema>;

export const invoicingPromoteToOfferBodySchema = z
  .object({
    documentDate: isoDateString.optional()
  })
  .strict();

export const invoicingSendOfferBodySchema = z
  .object({
    offerExpiryDate: isoDateString.optional().nullable(),
    to: z.string().trim().email().max(320).optional(),
    subject: z.string().trim().min(1).max(255).optional()
  })
  .strict();

export const invoicingSendDocumentEmailBodySchema = z
  .object({
    to: z.string().trim().email().max(320),
    subject: z.string().trim().min(1).max(255).optional()
  })
  .strict();

export type InvoicingSendDocumentEmailBodyInput = z.infer<typeof invoicingSendDocumentEmailBodySchema>;

export const invoicingSendInvoiceBodySchema = z
  .object({
    dueDate: isoDateString.optional().nullable(),
    paymentTermDays: z.number().int().min(0).max(3650).optional().nullable(),
    to: z.string().trim().email().max(320).optional(),
    subject: z.string().trim().min(1).max(255).optional()
  })
  .strict();

export const invoicingPromoteToInvoiceBodySchema = z
  .object({
    documentDate: isoDateString.optional(),
    invoiceDate: isoDateString.optional().nullable(),
    serviceDeliveryDate: isoDateString.optional().nullable()
  })
  .strict();

export const invoicingDemoteToQuoteBodySchema = z
  .object({
    reason: z.string().trim().min(1, "Reason is required").max(2000),
    quoteExpiryDate: isoDateString.optional().nullable(),
    documentDate: isoDateString.optional()
  })
  .strict();

export const invoicingAcceptOfferBodySchema = z
  .object({
    acceptanceProof: z
      .string()
      .trim()
      .min(1, "Customer acceptance proof is required")
      .max(2000)
  })
  .strict();

export const invoicingRejectOfferBodySchema = z
  .object({
    reason: z.string().trim().min(1, "Rejection reason is required").max(2000)
  })
  .strict();

export const invoicingPublicOfferResponseTokenParamsSchema = z
  .object({
    token: z.string().trim().min(32).max(128)
  })
  .strict();

export const invoicingPublicOfferDecisionBodySchema = z
  .object({
    decision: z.enum(["accept", "reject"]),
    responderName: z.string().trim().min(1, "Your name is required").max(200),
    comment: z.string().trim().min(1, "A comment is required").max(2000)
  })
  .strict();

export type InvoicingPublicOfferDecisionBodyInput = z.infer<typeof invoicingPublicOfferDecisionBodySchema>;

export const invoicingDisputeInvoiceBodySchema = z
  .object({
    disputedInformation: z
      .string()
      .trim()
      .min(1, "Customer note is required")
      .max(2000)
  })
  .strict();

export const invoicingAcknowledgeInvoiceDisputeBodySchema = z
  .object({
    companyResponse: z
      .string()
      .trim()
      .min(1, "Explain why you agree with the dispute")
      .max(2000),
    outstandingPaymentPlan: z
      .string()
      .trim()
      .min(1, "Describe what will happen with the outstanding payment")
      .max(2000)
  })
  .strict();

export type InvoicingAcknowledgeInvoiceDisputeBodyInput = z.infer<
  typeof invoicingAcknowledgeInvoiceDisputeBodySchema
>;

export const invoicingDenyInvoiceDisputeBodySchema = z
  .object({
    denialReason: z
      .string()
      .trim()
      .min(1, "Comment is required")
      .max(2000)
  })
  .strict();

export type InvoicingDenyInvoiceDisputeBodyInput = z.infer<typeof invoicingDenyInvoiceDisputeBodySchema>;

export const invoicingDisputeAcknowledgmentDiscountBodySchema = z
  .object({
    adjustmentDate: isoDateString,
    amountMinor: amountMinor.refine((n) => n > 0, { message: "Discount amount must be greater than zero" }),
    description: z.string().trim().min(1, "Description is required").max(500)
  })
  .strict();

export type InvoicingDisputeAcknowledgmentDiscountBodyInput = z.infer<
  typeof invoicingDisputeAcknowledgmentDiscountBodySchema
>;

export const invoicingDisputeAcknowledgmentFullCreditBodySchema = z
  .object({
    creditDate: isoDateString,
    note: z.string().max(2000).optional().default("")
  })
  .strict();

export type InvoicingDisputeAcknowledgmentFullCreditBodyInput = z.infer<
  typeof invoicingDisputeAcknowledgmentFullCreditBodySchema
>;

export const invoicingRegisterInvoicePaymentBodySchema = z
  .object({
    amountMinor: amountMinor.refine((n) => n > 0, { message: "Payment amount must be greater than zero" }),
    paymentDate: isoDateString,
    reference: z.string().trim().max(128).optional().nullable(),
    note: z.string().max(2000).optional().default("")
  })
  .strict();

export type InvoicingRegisterInvoicePaymentInput = z.infer<typeof invoicingRegisterInvoicePaymentBodySchema>;

export const invoicingPaymentsListQuerySchema = z
  .object({
    q: z.string().trim().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional()
  })
  .strict();

export type InvoicingPaymentsListQueryInput = z.infer<typeof invoicingPaymentsListQuerySchema>;

/** Random segment length for `{prefix}-{year}-{id}` quote numbers. */
export const INVOICING_QUOTE_RANDOM_ID_LENGTH = 8;

/** Uppercase alphanumeric alphabet for quote random ids (excludes ambiguous I/O if desired — kept full A-Z0-9). */
export const INVOICING_QUOTE_RANDOM_ID_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Formats a permanent quote document number: `{prefix}-{year}-{randomId}`. */
export const formatInvoicingQuoteDocumentNumber = (
  prefix: string,
  year: number,
  randomId: string
): string => {
  const normalizedPrefix = prefix.trim();
  const normalizedId = randomId.trim().toUpperCase();
  return `${normalizedPrefix}-${year}-${normalizedId}`;
};

/** First revision in a quote/offer series (displayed as `.0`). */
export const INITIAL_INVOICING_DOCUMENT_REVISION = "0";

/** Next dotted revision when demoting or re-promoting (e.g. "0" → "1", "1" → "2", "1.2" → "1.3"). */
export const nextInvoicingOfferRevision = (previous: string | null | undefined): string => {
  const trimmed = previous?.trim() || INITIAL_INVOICING_DOCUMENT_REVISION;
  const parts = trimmed.split(".").map((segment) => {
    const n = Number.parseInt(segment, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  });
  if (parts.length === 0) return "1";
  parts[parts.length - 1]! += 1;
  return parts.join(".");
};

export const formatInvoicingOfferDisplayNumber = (
  documentNumber: string,
  revision: string | null | undefined
): string => {
  const rev = revision?.trim();
  return rev ? `${documentNumber}.${rev}` : documentNumber;
};

/** Invoice display number — same dotted revision suffix as offers. */
export const formatInvoicingInvoiceDisplayNumber = formatInvoicingOfferDisplayNumber;

export const invoicingDocumentKindLabel = (kind: InvoicingDocumentKind): string => {
  switch (kind) {
    case "quote":
      return "Quote";
    case "offer":
      return "Offer";
    case "invoice":
      return "Invoice";
    default:
      return kind;
  }
};

/** URL path segment under `/admin/invoicing/` for a document detail screen. */
export const invoicingDocumentPathSegment = (
  kind: InvoicingDocumentKind,
  documentId: string
): string => {
  switch (kind) {
    case "quote":
      return `quotes/${documentId}`;
    case "offer":
      return `offers/${documentId}`;
    case "invoice":
      return `invoices/${documentId}`;
    default:
      return `${kind}/${documentId}`;
  }
};

export const INVOICING_AUDIT_EVENT_KINDS = [
  "quote_created",
  "quote_updated",
  "quote_archived",
  "quote_deleted",
  "quote_created_from_offer",
  "quote_created_from_invoice",
  "quote_promoted_to_offer",
  "quote_promoted_to_invoice",
  "offer_created",
  "offer_accepted",
  "offer_rejected",
  "offer_demoted_to_quote",
  "offer_promoted_to_invoice",
  "invoice_created",
  "invoice_demoted_to_quote",
  "invoice_sent",
  "invoice_finalized",
  "invoice_accredited",
  "invoice_disputed",
  "invoice_dispute_email_sent",
  "invoice_dispute_acknowledged",
  "invoice_dispute_acknowledgment_email_sent",
  "invoice_dispute_discount_revision_created",
  "invoice_dispute_add_lines_revision_created",
  "invoice_dispute_full_credit_applied",
  "invoice_dispute_full_credit_email_sent",
  "invoice_dispute_denied",
  "invoice_dispute_denial_email_sent",
  "invoice_payment_received_email_sent",
  "invoice_archived",
  "invoice_payment_registered",
  "invoice_payment_revision_created",
  "offer_expired",
  "offer_sent",
  "quote_expiry_detected",
  "quote_email_sent",
  "offer_email_sent",
  "offer_decision_email_sent",
  "invoice_email_sent",
  "invoice_marked_overdue",
  "invoice_payment_reminder_sent"
] as const;

export type InvoicingAuditEventKind = (typeof INVOICING_AUDIT_EVENT_KINDS)[number];

/** Business-process sequence for tie-breaking audit events that share the same timestamp. */
export const invoicingAuditEventKindSequence = (eventKind: string): number => {
  const idx = INVOICING_AUDIT_EVENT_KINDS.indexOf(eventKind as InvoicingAuditEventKind);
  return idx === -1 ? -1 : idx;
};

/** Newest-first ordering for audit trail display (timestamp, then business-process sequence). */
export const compareInvoicingAuditEventsByRecency = (
  a: { createdAt: Date | string; eventKind: string },
  b: { createdAt: Date | string; eventKind: string }
): number => {
  const timeDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  if (timeDiff !== 0) return timeDiff;
  return (
    invoicingAuditEventKindSequence(b.eventKind) - invoicingAuditEventKindSequence(a.eventKind)
  );
};

export const invoicingAuditEventKindLabel = (eventKind: string): string => {
  switch (eventKind as InvoicingAuditEventKind) {
    case "quote_created":
      return "Quote created";
    case "quote_updated":
      return "Quote updated";
    case "quote_archived":
      return "Quote archived";
    case "quote_deleted":
      return "Quote deleted";
    case "quote_created_from_offer":
      return "Quote created from offer demotion";
    case "quote_created_from_invoice":
      return "Quote created from invoice demotion";
    case "quote_promoted_to_offer":
      return "Quote promoted to offer";
    case "quote_promoted_to_invoice":
      return "Quote promoted to invoice";
    case "offer_created":
      return "Offer created";
    case "offer_accepted":
      return "Offer accepted";
    case "offer_rejected":
      return "Offer rejected";
    case "offer_demoted_to_quote":
      return "Offer demoted to quote";
    case "offer_promoted_to_invoice":
      return "Offer promoted to invoice";
    case "invoice_created":
      return "Invoice created";
    case "invoice_demoted_to_quote":
      return "Invoice demoted to quote";
    case "invoice_sent":
    case "invoice_finalized":
      return "Invoice sent";
    case "invoice_accredited":
      return "Invoice accredited";
    case "invoice_disputed":
      return "Invoice disputed";
    case "invoice_dispute_email_sent":
      return "Invoice dispute notification emailed to customer";
    case "invoice_dispute_acknowledged":
      return "Invoice dispute acknowledged";
    case "invoice_dispute_acknowledgment_email_sent":
      return "Dispute acknowledgment emailed to customer";
    case "invoice_dispute_discount_revision_created":
      return "Revised invoice after dispute discount";
    case "invoice_dispute_add_lines_revision_created":
      return "Revised invoice after dispute line additions";
    case "invoice_dispute_full_credit_applied":
      return "Invoice fully credited after dispute";
    case "invoice_dispute_full_credit_email_sent":
      return "Dispute full credit confirmation emailed to customer";
    case "invoice_dispute_denied":
      return "Invoice dispute denied";
    case "invoice_dispute_denial_email_sent":
      return "Dispute denial explanation emailed to customer";
    case "invoice_payment_received_email_sent":
      return "Full payment confirmation emailed to customer";
    case "invoice_archived":
      return "Invoice archived";
    case "invoice_payment_registered":
      return "Payment registered";
    case "invoice_payment_revision_created":
      return "Revised invoice after partial payment";
    case "offer_expired":
      return "Offer expired";
    case "offer_sent":
      return "Offer sent";
    case "quote_expiry_detected":
      return "Quote validity elapsed";
    case "quote_email_sent":
      return "Quote emailed to customer";
    case "offer_email_sent":
      return "Offer emailed to customer";
    case "offer_decision_email_sent":
      return "Offer decision confirmation emailed to customer";
    case "invoice_email_sent":
      return "Invoice emailed to customer";
    case "invoice_marked_overdue":
      return "Invoice marked overdue";
    case "invoice_payment_reminder_sent":
      return "Payment reminder sent";
    default:
      return eventKind.replaceAll("_", " ");
  }
};

const parseInvoicingRevisionSegments = (revision: string | null | undefined): number[] => {
  const trimmed = revision?.trim() || INITIAL_INVOICING_DOCUMENT_REVISION;
  return trimmed.split(".").map((segment) => {
    const n = Number.parseInt(segment, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  });
};

/** Sort order for dotted offer revisions (`.0`, `.1`, `.1.2`, …). */
export const compareInvoicingRevisions = (
  a: string | null | undefined,
  b: string | null | undefined
): number => {
  const pa = parseInvoicingRevisionSegments(a);
  const pb = parseInvoicingRevisionSegments(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
};

export type InvoicingDefaultTermsConfiguration = {
  defaultQuoteTermsText: string;
  defaultOfferTermsText: string;
  defaultInvoiceTermsText: string;
};

/** Default payment terms & conditions text for new documents of the given kind. */
export const defaultInvoicingTermsTextForKind = (
  kind: InvoicingDocumentKind,
  configuration: InvoicingDefaultTermsConfiguration
): string => {
  switch (kind) {
    case "quote":
      return configuration.defaultQuoteTermsText;
    case "offer":
      return configuration.defaultOfferTermsText;
    case "invoice":
      return configuration.defaultInvoiceTermsText;
    default:
      return "";
  }
};

export const isEditableQuoteStatus = (status: InvoicingQuoteStatus): boolean => status === "quote_draft";

export const isDeletableQuoteStatus = (status: InvoicingQuoteStatus): boolean => status === "quote_archived";

/** Offer awaits an accept or reject decision (draft or sent, not yet decided). */
export const isOfferPendingDecision = (status: InvoicingOfferStatus): boolean =>
  status === "offer_draft" || status === "offer_sent";

/** Unguessable customer response link length (48 bytes → 64-char base64url secret). */
export const INVOICING_OFFER_RESPONSE_TOKEN_BYTE_LENGTH = 48;

/** Quote may be emailed only before it is promoted to an offer or invoice. */
export const canSendQuoteEmail = (status: InvoicingQuoteStatus): boolean =>
  status !== "quote_converted_to_offer" && status !== "quote_converted_to_invoice";

/** Offer may be re-emailed only after it has been sent to the customer. */
export const canSendOfferEmail = (status: InvoicingOfferStatus): boolean => status === "offer_sent";

/** Invoice may be re-emailed only after it has been sent to the customer (not while disputed or after partial payment). */
export const canSendInvoiceEmail = (status: InvoicingInvoiceStatus): boolean =>
  status === "invoice_sent" ||
  status === "invoice_finalized" ||
  status === "invoice_overdue" ||
  status === "invoice_accredited";

export type InvoicingInvoiceDisputeResolution = "acknowledged" | "denied";

export type InvoicingAuditEventRecencyInput = {
  createdAt: Date | string;
  eventKind: string;
  payload?: Record<string, unknown> | null;
};

/** Events strictly after the most recent `invoice_disputed` entry (newest-first audit list). */
export const sliceInvoiceDisputeCycleEventsAfterDispute = (
  events: readonly InvoicingAuditEventRecencyInput[]
): InvoicingAuditEventRecencyInput[] => {
  const latestDisputeIdx = events.findIndex((event) => event.eventKind === "invoice_disputed");
  if (latestDisputeIdx <= 0) return [];
  return events.slice(0, latestDisputeIdx);
};

/** Resolve the current dispute cycle only — older denied/acknowledged cycles are ignored. */
export const resolveInvoiceDisputeResolutionFromAuditEvents = (
  events: readonly InvoicingAuditEventRecencyInput[]
): InvoicingInvoiceDisputeResolution | null => {
  for (const event of sliceInvoiceDisputeCycleEventsAfterDispute(events)) {
    if (event.eventKind === "invoice_dispute_denied") return "denied";
    // Complete only after the customer email was sent — allows retry if SMTP failed.
    if (event.eventKind === "invoice_dispute_acknowledgment_email_sent") return "acknowledged";
  }
  return null;
};

/** Customer note from the most recent dispute (newest-first audit list). */
export const resolveInvoiceCustomerDisputeNoteFromAuditEvents = (
  events: readonly InvoicingAuditEventRecencyInput[]
): string | null => {
  for (const event of events) {
    if (event.eventKind !== "invoice_disputed") continue;
    const note =
      typeof event.payload === "object" &&
      event.payload != null &&
      "disputedInformation" in event.payload &&
      typeof (event.payload as { disputedInformation?: unknown }).disputedInformation === "string"
        ? (event.payload as { disputedInformation: string }).disputedInformation.trim()
        : "";
    if (note) return note;
  }
  return null;
};

/** Staff sidebar only — hidden once the dispute is resolved or the invoice is no longer disputed. */
export const resolveInvoiceCustomerDisputeNoteForSidebar = (
  status: InvoicingInvoiceStatus,
  events: readonly InvoicingAuditEventRecencyInput[]
): string | null => {
  if (status !== "invoice_disputed") return null;
  if (resolveInvoiceDisputeResolutionFromAuditEvents(events) != null) return null;
  return resolveInvoiceCustomerDisputeNoteFromAuditEvents(events);
};

export const hasInvoiceDisputeAcknowledgmentRecordedInCurrentCycle = (
  events: readonly InvoicingAuditEventRecencyInput[]
): boolean =>
  sliceInvoiceDisputeCycleEventsAfterDispute(events).some(
    (event) => event.eventKind === "invoice_dispute_acknowledged"
  );

/** Disputed invoices may be acknowledged or denied once per active dispute cycle. */
export const canResolveInvoiceDispute = (
  status: InvoicingInvoiceStatus,
  resolution: InvoicingInvoiceDisputeResolution | null | undefined
): boolean => status === "invoice_disputed" && (resolution == null || resolution === undefined);

/** Offer may be promoted to an invoice only after acceptance. */
export const canPromoteOfferToInvoice = (status: InvoicingOfferStatus): boolean => status === "offer_accepted";

/** Offer may be demoted back to a quote only while still a draft (not after send). */
export const canDemoteOfferToQuote = (status: InvoicingOfferStatus): boolean => status === "offer_draft";

/** Invoice may be demoted back to a quote only while still a draft (not after send). */
export const canDemoteInvoiceToQuote = (status: InvoicingInvoiceStatus): boolean => status === "invoice_draft";

/** Sent and overdue invoices may receive registered payments. */
export const canRegisterInvoicePayment = (status: InvoicingInvoiceStatus): boolean =>
  status === "invoice_sent" || status === "invoice_finalized" || status === "invoice_overdue";

/** Draft and outstanding sent or overdue invoices may be marked disputed (not after partial payment). */
export const canDisputeInvoice = (status: InvoicingInvoiceStatus): boolean =>
  status === "invoice_draft" ||
  status === "invoice_sent" ||
  status === "invoice_finalized" ||
  status === "invoice_overdue";

/** Paid or partially paid invoices may be archived for record-keeping. */
export const canArchiveInvoice = (status: InvoicingInvoiceStatus): boolean =>
  status === "invoice_paid" || status === "invoice_partially_paid" || status === "invoice_accredited";

export const formatInvoicingPaymentCreditLineDescription = (input: {
  paymentDate: string;
  reference?: string | null;
}): string => {
  const ref = input.reference?.trim();
  return ref
    ? `Payment received on ${input.paymentDate} (${ref})`
    : `Payment received on ${input.paymentDate}`;
};

export const formatInvoicingDisputeDiscountLineDescription = (input: {
  adjustmentDate: string;
  description: string;
}): string => {
  const detail = input.description.trim();
  return detail
    ? `Dispute discount on ${input.adjustmentDate} — ${detail}`
    : `Dispute discount on ${input.adjustmentDate}`;
};

export const formatInvoicingDisputeFullCreditLineDescription = (input: {
  creditDate: string;
  note?: string | null;
}): string => {
  const note = input.note?.trim();
  return note
    ? `Dispute credit on ${input.creditDate} — ${note}`
    : `Dispute credit on ${input.creditDate}`;
};

export const INVOICING_DISPUTE_ACKNOWLEDGMENT_FOLLOW_UP_EVENT_KINDS = [
  "invoice_dispute_discount_revision_created",
  "invoice_dispute_add_lines_revision_created",
  "invoice_dispute_full_credit_applied"
] as const;

export type InvoicingDisputeAcknowledgmentFollowUpEventKind =
  (typeof INVOICING_DISPUTE_ACKNOWLEDGMENT_FOLLOW_UP_EVENT_KINDS)[number];

export const hasInvoiceDisputeAcknowledgmentFollowUp = (
  events: readonly InvoicingAuditEventRecencyInput[]
): boolean => {
  const acknowledgmentEmailIdx = events.findIndex(
    (event) => event.eventKind === "invoice_dispute_acknowledgment_email_sent"
  );
  if (acknowledgmentEmailIdx <= 0) return false;
  return events
    .slice(0, acknowledgmentEmailIdx)
    .some((event) =>
      (INVOICING_DISPUTE_ACKNOWLEDGMENT_FOLLOW_UP_EVENT_KINDS as readonly string[]).includes(event.eventKind)
    );
};

export const canApplyDisputeAcknowledgmentFollowUp = (
  status: InvoicingInvoiceStatus,
  events: readonly InvoicingAuditEventRecencyInput[]
): boolean =>
  status === "invoice_dispute_acknowledged" && !hasInvoiceDisputeAcknowledgmentFollowUp(events);

export const isInvoicingPaymentLineKind = (lineKind: string): boolean => lineKind === "payment";

/** Concise human-readable label for quote, offer, and invoice workflow statuses. */
export const formatInvoicingStatus = (status: string): string => {
  switch (status) {
    case "quote_draft":
      return "Draft";
    case "quote_archived":
      return "Archived";
    case "quote_converted_to_offer":
      return "Promoted";
    case "quote_converted_to_invoice":
      return "Promoted to invoice";
    case "offer_draft":
      return "Draft";
    case "offer_sent":
      return "Sent";
    case "offer_accepted":
      return "Accepted";
    case "offer_rejected":
      return "Rejected";
    case "offer_converted_to_invoice":
      return "Promoted";
    case "offer_demoted":
      return "Demoted";
    case "offer_archived":
      return "Archived";
    case "offer_expired":
      return "Expired";
    case "invoice_draft":
      return "Draft";
    case "invoice_sent":
    case "invoice_finalized":
      return "Sent";
    case "invoice_overdue":
      return "Overdue";
    case "invoice_paid":
      return "Paid";
    case "invoice_accredited":
      return "Accredited";
    case "invoice_partially_paid":
      return "Partially paid";
    case "invoice_archived":
      return "Archived";
    case "invoice_disputed":
      return "Disputed";
    case "invoice_dispute_acknowledged":
      return "Dispute acknowledged";
    case "invoice_demoted":
      return "Demoted";
    default: {
      const trimmed = status.trim();
      if (!trimmed) return "—";
      const withoutPrefix = trimmed.replace(/^(quote|offer|invoice)_/, "");
      return withoutPrefix
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
    }
  }
};

export const parseInvoicingJson = <T>(raw: unknown, fallback: T): T => {
  if (raw == null) return fallback;
  if (typeof raw === "object") return raw as T;
  const text = String(raw).trim();
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
};

export const stringifyInvoicingJson = (value: unknown): string => JSON.stringify(value ?? {});

export const parseInvoicingIssuerSnapshot = (raw: unknown): InvoicingIssuerSnapshot => {
  const parsed = parseInvoicingJson(raw, {});
  const result = invoicingIssuerSnapshotSchema.safeParse(parsed);
  if (result.success) return result.data;
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const o = parsed as Record<string, unknown>;
    const legacy = invoicingIssuerSnapshotSchema.safeParse({
      companyName: typeof o.companyName === "string" ? o.companyName : undefined,
      companyEmail: typeof o.companyEmail === "string" ? o.companyEmail : undefined,
      companyPhone: typeof o.companyPhone === "string" ? o.companyPhone : undefined,
      companyAddress: typeof o.companyAddress === "string" ? o.companyAddress : undefined,
      vatIdentificationNumber:
        typeof o.vatIdentificationNumber === "string" ? o.vatIdentificationNumber : undefined,
      chamberOfCommerceNumber:
        typeof o.chamberOfCommerceNumber === "string" ? o.chamberOfCommerceNumber : undefined,
      bankAccountNumber: typeof o.bankAccountNumber === "string" ? o.bankAccountNumber : undefined
    });
    if (legacy.success) return legacy.data;
  }
  return {};
};

const ISSUER_SNAPSHOT_FIELDS = [
  "companyName",
  "companyEmail",
  "companyPhone",
  "companyAddress",
  "vatIdentificationNumber",
  "chamberOfCommerceNumber",
  "bankAccountNumber"
] as const satisfies ReadonlyArray<keyof InvoicingIssuerSnapshot>;

/** Prefer stored document values; fill gaps from current tenant configuration for display. */
export const resolveInvoicingIssuerSnapshot = (
  documentSnapshot: InvoicingIssuerSnapshot | null | undefined,
  configurationSnapshot: InvoicingIssuerSnapshot | null | undefined
): InvoicingIssuerSnapshot => {
  const document = documentSnapshot ?? {};
  const configuration = configurationSnapshot ?? {};
  const resolved: InvoicingIssuerSnapshot = {};
  for (const field of ISSUER_SNAPSHOT_FIELDS) {
    const fromDocument = document[field]?.trim();
    if (fromDocument) {
      resolved[field] = fromDocument;
      continue;
    }
    const fromConfiguration = configuration[field]?.trim();
    if (fromConfiguration) resolved[field] = fromConfiguration;
  }
  return resolved;
};

export const invoicingIssuerSnapshotHasDetails = (
  snapshot: InvoicingIssuerSnapshot | null | undefined
): boolean => {
  const s = snapshot ?? {};
  return ISSUER_SNAPSHOT_FIELDS.some((field) => Boolean(s[field]?.trim()));
};

export const parseInvoicingTaxRateOptions = (raw: string | null | undefined): InvoicingTaxRateOption[] => {
  const parsed = parseInvoicingJson(raw, DEFAULT_INVOICING_TAX_RATE_OPTIONS);
  const result = invoicingTaxRateOptionsSchema.safeParse(parsed);
  return result.success ? result.data : DEFAULT_INVOICING_TAX_RATE_OPTIONS;
};

export const invoicingTaxRateOptionLabel = (
  options: InvoicingTaxRateOption[],
  rateBps: number | null | undefined
): string => {
  if (rateBps == null || rateBps === 0) return "N/A";
  const hit = options.find((o) => o.rateBps === rateBps);
  if (hit) return hit.label;
  return `${rateBps / 100}%`;
};

export const defaultInvoicingTaxRateBps = (options: InvoicingTaxRateOption[]): number | null =>
  options[0]?.rateBps ?? null;
