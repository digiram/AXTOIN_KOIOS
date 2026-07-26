/**
 * Tenant invoicing & quoting — quotes, offers, invoices, catalog, numbering.
 */

import { randomBytes, randomUUID } from "node:crypto";
import { and, count, desc, eq, ilike, inArray, isNotNull, lt, or, sql } from "drizzle-orm";

import type {
  InvoicingCatalogItemCreateInput,
  InvoicingCatalogItemPatchInput,
  InvoicingCatalogListQueryInput,
  InvoicingConfigurationPutInput,
  InvoicingTaxRateOption,
  InvoicingCustomerSnapshot,
  InvoicingDocumentKind,
  InvoicingDocumentThemeColor,
  InvoicingDocumentsListQueryInput,
  InvoicingInvoiceStatus,
  InvoicingLineItemInput,
  InvoicingIssuerSnapshot,
  InvoicingOfferStatus,
  InvoicingQuoteCreateInput,
  InvoicingQuotePatchInput,
  InvoicingQuoteStatus,
  InvoicingRegisterInvoicePaymentInput,
  InvoicingDisputeAcknowledgmentDiscountBodyInput,
  InvoicingDisputeAcknowledgmentFullCreditBodyInput,
  InvoicingTaxBreakdownEntry
} from "@starter/shared";
import {
  aggregateInvoicingLinesWithTaxBreakdown,
  defaultInvoicingTermsTextForKind,
  compareInvoicingAuditEventsByRecency,
  compareInvoicingRevisions,
  formatInvoicingOfferDisplayNumber,
  formatInvoicingInvoiceDisplayNumber,
  formatInvoicingQuoteDocumentNumber,
  formatInvoicingPaymentCreditLineDescription,
  formatInvoicingDisputeDiscountLineDescription,
  formatInvoicingDisputeFullCreditLineDescription,
  canApplyDisputeAcknowledgmentFollowUp,
  hasInvoiceDisputeAcknowledgmentFollowUp,
  INVOICING_QUOTE_RANDOM_ID_ALPHABET,
  INVOICING_QUOTE_RANDOM_ID_LENGTH,
  INITIAL_INVOICING_DOCUMENT_REVISION,
  isEditableQuoteStatus,
  isOfferPendingDecision,
  canPromoteOfferToInvoice,
  canDemoteOfferToQuote,
  canDemoteInvoiceToQuote,
  canDisputeInvoice,
  canArchiveInvoice,
  canRegisterInvoicePayment,
  DEFAULT_INVOICING_TAX_RATE_OPTIONS,
  nextInvoicingOfferRevision,
  parseInvoicingTaxRateOptions,
  parseInvoicingJson,
  parseInvoicingIssuerSnapshot,
  parseInvoicingEmailMomentsOverrides,
  resolveInvoicingEmailMomentsEnabled,
  invoicingEmailMomentIsEnabled,
  type InvoicingEmailMomentKey,
  resolveInvoicingIssuerSnapshot,
  resolveInvoicingPaymentTermDays,
  resolveQuoteExpiryDate,
  hasInvoiceDisputeAcknowledgmentRecordedInCurrentCycle,
  resolveInvoiceCustomerDisputeNoteFromAuditEvents,
  resolveInvoiceCustomerDisputeNoteForSidebar,
  resolveInvoiceDisputeResolutionFromAuditEvents,
  stringifyInvoicingJson,
  sumInvoicingDocumentTotalsFromStoredLines,
  isOfferPastValidity,
  isInvoicingOfferCustomerResponseAllowed,
  formatInvoicingPublicOfferDecisionProof,
  isQuoteSoftExpired,
  resolveOfferExpiryDateForSend,
  resolvePaymentTermDaysForFinalize,
  resolveInvoiceDueDateForSend,
  resolveInvoicingReminderOffsets,
  invoicingPaymentReminderTriggerDate,
  todayIsoDateUtc,
  type InvoicingPaymentReminderKind
} from "@starter/shared";

import { getContactById, getOrganizationById } from "./crm-repos.js";
import { escapeLike } from "./crm-repos-query-helpers.js";
import { mysqlDb, pgDb } from "./crm-repos-db.js";
import {
  INVOICING_AUDIT_EVENTS_TABLE_KEY,
  INVOICING_CONFIG_TABLE_KEY,
  INVOICING_INVOICE_TABLE_KEY,
  INVOICING_OFFER_TABLE_KEY,
  INVOICING_QUOTE_TABLE_KEY,
  openInvoicingRow,
  sealInvoicingPatch,
  sealInvoicingRow
} from "./field-encryption/invoicing-boundary.js";
import { getUserDisplayLabelById } from "./repos.js";
import * as mysql from "./mysql-schema.js";
import * as pg from "./pg-schema.js";
import { dialectFromEnv } from "./schema.js";

const isMysql = () => dialectFromEnv() === "mysql";

const isoDateOnly = (d: Date | string | null | undefined): string | null => {
  if (d == null) return null;
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const quantityStr = (n: number) => String(n);

const dateForDb = (iso: string | null | undefined): Date | null => {
  if (iso == null) return null;
  return new Date(`${iso}T00:00:00.000Z`);
};

export type InvoicingConfigurationRow = {
  tenantId: string;
  quoteNumberPrefix: string;
  offerNumberPrefix: string;
  invoiceNumberPrefix: string;
  numberPadding: number;
  yearlyReset: boolean;
  allowDirectQuoteToInvoice: boolean;
  requireQuoteExpiryDate: boolean;
  allowCustomerFacingQuotes: boolean;
  defaultQuoteValidityDays: number | null;
  defaultPaymentTermDays: number | null;
  paymentReminderFirstOffsetDays: number;
  paymentReminderSecondOffsetDays: number;
  paymentRemindersEnabled: boolean;
  emailMomentsEnabled: Partial<Record<InvoicingEmailMomentKey, boolean>>;
  autoExpireOffersEnabled: boolean;
  quoteExpiryWarningsEnabled: boolean;
  allowManualLineItems: boolean;
  allowDiscounts: boolean;
  issuerSnapshot: InvoicingIssuerSnapshot;
  taxRateOptions: InvoicingTaxRateOption[];
  defaultQuoteTermsText: string;
  defaultOfferTermsText: string;
  defaultInvoiceTermsText: string;
  defaultFooterText: string;
  documentThemeColor: InvoicingDocumentThemeColor;
  companyLogoRelPath: string | null;
  updatedAt: Date;
};

export type InvoicingQuoteRow = {
  id: string;
  tenantId: string;
  status: InvoicingQuoteStatus;
  documentNumber: string | null;
  temporaryReference: string | null;
  sourceOfferId: string | null;
  sourceInvoiceId: string | null;
  crmOrganizationId: string | null;
  crmContactId: string | null;
  customerSnapshot: InvoicingCustomerSnapshot;
  issuerSnapshot: InvoicingIssuerSnapshot;
  currencyCode: string;
  documentDate: string;
  quoteExpiryDate: string | null;
  paymentTermDays: number | null;
  subtotalExcludingTaxMinor: number;
  discountTotalMinor: number;
  taxTotalMinor: number;
  totalIncludingTaxMinor: number;
  taxBreakdown: InvoicingTaxBreakdownEntry[];
  notes: string;
  internalNotes: string;
  termsText: string;
  footerText: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type InvoicingLineItemRow = {
  id: string;
  sortOrder: number;
  catalogItemId: string | null;
  lineKind: string;
  description: string;
  sku: string | null;
  quantity: number;
  unitLabel: string;
  unitPriceMinor: number;
  discountMinor: number;
  taxRateBps: number | null;
  lineSubtotalMinor: number;
  lineTaxMinor: number;
  lineTotalMinor: number;
};

export type InvoicingDocumentTotals = {
  subtotalExcludingTaxMinor: number;
  discountTotalMinor: number;
  taxTotalMinor: number;
  totalIncludingTaxMinor: number;
  taxBreakdown: InvoicingTaxBreakdownEntry[];
  notes: string;
  internalNotes: string;
  termsText: string;
  footerText: string;
};

export type InvoicingOfferRow = {
  id: string;
  tenantId: string;
  status: InvoicingOfferStatus;
  documentNumber: string;
  revision: string | null;
  sourceQuoteId: string | null;
  crmOrganizationId: string | null;
  crmContactId: string | null;
  customerSnapshot: InvoicingCustomerSnapshot;
  issuerSnapshot: InvoicingIssuerSnapshot;
  currencyCode: string;
  documentDate: string;
  offerExpiryDate: string | null;
  paymentTermDays: number | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
} & InvoicingDocumentTotals;

export type InvoicingInvoiceRow = {
  id: string;
  tenantId: string;
  status: InvoicingInvoiceStatus;
  documentNumber: string;
  revision: string | null;
  sourceQuoteId: string | null;
  sourceOfferId: string | null;
  sourceInvoiceId: string | null;
  crmOrganizationId: string | null;
  crmContactId: string | null;
  customerSnapshot: InvoicingCustomerSnapshot;
  issuerSnapshot: InvoicingIssuerSnapshot;
  currencyCode: string;
  documentDate: string;
  invoiceDate: string | null;
  serviceDeliveryDate: string | null;
  paymentTermDays: number | null;
  dueDate: string | null;
  partialPaymentAnchorDate: string | null;
  finalizedAt: Date | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
} & InvoicingDocumentTotals;

export type InvoicingDocumentListItem = {
  kind: InvoicingDocumentKind;
  id: string;
  status: string;
  documentNumber: string | null;
  temporaryReference: string | null;
  customerName: string | null;
  contactName: string | null;
  currencyCode: string;
  documentDate: string;
  totalIncludingTaxMinor: number;
  updatedAt: Date;
  quoteExpiryDate?: string | null;
  isQuoteExpired?: boolean;
  dueDate?: string | null;
};

const documentListItemMatchesQuery = (
  item: InvoicingDocumentListItem,
  query: InvoicingDocumentsListQueryInput
): boolean => {
  if (query.status && item.status !== query.status) return false;
  if (query.documentDateFrom && item.documentDate < query.documentDateFrom) return false;
  if (query.documentDateTo && item.documentDate > query.documentDateTo) return false;
  if (query.totalMinorMin !== undefined && item.totalIncludingTaxMinor < query.totalMinorMin) return false;
  if (query.totalMinorMax !== undefined && item.totalIncludingTaxMinor > query.totalMinorMax) return false;

  if (query.q) {
    const q = query.q.toLowerCase();
    const num = (item.documentNumber ?? item.temporaryReference ?? "").toLowerCase();
    const cust = (item.customerName ?? "").toLowerCase();
    const contact = (item.contactName ?? "").toLowerCase();
    if (!num.includes(q) && !cust.includes(q) && !contact.includes(q)) return false;
  }
  if (query.customerQ) {
    const cq = query.customerQ.toLowerCase();
    if (!(item.customerName ?? "").toLowerCase().includes(cq)) return false;
  }
  if (query.contactQ) {
    const ctq = query.contactQ.toLowerCase();
    if (!(item.contactName ?? "").toLowerCase().includes(ctq)) return false;
  }
  if (query.expiredOnly && item.kind === "quote") {
    if (!item.isQuoteExpired) return false;
  }
  return true;
};

const mapDocumentTotals = (row: {
  subtotalExcludingTaxMinor: number;
  discountTotalMinor: number;
  taxTotalMinor: number;
  totalIncludingTaxMinor: number;
  taxBreakdownJson: string;
  notes: string;
  internalNotes: string;
  termsText: string;
  footerText: string;
}): InvoicingDocumentTotals => ({
  subtotalExcludingTaxMinor: row.subtotalExcludingTaxMinor,
  discountTotalMinor: row.discountTotalMinor,
  taxTotalMinor: row.taxTotalMinor,
  totalIncludingTaxMinor: row.totalIncludingTaxMinor,
  taxBreakdown: parseInvoicingJson(row.taxBreakdownJson, []),
  notes: row.notes,
  internalNotes: row.internalNotes,
  termsText: row.termsText,
  footerText: row.footerText
});

type InvoicingAuditEventClock = {
  next: () => Date;
};

/** Ensures sequential audit events in one business action get distinct, monotonic timestamps. */
const createInvoicingAuditEventClock = (start?: Date): InvoicingAuditEventClock => {
  let lastMs = (start ?? new Date()).getTime();
  return {
    next: () => {
      const nowMs = Date.now();
      lastMs = Math.max(lastMs + 1, nowMs);
      return new Date(lastMs);
    }
  };
};

export const insertInvoicingAuditEvent = async (input: {
  tenantId: string;
  eventKind: string;
  documentKind: InvoicingDocumentKind;
  documentId: string;
  actorUserId: string | null;
  payload?: Record<string, unknown>;
  createdAt?: Date;
}): Promise<void> => {
  const id = randomUUID();
  const createdAt = input.createdAt ?? new Date();
  const payloadJson = stringifyInvoicingJson(input.payload ?? {});
  const sealed = await sealInvoicingRow(
    INVOICING_AUDIT_EVENTS_TABLE_KEY,
    input.tenantId,
    { payloadJson },
    id,
    new Set(["payloadJson"])
  );
  const payloadStored = String(sealed.payloadJson ?? payloadJson);
  if (isMysql()) {
    await mysqlDb().insert(mysql.invoicingAuditEvents).values({
      id,
      tenantId: input.tenantId,
      eventKind: input.eventKind,
      documentKind: input.documentKind,
      documentId: input.documentId,
      actorUserId: input.actorUserId,
      payloadJson: payloadStored,
      createdAt
    });
    return;
  }
  await pgDb().insert(pg.invoicingAuditEvents).values({
    id,
    tenantId: input.tenantId,
    eventKind: input.eventKind,
    documentKind: input.documentKind,
    documentId: input.documentId,
    actorUserId: input.actorUserId,
    payloadJson: payloadStored,
    createdAt
  });
};

const mapConfigPlain = (row: {
  tenantId: string;
  quoteNumberPrefix: string;
  offerNumberPrefix: string;
  invoiceNumberPrefix: string;
  numberPadding: number;
  yearlyReset: boolean;
  allowDirectQuoteToInvoice: boolean;
  requireQuoteExpiryDate: boolean;
  allowCustomerFacingQuotes: boolean;
  defaultQuoteValidityDays: number | null;
  defaultPaymentTermDays: number | null;
  paymentReminderFirstOffsetDays: number;
  paymentReminderSecondOffsetDays: number;
  paymentRemindersEnabled: boolean;
  emailMomentsEnabledJson: string;
  autoExpireOffersEnabled: boolean;
  quoteExpiryWarningsEnabled: boolean;
  allowManualLineItems: boolean;
  allowDiscounts: boolean;
  issuerSnapshotJson: string;
  taxRateOptionsJson: string;
  defaultQuoteTermsText: string;
  defaultOfferTermsText: string;
  defaultInvoiceTermsText: string;
  defaultFooterText: string;
  documentThemeColor: string;
  companyLogoRelPath?: string | null;
  updatedAt: Date;
}): InvoicingConfigurationRow => ({
  tenantId: row.tenantId,
  quoteNumberPrefix: row.quoteNumberPrefix,
  offerNumberPrefix: row.offerNumberPrefix,
  invoiceNumberPrefix: row.invoiceNumberPrefix,
  numberPadding: row.numberPadding,
  yearlyReset: row.yearlyReset,
  allowDirectQuoteToInvoice: row.allowDirectQuoteToInvoice,
  requireQuoteExpiryDate: row.requireQuoteExpiryDate,
  allowCustomerFacingQuotes: row.allowCustomerFacingQuotes,
  defaultQuoteValidityDays: row.defaultQuoteValidityDays,
  defaultPaymentTermDays: row.defaultPaymentTermDays,
  paymentReminderFirstOffsetDays: row.paymentReminderFirstOffsetDays,
  paymentReminderSecondOffsetDays: row.paymentReminderSecondOffsetDays,
  paymentRemindersEnabled: row.paymentRemindersEnabled,
  emailMomentsEnabled: parseInvoicingEmailMomentsOverrides(row.emailMomentsEnabledJson),
  autoExpireOffersEnabled: row.autoExpireOffersEnabled,
  quoteExpiryWarningsEnabled: row.quoteExpiryWarningsEnabled,
  allowManualLineItems: row.allowManualLineItems,
  allowDiscounts: row.allowDiscounts,
  issuerSnapshot: parseInvoicingIssuerSnapshot(row.issuerSnapshotJson),
  taxRateOptions: parseInvoicingTaxRateOptions(row.taxRateOptionsJson),
  defaultQuoteTermsText: row.defaultQuoteTermsText,
  defaultOfferTermsText: row.defaultOfferTermsText,
  defaultInvoiceTermsText: row.defaultInvoiceTermsText,
  defaultFooterText: row.defaultFooterText,
  documentThemeColor: row.documentThemeColor as InvoicingDocumentThemeColor,
  companyLogoRelPath: row.companyLogoRelPath ?? null,
  updatedAt: row.updatedAt
});

const mapConfigMysql = (row: typeof mysql.invoicingTenantConfiguration.$inferSelect): InvoicingConfigurationRow =>
  mapConfigPlain({
    ...row,
    issuerSnapshotJson: row.issuerSnapshotJson
  } as Parameters<typeof mapConfigPlain>[0]);

const openConfigRow = async (
  tenantId: string,
  row: typeof pg.invoicingTenantConfiguration.$inferSelect | typeof mysql.invoicingTenantConfiguration.$inferSelect
): Promise<InvoicingConfigurationRow> =>
  openInvoicingRow(INVOICING_CONFIG_TABLE_KEY, tenantId, row as unknown as Record<string, unknown>, (plain) =>
    mapConfigPlain(plain as Parameters<typeof mapConfigPlain>[0])
  );

export const ensureInvoicingTenantConfiguration = async (tenantId: string): Promise<InvoicingConfigurationRow> => {
  const existing = await getInvoicingConfiguration(tenantId);
  if (existing) return existing;
  const now = new Date();
  if (isMysql()) {
    await mysqlDb().insert(mysql.invoicingTenantConfiguration).values({
      tenantId,
      issuerSnapshotJson: "{}",
      taxRateOptionsJson: stringifyInvoicingJson(DEFAULT_INVOICING_TAX_RATE_OPTIONS),
      updatedAt: now
    });
  } else {
    await pgDb().insert(pg.invoicingTenantConfiguration).values({
      tenantId,
      issuerSnapshotJson: "{}",
      taxRateOptionsJson: stringifyInvoicingJson(DEFAULT_INVOICING_TAX_RATE_OPTIONS),
      updatedAt: now
    });
  }
  const created = await getInvoicingConfiguration(tenantId);
  if (!created) throw new Error("ensureInvoicingTenantConfiguration failed");
  return created;
};

export const getInvoicingConfiguration = async (tenantId: string): Promise<InvoicingConfigurationRow | undefined> => {
  if (isMysql()) {
    const rows = await mysqlDb()
      .select()
      .from(mysql.invoicingTenantConfiguration)
      .where(eq(mysql.invoicingTenantConfiguration.tenantId, tenantId))
      .limit(1);
    const row = rows[0];
    return row ? await openConfigRow(tenantId, row) : undefined;
  }
  const rows = await pgDb()
    .select()
    .from(pg.invoicingTenantConfiguration)
    .where(eq(pg.invoicingTenantConfiguration.tenantId, tenantId))
    .limit(1);
  const row = rows[0];
  return row ? await openConfigRow(tenantId, row) : undefined;
};

export const updateInvoicingConfiguration = async (
  tenantId: string,
  input: InvoicingConfigurationPutInput
): Promise<InvoicingConfigurationRow> => {
  await ensureInvoicingTenantConfiguration(tenantId);
  const now = new Date();
  const patch: Record<string, unknown> = { updatedAt: now };
  if (input.quoteNumberPrefix !== undefined) patch.quoteNumberPrefix = input.quoteNumberPrefix;
  if (input.offerNumberPrefix !== undefined) patch.offerNumberPrefix = input.offerNumberPrefix;
  if (input.invoiceNumberPrefix !== undefined) patch.invoiceNumberPrefix = input.invoiceNumberPrefix;
  if (input.numberPadding !== undefined) patch.numberPadding = input.numberPadding;
  if (input.yearlyReset !== undefined) patch.yearlyReset = input.yearlyReset;
  if (input.allowDirectQuoteToInvoice !== undefined) patch.allowDirectQuoteToInvoice = input.allowDirectQuoteToInvoice;
  if (input.requireQuoteExpiryDate !== undefined) patch.requireQuoteExpiryDate = input.requireQuoteExpiryDate;
  if (input.allowCustomerFacingQuotes !== undefined) patch.allowCustomerFacingQuotes = input.allowCustomerFacingQuotes;
  if (input.defaultQuoteValidityDays !== undefined) patch.defaultQuoteValidityDays = input.defaultQuoteValidityDays;
  if (input.defaultPaymentTermDays !== undefined) patch.defaultPaymentTermDays = input.defaultPaymentTermDays;
  if (input.paymentReminderFirstOffsetDays !== undefined) {
    patch.paymentReminderFirstOffsetDays = input.paymentReminderFirstOffsetDays;
  }
  if (input.paymentReminderSecondOffsetDays !== undefined) {
    patch.paymentReminderSecondOffsetDays = input.paymentReminderSecondOffsetDays;
  }
  if (input.paymentRemindersEnabled !== undefined || input.emailMoments !== undefined) {
    const current = await getInvoicingConfiguration(tenantId);
    const resolved = resolveInvoicingEmailMomentsEnabled({
      emailMomentsEnabled: {
        ...current?.emailMomentsEnabled,
        ...(input.emailMoments ?? {})
      },
      paymentRemindersEnabled:
        input.paymentRemindersEnabled !== undefined
          ? input.paymentRemindersEnabled
          : current?.paymentRemindersEnabled
    });
    patch.emailMomentsEnabledJson = stringifyInvoicingJson(
      Object.fromEntries(
        (Object.keys(resolved) as InvoicingEmailMomentKey[]).map((key) => [key, resolved[key]])
      )
    );
    patch.paymentRemindersEnabled = resolved.payment_reminder;
  }
  if (input.autoExpireOffersEnabled !== undefined) patch.autoExpireOffersEnabled = input.autoExpireOffersEnabled;
  if (input.quoteExpiryWarningsEnabled !== undefined) {
    patch.quoteExpiryWarningsEnabled = input.quoteExpiryWarningsEnabled;
  }
  if (input.allowManualLineItems !== undefined) patch.allowManualLineItems = input.allowManualLineItems;
  if (input.allowDiscounts !== undefined) patch.allowDiscounts = input.allowDiscounts;
  if (input.issuerSnapshot !== undefined) {
    const current = await getInvoicingConfiguration(tenantId);
    const merged: InvoicingIssuerSnapshot = {
      ...parseInvoicingIssuerSnapshot(current?.issuerSnapshot),
      ...input.issuerSnapshot
    };
    patch.issuerSnapshotJson = stringifyInvoicingJson(merged);
  }
  if (input.defaultQuoteTermsText !== undefined) patch.defaultQuoteTermsText = input.defaultQuoteTermsText;
  if (input.defaultOfferTermsText !== undefined) patch.defaultOfferTermsText = input.defaultOfferTermsText;
  if (input.defaultInvoiceTermsText !== undefined) patch.defaultInvoiceTermsText = input.defaultInvoiceTermsText;
  if (input.defaultFooterText !== undefined) patch.defaultFooterText = input.defaultFooterText;
  if (input.taxRateOptions !== undefined) {
    patch.taxRateOptionsJson = stringifyInvoicingJson(input.taxRateOptions);
  }
  if (input.documentThemeColor !== undefined) patch.documentThemeColor = input.documentThemeColor;

  const sealedPatch = await sealInvoicingPatch(INVOICING_CONFIG_TABLE_KEY, tenantId, patch, tenantId);

  if (isMysql()) {
    await mysqlDb()
      .update(mysql.invoicingTenantConfiguration)
      .set(sealedPatch as typeof mysql.invoicingTenantConfiguration.$inferInsert)
      .where(eq(mysql.invoicingTenantConfiguration.tenantId, tenantId));
  } else {
    await pgDb()
      .update(pg.invoicingTenantConfiguration)
      .set(sealedPatch as typeof pg.invoicingTenantConfiguration.$inferInsert)
      .where(eq(pg.invoicingTenantConfiguration.tenantId, tenantId));
  }
  const row = await getInvoicingConfiguration(tenantId);
  if (!row) throw new Error("updateInvoicingConfiguration failed");
  return row;
};

export const setInvoicingCompanyLogoRelPath = async (
  tenantId: string,
  relPath: string | null
): Promise<InvoicingConfigurationRow> => {
  await ensureInvoicingTenantConfiguration(tenantId);
  const now = new Date();
  const patch = { companyLogoRelPath: relPath, updatedAt: now };
  if (isMysql()) {
    await mysqlDb()
      .update(mysql.invoicingTenantConfiguration)
      .set(patch)
      .where(eq(mysql.invoicingTenantConfiguration.tenantId, tenantId));
  } else {
    await pgDb()
      .update(pg.invoicingTenantConfiguration)
      .set(patch)
      .where(eq(pg.invoicingTenantConfiguration.tenantId, tenantId));
  }
  const row = await getInvoicingConfiguration(tenantId);
  if (!row) throw new Error("setInvoicingCompanyLogoRelPath failed");
  return row;
};

const prefixForKind = (cfg: InvoicingConfigurationRow, kind: InvoicingDocumentKind): string => {
  switch (kind) {
    case "quote":
      return cfg.quoteNumberPrefix;
    case "offer":
      return cfg.offerNumberPrefix;
    case "invoice":
      return cfg.invoiceNumberPrefix;
    default:
      return "DOC";
  }
};

export const allocateInvoicingDocumentNumber = async (
  tenantId: string,
  kind: InvoicingDocumentKind
): Promise<string> => {
  const cfg = await ensureInvoicingTenantConfiguration(tenantId);
  const year = cfg.yearlyReset ? new Date().getUTCFullYear() : 0;
  const seqYear = cfg.yearlyReset ? year : 0;

  if (isMysql()) {
    const db = mysqlDb();
    await db
      .insert(mysql.invoicingNumberSequences)
      .values({ tenantId, documentKind: kind, sequenceYear: seqYear, nextValue: 1 })
      .onDuplicateKeyUpdate({ set: { nextValue: sql`${mysql.invoicingNumberSequences.nextValue} + 1` } });
    const rows = await db
      .select()
      .from(mysql.invoicingNumberSequences)
      .where(
        and(
          eq(mysql.invoicingNumberSequences.tenantId, tenantId),
          eq(mysql.invoicingNumberSequences.documentKind, kind),
          eq(mysql.invoicingNumberSequences.sequenceYear, seqYear)
        )
      )
      .limit(1);
    const seq = rows[0]?.nextValue ?? 1;
    const assigned = seq;
    const padded = String(assigned).padStart(cfg.numberPadding, "0");
    const prefix = prefixForKind(cfg, kind);
    return cfg.yearlyReset ? `${prefix}-${year}-${padded}` : `${prefix}-${padded}`;
  }

  const db = pgDb();
  const inserted = await db
    .insert(pg.invoicingNumberSequences)
    .values({ tenantId, documentKind: kind, sequenceYear: seqYear, nextValue: 2 })
    .onConflictDoUpdate({
      target: [
        pg.invoicingNumberSequences.tenantId,
        pg.invoicingNumberSequences.documentKind,
        pg.invoicingNumberSequences.sequenceYear
      ],
      set: { nextValue: sql`${pg.invoicingNumberSequences.nextValue} + 1` }
    })
    .returning({ nextValue: pg.invoicingNumberSequences.nextValue });
  const assigned = (inserted[0]?.nextValue ?? 2) - 1;
  const padded = String(assigned).padStart(cfg.numberPadding, "0");
  const prefix = prefixForKind(cfg, kind);
  return cfg.yearlyReset ? `${prefix}-${year}-${padded}` : `${prefix}-${padded}`;
};

const generateInvoicingQuoteRandomId = (
  length: number = INVOICING_QUOTE_RANDOM_ID_LENGTH
): string => {
  const alphabet = INVOICING_QUOTE_RANDOM_ID_ALPHABET;
  const bytes = randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += alphabet[bytes[i]! % alphabet.length]!;
  }
  return result;
};

const invoicingQuoteNumberExists = async (tenantId: string, documentNumber: string): Promise<boolean> => {
  if (isMysql()) {
    const rows = await mysqlDb()
      .select({ id: mysql.invoicingQuotes.id })
      .from(mysql.invoicingQuotes)
      .where(
        and(
          eq(mysql.invoicingQuotes.tenantId, tenantId),
          eq(mysql.invoicingQuotes.documentNumber, documentNumber)
        )
      )
      .limit(1);
    return rows.length > 0;
  }
  const rows = await pgDb()
    .select({ id: pg.invoicingQuotes.id })
    .from(pg.invoicingQuotes)
    .where(and(eq(pg.invoicingQuotes.tenantId, tenantId), eq(pg.invoicingQuotes.documentNumber, documentNumber)))
    .limit(1);
  return rows.length > 0;
};

/** Allocates a permanent quote number: `{quotePrefix}-{creationYear}-{randomAlphanumeric}`. */
export const allocateInvoicingQuoteNumber = async (tenantId: string): Promise<string> => {
  const cfg = await ensureInvoicingTenantConfiguration(tenantId);
  const year = new Date().getUTCFullYear();
  const prefix = cfg.quoteNumberPrefix;
  for (let attempt = 0; attempt < 12; attempt++) {
    const documentNumber = formatInvoicingQuoteDocumentNumber(prefix, year, generateInvoicingQuoteRandomId());
    if (!(await invoicingQuoteNumberExists(tenantId, documentNumber))) {
      return documentNumber;
    }
  }
  throw new Error("quote_number_allocation_failed");
};

export const buildInvoicingCustomerSnapshot = async (
  tenantId: string,
  organizationId: string,
  contactId: string | null | undefined
): Promise<InvoicingCustomerSnapshot | null> => {
  const org = await getOrganizationById(tenantId, organizationId);
  if (!org) return null;
  let contactName: string | null = null;
  let email = org.email;
  let phone = org.phone;
  if (contactId) {
    const contact = await getContactById(tenantId, contactId);
    if (contact) {
      contactName = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() || null;
      email = contact.email ?? email;
      phone = contact.phone ?? phone;
    }
  }
  return {
    organizationId: org.id,
    organizationName: org.name,
    contactId: contactId ?? null,
    contactName,
    email,
    phone,
    addressLine1: org.addressLine1,
    addressLine2: org.addressLine2,
    postalCode: org.postalCode,
    city: org.city,
    state: org.state,
    country: org.country
  };
};

const mapQuotePlain = (row: {
  id: string;
  tenantId: string;
  status: string;
  documentNumber: string;
  temporaryReference: string | null;
  sourceOfferId: string | null;
  sourceInvoiceId: string | null;
  crmOrganizationId: string | null;
  crmContactId: string | null;
  customerSnapshotJson: string;
  issuerSnapshotJson: string;
  currencyCode: string;
  documentDate: string | Date;
  quoteExpiryDate: string | Date | null;
  paymentTermDays: number | null;
  subtotalExcludingTaxMinor: number;
  discountTotalMinor: number;
  taxTotalMinor: number;
  totalIncludingTaxMinor: number;
  taxBreakdownJson: string;
  notes: string;
  internalNotes: string;
  termsText: string;
  footerText: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): InvoicingQuoteRow => ({
  id: row.id,
  tenantId: row.tenantId,
  status: row.status as InvoicingQuoteStatus,
  documentNumber: row.documentNumber,
  temporaryReference: row.temporaryReference,
  sourceOfferId: row.sourceOfferId,
  sourceInvoiceId: row.sourceInvoiceId,
  crmOrganizationId: row.crmOrganizationId,
  crmContactId: row.crmContactId,
  customerSnapshot: parseInvoicingJson(row.customerSnapshotJson, {
    organizationId: "",
    organizationName: ""
  }),
  issuerSnapshot: parseInvoicingIssuerSnapshot(row.issuerSnapshotJson),
  currencyCode: row.currencyCode,
  documentDate: isoDateOnly(row.documentDate)!,
  quoteExpiryDate: isoDateOnly(row.quoteExpiryDate),
  paymentTermDays: row.paymentTermDays,
  subtotalExcludingTaxMinor: row.subtotalExcludingTaxMinor,
  discountTotalMinor: row.discountTotalMinor,
  taxTotalMinor: row.taxTotalMinor,
  totalIncludingTaxMinor: row.totalIncludingTaxMinor,
  taxBreakdown: parseInvoicingJson(row.taxBreakdownJson, []),
  notes: row.notes,
  internalNotes: row.internalNotes,
  termsText: row.termsText,
  footerText: row.footerText,
  createdByUserId: row.createdByUserId,
  updatedByUserId: row.updatedByUserId,
  archivedAt: row.archivedAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
});

const openQuoteRow = async (
  tenantId: string,
  row: typeof pg.invoicingQuotes.$inferSelect | typeof mysql.invoicingQuotes.$inferSelect
): Promise<InvoicingQuoteRow> =>
  openInvoicingRow(INVOICING_QUOTE_TABLE_KEY, tenantId, row as unknown as Record<string, unknown>, (plain) =>
    mapQuotePlain(plain as Parameters<typeof mapQuotePlain>[0])
  );

const lineTotalsFromInput = (lines: InvoicingLineItemInput[]) => {
  const agg = aggregateInvoicingLinesWithTaxBreakdown(lines);
  return agg;
};

const mapLineItemRow = (r: {
  id: string;
  sortOrder: number;
  catalogItemId: string | null;
  lineKind: string;
  description: string;
  sku: string | null;
  quantity: string | number;
  unitLabel: string;
  unitPriceMinor: number;
  discountMinor: number;
  taxRateBps: number | null;
  lineSubtotalMinor: number;
  lineTaxMinor: number;
  lineTotalMinor: number;
}): InvoicingLineItemRow => ({
  id: r.id,
  sortOrder: r.sortOrder,
  catalogItemId: r.catalogItemId,
  lineKind: r.lineKind,
  description: r.description,
  sku: r.sku,
  quantity: Number(r.quantity),
  unitLabel: r.unitLabel,
  unitPriceMinor: r.unitPriceMinor,
  discountMinor: r.discountMinor,
  taxRateBps: r.taxRateBps,
  lineSubtotalMinor: r.lineSubtotalMinor,
  lineTaxMinor: r.lineTaxMinor,
  lineTotalMinor: r.lineTotalMinor
});

export const listQuoteLineItems = async (tenantId: string, quoteId: string): Promise<InvoicingLineItemRow[]> => {
  if (isMysql()) {
    const rows = await mysqlDb()
      .select()
      .from(mysql.invoicingQuoteLineItems)
      .where(and(eq(mysql.invoicingQuoteLineItems.tenantId, tenantId), eq(mysql.invoicingQuoteLineItems.quoteId, quoteId)))
      .orderBy(mysql.invoicingQuoteLineItems.sortOrder);
    return rows.map(mapLineItemRow);
  }
  const rows = await pgDb()
    .select()
    .from(pg.invoicingQuoteLineItems)
    .where(and(eq(pg.invoicingQuoteLineItems.tenantId, tenantId), eq(pg.invoicingQuoteLineItems.quoteId, quoteId)))
    .orderBy(pg.invoicingQuoteLineItems.sortOrder);
  return rows.map(mapLineItemRow);
};

export const listOfferLineItems = async (tenantId: string, offerId: string): Promise<InvoicingLineItemRow[]> => {
  if (isMysql()) {
    const rows = await mysqlDb()
      .select()
      .from(mysql.invoicingOfferLineItems)
      .where(and(eq(mysql.invoicingOfferLineItems.tenantId, tenantId), eq(mysql.invoicingOfferLineItems.offerId, offerId)))
      .orderBy(mysql.invoicingOfferLineItems.sortOrder);
    return rows.map(mapLineItemRow);
  }
  const rows = await pgDb()
    .select()
    .from(pg.invoicingOfferLineItems)
    .where(and(eq(pg.invoicingOfferLineItems.tenantId, tenantId), eq(pg.invoicingOfferLineItems.offerId, offerId)))
    .orderBy(pg.invoicingOfferLineItems.sortOrder);
  return rows.map(mapLineItemRow);
};

export const listInvoiceLineItems = async (tenantId: string, invoiceId: string): Promise<InvoicingLineItemRow[]> => {
  if (isMysql()) {
    const rows = await mysqlDb()
      .select()
      .from(mysql.invoicingInvoiceLineItems)
      .where(
        and(eq(mysql.invoicingInvoiceLineItems.tenantId, tenantId), eq(mysql.invoicingInvoiceLineItems.invoiceId, invoiceId))
      )
      .orderBy(mysql.invoicingInvoiceLineItems.sortOrder);
    return rows.map(mapLineItemRow);
  }
  const rows = await pgDb()
    .select()
    .from(pg.invoicingInvoiceLineItems)
    .where(and(eq(pg.invoicingInvoiceLineItems.tenantId, tenantId), eq(pg.invoicingInvoiceLineItems.invoiceId, invoiceId)))
    .orderBy(pg.invoicingInvoiceLineItems.sortOrder);
  return rows.map(mapLineItemRow);
};

export const getQuoteById = async (tenantId: string, quoteId: string): Promise<InvoicingQuoteRow | undefined> => {
  if (isMysql()) {
    const rows = await mysqlDb()
      .select()
      .from(mysql.invoicingQuotes)
      .where(and(eq(mysql.invoicingQuotes.tenantId, tenantId), eq(mysql.invoicingQuotes.id, quoteId)))
      .limit(1);
    const row = rows[0];
    return row ? await openQuoteRow(tenantId, row) : undefined;
  }
  const rows = await pgDb()
    .select()
    .from(pg.invoicingQuotes)
    .where(and(eq(pg.invoicingQuotes.tenantId, tenantId), eq(pg.invoicingQuotes.id, quoteId)))
    .limit(1);
  const row = rows[0];
  return row ? await openQuoteRow(tenantId, row) : undefined;
};

const replaceQuoteLineItems = async (
  tenantId: string,
  quoteId: string,
  lines: InvoicingLineItemInput[],
  totals: ReturnType<typeof lineTotalsFromInput>
): Promise<void> => {
  if (isMysql()) {
    const db = mysqlDb();
    await db
      .delete(mysql.invoicingQuoteLineItems)
      .where(and(eq(mysql.invoicingQuoteLineItems.tenantId, tenantId), eq(mysql.invoicingQuoteLineItems.quoteId, quoteId)));
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const computed = totals.lines[i]!;
      await db.insert(mysql.invoicingQuoteLineItems).values({
        id: line.id ?? randomUUID(),
        tenantId,
        quoteId,
        sortOrder: line.sortOrder ?? i,
        catalogItemId: line.catalogItemId ?? null,
        lineKind: line.catalogItemId ? "catalog" : (line.lineKind ?? "manual"),
        description: line.description,
        sku: line.sku ?? null,
        quantity: quantityStr(line.quantity),
        unitLabel: line.unitLabel,
        unitPriceMinor: line.unitPriceMinor,
        discountMinor: line.discountMinor ?? 0,
        taxRateBps: line.taxRateBps ?? null,
        lineSubtotalMinor: computed.lineSubtotalMinor,
        lineTaxMinor: computed.lineTaxMinor,
        lineTotalMinor: computed.lineTotalMinor,
        snapshotJson: "{}"
      });
    }
    return;
  }
  const db = pgDb();
  await db
    .delete(pg.invoicingQuoteLineItems)
    .where(and(eq(pg.invoicingQuoteLineItems.tenantId, tenantId), eq(pg.invoicingQuoteLineItems.quoteId, quoteId)));
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const computed = totals.lines[i]!;
    await db.insert(pg.invoicingQuoteLineItems).values({
      id: line.id ?? randomUUID(),
      tenantId,
      quoteId,
      sortOrder: line.sortOrder ?? i,
      catalogItemId: line.catalogItemId ?? null,
      lineKind: line.catalogItemId ? "catalog" : (line.lineKind ?? "manual"),
      description: line.description,
      sku: line.sku ?? null,
      quantity: quantityStr(line.quantity),
      unitLabel: line.unitLabel,
      unitPriceMinor: line.unitPriceMinor,
      discountMinor: line.discountMinor ?? 0,
      taxRateBps: line.taxRateBps ?? null,
      lineSubtotalMinor: computed.lineSubtotalMinor,
      lineTaxMinor: computed.lineTaxMinor,
      lineTotalMinor: computed.lineTotalMinor,
      snapshotJson: "{}"
    });
  }
};

export const insertQuote = async (
  tenantId: string,
  userId: string | null,
  input: InvoicingQuoteCreateInput
): Promise<InvoicingQuoteRow> => {
  const cfg = await ensureInvoicingTenantConfiguration(tenantId);
  const totals = lineTotalsFromInput(input.lineItems);
  const id = randomUUID();
  const documentNumber = await allocateInvoicingQuoteNumber(tenantId);
  const customerSnapshot =
    input.crmOrganizationId != null
      ? await buildInvoicingCustomerSnapshot(tenantId, input.crmOrganizationId, input.crmContactId)
      : null;
  const now = new Date();
  const base = {
    id,
    tenantId,
    status: "quote_draft" as const,
    documentNumber,
    temporaryReference: null as string | null,
    crmOrganizationId: input.crmOrganizationId ?? null,
    crmContactId: input.crmContactId ?? null,
    customerSnapshotJson: stringifyInvoicingJson(customerSnapshot ?? {}),
    issuerSnapshotJson: stringifyInvoicingJson(resolveInvoicingIssuerSnapshot({}, cfg.issuerSnapshot)),
    currencyCode: input.currencyCode,
    documentDate: input.documentDate,
    quoteExpiryDate: resolveQuoteExpiryDate(input.documentDate, input.quoteExpiryDate),
    paymentTermDays: resolveInvoicingPaymentTermDays(input.paymentTermDays, cfg.defaultPaymentTermDays),
    subtotalExcludingTaxMinor: totals.subtotalExcludingTaxMinor,
    discountTotalMinor: totals.discountTotalMinor,
    taxTotalMinor: totals.taxTotalMinor,
    totalIncludingTaxMinor: totals.totalIncludingTaxMinor,
    taxBreakdownJson: stringifyInvoicingJson(totals.taxBreakdown),
    notes: input.notes ?? "",
    internalNotes: input.internalNotes ?? "",
    termsText: defaultInvoicingTermsTextForKind("quote", cfg),
    footerText: input.footerText || cfg.defaultFooterText,
    createdByUserId: userId,
    updatedByUserId: userId,
    createdAt: now,
    updatedAt: now
  };
  const sealed = await sealInvoicingRow(INVOICING_QUOTE_TABLE_KEY, tenantId, base, id);
  const writeRow = { ...base, ...sealed };
  if (isMysql()) {
    await mysqlDb().insert(mysql.invoicingQuotes).values({
      ...writeRow,
      documentDate: dateForDb(base.documentDate)!,
      quoteExpiryDate: dateForDb(base.quoteExpiryDate)
    });
  } else {
    await pgDb().insert(pg.invoicingQuotes).values(writeRow);
  }
  await replaceQuoteLineItems(tenantId, id, input.lineItems, totals);
  await insertInvoicingAuditEvent({
    tenantId,
    eventKind: "quote_created",
    documentKind: "quote",
    documentId: id,
    actorUserId: userId
  });
  const row = await getQuoteById(tenantId, id);
  if (!row) throw new Error("insertQuote failed");
  return row;
};

export const updateQuote = async (
  tenantId: string,
  quoteId: string,
  userId: string | null,
  input: InvoicingQuotePatchInput
): Promise<InvoicingQuoteRow | null> => {
  const existing = await getQuoteById(tenantId, quoteId);
  if (!existing || !isEditableQuoteStatus(existing.status)) return null;
  const cfg = await ensureInvoicingTenantConfiguration(tenantId);
  const lines = input.lineItems ?? (await listQuoteLineItems(tenantId, quoteId)).map((r) => ({
    description: r.description,
    quantity: r.quantity,
    unitLabel: r.unitLabel,
    unitPriceMinor: r.unitPriceMinor,
    discountMinor: r.discountMinor,
    taxRateBps: r.taxRateBps,
    catalogItemId: r.catalogItemId,
    sku: r.sku,
    sortOrder: r.sortOrder
  }));
  const totals = lineTotalsFromInput(lines as InvoicingLineItemInput[]);
  let customerSnapshot = existing.customerSnapshot;
  const orgId = input.crmOrganizationId !== undefined ? input.crmOrganizationId : existing.crmOrganizationId;
  const contactId = input.crmContactId !== undefined ? input.crmContactId : existing.crmContactId;
  if (orgId) {
    const built = await buildInvoicingCustomerSnapshot(tenantId, orgId, contactId);
    if (built) customerSnapshot = built;
  }
  const now = new Date();
  const patch = {
    crmOrganizationId: orgId,
    crmContactId: contactId,
    customerSnapshotJson: stringifyInvoicingJson(customerSnapshot),
    currencyCode: input.currencyCode ?? existing.currencyCode,
    documentDate: input.documentDate ?? existing.documentDate,
    quoteExpiryDate: input.quoteExpiryDate !== undefined ? input.quoteExpiryDate : existing.quoteExpiryDate,
    paymentTermDays:
      input.paymentTermDays !== undefined
        ? resolveInvoicingPaymentTermDays(input.paymentTermDays, cfg.defaultPaymentTermDays)
        : existing.paymentTermDays,
    subtotalExcludingTaxMinor: totals.subtotalExcludingTaxMinor,
    discountTotalMinor: totals.discountTotalMinor,
    taxTotalMinor: totals.taxTotalMinor,
    totalIncludingTaxMinor: totals.totalIncludingTaxMinor,
    taxBreakdownJson: stringifyInvoicingJson(totals.taxBreakdown),
    notes: input.notes ?? existing.notes,
    internalNotes: input.internalNotes ?? existing.internalNotes,
    termsText: defaultInvoicingTermsTextForKind("quote", cfg),
    footerText: input.footerText ?? existing.footerText,
    issuerSnapshotJson: stringifyInvoicingJson(resolveInvoicingIssuerSnapshot(existing.issuerSnapshot, cfg.issuerSnapshot)),
    updatedByUserId: userId,
    updatedAt: now
  };
  const sealedPatch = await sealInvoicingPatch(INVOICING_QUOTE_TABLE_KEY, tenantId, patch, quoteId);
  if (isMysql()) {
    const { documentDate, quoteExpiryDate, ...patchRest } = sealedPatch;
    await mysqlDb()
      .update(mysql.invoicingQuotes)
      .set({
        ...patchRest,
        documentDate: dateForDb(documentDate as string)!,
        ...(quoteExpiryDate != null ? { quoteExpiryDate: dateForDb(quoteExpiryDate as string)! } : {})
      })
      .where(and(eq(mysql.invoicingQuotes.tenantId, tenantId), eq(mysql.invoicingQuotes.id, quoteId)));
  } else {
    await pgDb()
      .update(pg.invoicingQuotes)
      .set(sealedPatch)
      .where(and(eq(pg.invoicingQuotes.tenantId, tenantId), eq(pg.invoicingQuotes.id, quoteId)));
  }
  if (input.lineItems) {
    await replaceQuoteLineItems(tenantId, quoteId, input.lineItems, totals);
  }
  await insertInvoicingAuditEvent({
    tenantId,
    eventKind: "quote_updated",
    documentKind: "quote",
    documentId: quoteId,
    actorUserId: userId
  });
  const updated = await getQuoteById(tenantId, quoteId);
  return updated ?? null;
};

export const archiveQuote = async (
  tenantId: string,
  quoteId: string,
  userId: string | null
): Promise<InvoicingQuoteRow | null> => {
  const existing = await getQuoteById(tenantId, quoteId);
  if (!existing || existing.status === "quote_archived") return null;
  const now = new Date();
  const patch = { status: "quote_archived" as const, archivedAt: now, updatedByUserId: userId, updatedAt: now };
  if (isMysql()) {
    await mysqlDb()
      .update(mysql.invoicingQuotes)
      .set(patch)
      .where(and(eq(mysql.invoicingQuotes.tenantId, tenantId), eq(mysql.invoicingQuotes.id, quoteId)));
  } else {
    await pgDb()
      .update(pg.invoicingQuotes)
      .set(patch)
      .where(and(eq(pg.invoicingQuotes.tenantId, tenantId), eq(pg.invoicingQuotes.id, quoteId)));
  }
  await insertInvoicingAuditEvent({
    tenantId,
    eventKind: "quote_archived",
    documentKind: "quote",
    documentId: quoteId,
    actorUserId: userId
  });
  const updated = await getQuoteById(tenantId, quoteId);
  return updated ?? null;
};

export const deleteQuote = async (
  tenantId: string,
  quoteId: string,
  userId: string | null
): Promise<"deleted" | "not_found" | "not_deletable"> => {
  const existing = await getQuoteById(tenantId, quoteId);
  if (!existing) return "not_found";
  if (existing.status !== "quote_archived") return "not_deletable";

  await insertInvoicingAuditEvent({
    tenantId,
    eventKind: "quote_deleted",
    documentKind: "quote",
    documentId: quoteId,
    actorUserId: userId,
    payload: {
      documentNumber: existing.documentNumber,
      temporaryReference: existing.temporaryReference
    }
  });

  if (isMysql()) {
    await mysqlDb()
      .delete(mysql.invoicingQuotes)
      .where(and(eq(mysql.invoicingQuotes.tenantId, tenantId), eq(mysql.invoicingQuotes.id, quoteId)));
  } else {
    await pgDb()
      .delete(pg.invoicingQuotes)
      .where(and(eq(pg.invoicingQuotes.tenantId, tenantId), eq(pg.invoicingQuotes.id, quoteId)));
  }
  return "deleted";
};

export const listInvoicingDocuments = async (
  tenantId: string,
  query: InvoicingDocumentsListQueryInput
): Promise<{ items: InvoicingDocumentListItem[]; total: number }> => {
  const limit = query.limit ?? 50;
  const offset = query.offset ?? 0;
  const items: InvoicingDocumentListItem[] = [];

  const cfg = await getInvoicingConfiguration(tenantId);
  const quoteWarningsEnabled = cfg?.quoteExpiryWarningsEnabled ?? true;

  const pushQuote = (r: InvoicingQuoteRow) => {
    const isQuoteExpired = quoteWarningsEnabled && isQuoteSoftExpired(r.quoteExpiryDate, todayIso());
    items.push({
      kind: "quote",
      id: r.id,
      status: r.status,
      documentNumber: r.documentNumber,
      temporaryReference: r.temporaryReference,
      customerName: r.customerSnapshot.organizationName || null,
      contactName: r.customerSnapshot.contactName ?? null,
      currencyCode: r.currencyCode,
      documentDate: r.documentDate,
      totalIncludingTaxMinor: r.totalIncludingTaxMinor,
      updatedAt: r.updatedAt,
      quoteExpiryDate: r.quoteExpiryDate,
      isQuoteExpired
    });
  };

  if (!query.kind || query.kind === "quote") {
    if (isMysql()) {
      const rows = await mysqlDb()
        .select()
        .from(mysql.invoicingQuotes)
        .where(eq(mysql.invoicingQuotes.tenantId, tenantId))
        .orderBy(desc(mysql.invoicingQuotes.updatedAt))
        .limit(500);
      for (const row of rows) {
        const mapped = await getQuoteById(tenantId, row.id);
        if (mapped) pushQuote(mapped);
      }
    } else {
      const rows = await pgDb()
        .select()
        .from(pg.invoicingQuotes)
        .where(eq(pg.invoicingQuotes.tenantId, tenantId))
        .orderBy(desc(pg.invoicingQuotes.updatedAt))
        .limit(500);
      for (const row of rows) {
        const mapped = await openQuoteRow(tenantId, row);
        pushQuote(mapped);
      }
    }
  }

  if (!query.kind || query.kind === "offer") {
    const offerRows = isMysql()
      ? await mysqlDb()
          .select()
          .from(mysql.invoicingOffers)
          .where(eq(mysql.invoicingOffers.tenantId, tenantId))
          .orderBy(desc(mysql.invoicingOffers.updatedAt))
          .limit(500)
      : await pgDb()
          .select()
          .from(pg.invoicingOffers)
          .where(eq(pg.invoicingOffers.tenantId, tenantId))
          .orderBy(desc(pg.invoicingOffers.updatedAt))
          .limit(500);
    for (const r of offerRows) {
      const mapped = await openOfferRow(tenantId, r);
      items.push({
        kind: "offer",
        id: mapped.id,
        status: mapped.status,
        documentNumber: formatInvoicingOfferDisplayNumber(mapped.documentNumber, mapped.revision),
        temporaryReference: null,
        customerName: mapped.customerSnapshot.organizationName || null,
        contactName: mapped.customerSnapshot.contactName ?? null,
        currencyCode: mapped.currencyCode,
        documentDate: mapped.documentDate,
        totalIncludingTaxMinor: mapped.totalIncludingTaxMinor,
        updatedAt: mapped.updatedAt
      });
    }
  }

  if (!query.kind || query.kind === "invoice") {
    const invoiceRows = isMysql()
      ? await mysqlDb()
          .select()
          .from(mysql.invoicingInvoices)
          .where(eq(mysql.invoicingInvoices.tenantId, tenantId))
          .orderBy(desc(mysql.invoicingInvoices.updatedAt))
          .limit(500)
      : await pgDb()
          .select()
          .from(pg.invoicingInvoices)
          .where(eq(pg.invoicingInvoices.tenantId, tenantId))
          .orderBy(desc(pg.invoicingInvoices.updatedAt))
          .limit(500);
    for (const r of invoiceRows) {
      const mapped = await openInvoiceRow(tenantId, r);
      items.push({
        kind: "invoice",
        id: mapped.id,
        status: mapped.status,
        documentNumber: formatInvoicingInvoiceDisplayNumber(mapped.documentNumber, mapped.revision),
        temporaryReference: null,
        customerName: mapped.customerSnapshot.organizationName || null,
        contactName: mapped.customerSnapshot.contactName ?? null,
        currencyCode: mapped.currencyCode,
        documentDate: mapped.documentDate,
        totalIncludingTaxMinor: mapped.totalIncludingTaxMinor,
        updatedAt: mapped.updatedAt,
        dueDate: mapped.dueDate
      });
    }
  }

  items.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  const filtered = items.filter((it) => documentListItemMatchesQuery(it, query));
  const total = filtered.length;
  return { items: filtered.slice(offset, offset + limit), total };
};

export const listInvoicingCatalogItems = async (
  tenantId: string,
  query: InvoicingCatalogListQueryInput
) => {
  const limit = query.limit ?? 50;
  const offset = query.offset ?? 0;
  const q = query.q?.trim() ?? "";
  if (isMysql()) {
    const base = eq(mysql.invoicingCatalogItems.tenantId, tenantId);
    const where = and(
      base,
      query.activeOnly ? eq(mysql.invoicingCatalogItems.isActive, true) : undefined,
      q.length > 0
        ? or(
            sql`LOWER(${mysql.invoicingCatalogItems.name}) LIKE LOWER(${"%" + escapeLike(q) + "%"})`,
            sql`LOWER(COALESCE(${mysql.invoicingCatalogItems.sku},'')) LIKE LOWER(${"%" + escapeLike(q) + "%"})`
          )
        : undefined
    );
    const totalRows = await mysqlDb().select({ n: count() }).from(mysql.invoicingCatalogItems).where(where);
    const rows = await mysqlDb()
      .select()
      .from(mysql.invoicingCatalogItems)
      .where(where)
      .orderBy(desc(mysql.invoicingCatalogItems.updatedAt))
      .limit(limit)
      .offset(offset);
    return { rows, total: Number(totalRows[0]?.n ?? 0) };
  }
  const base = eq(pg.invoicingCatalogItems.tenantId, tenantId);
  const t = `%${escapeLike(q)}%`;
  const where = and(
    base,
    query.activeOnly ? eq(pg.invoicingCatalogItems.isActive, true) : undefined,
    q.length > 0
      ? or(ilike(pg.invoicingCatalogItems.name, t), ilike(pg.invoicingCatalogItems.sku, t))
      : undefined
  );
  const totalRows = await pgDb().select({ n: count() }).from(pg.invoicingCatalogItems).where(where);
  const rows = await pgDb()
    .select()
    .from(pg.invoicingCatalogItems)
    .where(where)
    .orderBy(desc(pg.invoicingCatalogItems.updatedAt))
    .limit(limit)
    .offset(offset);
  return { rows, total: Number(totalRows[0]?.n ?? 0) };
};

export const insertCatalogItem = async (
  tenantId: string,
  userId: string | null,
  input: InvoicingCatalogItemCreateInput
) => {
  const id = randomUUID();
  const now = new Date();
  const values = {
    id,
    tenantId,
    itemKind: input.itemKind ?? "service",
    sku: input.sku ?? null,
    name: input.name,
    description: input.description ?? "",
    unitLabel: input.unitLabel,
    unitPriceMinor: input.unitPriceMinor,
    currencyCode: input.currencyCode,
    taxRateBps: input.taxRateBps ?? null,
    isActive: input.isActive ?? true,
    createdByUserId: userId,
    updatedByUserId: userId,
    createdAt: now,
    updatedAt: now
  };
  if (isMysql()) {
    await mysqlDb().insert(mysql.invoicingCatalogItems).values(values);
  } else {
    await pgDb().insert(pg.invoicingCatalogItems).values(values);
  }
  await insertInvoicingAuditEvent({
    tenantId,
    eventKind: "catalog_item_created",
    documentKind: "quote",
    documentId: id,
    actorUserId: userId,
    payload: { catalogItemId: id }
  });
  return values;
};

const copyQuoteToOffer = async (
  tenantId: string,
  quote: InvoicingQuoteRow,
  userId: string | null,
  opts: { documentDate?: string },
  auditOpts: { skipAudit?: boolean } = {}
): Promise<{ offerId: string; documentNumber: string; revision: string }> => {
  if (!quote.crmOrganizationId) throw new Error("crm_organization_required");
  const cfg = await ensureInvoicingTenantConfiguration(tenantId);
  const issuerSnapshot = resolveInvoicingIssuerSnapshot(quote.issuerSnapshot, cfg.issuerSnapshot);
  let documentNumber: string;
  let revision: string;
  if (quote.sourceOfferId) {
    const sourceOffer = await getOfferById(tenantId, quote.sourceOfferId);
    if (!sourceOffer) throw new Error("source_offer_not_found");
    documentNumber = sourceOffer.documentNumber;
    revision = nextInvoicingOfferRevision(sourceOffer.revision);
  } else {
    documentNumber = await allocateInvoicingDocumentNumber(tenantId, "offer");
    revision = INITIAL_INVOICING_DOCUMENT_REVISION;
  }
  const offerId = randomUUID();
  const now = new Date();
  const documentDate = opts.documentDate ?? quote.documentDate;
  const base = {
    id: offerId,
    tenantId,
    status: "offer_draft" as InvoicingOfferStatus,
    documentNumber,
    revision,
    sourceQuoteId: quote.id,
    crmOrganizationId: quote.crmOrganizationId,
    crmContactId: quote.crmContactId,
    customerSnapshotJson: stringifyInvoicingJson(quote.customerSnapshot),
    issuerSnapshotJson: stringifyInvoicingJson(issuerSnapshot),
    currencyCode: quote.currencyCode,
    documentDate,
    offerExpiryDate: null as string | null,
    paymentTermDays: null,
    subtotalExcludingTaxMinor: quote.subtotalExcludingTaxMinor,
    discountTotalMinor: quote.discountTotalMinor,
    taxTotalMinor: quote.taxTotalMinor,
    totalIncludingTaxMinor: quote.totalIncludingTaxMinor,
    taxBreakdownJson: stringifyInvoicingJson(quote.taxBreakdown),
    notes: quote.notes,
    internalNotes: quote.internalNotes,
    termsText: cfg.defaultOfferTermsText,
    footerText: quote.footerText,
    createdByUserId: userId,
    updatedByUserId: userId,
    createdAt: now,
    updatedAt: now
  };
  const sealed = await sealInvoicingRow(INVOICING_OFFER_TABLE_KEY, tenantId, base, offerId);
  const writeRow = { ...base, ...sealed };
  const lines = await listQuoteLineItems(tenantId, quote.id);
  if (isMysql()) {
    await mysqlDb().insert(mysql.invoicingOffers).values({
      ...writeRow,
      documentDate: dateForDb(base.documentDate)!,
      offerExpiryDate: dateForDb(base.offerExpiryDate)
    });
    for (const line of lines) {
      await mysqlDb().insert(mysql.invoicingOfferLineItems).values({
        id: randomUUID(),
        tenantId,
        offerId,
        sortOrder: line.sortOrder,
        catalogItemId: line.catalogItemId,
        lineKind: line.lineKind,
        description: line.description,
        sku: line.sku,
        quantity: quantityStr(line.quantity),
        unitLabel: line.unitLabel,
        unitPriceMinor: line.unitPriceMinor,
        discountMinor: line.discountMinor,
        taxRateBps: line.taxRateBps,
        lineSubtotalMinor: line.lineSubtotalMinor,
        lineTaxMinor: line.lineTaxMinor,
        lineTotalMinor: line.lineTotalMinor,
        snapshotJson: "{}"
      });
    }
  } else {
    await pgDb().insert(pg.invoicingOffers).values(writeRow);
    for (const line of lines) {
      await pgDb().insert(pg.invoicingOfferLineItems).values({
        id: randomUUID(),
        tenantId,
        offerId,
        sortOrder: line.sortOrder,
        catalogItemId: line.catalogItemId,
        lineKind: line.lineKind,
        description: line.description,
        sku: line.sku,
        quantity: quantityStr(line.quantity),
        unitLabel: line.unitLabel,
        unitPriceMinor: line.unitPriceMinor,
        discountMinor: line.discountMinor,
        taxRateBps: line.taxRateBps,
        lineSubtotalMinor: line.lineSubtotalMinor,
        lineTaxMinor: line.lineTaxMinor,
        lineTotalMinor: line.lineTotalMinor,
        snapshotJson: "{}"
      });
    }
  }
  if (!auditOpts.skipAudit) {
    await insertInvoicingAuditEvent({
      tenantId,
      eventKind: "offer_created",
      documentKind: "offer",
      documentId: offerId,
      actorUserId: userId,
      payload: { sourceQuoteId: quote.id, documentNumber, revision }
    });
  }
  return { offerId, documentNumber, revision };
};

const copyOfferLineItemsToQuote = async (
  tenantId: string,
  offerId: string,
  quoteId: string
): Promise<void> => {
  const lines = await listOfferLineItems(tenantId, offerId);
  if (isMysql()) {
    for (const line of lines) {
      await mysqlDb().insert(mysql.invoicingQuoteLineItems).values({
        id: randomUUID(),
        tenantId,
        quoteId,
        sortOrder: line.sortOrder,
        catalogItemId: line.catalogItemId,
        lineKind: line.lineKind,
        description: line.description,
        sku: line.sku,
        quantity: quantityStr(line.quantity),
        unitLabel: line.unitLabel,
        unitPriceMinor: line.unitPriceMinor,
        discountMinor: line.discountMinor,
        taxRateBps: line.taxRateBps,
        lineSubtotalMinor: line.lineSubtotalMinor,
        lineTaxMinor: line.lineTaxMinor,
        lineTotalMinor: line.lineTotalMinor,
        snapshotJson: "{}"
      });
    }
    return;
  }
  for (const line of lines) {
    await pgDb().insert(pg.invoicingQuoteLineItems).values({
      id: randomUUID(),
      tenantId,
      quoteId,
      sortOrder: line.sortOrder,
      catalogItemId: line.catalogItemId,
      lineKind: line.lineKind,
      description: line.description,
      sku: line.sku,
      quantity: quantityStr(line.quantity),
      unitLabel: line.unitLabel,
      unitPriceMinor: line.unitPriceMinor,
      discountMinor: line.discountMinor,
      taxRateBps: line.taxRateBps,
      lineSubtotalMinor: line.lineSubtotalMinor,
      lineTaxMinor: line.lineTaxMinor,
      lineTotalMinor: line.lineTotalMinor,
      snapshotJson: "{}"
    });
  }
};

const copyOfferToQuote = async (
  tenantId: string,
  offer: InvoicingOfferRow,
  userId: string | null,
  opts: { documentDate?: string; quoteExpiryDate?: string | null }
): Promise<{ quoteId: string }> => {
  if (!offer.crmOrganizationId) throw new Error("crm_organization_required");
  const cfg = await ensureInvoicingTenantConfiguration(tenantId);
  const quoteId = randomUUID();
  const documentNumber = await allocateInvoicingQuoteNumber(tenantId);
  const now = new Date();
  const documentDate = opts.documentDate ?? offer.documentDate;
  const quoteExpiryDate = resolveQuoteExpiryDate(
    documentDate,
    opts.quoteExpiryDate ?? offer.offerExpiryDate
  );
  const base = {
    id: quoteId,
    tenantId,
    status: "quote_draft" as const,
    documentNumber,
    temporaryReference: null as string | null,
    sourceOfferId: offer.id,
    crmOrganizationId: offer.crmOrganizationId,
    crmContactId: offer.crmContactId,
    customerSnapshotJson: stringifyInvoicingJson(offer.customerSnapshot),
    issuerSnapshotJson: stringifyInvoicingJson(offer.issuerSnapshot),
    currencyCode: offer.currencyCode,
    documentDate,
    quoteExpiryDate,
    paymentTermDays: resolveInvoicingPaymentTermDays(null, cfg.defaultPaymentTermDays),
    subtotalExcludingTaxMinor: offer.subtotalExcludingTaxMinor,
    discountTotalMinor: offer.discountTotalMinor,
    taxTotalMinor: offer.taxTotalMinor,
    totalIncludingTaxMinor: offer.totalIncludingTaxMinor,
    taxBreakdownJson: stringifyInvoicingJson(offer.taxBreakdown),
    notes: offer.notes,
    internalNotes: offer.internalNotes,
    termsText: cfg.defaultQuoteTermsText,
    footerText: offer.footerText,
    createdByUserId: userId,
    updatedByUserId: userId,
    createdAt: now,
    updatedAt: now
  };
  const sealed = await sealInvoicingRow(INVOICING_QUOTE_TABLE_KEY, tenantId, base, quoteId);
  const writeRow = { ...base, ...sealed };
  if (isMysql()) {
    await mysqlDb().insert(mysql.invoicingQuotes).values({
      ...writeRow,
      documentDate: dateForDb(base.documentDate)!,
      quoteExpiryDate: dateForDb(base.quoteExpiryDate)
    });
  } else {
    await pgDb().insert(pg.invoicingQuotes).values(writeRow);
  }
  await copyOfferLineItemsToQuote(tenantId, offer.id, quoteId);
  return { quoteId };
};

const copyInvoiceLineItemsToQuote = async (
  tenantId: string,
  invoiceId: string,
  quoteId: string
): Promise<void> => {
  const lines = await listInvoiceLineItems(tenantId, invoiceId);
  if (isMysql()) {
    for (const line of lines) {
      await mysqlDb().insert(mysql.invoicingQuoteLineItems).values({
        id: randomUUID(),
        tenantId,
        quoteId,
        sortOrder: line.sortOrder,
        catalogItemId: line.catalogItemId,
        lineKind: line.lineKind,
        description: line.description,
        sku: line.sku,
        quantity: quantityStr(line.quantity),
        unitLabel: line.unitLabel,
        unitPriceMinor: line.unitPriceMinor,
        discountMinor: line.discountMinor,
        taxRateBps: line.taxRateBps,
        lineSubtotalMinor: line.lineSubtotalMinor,
        lineTaxMinor: line.lineTaxMinor,
        lineTotalMinor: line.lineTotalMinor,
        snapshotJson: "{}"
      });
    }
    return;
  }
  for (const line of lines) {
    await pgDb().insert(pg.invoicingQuoteLineItems).values({
      id: randomUUID(),
      tenantId,
      quoteId,
      sortOrder: line.sortOrder,
      catalogItemId: line.catalogItemId,
      lineKind: line.lineKind,
      description: line.description,
      sku: line.sku,
      quantity: quantityStr(line.quantity),
      unitLabel: line.unitLabel,
      unitPriceMinor: line.unitPriceMinor,
      discountMinor: line.discountMinor,
      taxRateBps: line.taxRateBps,
      lineSubtotalMinor: line.lineSubtotalMinor,
      lineTaxMinor: line.lineTaxMinor,
      lineTotalMinor: line.lineTotalMinor,
      snapshotJson: "{}"
    });
  }
};

const copyInvoiceToQuote = async (
  tenantId: string,
  invoice: InvoicingInvoiceRow,
  userId: string | null,
  opts: { documentDate?: string; quoteExpiryDate?: string | null }
): Promise<{ quoteId: string }> => {
  if (!invoice.crmOrganizationId) throw new Error("crm_organization_required");
  const cfg = await ensureInvoicingTenantConfiguration(tenantId);
  const quoteId = randomUUID();
  const documentNumber = await allocateInvoicingQuoteNumber(tenantId);
  const now = new Date();
  const documentDate = opts.documentDate ?? invoice.documentDate;
  const quoteExpiryDate = resolveQuoteExpiryDate(documentDate, opts.quoteExpiryDate);
  const base = {
    id: quoteId,
    tenantId,
    status: "quote_draft" as const,
    documentNumber,
    temporaryReference: null as string | null,
    sourceOfferId: invoice.sourceOfferId,
    sourceInvoiceId: invoice.id,
    crmOrganizationId: invoice.crmOrganizationId,
    crmContactId: invoice.crmContactId,
    customerSnapshotJson: stringifyInvoicingJson(invoice.customerSnapshot),
    issuerSnapshotJson: stringifyInvoicingJson(invoice.issuerSnapshot),
    currencyCode: invoice.currencyCode,
    documentDate,
    quoteExpiryDate,
    paymentTermDays: resolveInvoicingPaymentTermDays(invoice.paymentTermDays, cfg.defaultPaymentTermDays),
    subtotalExcludingTaxMinor: invoice.subtotalExcludingTaxMinor,
    discountTotalMinor: invoice.discountTotalMinor,
    taxTotalMinor: invoice.taxTotalMinor,
    totalIncludingTaxMinor: invoice.totalIncludingTaxMinor,
    taxBreakdownJson: stringifyInvoicingJson(invoice.taxBreakdown),
    notes: invoice.notes,
    internalNotes: invoice.internalNotes,
    termsText: cfg.defaultQuoteTermsText,
    footerText: invoice.footerText,
    createdByUserId: userId,
    updatedByUserId: userId,
    createdAt: now,
    updatedAt: now
  };
  const sealed = await sealInvoicingRow(INVOICING_QUOTE_TABLE_KEY, tenantId, base, quoteId);
  const writeRow = { ...base, ...sealed };
  if (isMysql()) {
    await mysqlDb().insert(mysql.invoicingQuotes).values({
      ...writeRow,
      documentDate: dateForDb(base.documentDate)!,
      quoteExpiryDate: dateForDb(base.quoteExpiryDate)
    });
  } else {
    await pgDb().insert(pg.invoicingQuotes).values(writeRow);
  }
  await copyInvoiceLineItemsToQuote(tenantId, invoice.id, quoteId);
  return { quoteId };
};

export const demoteInvoiceToQuote = async (
  tenantId: string,
  invoiceId: string,
  userId: string | null,
  opts: { reason: string; documentDate?: string; quoteExpiryDate?: string | null }
): Promise<{ quoteId: string } | null> => {
  const invoice = await getInvoiceById(tenantId, invoiceId);
  if (!invoice || !canDemoteInvoiceToQuote(invoice.status) || !invoice.crmOrganizationId) return null;
  const { quoteId } = await copyInvoiceToQuote(tenantId, invoice, userId, opts);
  const now = new Date();
  const invoicePatch = {
    status: "invoice_demoted" as const,
    archivedAt: now,
    updatedByUserId: userId,
    updatedAt: now
  };
  if (isMysql()) {
    await mysqlDb()
      .update(mysql.invoicingInvoices)
      .set(invoicePatch)
      .where(and(eq(mysql.invoicingInvoices.tenantId, tenantId), eq(mysql.invoicingInvoices.id, invoiceId)));
  } else {
    await pgDb()
      .update(pg.invoicingInvoices)
      .set(invoicePatch)
      .where(and(eq(pg.invoicingInvoices.tenantId, tenantId), eq(pg.invoicingInvoices.id, invoiceId)));
  }
  const auditClock = createInvoicingAuditEventClock(now);
  await insertInvoicingAuditEvent({
    tenantId,
    eventKind: "invoice_demoted_to_quote",
    documentKind: "invoice",
    documentId: invoiceId,
    actorUserId: userId,
    createdAt: auditClock.next(),
    payload: { quoteId, reason: opts.reason }
  });
  await insertInvoicingAuditEvent({
    tenantId,
    eventKind: "quote_created_from_invoice",
    documentKind: "quote",
    documentId: quoteId,
    actorUserId: userId,
    createdAt: auditClock.next(),
    payload: { invoiceId, reason: opts.reason }
  });
  return { quoteId };
};

export const demoteOfferToQuote = async (
  tenantId: string,
  offerId: string,
  userId: string | null,
  opts: { reason: string; documentDate?: string; quoteExpiryDate?: string | null }
): Promise<{ quoteId: string } | null> => {
  const offer = await getOfferById(tenantId, offerId);
  if (!offer || !canDemoteOfferToQuote(offer.status)) return null;
  const { quoteId } = await copyOfferToQuote(tenantId, offer, userId, opts);
  const now = new Date();
  const offerPatch = {
    status: "offer_demoted" as const,
    archivedAt: now,
    updatedByUserId: userId,
    updatedAt: now
  };
  if (isMysql()) {
    await mysqlDb()
      .update(mysql.invoicingOffers)
      .set(offerPatch)
      .where(and(eq(mysql.invoicingOffers.tenantId, tenantId), eq(mysql.invoicingOffers.id, offerId)));
  } else {
    await pgDb()
      .update(pg.invoicingOffers)
      .set(offerPatch)
      .where(and(eq(pg.invoicingOffers.tenantId, tenantId), eq(pg.invoicingOffers.id, offerId)));
  }
  const auditClock = createInvoicingAuditEventClock(now);
  await insertInvoicingAuditEvent({
    tenantId,
    eventKind: "offer_demoted_to_quote",
    documentKind: "offer",
    documentId: offerId,
    actorUserId: userId,
    createdAt: auditClock.next(),
    payload: { quoteId, reason: opts.reason }
  });
  await insertInvoicingAuditEvent({
    tenantId,
    eventKind: "quote_created_from_offer",
    documentKind: "quote",
    documentId: quoteId,
    actorUserId: userId,
    createdAt: auditClock.next(),
    payload: { offerId, reason: opts.reason }
  });
  return { quoteId };
};

export const promoteQuoteToOffer = async (
  tenantId: string,
  quoteId: string,
  userId: string | null,
  opts: { documentDate?: string } = {}
): Promise<{
  offerId: string;
  documentNumber: string;
  revision: string;
  displayDocumentNumber: string;
} | null> => {
  const quote = await getQuoteById(tenantId, quoteId);
  if (!quote || quote.status !== "quote_draft") return null;
  if (!quote.documentNumber) {
    const legacyDocumentNumber = await allocateInvoicingQuoteNumber(tenantId);
    const legacyNow = new Date();
    const legacyPatch = {
      documentNumber: legacyDocumentNumber,
      updatedByUserId: userId,
      updatedAt: legacyNow
    };
    if (isMysql()) {
      await mysqlDb()
        .update(mysql.invoicingQuotes)
        .set(legacyPatch)
        .where(and(eq(mysql.invoicingQuotes.tenantId, tenantId), eq(mysql.invoicingQuotes.id, quoteId)));
    } else {
      await pgDb()
        .update(pg.invoicingQuotes)
        .set(legacyPatch)
        .where(and(eq(pg.invoicingQuotes.tenantId, tenantId), eq(pg.invoicingQuotes.id, quoteId)));
    }
    quote.documentNumber = legacyDocumentNumber;
  }
  const now = new Date();
  const { offerId, documentNumber, revision } = await copyQuoteToOffer(tenantId, quote, userId, opts, {
    skipAudit: true
  });
  const quotePatch = {
    status: "quote_converted_to_offer" as const,
    updatedByUserId: userId,
    updatedAt: now
  };
  if (isMysql()) {
    await mysqlDb()
      .update(mysql.invoicingQuotes)
      .set(quotePatch)
      .where(and(eq(mysql.invoicingQuotes.tenantId, tenantId), eq(mysql.invoicingQuotes.id, quoteId)));
  } else {
    await pgDb()
      .update(pg.invoicingQuotes)
      .set(quotePatch)
      .where(and(eq(pg.invoicingQuotes.tenantId, tenantId), eq(pg.invoicingQuotes.id, quoteId)));
  }
  const auditClock = createInvoicingAuditEventClock(now);
  await insertInvoicingAuditEvent({
    tenantId,
    eventKind: "quote_promoted_to_offer",
    documentKind: "quote",
    documentId: quoteId,
    actorUserId: userId,
    createdAt: auditClock.next(),
    payload: { offerId, documentNumber, revision }
  });
  await insertInvoicingAuditEvent({
    tenantId,
    eventKind: "offer_created",
    documentKind: "offer",
    documentId: offerId,
    actorUserId: userId,
    createdAt: auditClock.next(),
    payload: { sourceQuoteId: quoteId, documentNumber, revision }
  });
  return {
    offerId,
    documentNumber,
    revision,
    displayDocumentNumber: formatInvoicingOfferDisplayNumber(documentNumber, revision)
  };
};

const createInvoiceFromSource = async (
  tenantId: string,
  userId: string | null,
  source: {
    quoteId?: string | null;
    offerId?: string | null;
    crmOrganizationId: string;
    crmContactId: string | null;
    customerSnapshot: InvoicingCustomerSnapshot;
    issuerSnapshot: InvoicingIssuerSnapshot;
    currencyCode: string;
    documentDate: string;
    invoiceDate?: string | null;
    serviceDeliveryDate?: string | null;
    paymentTermDays: number | null;
    totals: Pick<
      InvoicingQuoteRow,
      | "subtotalExcludingTaxMinor"
      | "discountTotalMinor"
      | "taxTotalMinor"
      | "totalIncludingTaxMinor"
      | "taxBreakdown"
      | "notes"
      | "internalNotes"
      | "termsText"
      | "footerText"
    >;
    lines: InvoicingLineItemRow[];
  },
  auditOpts: { skipAudit?: boolean } = {}
): Promise<{ invoiceId: string; documentNumber: string; revision: string }> => {
  const cfg = await ensureInvoicingTenantConfiguration(tenantId);
  const documentNumber = await allocateInvoicingDocumentNumber(tenantId, "invoice");
  const revision = INITIAL_INVOICING_DOCUMENT_REVISION;
  const invoiceId = randomUUID();
  const now = new Date();
  const base = {
    id: invoiceId,
    tenantId,
    status: "invoice_draft" as InvoicingInvoiceStatus,
    documentNumber,
    revision,
    sourceQuoteId: source.quoteId ?? null,
    sourceOfferId: source.offerId ?? null,
    crmOrganizationId: source.crmOrganizationId,
    crmContactId: source.crmContactId,
    customerSnapshotJson: stringifyInvoicingJson(source.customerSnapshot),
    issuerSnapshotJson: stringifyInvoicingJson(source.issuerSnapshot),
    currencyCode: source.currencyCode,
    documentDate: source.documentDate,
    invoiceDate: source.invoiceDate ?? source.documentDate,
    serviceDeliveryDate: source.serviceDeliveryDate ?? null,
    paymentTermDays: source.paymentTermDays,
    subtotalExcludingTaxMinor: source.totals.subtotalExcludingTaxMinor,
    discountTotalMinor: source.totals.discountTotalMinor,
    taxTotalMinor: source.totals.taxTotalMinor,
    totalIncludingTaxMinor: source.totals.totalIncludingTaxMinor,
    taxBreakdownJson: stringifyInvoicingJson(source.totals.taxBreakdown),
    notes: source.totals.notes,
    internalNotes: source.totals.internalNotes,
    termsText: defaultInvoicingTermsTextForKind("invoice", cfg),
    footerText: source.totals.footerText,
    createdByUserId: userId,
    updatedByUserId: userId,
    createdAt: now,
    updatedAt: now
  };
  const sealed = await sealInvoicingRow(INVOICING_INVOICE_TABLE_KEY, tenantId, base, invoiceId);
  const writeRow = { ...base, ...sealed };
  if (isMysql()) {
    await mysqlDb().insert(mysql.invoicingInvoices).values({
      ...writeRow,
      documentDate: dateForDb(base.documentDate)!,
      invoiceDate: dateForDb(base.invoiceDate),
      serviceDeliveryDate: dateForDb(base.serviceDeliveryDate)
    });
    for (const line of source.lines) {
      await mysqlDb().insert(mysql.invoicingInvoiceLineItems).values({
        id: randomUUID(),
        tenantId,
        invoiceId,
        sortOrder: line.sortOrder,
        catalogItemId: line.catalogItemId,
        lineKind: line.lineKind,
        description: line.description,
        sku: line.sku,
        quantity: quantityStr(line.quantity),
        unitLabel: line.unitLabel,
        unitPriceMinor: line.unitPriceMinor,
        discountMinor: line.discountMinor,
        taxRateBps: line.taxRateBps,
        lineSubtotalMinor: line.lineSubtotalMinor,
        lineTaxMinor: line.lineTaxMinor,
        lineTotalMinor: line.lineTotalMinor,
        snapshotJson: "{}"
      });
    }
  } else {
    await pgDb().insert(pg.invoicingInvoices).values(writeRow);
    for (const line of source.lines) {
      await pgDb().insert(pg.invoicingInvoiceLineItems).values({
        id: randomUUID(),
        tenantId,
        invoiceId,
        sortOrder: line.sortOrder,
        catalogItemId: line.catalogItemId,
        lineKind: line.lineKind,
        description: line.description,
        sku: line.sku,
        quantity: quantityStr(line.quantity),
        unitLabel: line.unitLabel,
        unitPriceMinor: line.unitPriceMinor,
        discountMinor: line.discountMinor,
        taxRateBps: line.taxRateBps,
        lineSubtotalMinor: line.lineSubtotalMinor,
        lineTaxMinor: line.lineTaxMinor,
        lineTotalMinor: line.lineTotalMinor,
        snapshotJson: "{}"
      });
    }
  }
  if (!auditOpts.skipAudit) {
    await insertInvoicingAuditEvent({
      tenantId,
      eventKind: "invoice_created",
      documentKind: "invoice",
      documentId: invoiceId,
      actorUserId: userId,
      payload: {
        documentNumber,
        revision,
        sourceQuoteId: source.quoteId ?? null,
        sourceOfferId: source.offerId ?? null
      }
    });
  }
  return { invoiceId, documentNumber, revision };
};

export const promoteQuoteToInvoice = async (
  tenantId: string,
  quoteId: string,
  userId: string | null,
  opts: { documentDate?: string; invoiceDate?: string | null; serviceDeliveryDate?: string | null }
): Promise<{ invoiceId: string; documentNumber: string } | null> => {
  const cfg = await ensureInvoicingTenantConfiguration(tenantId);
  if (!cfg.allowDirectQuoteToInvoice) return null;
  const quote = await getQuoteById(tenantId, quoteId);
  if (!quote || quote.status !== "quote_draft" || !quote.crmOrganizationId) return null;
  const lines = await listQuoteLineItems(tenantId, quoteId);
  const now = new Date();
  const { invoiceId, documentNumber, revision } = await createInvoiceFromSource(
    tenantId,
    userId,
    {
      quoteId,
      crmOrganizationId: quote.crmOrganizationId,
      crmContactId: quote.crmContactId,
      customerSnapshot: quote.customerSnapshot,
      issuerSnapshot: resolveInvoicingIssuerSnapshot(quote.issuerSnapshot, cfg.issuerSnapshot),
      currencyCode: quote.currencyCode,
      documentDate: opts.documentDate ?? quote.documentDate,
      invoiceDate: opts.invoiceDate,
      serviceDeliveryDate: opts.serviceDeliveryDate,
      paymentTermDays: null,
      totals: quote,
      lines
    },
    { skipAudit: true }
  );
  const quotePatch = {
    status: "quote_converted_to_invoice" as const,
    updatedByUserId: userId,
    updatedAt: now
  };
  if (isMysql()) {
    await mysqlDb()
      .update(mysql.invoicingQuotes)
      .set(quotePatch)
      .where(and(eq(mysql.invoicingQuotes.tenantId, tenantId), eq(mysql.invoicingQuotes.id, quoteId)));
  } else {
    await pgDb()
      .update(pg.invoicingQuotes)
      .set(quotePatch)
      .where(and(eq(pg.invoicingQuotes.tenantId, tenantId), eq(pg.invoicingQuotes.id, quoteId)));
  }
  const auditClock = createInvoicingAuditEventClock(now);
  await insertInvoicingAuditEvent({
    tenantId,
    eventKind: "quote_promoted_to_invoice",
    documentKind: "quote",
    documentId: quoteId,
    actorUserId: userId,
    createdAt: auditClock.next(),
    payload: { invoiceId, documentNumber }
  });
  await insertInvoicingAuditEvent({
    tenantId,
    eventKind: "invoice_created",
    documentKind: "invoice",
    documentId: invoiceId,
    actorUserId: userId,
    createdAt: auditClock.next(),
    payload: {
      documentNumber,
      revision,
      sourceQuoteId: quoteId,
      sourceOfferId: null
    }
  });
  return { invoiceId, documentNumber };
};

const mapOfferPlain = (
  row: typeof pg.invoicingOffers.$inferSelect | typeof mysql.invoicingOffers.$inferSelect
): InvoicingOfferRow => ({
  id: row.id,
  tenantId: row.tenantId,
  status: row.status as InvoicingOfferStatus,
  documentNumber: row.documentNumber,
  revision: row.revision,
  sourceQuoteId: row.sourceQuoteId,
  crmOrganizationId: row.crmOrganizationId,
  crmContactId: row.crmContactId,
  customerSnapshot: parseInvoicingJson(row.customerSnapshotJson, { organizationId: "", organizationName: "" }),
  issuerSnapshot: parseInvoicingIssuerSnapshot(row.issuerSnapshotJson),
  currencyCode: row.currencyCode,
  documentDate: isoDateOnly(row.documentDate)!,
  offerExpiryDate: isoDateOnly(row.offerExpiryDate),
  paymentTermDays: row.paymentTermDays,
  createdByUserId: row.createdByUserId,
  updatedByUserId: row.updatedByUserId,
  archivedAt: row.archivedAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  ...mapDocumentTotals(row)
});

const openOfferRow = async (
  tenantId: string,
  row: typeof pg.invoicingOffers.$inferSelect | typeof mysql.invoicingOffers.$inferSelect
): Promise<InvoicingOfferRow> =>
  openInvoicingRow(INVOICING_OFFER_TABLE_KEY, tenantId, row as unknown as Record<string, unknown>, (plain) =>
    mapOfferPlain(plain as typeof row)
  );

export const getOfferById = async (tenantId: string, offerId: string): Promise<InvoicingOfferRow | undefined> => {
  if (isMysql()) {
    const rows = await mysqlDb()
      .select()
      .from(mysql.invoicingOffers)
      .where(and(eq(mysql.invoicingOffers.tenantId, tenantId), eq(mysql.invoicingOffers.id, offerId)))
      .limit(1);
    const row = rows[0];
    return row ? await openOfferRow(tenantId, row) : undefined;
  }
  const rows = await pgDb()
    .select()
    .from(pg.invoicingOffers)
    .where(and(eq(pg.invoicingOffers.tenantId, tenantId), eq(pg.invoicingOffers.id, offerId)))
    .limit(1);
  const row = rows[0];
  return row ? await openOfferRow(tenantId, row) : undefined;
};

const mapInvoicePlain = (
  row: typeof pg.invoicingInvoices.$inferSelect | typeof mysql.invoicingInvoices.$inferSelect
): InvoicingInvoiceRow => ({
  id: row.id,
  tenantId: row.tenantId,
  status: row.status as InvoicingInvoiceStatus,
  documentNumber: row.documentNumber,
  revision: row.revision,
  sourceQuoteId: row.sourceQuoteId,
  sourceOfferId: row.sourceOfferId,
  sourceInvoiceId: row.sourceInvoiceId,
  crmOrganizationId: row.crmOrganizationId,
  crmContactId: row.crmContactId,
  customerSnapshot: parseInvoicingJson(row.customerSnapshotJson, { organizationId: "", organizationName: "" }),
  issuerSnapshot: parseInvoicingIssuerSnapshot(row.issuerSnapshotJson),
  currencyCode: row.currencyCode,
  documentDate: isoDateOnly(row.documentDate)!,
  invoiceDate: isoDateOnly(row.invoiceDate),
  serviceDeliveryDate: isoDateOnly(row.serviceDeliveryDate),
  paymentTermDays: row.paymentTermDays,
  dueDate: isoDateOnly(row.dueDate),
  partialPaymentAnchorDate: isoDateOnly(row.partialPaymentAnchorDate),
  finalizedAt: row.finalizedAt,
  createdByUserId: row.createdByUserId,
  updatedByUserId: row.updatedByUserId,
  archivedAt: row.archivedAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  ...mapDocumentTotals(row)
});

const openInvoiceRow = async (
  tenantId: string,
  row: typeof pg.invoicingInvoices.$inferSelect | typeof mysql.invoicingInvoices.$inferSelect
): Promise<InvoicingInvoiceRow> =>
  openInvoicingRow(INVOICING_INVOICE_TABLE_KEY, tenantId, row as unknown as Record<string, unknown>, (plain) =>
    mapInvoicePlain(plain as typeof row)
  );

export const getInvoiceById = async (tenantId: string, invoiceId: string): Promise<InvoicingInvoiceRow | undefined> => {
  if (isMysql()) {
    const rows = await mysqlDb()
      .select()
      .from(mysql.invoicingInvoices)
      .where(and(eq(mysql.invoicingInvoices.tenantId, tenantId), eq(mysql.invoicingInvoices.id, invoiceId)))
      .limit(1);
    const row = rows[0];
    return row ? await openInvoiceRow(tenantId, row) : undefined;
  }
  const rows = await pgDb()
    .select()
    .from(pg.invoicingInvoices)
    .where(and(eq(pg.invoicingInvoices.tenantId, tenantId), eq(pg.invoicingInvoices.id, invoiceId)))
    .limit(1);
  const row = rows[0];
  return row ? await openInvoiceRow(tenantId, row) : undefined;
};

export const promoteOfferToInvoice = async (
  tenantId: string,
  offerId: string,
  userId: string | null,
  opts: { documentDate?: string; invoiceDate?: string | null; serviceDeliveryDate?: string | null }
): Promise<{ invoiceId: string; documentNumber: string } | null> => {
  const offer = await getOfferById(tenantId, offerId);
  if (!offer || !canPromoteOfferToInvoice(offer.status) || !offer.crmOrganizationId) return null;
  const cfg = await ensureInvoicingTenantConfiguration(tenantId);
  const mappedLines = await listOfferLineItems(tenantId, offerId);
  const now = new Date();
  const { invoiceId, documentNumber, revision } = await createInvoiceFromSource(
    tenantId,
    userId,
    {
      quoteId: offer.sourceQuoteId,
      offerId,
      crmOrganizationId: offer.crmOrganizationId,
      crmContactId: offer.crmContactId,
      customerSnapshot: offer.customerSnapshot,
      issuerSnapshot: resolveInvoicingIssuerSnapshot(offer.issuerSnapshot, cfg.issuerSnapshot),
      currencyCode: offer.currencyCode,
      documentDate: opts.documentDate ?? offer.documentDate,
      invoiceDate: opts.invoiceDate,
      serviceDeliveryDate: opts.serviceDeliveryDate,
      paymentTermDays: null,
      totals: offer,
      lines: mappedLines
    },
    { skipAudit: true }
  );
  const offerPatch = { status: "offer_converted_to_invoice" as const, updatedByUserId: userId, updatedAt: now };
  if (isMysql()) {
    await mysqlDb()
      .update(mysql.invoicingOffers)
      .set(offerPatch)
      .where(and(eq(mysql.invoicingOffers.tenantId, tenantId), eq(mysql.invoicingOffers.id, offerId)));
  } else {
    await pgDb()
      .update(pg.invoicingOffers)
      .set(offerPatch)
      .where(and(eq(pg.invoicingOffers.tenantId, tenantId), eq(pg.invoicingOffers.id, offerId)));
  }
  const auditClock = createInvoicingAuditEventClock(now);
  await insertInvoicingAuditEvent({
    tenantId,
    eventKind: "offer_promoted_to_invoice",
    documentKind: "offer",
    documentId: offerId,
    actorUserId: userId,
    createdAt: auditClock.next(),
    payload: { invoiceId, documentNumber, revision }
  });
  await insertInvoicingAuditEvent({
    tenantId,
    eventKind: "invoice_created",
    documentKind: "invoice",
    documentId: invoiceId,
    actorUserId: userId,
    createdAt: auditClock.next(),
    payload: {
      documentNumber,
      revision,
      sourceQuoteId: offer.sourceQuoteId,
      sourceOfferId: offerId
    }
  });
  return { invoiceId, documentNumber };
};

const setOfferStatus = async (
  tenantId: string,
  offerId: string,
  status: InvoicingOfferStatus,
  userId: string | null
): Promise<void> => {
  const now = new Date();
  const patch = { status, updatedByUserId: userId, updatedAt: now };
  if (isMysql()) {
    await mysqlDb()
      .update(mysql.invoicingOffers)
      .set(patch)
      .where(and(eq(mysql.invoicingOffers.tenantId, tenantId), eq(mysql.invoicingOffers.id, offerId)));
    return;
  }
  await pgDb()
    .update(pg.invoicingOffers)
    .set(patch)
    .where(and(eq(pg.invoicingOffers.tenantId, tenantId), eq(pg.invoicingOffers.id, offerId)));
};

export const acceptOffer = async (
  tenantId: string,
  offerId: string,
  userId: string | null,
  opts: { acceptanceProof: string }
): Promise<boolean> => {
  const offer = await getOfferById(tenantId, offerId);
  if (!offer || !isOfferPendingDecision(offer.status)) return false;
  if (isOfferPastValidity(offer.offerExpiryDate)) return false;
  await setOfferStatus(tenantId, offerId, "offer_accepted", userId);
  await insertInvoicingAuditEvent({
    tenantId,
    eventKind: "offer_accepted",
    documentKind: "offer",
    documentId: offerId,
    actorUserId: userId,
    payload: { acceptanceProof: opts.acceptanceProof }
  });
  return true;
};

export const sendOffer = async (
  tenantId: string,
  offerId: string,
  userId: string | null,
  opts: { offerExpiryDate?: string | null } = {}
): Promise<boolean> => {
  const offer = await getOfferById(tenantId, offerId);
  if (!offer || offer.status !== "offer_draft") return false;
  const cfg = await ensureInvoicingTenantConfiguration(tenantId);
  const sendDate = todayIsoDateUtc();
  const offerExpiryDate = resolveOfferExpiryDateForSend(
    sendDate,
    opts.offerExpiryDate,
    cfg.defaultQuoteValidityDays
  );
  const now = new Date();
  const patch = {
    status: "offer_sent" as const,
    offerExpiryDate,
    updatedByUserId: userId,
    updatedAt: now
  };
  if (isMysql()) {
    await mysqlDb()
      .update(mysql.invoicingOffers)
      .set({
        ...patch,
        offerExpiryDate: dateForDb(offerExpiryDate)
      })
      .where(and(eq(mysql.invoicingOffers.tenantId, tenantId), eq(mysql.invoicingOffers.id, offerId)));
  } else {
    await pgDb()
      .update(pg.invoicingOffers)
      .set(patch)
      .where(and(eq(pg.invoicingOffers.tenantId, tenantId), eq(pg.invoicingOffers.id, offerId)));
  }
  await insertInvoicingAuditEvent({
    tenantId,
    eventKind: "offer_sent",
    documentKind: "offer",
    documentId: offerId,
    actorUserId: userId,
    payload: { offerExpiryDate }
  });
  return true;
};

export const rejectOffer = async (
  tenantId: string,
  offerId: string,
  userId: string | null,
  opts: { reason: string; responderName?: string; comment?: string; channel?: string }
): Promise<boolean> => {
  const offer = await getOfferById(tenantId, offerId);
  if (!offer || !isOfferPendingDecision(offer.status)) return false;
  if (isOfferPastValidity(offer.offerExpiryDate)) return false;
  await setOfferStatus(tenantId, offerId, "offer_rejected", userId);
  await insertInvoicingAuditEvent({
    tenantId,
    eventKind: "offer_rejected",
    documentKind: "offer",
    documentId: offerId,
    actorUserId: userId,
    payload: {
      reason: opts.reason,
      ...(opts.responderName ? { responderName: opts.responderName } : {}),
      ...(opts.comment ? { comment: opts.comment } : {}),
      ...(opts.channel ? { channel: opts.channel } : {})
    }
  });
  return true;
};

export const acceptOfferFromCustomerLink = async (
  tenantId: string,
  offerId: string,
  opts: { responderName: string; comment: string }
): Promise<boolean> => {
  const offer = await getOfferById(tenantId, offerId);
  if (!offer || !isInvoicingOfferCustomerResponseAllowed(offer.status, offer.offerExpiryDate)) return false;
  const acceptanceProof = formatInvoicingPublicOfferDecisionProof(opts);
  await setOfferStatus(tenantId, offerId, "offer_accepted", null);
  await insertInvoicingAuditEvent({
    tenantId,
    eventKind: "offer_accepted",
    documentKind: "offer",
    documentId: offerId,
    actorUserId: null,
    payload: {
      acceptanceProof,
      responderName: opts.responderName,
      comment: opts.comment,
      channel: "public_offer_link"
    }
  });
  return true;
};

export const rejectOfferFromCustomerLink = async (
  tenantId: string,
  offerId: string,
  opts: { responderName: string; comment: string }
): Promise<boolean> => {
  const reason = formatInvoicingPublicOfferDecisionProof(opts);
  return rejectOffer(tenantId, offerId, null, {
    reason,
    responderName: opts.responderName,
    comment: opts.comment,
    channel: "public_offer_link"
  });
};

export const sendInvoice = async (
  tenantId: string,
  invoiceId: string,
  userId: string | null,
  opts: {
    dueDate?: string | null;
    paymentTermDays?: number | null;
    statusAfterSend?: InvoicingInvoiceStatus;
  } = {}
): Promise<boolean> => {
  const invoice = await getInvoiceById(tenantId, invoiceId);
  if (!invoice || invoice.status !== "invoice_draft") return false;
  const cfg = await ensureInvoicingTenantConfiguration(tenantId);
  const sourceQuote = invoice.sourceQuoteId
    ? await getQuoteById(tenantId, invoice.sourceQuoteId)
    : undefined;
  const sendDate = invoice.partialPaymentAnchorDate ?? todayIsoDateUtc();
  const { dueDate, paymentTermDays } = resolveInvoiceDueDateForSend(
    sendDate,
    opts.dueDate,
    opts.paymentTermDays,
    sourceQuote?.paymentTermDays,
    cfg.defaultPaymentTermDays
  );
  const statusAfterSend = opts.statusAfterSend ?? "invoice_sent";
  const now = new Date();
  const patch = {
    status: statusAfterSend,
    finalizedAt: now,
    dueDate,
    paymentTermDays,
    updatedByUserId: userId,
    updatedAt: now
  };
  if (isMysql()) {
    await mysqlDb()
      .update(mysql.invoicingInvoices)
      .set({
        ...patch,
        dueDate: dateForDb(dueDate)!
      })
      .where(and(eq(mysql.invoicingInvoices.tenantId, tenantId), eq(mysql.invoicingInvoices.id, invoiceId)));
  } else {
    await pgDb()
      .update(pg.invoicingInvoices)
      .set(patch)
      .where(and(eq(pg.invoicingInvoices.tenantId, tenantId), eq(pg.invoicingInvoices.id, invoiceId)));
  }
  const eventKind =
    statusAfterSend === "invoice_accredited" ? "invoice_accredited" : "invoice_sent";
  await insertInvoicingAuditEvent({
    tenantId,
    eventKind,
    documentKind: "invoice",
    documentId: invoiceId,
    actorUserId: userId,
    payload: { dueDate, paymentTermDays }
  });
  return true;
};

export const disputeInvoice = async (
  tenantId: string,
  invoiceId: string,
  userId: string | null,
  opts: { disputedInformation: string }
): Promise<boolean> => {
  const invoice = await getInvoiceById(tenantId, invoiceId);
  if (!invoice || !canDisputeInvoice(invoice.status)) return false;
  const now = new Date();
  const patch = { status: "invoice_disputed" as const, updatedByUserId: userId, updatedAt: now };
  if (isMysql()) {
    await mysqlDb()
      .update(mysql.invoicingInvoices)
      .set(patch)
      .where(and(eq(mysql.invoicingInvoices.tenantId, tenantId), eq(mysql.invoicingInvoices.id, invoiceId)));
  } else {
    await pgDb()
      .update(pg.invoicingInvoices)
      .set(patch)
      .where(and(eq(pg.invoicingInvoices.tenantId, tenantId), eq(pg.invoicingInvoices.id, invoiceId)));
  }
  await insertInvoicingAuditEvent({
    tenantId,
    eventKind: "invoice_disputed",
    documentKind: "invoice",
    documentId: invoiceId,
    actorUserId: userId,
    payload: { disputedInformation: opts.disputedInformation }
  });
  return true;
};

export type InvoicingInvoiceDisputeResolution = "acknowledged" | "denied";

export const getInvoiceDisputeResolution = async (
  tenantId: string,
  invoiceId: string
): Promise<InvoicingInvoiceDisputeResolution | null> => {
  const events = await listInvoicingAuditEventsForDocument(tenantId, "invoice", invoiceId);
  return resolveInvoiceDisputeResolutionFromAuditEvents(events);
};

export const getInvoiceCustomerDisputeNote = async (
  tenantId: string,
  invoiceId: string
): Promise<string | null> => {
  const invoice = await getInvoiceById(tenantId, invoiceId);
  if (!invoice) return null;
  const events = await listInvoicingAuditEventsForDocument(tenantId, "invoice", invoiceId);
  return resolveInvoiceCustomerDisputeNoteForSidebar(invoice.status, events);
};

export const acknowledgeInvoiceDispute = async (
  tenantId: string,
  invoiceId: string,
  userId: string | null,
  opts: { companyResponse: string; outstandingPaymentPlan: string }
): Promise<boolean> => {
  const invoice = await getInvoiceById(tenantId, invoiceId);
  if (!invoice || invoice.status !== "invoice_disputed") return false;
  if (await getInvoiceDisputeResolution(tenantId, invoiceId)) return false;

  const events = await listInvoicingAuditEventsForDocument(tenantId, "invoice", invoiceId);
  const alreadyRecorded = hasInvoiceDisputeAcknowledgmentRecordedInCurrentCycle(events);
  if (!alreadyRecorded) {
    await insertInvoicingAuditEvent({
      tenantId,
      eventKind: "invoice_dispute_acknowledged",
      documentKind: "invoice",
      documentId: invoiceId,
      actorUserId: userId,
      payload: {
        companyResponse: opts.companyResponse.trim(),
        outstandingPaymentPlan: opts.outstandingPaymentPlan.trim()
      }
    });
  }
  return true;
};

export const finalizeInvoiceDisputeAcknowledgment = async (
  tenantId: string,
  invoiceId: string,
  userId: string | null
): Promise<boolean> => {
  const invoice = await getInvoiceById(tenantId, invoiceId);
  if (!invoice || invoice.status !== "invoice_disputed") return false;
  const now = new Date();
  const patch = {
    status: "invoice_dispute_acknowledged" as const,
    updatedByUserId: userId,
    updatedAt: now
  };
  if (isMysql()) {
    await mysqlDb()
      .update(mysql.invoicingInvoices)
      .set(patch)
      .where(and(eq(mysql.invoicingInvoices.tenantId, tenantId), eq(mysql.invoicingInvoices.id, invoiceId)));
  } else {
    await pgDb()
      .update(pg.invoicingInvoices)
      .set(patch)
      .where(and(eq(pg.invoicingInvoices.tenantId, tenantId), eq(pg.invoicingInvoices.id, invoiceId)));
  }
  return true;
};

export const getInvoiceDisputeAcknowledgmentFollowUpApplied = async (
  tenantId: string,
  invoiceId: string
): Promise<boolean> => {
  const events = await listInvoicingAuditEventsForDocument(tenantId, "invoice", invoiceId);
  return hasInvoiceDisputeAcknowledgmentFollowUp(events);
};

export type DisputeAcknowledgmentRevisionResult = {
  sourceInvoiceId: string;
  revisedInvoiceId: string;
  revision: string;
  displayDocumentNumber: string;
};

export type DisputeAcknowledgmentFullCreditResult = {
  sourceInvoiceId: string;
  revisedInvoiceId: string;
  revision: string;
  displayDocumentNumber: string;
  creditedAmountMinor: number;
};

const getInvoiceForDisputeAcknowledgmentFollowUp = async (
  tenantId: string,
  invoiceId: string
): Promise<InvoicingInvoiceRow | null> => {
  const invoice = await getInvoiceById(tenantId, invoiceId);
  if (!invoice) return null;
  const events = await listInvoicingAuditEventsForDocument(tenantId, "invoice", invoiceId);
  if (!canApplyDisputeAcknowledgmentFollowUp(invoice.status, events)) return null;
  return invoice;
};

type InvoiceRevisionLineInsert = {
  sortOrder: number;
  catalogItemId: string | null;
  lineKind: string;
  description: string;
  sku: string | null;
  quantity: number;
  unitLabel: string;
  unitPriceMinor: number;
  discountMinor: number;
  taxRateBps: number | null;
  lineSubtotalMinor: number;
  lineTaxMinor: number;
  lineTotalMinor: number;
};

const createInvoiceRevisionWithExtraLines = async (
  tenantId: string,
  sourceInvoice: InvoicingInvoiceRow,
  userId: string | null,
  opts: { anchorDate: string; extraLines: InvoiceRevisionLineInsert[] }
): Promise<{ invoiceId: string; revision: string }> => {
  const sourceLines = await listInvoiceLineItems(tenantId, sourceInvoice.id);
  const revision = nextInvoicingOfferRevision(sourceInvoice.revision);
  const totals = sumInvoicingDocumentTotalsFromStoredLines([...sourceLines, ...opts.extraLines]);
  const invoiceId = randomUUID();
  const now = new Date();
  const base = {
    id: invoiceId,
    tenantId,
    status: "invoice_draft" as InvoicingInvoiceStatus,
    documentNumber: sourceInvoice.documentNumber,
    revision,
    sourceQuoteId: sourceInvoice.sourceQuoteId,
    sourceOfferId: sourceInvoice.sourceOfferId,
    sourceInvoiceId: sourceInvoice.id,
    crmOrganizationId: sourceInvoice.crmOrganizationId,
    crmContactId: sourceInvoice.crmContactId,
    customerSnapshotJson: stringifyInvoicingJson(sourceInvoice.customerSnapshot),
    issuerSnapshotJson: stringifyInvoicingJson(sourceInvoice.issuerSnapshot),
    currencyCode: sourceInvoice.currencyCode,
    documentDate: sourceInvoice.documentDate,
    invoiceDate: sourceInvoice.invoiceDate,
    serviceDeliveryDate: sourceInvoice.serviceDeliveryDate,
    paymentTermDays: sourceInvoice.paymentTermDays,
    partialPaymentAnchorDate: opts.anchorDate,
    subtotalExcludingTaxMinor: totals.subtotalExcludingTaxMinor,
    discountTotalMinor: totals.discountTotalMinor,
    taxTotalMinor: totals.taxTotalMinor,
    totalIncludingTaxMinor: totals.totalIncludingTaxMinor,
    taxBreakdownJson: stringifyInvoicingJson(totals.taxBreakdown),
    notes: sourceInvoice.notes,
    internalNotes: sourceInvoice.internalNotes,
    termsText: sourceInvoice.termsText,
    footerText: sourceInvoice.footerText,
    createdByUserId: userId,
    updatedByUserId: userId,
    createdAt: now,
    updatedAt: now
  };

  const sealed = await sealInvoicingRow(INVOICING_INVOICE_TABLE_KEY, tenantId, base, invoiceId);
  const writeRow = { ...base, ...sealed };

  const insertLine = async (line: InvoiceRevisionLineInsert | InvoicingLineItemRow) => {
    const lineId = randomUUID();
    const payload = {
      id: lineId,
      tenantId,
      invoiceId,
      sortOrder: line.sortOrder,
      catalogItemId: line.catalogItemId,
      lineKind: line.lineKind,
      description: line.description,
      sku: line.sku,
      quantity: quantityStr(line.quantity),
      unitLabel: line.unitLabel,
      unitPriceMinor: line.unitPriceMinor,
      discountMinor: line.discountMinor,
      taxRateBps: line.taxRateBps,
      lineSubtotalMinor: line.lineSubtotalMinor,
      lineTaxMinor: line.lineTaxMinor,
      lineTotalMinor: line.lineTotalMinor,
      snapshotJson: "{}"
    };
    if (isMysql()) {
      await mysqlDb().insert(mysql.invoicingInvoiceLineItems).values(payload);
    } else {
      await pgDb().insert(pg.invoicingInvoiceLineItems).values(payload);
    }
  };

  if (isMysql()) {
    await mysqlDb().insert(mysql.invoicingInvoices).values({
      ...writeRow,
      documentDate: dateForDb(base.documentDate)!,
      invoiceDate: dateForDb(base.invoiceDate),
      serviceDeliveryDate: dateForDb(base.serviceDeliveryDate),
      partialPaymentAnchorDate: dateForDb(base.partialPaymentAnchorDate)
    });
  } else {
    await pgDb().insert(pg.invoicingInvoices).values({
      ...writeRow,
      invoiceDate: base.invoiceDate,
      serviceDeliveryDate: base.serviceDeliveryDate,
      partialPaymentAnchorDate: base.partialPaymentAnchorDate
    });
  }

  for (const line of sourceLines) {
    await insertLine(line);
  }
  for (const line of opts.extraLines) {
    await insertLine(line);
  }

  return { invoiceId, revision };
};

const recordDisputeAcknowledgmentRevision = async (input: {
  tenantId: string;
  sourceInvoice: InvoicingInvoiceRow;
  userId: string | null;
  revisedInvoiceId: string;
  revision: string;
  sourceEventKind: "invoice_dispute_discount_revision_created";
  payload: Record<string, unknown>;
}): Promise<DisputeAcknowledgmentRevisionResult> => {
  const auditClock = createInvoicingAuditEventClock(new Date());
  await insertInvoicingAuditEvent({
    tenantId: input.tenantId,
    eventKind: input.sourceEventKind,
    documentKind: "invoice",
    documentId: input.sourceInvoice.id,
    actorUserId: input.userId,
    createdAt: auditClock.next(),
    payload: {
      revisedInvoiceId: input.revisedInvoiceId,
      revision: input.revision,
      ...input.payload
    }
  });
  await insertInvoicingAuditEvent({
    tenantId: input.tenantId,
    eventKind: "invoice_payment_revision_created",
    documentKind: "invoice",
    documentId: input.revisedInvoiceId,
    actorUserId: input.userId,
    createdAt: auditClock.next(),
    payload: {
      sourceInvoiceId: input.sourceInvoice.id,
      revision: input.revision,
      ...input.payload
    }
  });
  return {
    sourceInvoiceId: input.sourceInvoice.id,
    revisedInvoiceId: input.revisedInvoiceId,
    revision: input.revision,
    displayDocumentNumber: formatInvoicingInvoiceDisplayNumber(
      input.sourceInvoice.documentNumber,
      input.revision
    )
  };
};

export const applyDisputeAcknowledgmentDiscount = async (
  tenantId: string,
  invoiceId: string,
  userId: string | null,
  input: InvoicingDisputeAcknowledgmentDiscountBodyInput
): Promise<DisputeAcknowledgmentRevisionResult | null> => {
  const invoice = await getInvoiceForDisputeAcknowledgmentFollowUp(tenantId, invoiceId);
  if (!invoice) return null;
  if (input.amountMinor > invoice.totalIncludingTaxMinor) return null;

  const sourceLines = await listInvoiceLineItems(tenantId, invoice.id);
  const maxSort = sourceLines.reduce((max, line) => Math.max(max, line.sortOrder), -1);
  const creditMinor = -input.amountMinor;
  const discountLine: InvoiceRevisionLineInsert = {
    sortOrder: maxSort + 1,
    catalogItemId: null,
    lineKind: "payment",
    description: formatInvoicingDisputeDiscountLineDescription({
      adjustmentDate: input.adjustmentDate,
      description: input.description
    }),
    sku: null,
    quantity: 1,
    unitLabel: "adjustment",
    unitPriceMinor: creditMinor,
    discountMinor: 0,
    taxRateBps: 0,
    lineSubtotalMinor: creditMinor,
    lineTaxMinor: 0,
    lineTotalMinor: creditMinor
  };
  const { invoiceId: revisedInvoiceId, revision } = await createInvoiceRevisionWithExtraLines(
    tenantId,
    invoice,
    userId,
    { anchorDate: input.adjustmentDate, extraLines: [discountLine] }
  );
  return recordDisputeAcknowledgmentRevision({
    tenantId,
    sourceInvoice: invoice,
    userId,
    revisedInvoiceId,
    revision,
    sourceEventKind: "invoice_dispute_discount_revision_created",
    payload: {
      adjustmentDate: input.adjustmentDate,
      amountMinor: input.amountMinor,
      description: input.description.trim()
    }
  });
};

export const applyDisputeAcknowledgmentFullCredit = async (
  tenantId: string,
  invoiceId: string,
  userId: string | null,
  input: InvoicingDisputeAcknowledgmentFullCreditBodyInput
): Promise<DisputeAcknowledgmentFullCreditResult | null> => {
  const invoice = await getInvoiceForDisputeAcknowledgmentFollowUp(tenantId, invoiceId);
  if (!invoice) return null;
  if (invoice.totalIncludingTaxMinor <= 0) return null;

  const creditedAmountMinor = invoice.totalIncludingTaxMinor;
  const sourceLines = await listInvoiceLineItems(tenantId, invoice.id);
  const maxSort = sourceLines.reduce((max, line) => Math.max(max, line.sortOrder), -1);
  const creditMinor = -creditedAmountMinor;
  const creditLine: InvoiceRevisionLineInsert = {
    sortOrder: maxSort + 1,
    catalogItemId: null,
    lineKind: "payment",
    description: formatInvoicingDisputeFullCreditLineDescription({
      creditDate: input.creditDate,
      note: input.note
    }),
    sku: null,
    quantity: 1,
    unitLabel: "adjustment",
    unitPriceMinor: creditMinor,
    discountMinor: 0,
    taxRateBps: 0,
    lineSubtotalMinor: creditMinor,
    lineTaxMinor: 0,
    lineTotalMinor: creditMinor
  };
  const { invoiceId: revisedInvoiceId, revision } = await createInvoiceRevisionWithExtraLines(
    tenantId,
    invoice,
    userId,
    { anchorDate: input.creditDate, extraLines: [creditLine] }
  );

  const auditClock = createInvoicingAuditEventClock(new Date());
  await insertInvoicingAuditEvent({
    tenantId,
    eventKind: "invoice_dispute_full_credit_applied",
    documentKind: "invoice",
    documentId: invoiceId,
    actorUserId: userId,
    createdAt: auditClock.next(),
    payload: {
      creditDate: input.creditDate,
      creditedAmountMinor,
      note: input.note?.trim() || null,
      revisedInvoiceId,
      revision
    }
  });
  await insertInvoicingAuditEvent({
    tenantId,
    eventKind: "invoice_payment_revision_created",
    documentKind: "invoice",
    documentId: revisedInvoiceId,
    actorUserId: userId,
    createdAt: auditClock.next(),
    payload: {
      sourceInvoiceId: invoice.id,
      revision,
      creditDate: input.creditDate,
      outcome: "dispute_full_credit"
    }
  });

  return {
    sourceInvoiceId: invoice.id,
    revisedInvoiceId,
    revision,
    displayDocumentNumber: formatInvoicingInvoiceDisplayNumber(invoice.documentNumber, revision),
    creditedAmountMinor
  };
};

export const markInvoiceAccredited = async (
  tenantId: string,
  invoiceId: string,
  userId: string | null
): Promise<boolean> => {
  const invoice = await getInvoiceById(tenantId, invoiceId);
  if (!invoice || invoice.status !== "invoice_dispute_acknowledged") return false;

  const now = new Date();
  const patch = {
    status: "invoice_accredited" as const,
    updatedByUserId: userId,
    updatedAt: now
  };
  if (isMysql()) {
    await mysqlDb()
      .update(mysql.invoicingInvoices)
      .set(patch)
      .where(and(eq(mysql.invoicingInvoices.tenantId, tenantId), eq(mysql.invoicingInvoices.id, invoiceId)));
  } else {
    await pgDb()
      .update(pg.invoicingInvoices)
      .set(patch)
      .where(and(eq(pg.invoicingInvoices.tenantId, tenantId), eq(pg.invoicingInvoices.id, invoiceId)));
  }
  return true;
};

export const denyInvoiceDispute = async (
  tenantId: string,
  invoiceId: string,
  userId: string | null,
  opts: { denialReason: string }
): Promise<boolean> => {
  const invoice = await getInvoiceById(tenantId, invoiceId);
  if (!invoice || invoice.status !== "invoice_disputed") return false;
  if (await getInvoiceDisputeResolution(tenantId, invoiceId)) return false;

  const resetAnchorDate = todayIsoDateUtc();
  const now = new Date();
  const patch = {
    status: "invoice_draft" as const,
    finalizedAt: null,
    dueDate: null,
    partialPaymentAnchorDate: resetAnchorDate,
    updatedByUserId: userId,
    updatedAt: now
  };
  if (isMysql()) {
    await mysqlDb()
      .update(mysql.invoicingInvoices)
      .set({
        ...patch,
        dueDate: null,
        partialPaymentAnchorDate: dateForDb(resetAnchorDate)!
      })
      .where(and(eq(mysql.invoicingInvoices.tenantId, tenantId), eq(mysql.invoicingInvoices.id, invoiceId)));
  } else {
    await pgDb()
      .update(pg.invoicingInvoices)
      .set(patch)
      .where(and(eq(pg.invoicingInvoices.tenantId, tenantId), eq(pg.invoicingInvoices.id, invoiceId)));
  }

  await insertInvoicingAuditEvent({
    tenantId,
    eventKind: "invoice_dispute_denied",
    documentKind: "invoice",
    documentId: invoiceId,
    actorUserId: userId,
    payload: { resetAnchorDate, denialReason: opts.denialReason.trim() }
  });
  return true;
};

export const archiveInvoice = async (
  tenantId: string,
  invoiceId: string,
  userId: string | null
): Promise<boolean> => {
  const invoice = await getInvoiceById(tenantId, invoiceId);
  if (!invoice || !canArchiveInvoice(invoice.status)) return false;
  const now = new Date();
  const patch = {
    status: "invoice_archived" as const,
    archivedAt: now,
    updatedByUserId: userId,
    updatedAt: now
  };
  if (isMysql()) {
    await mysqlDb()
      .update(mysql.invoicingInvoices)
      .set(patch)
      .where(and(eq(mysql.invoicingInvoices.tenantId, tenantId), eq(mysql.invoicingInvoices.id, invoiceId)));
  } else {
    await pgDb()
      .update(pg.invoicingInvoices)
      .set(patch)
      .where(and(eq(pg.invoicingInvoices.tenantId, tenantId), eq(pg.invoicingInvoices.id, invoiceId)));
  }
  await insertInvoicingAuditEvent({
    tenantId,
    eventKind: "invoice_archived",
    documentKind: "invoice",
    documentId: invoiceId,
    actorUserId: userId
  });
  return true;
};

export type InvoicingInvoicePaymentRow = {
  id: string;
  tenantId: string;
  invoiceId: string;
  amountMinor: number;
  paymentDate: string;
  reference: string | null;
  note: string;
  revisedInvoiceId: string | null;
  createdByUserId: string | null;
  createdAt: Date;
};

export type RegisterInvoicePaymentResult =
  | { outcome: "full"; paymentId: string; invoiceId: string }
  | {
      outcome: "partial";
      paymentId: string;
      sourceInvoiceId: string;
      revisedInvoiceId: string;
      revision: string;
      displayDocumentNumber: string;
    };

const mapInvoicePaymentRow = (row: {
  id: string;
  tenantId: string;
  invoiceId: string;
  amountMinor: number;
  paymentDate: Date | string;
  reference: string | null;
  note: string;
  revisedInvoiceId: string | null;
  createdByUserId: string | null;
  createdAt: Date;
}): InvoicingInvoicePaymentRow => ({
  id: row.id,
  tenantId: row.tenantId,
  invoiceId: row.invoiceId,
  amountMinor: row.amountMinor,
  paymentDate: isoDateOnly(row.paymentDate)!,
  reference: row.reference,
  note: row.note,
  revisedInvoiceId: row.revisedInvoiceId,
  createdByUserId: row.createdByUserId,
  createdAt: row.createdAt
});

const listInvoicesByDocumentNumber = async (
  tenantId: string,
  documentNumber: string
): Promise<InvoicingInvoiceRow[]> => {
  if (isMysql()) {
    const rows = await mysqlDb()
      .select()
      .from(mysql.invoicingInvoices)
      .where(
        and(
          eq(mysql.invoicingInvoices.tenantId, tenantId),
          eq(mysql.invoicingInvoices.documentNumber, documentNumber)
        )
      );
    return Promise.all(rows.map((row) => openInvoiceRow(tenantId, row)));
  }
  const rows = await pgDb()
    .select()
    .from(pg.invoicingInvoices)
    .where(
      and(eq(pg.invoicingInvoices.tenantId, tenantId), eq(pg.invoicingInvoices.documentNumber, documentNumber))
    );
  return Promise.all(rows.map((row) => openInvoiceRow(tenantId, row)));
};

export const listInvoicePayments = async (
  tenantId: string,
  invoiceId: string
): Promise<InvoicingInvoicePaymentRow[]> => {
  const invoice = await getInvoiceById(tenantId, invoiceId);
  if (!invoice) return [];
  const relatedInvoices = await listInvoicesByDocumentNumber(tenantId, invoice.documentNumber);
  const invoiceIds = relatedInvoices.map((row) => row.id);
  if (invoiceIds.length === 0) return [];

  if (isMysql()) {
    const rows = await mysqlDb()
      .select()
      .from(mysql.invoicingInvoicePayments)
      .where(
        and(
          eq(mysql.invoicingInvoicePayments.tenantId, tenantId),
          inArray(mysql.invoicingInvoicePayments.invoiceId, invoiceIds)
        )
      )
      .orderBy(mysql.invoicingInvoicePayments.createdAt);
    return rows.map(mapInvoicePaymentRow);
  }

  const rows = await pgDb()
    .select()
    .from(pg.invoicingInvoicePayments)
    .where(
      and(
        eq(pg.invoicingInvoicePayments.tenantId, tenantId),
        inArray(pg.invoicingInvoicePayments.invoiceId, invoiceIds)
      )
    )
    .orderBy(pg.invoicingInvoicePayments.createdAt);
  return rows.map(mapInvoicePaymentRow);
};

export type InvoicingTenantPaymentListItem = {
  id: string;
  invoiceId: string;
  amountMinor: number;
  paymentDate: string;
  reference: string | null;
  note: string;
  revisedInvoiceId: string | null;
  createdAt: Date;
  invoiceDocumentNumber: string;
  invoiceDisplayDocumentNumber: string;
  invoiceCustomerName: string | null;
  invoiceCurrencyCode: string;
  invoiceStatus: InvoicingInvoiceStatus;
};

const mapTenantPaymentListItem = (
  payment: InvoicingInvoicePaymentRow,
  invoice: InvoicingInvoiceRow
): InvoicingTenantPaymentListItem => ({
  id: payment.id,
  invoiceId: payment.invoiceId,
  amountMinor: payment.amountMinor,
  paymentDate: payment.paymentDate,
  reference: payment.reference,
  note: payment.note,
  revisedInvoiceId: payment.revisedInvoiceId,
  createdAt: payment.createdAt,
  invoiceDocumentNumber: invoice.documentNumber,
  invoiceDisplayDocumentNumber: formatInvoicingInvoiceDisplayNumber(invoice.documentNumber, invoice.revision),
  invoiceCustomerName: invoice.customerSnapshot.organizationName?.trim() || null,
  invoiceCurrencyCode: invoice.currencyCode,
  invoiceStatus: invoice.status
});

export const listTenantInvoicePayments = async (
  tenantId: string,
  query: { q?: string; limit?: number; offset?: number }
): Promise<{ items: InvoicingTenantPaymentListItem[]; total: number }> => {
  const limit = query.limit ?? 50;
  const offset = query.offset ?? 0;
  const q = query.q?.trim().toLowerCase();

  if (isMysql()) {
    const rows = await mysqlDb()
      .select({
        payment: mysql.invoicingInvoicePayments,
        invoice: mysql.invoicingInvoices
      })
      .from(mysql.invoicingInvoicePayments)
      .innerJoin(
        mysql.invoicingInvoices,
        eq(mysql.invoicingInvoicePayments.invoiceId, mysql.invoicingInvoices.id)
      )
      .where(eq(mysql.invoicingInvoicePayments.tenantId, tenantId))
      .orderBy(desc(mysql.invoicingInvoicePayments.paymentDate), desc(mysql.invoicingInvoicePayments.createdAt));

    const mapped = await Promise.all(
      rows.map(async ({ payment, invoice }) =>
        mapTenantPaymentListItem(mapInvoicePaymentRow(payment), await openInvoiceRow(tenantId, invoice))
      )
    );
    const filtered = q
      ? mapped.filter((row) => {
          const haystack = [
            row.reference,
            row.invoiceDocumentNumber,
            row.invoiceDisplayDocumentNumber,
            row.invoiceCustomerName,
            row.note
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return haystack.includes(q);
        })
      : mapped;
    return { items: filtered.slice(offset, offset + limit), total: filtered.length };
  }

  const rows = await pgDb()
    .select({
      payment: pg.invoicingInvoicePayments,
      invoice: pg.invoicingInvoices
    })
    .from(pg.invoicingInvoicePayments)
    .innerJoin(pg.invoicingInvoices, eq(pg.invoicingInvoicePayments.invoiceId, pg.invoicingInvoices.id))
    .where(eq(pg.invoicingInvoicePayments.tenantId, tenantId))
    .orderBy(desc(pg.invoicingInvoicePayments.paymentDate), desc(pg.invoicingInvoicePayments.createdAt));

  const mapped = await Promise.all(
    rows.map(async ({ payment, invoice }) =>
      mapTenantPaymentListItem(mapInvoicePaymentRow(payment), await openInvoiceRow(tenantId, invoice))
    )
  );
  const filtered = q
    ? mapped.filter((row) => {
        const haystack = [
          row.reference,
          row.invoiceDocumentNumber,
          row.invoiceDisplayDocumentNumber,
          row.invoiceCustomerName,
          row.note
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      })
    : mapped;
  return { items: filtered.slice(offset, offset + limit), total: filtered.length };
};

const insertInvoicePaymentRow = async (input: {
  tenantId: string;
  invoiceId: string;
  amountMinor: number;
  paymentDate: string;
  reference?: string | null;
  note?: string;
  revisedInvoiceId?: string | null;
  userId: string | null;
}): Promise<string> => {
  const paymentId = randomUUID();
  const now = new Date();
  const values = {
    id: paymentId,
    tenantId: input.tenantId,
    invoiceId: input.invoiceId,
    amountMinor: input.amountMinor,
    paymentDate: input.paymentDate,
    reference: input.reference?.trim() || null,
    note: input.note?.trim() ?? "",
    revisedInvoiceId: input.revisedInvoiceId ?? null,
    createdByUserId: input.userId,
    createdAt: now
  };
  if (isMysql()) {
    await mysqlDb().insert(mysql.invoicingInvoicePayments).values({
      ...values,
      paymentDate: dateForDb(values.paymentDate)!
    });
  } else {
    await pgDb().insert(pg.invoicingInvoicePayments).values({
      ...values,
      paymentDate: values.paymentDate
    });
  }
  return paymentId;
};

const createInvoiceRevisionAfterPartialPayment = async (
  tenantId: string,
  sourceInvoice: InvoicingInvoiceRow,
  payment: Pick<InvoicingRegisterInvoicePaymentInput, "amountMinor" | "paymentDate" | "reference">,
  userId: string | null
): Promise<{ invoiceId: string; revision: string }> => {
  const sourceLines = await listInvoiceLineItems(tenantId, sourceInvoice.id);
  const maxSort = sourceLines.reduce((max, line) => Math.max(max, line.sortOrder), -1);
  const creditMinor = -payment.amountMinor;
  const paymentLine: InvoiceRevisionLineInsert = {
    sortOrder: maxSort + 1,
    catalogItemId: null,
    lineKind: "payment",
    description: formatInvoicingPaymentCreditLineDescription(payment),
    sku: null,
    quantity: 1,
    unitLabel: "payment",
    unitPriceMinor: creditMinor,
    discountMinor: 0,
    taxRateBps: 0,
    lineSubtotalMinor: creditMinor,
    lineTaxMinor: 0,
    lineTotalMinor: creditMinor
  };
  return createInvoiceRevisionWithExtraLines(tenantId, sourceInvoice, userId, {
    anchorDate: payment.paymentDate,
    extraLines: [paymentLine]
  });
};

export const registerInvoicePayment = async (
  tenantId: string,
  invoiceId: string,
  userId: string | null,
  input: InvoicingRegisterInvoicePaymentInput
): Promise<RegisterInvoicePaymentResult | null> => {
  const invoice = await getInvoiceById(tenantId, invoiceId);
  if (!invoice || !canRegisterInvoicePayment(invoice.status)) return null;
  if (input.amountMinor > invoice.totalIncludingTaxMinor) return null;
  if (invoice.totalIncludingTaxMinor <= 0) return null;

  const now = new Date();
  const isFullPayment = input.amountMinor === invoice.totalIncludingTaxMinor;

  if (isFullPayment) {
    const paymentId = await insertInvoicePaymentRow({
      tenantId,
      invoiceId,
      amountMinor: input.amountMinor,
      paymentDate: input.paymentDate,
      reference: input.reference,
      note: input.note,
      userId
    });
    const patch = {
      status: "invoice_paid" as const,
      updatedByUserId: userId,
      updatedAt: now
    };
    if (isMysql()) {
      await mysqlDb()
        .update(mysql.invoicingInvoices)
        .set(patch)
        .where(and(eq(mysql.invoicingInvoices.tenantId, tenantId), eq(mysql.invoicingInvoices.id, invoiceId)));
    } else {
      await pgDb()
        .update(pg.invoicingInvoices)
        .set(patch)
        .where(and(eq(pg.invoicingInvoices.tenantId, tenantId), eq(pg.invoicingInvoices.id, invoiceId)));
    }
    await insertInvoicingAuditEvent({
      tenantId,
      eventKind: "invoice_payment_registered",
      documentKind: "invoice",
      documentId: invoiceId,
      actorUserId: userId,
      payload: {
        paymentId,
        amountMinor: input.amountMinor,
        paymentDate: input.paymentDate,
        reference: input.reference ?? null,
        note: input.note?.trim() || null,
        outcome: "full"
      }
    });
    return { outcome: "full", paymentId, invoiceId };
  }

  const paymentId = await insertInvoicePaymentRow({
    tenantId,
    invoiceId,
    amountMinor: input.amountMinor,
    paymentDate: input.paymentDate,
    reference: input.reference,
    note: input.note,
    userId
  });

  const partialPatch = {
    status: "invoice_partially_paid" as const,
    updatedByUserId: userId,
    updatedAt: now
  };
  if (isMysql()) {
    await mysqlDb()
      .update(mysql.invoicingInvoices)
      .set(partialPatch)
      .where(and(eq(mysql.invoicingInvoices.tenantId, tenantId), eq(mysql.invoicingInvoices.id, invoiceId)));
  } else {
    await pgDb()
      .update(pg.invoicingInvoices)
      .set(partialPatch)
      .where(and(eq(pg.invoicingInvoices.tenantId, tenantId), eq(pg.invoicingInvoices.id, invoiceId)));
  }

  const { invoiceId: revisedInvoiceId, revision } = await createInvoiceRevisionAfterPartialPayment(
    tenantId,
    invoice,
    input,
    userId
  );

  if (isMysql()) {
    await mysqlDb()
      .update(mysql.invoicingInvoicePayments)
      .set({ revisedInvoiceId })
      .where(
        and(eq(mysql.invoicingInvoicePayments.tenantId, tenantId), eq(mysql.invoicingInvoicePayments.id, paymentId))
      );
  } else {
    await pgDb()
      .update(pg.invoicingInvoicePayments)
      .set({ revisedInvoiceId })
      .where(and(eq(pg.invoicingInvoicePayments.tenantId, tenantId), eq(pg.invoicingInvoicePayments.id, paymentId)));
  }

  const auditClock = createInvoicingAuditEventClock(now);
  await insertInvoicingAuditEvent({
    tenantId,
    eventKind: "invoice_payment_registered",
    documentKind: "invoice",
    documentId: invoiceId,
    actorUserId: userId,
    createdAt: auditClock.next(),
    payload: {
      paymentId,
      amountMinor: input.amountMinor,
      paymentDate: input.paymentDate,
      reference: input.reference ?? null,
      note: input.note?.trim() || null,
      outcome: "partial",
      revisedInvoiceId,
      revision
    }
  });
  await insertInvoicingAuditEvent({
    tenantId,
    eventKind: "invoice_payment_revision_created",
    documentKind: "invoice",
    documentId: revisedInvoiceId,
    actorUserId: userId,
    createdAt: auditClock.next(),
    payload: {
      sourceInvoiceId: invoice.id,
      revision,
      paymentAmountMinor: input.amountMinor
    }
  });

  return {
    outcome: "partial",
    paymentId,
    sourceInvoiceId: invoiceId,
    revisedInvoiceId,
    revision,
    displayDocumentNumber: formatInvoicingInvoiceDisplayNumber(invoice.documentNumber, revision)
  };
};

export type InvoicingAuditEventRow = {
  id: string;
  eventKind: string;
  documentKind: InvoicingDocumentKind;
  documentId: string;
  actorUserId: string | null;
  payload: Record<string, unknown>;
  createdAt: Date;
};

export type InvoicingAuditTrailSection = {
  key: string;
  title: string;
  subtitle: string | null;
  documentKind: InvoicingDocumentKind;
  documentId: string;
  pathSegment: string | null;
  isCurrent: boolean;
  events: InvoicingAuditEventRow[];
};

const mapInvoicingAuditEventRow = async (
  tenantId: string,
  row: {
    id: string;
    eventKind: string;
    documentKind: string;
    documentId: string;
    actorUserId: string | null;
    payloadJson: string;
    createdAt: Date;
  }
): Promise<InvoicingAuditEventRow> => {
  const plain = await openInvoicingRow(
    INVOICING_AUDIT_EVENTS_TABLE_KEY,
    tenantId,
    row as Record<string, unknown>,
    (p) => p
  );
  return {
    id: row.id,
    eventKind: row.eventKind,
    documentKind: row.documentKind as InvoicingDocumentKind,
    documentId: row.documentId,
    actorUserId: row.actorUserId,
    payload: parseInvoicingJson<Record<string, unknown>>(String(plain.payloadJson ?? row.payloadJson), {}),
    createdAt: row.createdAt
  };
};

export const listInvoicingAuditEventsForDocument = async (
  tenantId: string,
  documentKind: InvoicingDocumentKind,
  documentId: string
): Promise<InvoicingAuditEventRow[]> => {
  if (isMysql()) {
    const rows = await mysqlDb()
      .select()
      .from(mysql.invoicingAuditEvents)
      .where(
        and(
          eq(mysql.invoicingAuditEvents.tenantId, tenantId),
          eq(mysql.invoicingAuditEvents.documentKind, documentKind),
          eq(mysql.invoicingAuditEvents.documentId, documentId)
        )
      )
      .orderBy(desc(mysql.invoicingAuditEvents.createdAt));
    return Promise.all(rows.map((row) => mapInvoicingAuditEventRow(tenantId, row))).then((events) =>
      events.sort(compareInvoicingAuditEventsByRecency)
    );
  }
  const rows = await pgDb()
    .select()
    .from(pg.invoicingAuditEvents)
    .where(
      and(
        eq(pg.invoicingAuditEvents.tenantId, tenantId),
        eq(pg.invoicingAuditEvents.documentKind, documentKind),
        eq(pg.invoicingAuditEvents.documentId, documentId)
      )
    )
    .orderBy(desc(pg.invoicingAuditEvents.createdAt));
  return Promise.all(rows.map((row) => mapInvoicingAuditEventRow(tenantId, row))).then((events) =>
    events.sort(compareInvoicingAuditEventsByRecency)
  );
};

const listOffersByDocumentNumber = async (
  tenantId: string,
  documentNumber: string
): Promise<InvoicingOfferRow[]> => {
  if (isMysql()) {
    const rows = await mysqlDb()
      .select()
      .from(mysql.invoicingOffers)
      .where(
        and(eq(mysql.invoicingOffers.tenantId, tenantId), eq(mysql.invoicingOffers.documentNumber, documentNumber))
      );
    return Promise.all(rows.map((row) => openOfferRow(tenantId, row)));
  }
  const rows = await pgDb()
    .select()
    .from(pg.invoicingOffers)
    .where(and(eq(pg.invoicingOffers.tenantId, tenantId), eq(pg.invoicingOffers.documentNumber, documentNumber)));
  return Promise.all(rows.map((row) => openOfferRow(tenantId, row)));
};

export const findOfferBySourceQuoteId = async (
  tenantId: string,
  sourceQuoteId: string
): Promise<InvoicingOfferRow | undefined> => {
  if (isMysql()) {
    const rows = await mysqlDb()
      .select()
      .from(mysql.invoicingOffers)
      .where(
        and(eq(mysql.invoicingOffers.tenantId, tenantId), eq(mysql.invoicingOffers.sourceQuoteId, sourceQuoteId))
      )
      .orderBy(desc(mysql.invoicingOffers.createdAt))
      .limit(1);
    const row = rows[0];
    return row ? await openOfferRow(tenantId, row) : undefined;
  }
  const rows = await pgDb()
    .select()
    .from(pg.invoicingOffers)
    .where(and(eq(pg.invoicingOffers.tenantId, tenantId), eq(pg.invoicingOffers.sourceQuoteId, sourceQuoteId)))
    .orderBy(desc(pg.invoicingOffers.createdAt))
    .limit(1);
  const row = rows[0];
  return row ? await openOfferRow(tenantId, row) : undefined;
};

export const findInvoiceBySourceQuoteId = async (
  tenantId: string,
  sourceQuoteId: string
): Promise<InvoicingInvoiceRow | undefined> => {
  if (isMysql()) {
    const rows = await mysqlDb()
      .select()
      .from(mysql.invoicingInvoices)
      .where(
        and(eq(mysql.invoicingInvoices.tenantId, tenantId), eq(mysql.invoicingInvoices.sourceQuoteId, sourceQuoteId))
      )
      .orderBy(desc(mysql.invoicingInvoices.createdAt))
      .limit(1);
    const row = rows[0];
    return row ? await openInvoiceRow(tenantId, row) : undefined;
  }
  const rows = await pgDb()
    .select()
    .from(pg.invoicingInvoices)
    .where(and(eq(pg.invoicingInvoices.tenantId, tenantId), eq(pg.invoicingInvoices.sourceQuoteId, sourceQuoteId)))
    .orderBy(desc(pg.invoicingInvoices.createdAt))
    .limit(1);
  const row = rows[0];
  return row ? await openInvoiceRow(tenantId, row) : undefined;
};

const listInvoicesBySourceOfferId = async (
  tenantId: string,
  sourceOfferId: string
): Promise<InvoicingInvoiceRow[]> => {
  if (isMysql()) {
    const rows = await mysqlDb()
      .select()
      .from(mysql.invoicingInvoices)
      .where(
        and(eq(mysql.invoicingInvoices.tenantId, tenantId), eq(mysql.invoicingInvoices.sourceOfferId, sourceOfferId))
      )
      .orderBy(desc(mysql.invoicingInvoices.createdAt));
    return Promise.all(rows.map((row) => openInvoiceRow(tenantId, row)));
  }
  const rows = await pgDb()
    .select()
    .from(pg.invoicingInvoices)
    .where(and(eq(pg.invoicingInvoices.tenantId, tenantId), eq(pg.invoicingInvoices.sourceOfferId, sourceOfferId)))
    .orderBy(desc(pg.invoicingInvoices.createdAt));
  return Promise.all(rows.map((row) => openInvoiceRow(tenantId, row)));
};

export const findInvoiceBySourceOfferId = async (
  tenantId: string,
  sourceOfferId: string
): Promise<InvoicingInvoiceRow | undefined> => {
  const rows = await listInvoicesBySourceOfferId(tenantId, sourceOfferId);
  return rows[0];
};

const findQuoteBySourceOfferId = async (
  tenantId: string,
  sourceOfferId: string
): Promise<InvoicingQuoteRow | undefined> => {
  if (isMysql()) {
    const rows = await mysqlDb()
      .select()
      .from(mysql.invoicingQuotes)
      .where(
        and(eq(mysql.invoicingQuotes.tenantId, tenantId), eq(mysql.invoicingQuotes.sourceOfferId, sourceOfferId))
      )
      .orderBy(desc(mysql.invoicingQuotes.createdAt))
      .limit(1);
    const row = rows[0];
    return row ? await openQuoteRow(tenantId, row) : undefined;
  }
  const rows = await pgDb()
    .select()
    .from(pg.invoicingQuotes)
    .where(and(eq(pg.invoicingQuotes.tenantId, tenantId), eq(pg.invoicingQuotes.sourceOfferId, sourceOfferId)))
    .orderBy(desc(pg.invoicingQuotes.createdAt))
    .limit(1);
  const row = rows[0];
  return row ? await openQuoteRow(tenantId, row) : undefined;
};

const findQuoteBySourceInvoiceId = async (
  tenantId: string,
  sourceInvoiceId: string
): Promise<InvoicingQuoteRow | undefined> => {
  const row = isMysql()
    ? (
        await mysqlDb()
          .select({ id: mysql.invoicingQuotes.id })
          .from(mysql.invoicingQuotes)
          .where(
            and(
              eq(mysql.invoicingQuotes.tenantId, tenantId),
              eq(mysql.invoicingQuotes.sourceInvoiceId, sourceInvoiceId)
            )
          )
          .orderBy(desc(mysql.invoicingQuotes.createdAt))
          .limit(1)
      )[0]
    : (
        await pgDb()
          .select({ id: pg.invoicingQuotes.id })
          .from(pg.invoicingQuotes)
          .where(
            and(eq(pg.invoicingQuotes.tenantId, tenantId), eq(pg.invoicingQuotes.sourceInvoiceId, sourceInvoiceId))
          )
          .orderBy(desc(pg.invoicingQuotes.createdAt))
          .limit(1)
      )[0];
  if (!row) return undefined;
  return getQuoteById(tenantId, row.id);
};

const quoteDisplayLabel = (quote: InvoicingQuoteRow): string =>
  quote.documentNumber ?? quote.temporaryReference ?? quote.id.slice(0, 8);

const buildAuditTrailSection = async (
  tenantId: string,
  input: {
    key: string;
    title: string;
    subtitle: string | null;
    documentKind: InvoicingDocumentKind;
    documentId: string;
    isCurrent: boolean;
  }
): Promise<InvoicingAuditTrailSection> => ({
  ...input,
  pathSegment: input.isCurrent ? null : `${input.documentKind === "quote" ? "quotes" : input.documentKind === "offer" ? "offers" : "invoices"}/${input.documentId}`,
  events: await listInvoicingAuditEventsForDocument(tenantId, input.documentKind, input.documentId)
});

export const buildInvoicingDocumentAuditTrail = async (
  tenantId: string,
  documentKind: InvoicingDocumentKind,
  documentId: string
): Promise<InvoicingAuditTrailSection[] | null> => {
  if (documentKind === "offer") {
    return buildInvoicingOfferAuditTrail(tenantId, documentId);
  }
  if (documentKind === "quote") {
    return buildInvoicingQuoteAuditTrail(tenantId, documentId);
  }
  return buildInvoicingInvoiceAuditTrail(tenantId, documentId);
};

const resolveOfferDocumentNumberForQuote = async (
  tenantId: string,
  quote: InvoicingQuoteRow
): Promise<string | null> => {
  if (quote.sourceOfferId) {
    const sourceOffer = await getOfferById(tenantId, quote.sourceOfferId);
    return sourceOffer?.documentNumber ?? null;
  }
  if (quote.sourceInvoiceId) {
    const sourceInvoice = await getInvoiceById(tenantId, quote.sourceInvoiceId);
    if (!sourceInvoice?.sourceOfferId) return null;
    const sourceOffer = await getOfferById(tenantId, sourceInvoice.sourceOfferId);
    return sourceOffer?.documentNumber ?? null;
  }
  return null;
};

const buildInvoicingQuoteAuditTrail = async (
  tenantId: string,
  quoteId: string
): Promise<InvoicingAuditTrailSection[] | null> => {
  const quote = await getQuoteById(tenantId, quoteId);
  if (!quote) return null;

  const offerDocumentNumber = await resolveOfferDocumentNumberForQuote(tenantId, quote);
  if (offerDocumentNumber) {
    return buildInvoicingOfferChainAuditTrail(tenantId, offerDocumentNumber, {
      currentOfferId: null,
      currentInvoiceId: null,
      currentQuoteId: quoteId
    });
  }

  if (quote.sourceInvoiceId) {
    const sourceInvoice = await getInvoiceById(tenantId, quote.sourceInvoiceId);
    const sections: InvoicingAuditTrailSection[] = [];
    if (sourceInvoice?.sourceQuoteId) {
      const sourceQuote = await getQuoteById(tenantId, sourceInvoice.sourceQuoteId);
      if (sourceQuote) {
        sections.push(
          await buildAuditTrailSection(tenantId, {
            key: `quote-source-${sourceQuote.id}`,
            title: quoteDisplayLabel(sourceQuote),
            subtitle: "Source quote",
            documentKind: "quote",
            documentId: sourceQuote.id,
            isCurrent: false
          })
        );
      }
    }
    if (sourceInvoice) {
      sections.push(
        await buildAuditTrailSection(tenantId, {
          key: `invoice-source-${sourceInvoice.id}`,
          title: formatInvoicingInvoiceDisplayNumber(sourceInvoice.documentNumber, sourceInvoice.revision),
          subtitle: "Source invoice",
          documentKind: "invoice",
          documentId: sourceInvoice.id,
          isCurrent: false
        })
      );
    }
    sections.push(
      await buildAuditTrailSection(tenantId, {
        key: `quote-${quoteId}`,
        title: quoteDisplayLabel(quote),
        subtitle: "Quote after invoice demotion",
        documentKind: "quote",
        documentId: quoteId,
        isCurrent: true
      })
    );
    return sections;
  }

  return [
    await buildAuditTrailSection(tenantId, {
      key: `quote-${quoteId}`,
      title: quoteDisplayLabel(quote),
      subtitle: "Quote",
      documentKind: "quote",
      documentId: quoteId,
      isCurrent: true
    })
  ];
};

const buildInvoicingInvoiceAuditTrail = async (
  tenantId: string,
  invoiceId: string
): Promise<InvoicingAuditTrailSection[] | null> => {
  const invoice = await getInvoiceById(tenantId, invoiceId);
  if (!invoice) return null;
  if (invoice.sourceOfferId) {
    const sourceOffer = await getOfferById(tenantId, invoice.sourceOfferId);
    if (sourceOffer) {
      return buildInvoicingOfferChainAuditTrail(tenantId, sourceOffer.documentNumber, {
        currentOfferId: null,
        currentInvoiceId: invoiceId,
        currentQuoteId: null
      });
    }
  }

  const relatedInvoices = await listInvoicesByDocumentNumber(tenantId, invoice.documentNumber);
  if (relatedInvoices.length > 1) {
    relatedInvoices.sort((a, b) => compareInvoicingRevisions(a.revision, b.revision));
    const sections: InvoicingAuditTrailSection[] = [];
    for (const relatedInvoice of relatedInvoices) {
      sections.push(
        await buildAuditTrailSection(tenantId, {
          key: `invoice-${relatedInvoice.id}`,
          title: formatInvoicingInvoiceDisplayNumber(relatedInvoice.documentNumber, relatedInvoice.revision),
          subtitle:
            relatedInvoice.id === invoiceId
              ? relatedInvoice.sourceInvoiceId
                ? "Current invoice revision"
                : "Current invoice"
              : relatedInvoice.status === "invoice_partially_paid"
                ? "Partially paid invoice"
                : relatedInvoice.sourceInvoiceId
                  ? "Historic invoice revision"
                  : "Invoice",
          documentKind: "invoice",
          documentId: relatedInvoice.id,
          isCurrent: relatedInvoice.id === invoiceId
        })
      );
    }
    return sections;
  }

  const sections: InvoicingAuditTrailSection[] = [
    await buildAuditTrailSection(tenantId, {
      key: `invoice-${invoiceId}`,
      title: formatInvoicingInvoiceDisplayNumber(invoice.documentNumber, invoice.revision),
      subtitle: "Invoice",
      documentKind: "invoice",
      documentId: invoiceId,
      isCurrent: true
    })
  ];
  if (invoice.sourceQuoteId) {
    const sourceQuote = await getQuoteById(tenantId, invoice.sourceQuoteId);
    if (sourceQuote) {
      sections.push(
        await buildAuditTrailSection(tenantId, {
          key: `quote-source-${invoice.sourceQuoteId}`,
          title: quoteDisplayLabel(sourceQuote),
          subtitle: "Source quote",
          documentKind: "quote",
          documentId: invoice.sourceQuoteId,
          isCurrent: false
        })
      );
    }
  }
  return sections;
};

type InvoicingOfferChainAuditFocus = {
  currentOfferId: string | null;
  currentInvoiceId: string | null;
  currentQuoteId: string | null;
};

const quoteChainSubtitle = (quote: InvoicingQuoteRow, focus: InvoicingOfferChainAuditFocus): string => {
  if (quote.id === focus.currentQuoteId) {
    if (quote.sourceInvoiceId) return "Current quote after invoice demotion";
    if (quote.sourceOfferId) return "Current quote after offer demotion";
    return "Current quote";
  }
  if (quote.sourceInvoiceId) return "Quote after invoice demotion";
  if (quote.sourceOfferId) return "Quote after offer demotion";
  return "Source quote";
};

const appendQuoteAuditSection = async (
  tenantId: string,
  sections: InvoicingAuditTrailSection[],
  seenQuoteIds: Set<string>,
  quote: InvoicingQuoteRow,
  focus: InvoicingOfferChainAuditFocus
): Promise<void> => {
  if (seenQuoteIds.has(quote.id)) return;
  seenQuoteIds.add(quote.id);
  sections.push(
    await buildAuditTrailSection(tenantId, {
      key: `quote-${quote.id}`,
      title: quoteDisplayLabel(quote),
      subtitle: quoteChainSubtitle(quote, focus),
      documentKind: "quote",
      documentId: quote.id,
      isCurrent: quote.id === focus.currentQuoteId
    })
  );
};

const buildInvoicingOfferChainAuditTrail = async (
  tenantId: string,
  offerDocumentNumber: string,
  focus: InvoicingOfferChainAuditFocus
): Promise<InvoicingAuditTrailSection[]> => {
  const relatedOffers = await listOffersByDocumentNumber(tenantId, offerDocumentNumber);
  relatedOffers.sort((a, b) => compareInvoicingRevisions(a.revision, b.revision));

  const sections: InvoicingAuditTrailSection[] = [];
  const seenQuoteIds = new Set<string>();

  for (const relatedOffer of relatedOffers) {
    if (relatedOffer.sourceQuoteId) {
      const sourceQuote = await getQuoteById(tenantId, relatedOffer.sourceQuoteId);
      if (sourceQuote) {
        await appendQuoteAuditSection(tenantId, sections, seenQuoteIds, sourceQuote, focus);
      }
    }

    sections.push(
      await buildAuditTrailSection(tenantId, {
        key: `offer-${relatedOffer.id}`,
        title: formatInvoicingOfferDisplayNumber(relatedOffer.documentNumber, relatedOffer.revision),
        subtitle:
          relatedOffer.id === focus.currentOfferId ? "Current offer revision" : "Historic offer revision",
        documentKind: "offer",
        documentId: relatedOffer.id,
        isCurrent: relatedOffer.id === focus.currentOfferId
      })
    );

    const invoices = await listInvoicesBySourceOfferId(tenantId, relatedOffer.id);
    for (const relatedInvoice of invoices) {
      sections.push(
        await buildAuditTrailSection(tenantId, {
          key: `invoice-${relatedInvoice.id}`,
          title: formatInvoicingInvoiceDisplayNumber(relatedInvoice.documentNumber, relatedInvoice.revision),
          subtitle:
            relatedInvoice.id === focus.currentInvoiceId
              ? relatedInvoice.sourceInvoiceId
                ? "Current invoice revision"
                : "Current invoice"
              : relatedInvoice.status === "invoice_demoted"
                ? "Demoted invoice"
                : relatedInvoice.status === "invoice_partially_paid"
                  ? "Partially paid invoice"
                  : relatedInvoice.sourceInvoiceId
                    ? "Historic invoice revision"
                    : "Invoice",
          documentKind: "invoice",
          documentId: relatedInvoice.id,
          isCurrent: relatedInvoice.id === focus.currentInvoiceId
        })
      );

      const invoiceDemotedQuote = await findQuoteBySourceInvoiceId(tenantId, relatedInvoice.id);
      if (invoiceDemotedQuote) {
        await appendQuoteAuditSection(tenantId, sections, seenQuoteIds, invoiceDemotedQuote, focus);
      }
    }

    const offerDemotedQuote = await findQuoteBySourceOfferId(tenantId, relatedOffer.id);
    if (offerDemotedQuote && !offerDemotedQuote.sourceInvoiceId) {
      await appendQuoteAuditSection(tenantId, sections, seenQuoteIds, offerDemotedQuote, focus);
    }
  }

  return sections;
};

export const buildInvoicingOfferAuditTrail = async (
  tenantId: string,
  offerId: string
): Promise<InvoicingAuditTrailSection[] | null> => {
  const offer = await getOfferById(tenantId, offerId);
  if (!offer) return null;
  return buildInvoicingOfferChainAuditTrail(tenantId, offer.documentNumber, {
    currentOfferId: offerId,
    currentInvoiceId: null,
    currentQuoteId: null
  });
};

export const resolveInvoicingAuditActorLabels = async (
  events: InvoicingAuditEventRow[]
): Promise<Map<string, string | null>> => {
  const actorIds = [...new Set(events.map((e) => e.actorUserId).filter((id): id is string => Boolean(id)))];
  const labels = new Map<string, string | null>();
  await Promise.all(
    actorIds.map(async (actorId) => {
      labels.set(actorId, await getUserDisplayLabelById(actorId));
    })
  );
  return labels;
};

export type InvoicingDocumentsPurgeResult = {
  deletedQuotes: number;
  deletedOffers: number;
  deletedInvoices: number;
  deletedAuditEvents: number;
  resetNumberSequences: boolean;
};

/** Removes all quotes, offers, invoices, related audit events, and numbering sequences for a tenant (testing). */
export const purgeInvoicingDocumentsForTenant = async (
  tenantId: string
): Promise<InvoicingDocumentsPurgeResult> => {
  const documentKinds: InvoicingDocumentKind[] = ["quote", "offer", "invoice"];

  if (isMysql()) {
    const db = mysqlDb();
    const [invoiceRow] = await db
      .select({ value: count() })
      .from(mysql.invoicingInvoices)
      .where(eq(mysql.invoicingInvoices.tenantId, tenantId));
    const [offerRow] = await db
      .select({ value: count() })
      .from(mysql.invoicingOffers)
      .where(eq(mysql.invoicingOffers.tenantId, tenantId));
    const [quoteRow] = await db
      .select({ value: count() })
      .from(mysql.invoicingQuotes)
      .where(eq(mysql.invoicingQuotes.tenantId, tenantId));
    const [auditRow] = await db
      .select({ value: count() })
      .from(mysql.invoicingAuditEvents)
      .where(
        and(
          eq(mysql.invoicingAuditEvents.tenantId, tenantId),
          inArray(mysql.invoicingAuditEvents.documentKind, documentKinds)
        )
      );

    await db.delete(mysql.invoicingInvoices).where(eq(mysql.invoicingInvoices.tenantId, tenantId));
    await db.delete(mysql.invoicingOffers).where(eq(mysql.invoicingOffers.tenantId, tenantId));
    await db.delete(mysql.invoicingQuotes).where(eq(mysql.invoicingQuotes.tenantId, tenantId));
    await db
      .delete(mysql.invoicingAuditEvents)
      .where(
        and(
          eq(mysql.invoicingAuditEvents.tenantId, tenantId),
          inArray(mysql.invoicingAuditEvents.documentKind, documentKinds)
        )
      );
    await db
      .delete(mysql.invoicingNumberSequences)
      .where(eq(mysql.invoicingNumberSequences.tenantId, tenantId));

    return {
      deletedQuotes: quoteRow?.value ?? 0,
      deletedOffers: offerRow?.value ?? 0,
      deletedInvoices: invoiceRow?.value ?? 0,
      deletedAuditEvents: auditRow?.value ?? 0,
      resetNumberSequences: true
    };
  }

  const db = pgDb();
  const [invoiceRow] = await db
    .select({ value: count() })
    .from(pg.invoicingInvoices)
    .where(eq(pg.invoicingInvoices.tenantId, tenantId));
  const [offerRow] = await db
    .select({ value: count() })
    .from(pg.invoicingOffers)
    .where(eq(pg.invoicingOffers.tenantId, tenantId));
  const [quoteRow] = await db
    .select({ value: count() })
    .from(pg.invoicingQuotes)
    .where(eq(pg.invoicingQuotes.tenantId, tenantId));
  const [auditRow] = await db
    .select({ value: count() })
    .from(pg.invoicingAuditEvents)
    .where(
      and(
        eq(pg.invoicingAuditEvents.tenantId, tenantId),
        inArray(pg.invoicingAuditEvents.documentKind, documentKinds)
      )
    );

  await db.delete(pg.invoicingInvoices).where(eq(pg.invoicingInvoices.tenantId, tenantId));
  await db.delete(pg.invoicingOffers).where(eq(pg.invoicingOffers.tenantId, tenantId));
  await db.delete(pg.invoicingQuotes).where(eq(pg.invoicingQuotes.tenantId, tenantId));
  await db
    .delete(pg.invoicingAuditEvents)
    .where(
      and(
        eq(pg.invoicingAuditEvents.tenantId, tenantId),
        inArray(pg.invoicingAuditEvents.documentKind, documentKinds)
      )
    );
  await db.delete(pg.invoicingNumberSequences).where(eq(pg.invoicingNumberSequences.tenantId, tenantId));

  return {
    deletedQuotes: quoteRow?.value ?? 0,
    deletedOffers: offerRow?.value ?? 0,
    deletedInvoices: invoiceRow?.value ?? 0,
    deletedAuditEvents: auditRow?.value ?? 0,
    resetNumberSequences: true
  };
};

export type InvoicingLifecycleOfferTarget = { tenantId: string; offerId: string };

export type InvoicingLifecycleInvoiceTarget = { tenantId: string; invoiceId: string };

export type InvoicingLifecycleReminderTarget = {
  tenantId: string;
  invoiceId: string;
  reminderKind: InvoicingPaymentReminderKind;
};

const offerStatusesEligibleForExpiry: InvoicingOfferStatus[] = ["offer_draft", "offer_sent"];

export const listOffersDueForExpiry = async (limit: number): Promise<InvoicingLifecycleOfferTarget[]> => {
  const today = todayIso();
  const cap = Math.min(Math.max(1, limit), 1000);
  const todayDate = dateForDb(today)!;

  if (isMysql()) {
    const rows = await mysqlDb()
      .select({
        tenantId: mysql.invoicingOffers.tenantId,
        offerId: mysql.invoicingOffers.id
      })
      .from(mysql.invoicingOffers)
      .innerJoin(
        mysql.invoicingTenantConfiguration,
        eq(mysql.invoicingOffers.tenantId, mysql.invoicingTenantConfiguration.tenantId)
      )
      .where(
        and(
          inArray(mysql.invoicingOffers.status, offerStatusesEligibleForExpiry),
          isNotNull(mysql.invoicingOffers.offerExpiryDate),
          lt(mysql.invoicingOffers.offerExpiryDate, todayDate),
          eq(mysql.invoicingTenantConfiguration.autoExpireOffersEnabled, true)
        )
      )
      .limit(cap);
    return rows;
  }

  const rows = await pgDb()
    .select({
      tenantId: pg.invoicingOffers.tenantId,
      offerId: pg.invoicingOffers.id
    })
    .from(pg.invoicingOffers)
    .innerJoin(
      pg.invoicingTenantConfiguration,
      eq(pg.invoicingOffers.tenantId, pg.invoicingTenantConfiguration.tenantId)
    )
    .where(
      and(
        inArray(pg.invoicingOffers.status, offerStatusesEligibleForExpiry),
        isNotNull(pg.invoicingOffers.offerExpiryDate),
        lt(pg.invoicingOffers.offerExpiryDate, today),
        eq(pg.invoicingTenantConfiguration.autoExpireOffersEnabled, true)
      )
    )
    .limit(cap);
  return rows;
};

export const expireOfferById = async (
  tenantId: string,
  offerId: string
): Promise<{ expired: boolean; reason?: string }> => {
  const offer = await getOfferById(tenantId, offerId);
  if (!offer) return { expired: false, reason: "not_found" };
  if (!offerStatusesEligibleForExpiry.includes(offer.status)) {
    return { expired: false, reason: "ineligible_status" };
  }
  if (!isOfferPastValidity(offer.offerExpiryDate)) return { expired: false, reason: "not_past_validity" };
  const cfg = await getInvoicingConfiguration(tenantId);
  if (cfg && !cfg.autoExpireOffersEnabled) return { expired: false, reason: "disabled" };

  await setOfferStatus(tenantId, offerId, "offer_expired", null);
  await insertInvoicingAuditEvent({
    tenantId,
    eventKind: "offer_expired",
    documentKind: "offer",
    documentId: offerId,
    actorUserId: null,
    payload: { offerExpiryDate: offer.offerExpiryDate }
  });
  return { expired: true };
};

export const listInvoicesDueForOverdue = async (
  limit: number
): Promise<InvoicingLifecycleInvoiceTarget[]> => {
  const today = todayIso();
  const cap = Math.min(Math.max(1, limit), 1000);
  const todayDate = dateForDb(today)!;

  if (isMysql()) {
    const rows = await mysqlDb()
      .select({
        tenantId: mysql.invoicingInvoices.tenantId,
        invoiceId: mysql.invoicingInvoices.id
      })
      .from(mysql.invoicingInvoices)
      .where(
        and(
          eq(mysql.invoicingInvoices.status, "invoice_sent"),
          isNotNull(mysql.invoicingInvoices.dueDate),
          lt(mysql.invoicingInvoices.dueDate, todayDate),
          sql`${mysql.invoicingInvoices.totalIncludingTaxMinor} > 0`
        )
      )
      .limit(cap);
    return rows;
  }

  const rows = await pgDb()
    .select({
      tenantId: pg.invoicingInvoices.tenantId,
      invoiceId: pg.invoicingInvoices.id
    })
    .from(pg.invoicingInvoices)
    .where(
      and(
        eq(pg.invoicingInvoices.status, "invoice_sent"),
        isNotNull(pg.invoicingInvoices.dueDate),
        lt(pg.invoicingInvoices.dueDate, today),
        sql`${pg.invoicingInvoices.totalIncludingTaxMinor} > 0`
      )
    )
    .limit(cap);
  return rows;
};

export const markInvoiceOverdueById = async (
  tenantId: string,
  invoiceId: string
): Promise<{ marked: boolean; reason?: string }> => {
  const invoice = await getInvoiceById(tenantId, invoiceId);
  if (!invoice) return { marked: false, reason: "not_found" };
  if (invoice.status !== "invoice_sent") return { marked: false, reason: "ineligible_status" };
  if (!invoice.dueDate || invoice.dueDate >= todayIso()) return { marked: false, reason: "not_past_due" };
  if (invoice.totalIncludingTaxMinor <= 0) return { marked: false, reason: "no_balance" };

  const now = new Date();
  const patch = { status: "invoice_overdue" as const, updatedByUserId: null, updatedAt: now };
  if (isMysql()) {
    await mysqlDb()
      .update(mysql.invoicingInvoices)
      .set(patch)
      .where(and(eq(mysql.invoicingInvoices.tenantId, tenantId), eq(mysql.invoicingInvoices.id, invoiceId)));
  } else {
    await pgDb()
      .update(pg.invoicingInvoices)
      .set(patch)
      .where(and(eq(pg.invoicingInvoices.tenantId, tenantId), eq(pg.invoicingInvoices.id, invoiceId)));
  }

  await insertInvoicingAuditEvent({
    tenantId,
    eventKind: "invoice_marked_overdue",
    documentKind: "invoice",
    documentId: invoiceId,
    actorUserId: null,
    payload: { dueDate: invoice.dueDate }
  });
  return { marked: true };
};

const reminderAlreadySent = async (
  tenantId: string,
  invoiceId: string,
  reminderKind: InvoicingPaymentReminderKind
): Promise<boolean> => {
  if (isMysql()) {
    const rows = await mysqlDb()
      .select({ id: mysql.invoicingPaymentReminders.id })
      .from(mysql.invoicingPaymentReminders)
      .where(
        and(
          eq(mysql.invoicingPaymentReminders.tenantId, tenantId),
          eq(mysql.invoicingPaymentReminders.invoiceId, invoiceId),
          eq(mysql.invoicingPaymentReminders.reminderKind, reminderKind)
        )
      )
      .limit(1);
    return rows.length > 0;
  }
  const rows = await pgDb()
    .select({ id: pg.invoicingPaymentReminders.id })
    .from(pg.invoicingPaymentReminders)
    .where(
      and(
        eq(pg.invoicingPaymentReminders.tenantId, tenantId),
        eq(pg.invoicingPaymentReminders.invoiceId, invoiceId),
        eq(pg.invoicingPaymentReminders.reminderKind, reminderKind)
      )
    )
    .limit(1);
  return rows.length > 0;
};

export const listInvoicesDueForPaymentReminders = async (
  limit: number
): Promise<InvoicingLifecycleReminderTarget[]> => {
  const today = todayIso();
  const cap = Math.min(Math.max(1, limit), 1000);
  const targets: InvoicingLifecycleReminderTarget[] = [];

  const statuses: InvoicingInvoiceStatus[] = ["invoice_sent", "invoice_overdue"];

  if (isMysql()) {
    const rows = await mysqlDb()
      .select({
        tenantId: mysql.invoicingInvoices.tenantId,
        invoiceId: mysql.invoicingInvoices.id,
        dueDate: mysql.invoicingInvoices.dueDate,
        paymentReminderFirstOffsetDays: mysql.invoicingTenantConfiguration.paymentReminderFirstOffsetDays,
        paymentReminderSecondOffsetDays: mysql.invoicingTenantConfiguration.paymentReminderSecondOffsetDays,
        paymentRemindersEnabled: mysql.invoicingTenantConfiguration.paymentRemindersEnabled
      })
      .from(mysql.invoicingInvoices)
      .innerJoin(
        mysql.invoicingTenantConfiguration,
        eq(mysql.invoicingInvoices.tenantId, mysql.invoicingTenantConfiguration.tenantId)
      )
      .where(
        and(
          inArray(mysql.invoicingInvoices.status, statuses),
          isNotNull(mysql.invoicingInvoices.dueDate),
          eq(mysql.invoicingTenantConfiguration.paymentRemindersEnabled, true),
          sql`${mysql.invoicingInvoices.totalIncludingTaxMinor} > 0`
        )
      )
      .limit(cap * 2);

    for (const row of rows) {
      if (targets.length >= cap) break;
      const dueDate = isoDateOnly(row.dueDate);
      if (!dueDate || !row.paymentRemindersEnabled) continue;
      const offsets = resolveInvoicingReminderOffsets({
        paymentReminderFirstOffsetDays: row.paymentReminderFirstOffsetDays,
        paymentReminderSecondOffsetDays: row.paymentReminderSecondOffsetDays
      });
      for (const kind of ["first", "second"] as const) {
        const triggerDate = invoicingPaymentReminderTriggerDate(dueDate, kind, offsets);
        if (triggerDate > today) continue;
        if (await reminderAlreadySent(row.tenantId, row.invoiceId, kind)) continue;
        targets.push({ tenantId: row.tenantId, invoiceId: row.invoiceId, reminderKind: kind });
        if (targets.length >= cap) break;
      }
    }
    return targets;
  }

  const rows = await pgDb()
    .select({
      tenantId: pg.invoicingInvoices.tenantId,
      invoiceId: pg.invoicingInvoices.id,
      dueDate: pg.invoicingInvoices.dueDate,
      paymentReminderFirstOffsetDays: pg.invoicingTenantConfiguration.paymentReminderFirstOffsetDays,
      paymentReminderSecondOffsetDays: pg.invoicingTenantConfiguration.paymentReminderSecondOffsetDays,
      paymentRemindersEnabled: pg.invoicingTenantConfiguration.paymentRemindersEnabled
    })
    .from(pg.invoicingInvoices)
    .innerJoin(
      pg.invoicingTenantConfiguration,
      eq(pg.invoicingInvoices.tenantId, pg.invoicingTenantConfiguration.tenantId)
    )
    .where(
      and(
        inArray(pg.invoicingInvoices.status, statuses),
        isNotNull(pg.invoicingInvoices.dueDate),
        eq(pg.invoicingTenantConfiguration.paymentRemindersEnabled, true),
        sql`${pg.invoicingInvoices.totalIncludingTaxMinor} > 0`
      )
    )
    .limit(cap * 2);

  for (const row of rows) {
    if (targets.length >= cap) break;
    const dueDate = isoDateOnly(row.dueDate);
    if (!dueDate || !row.paymentRemindersEnabled) continue;
    const offsets = resolveInvoicingReminderOffsets({
      paymentReminderFirstOffsetDays: row.paymentReminderFirstOffsetDays,
      paymentReminderSecondOffsetDays: row.paymentReminderSecondOffsetDays
    });
    for (const kind of ["first", "second"] as const) {
      const triggerDate = invoicingPaymentReminderTriggerDate(dueDate, kind, offsets);
      if (triggerDate > today) continue;
      if (await reminderAlreadySent(row.tenantId, row.invoiceId, kind)) continue;
      targets.push({ tenantId: row.tenantId, invoiceId: row.invoiceId, reminderKind: kind });
      if (targets.length >= cap) break;
    }
  }
  return targets;
};

export type InvoicingPaymentReminderEmailPayload = {
  tenantId: string;
  invoiceId: string;
  reminderKind: InvoicingPaymentReminderKind;
  recipientEmail: string;
  documentNumber: string;
  displayDocumentNumber: string;
  dueDate: string;
  outstandingMinor: number;
  currencyCode: string;
  customerName: string;
};

/** Queue-safe job payload — no customer email or names in Redis/SQL job rows. */
export type InvoicingPaymentReminderEmailJobPayload = {
  tenantId: string;
  invoiceId: string;
  reminderKind: InvoicingPaymentReminderKind;
};

export const buildInvoicingPaymentReminderEmailPayload = async (
  tenantId: string,
  invoiceId: string,
  reminderKind: InvoicingPaymentReminderKind
): Promise<InvoicingPaymentReminderEmailPayload | null> => {
  const invoice = await getInvoiceById(tenantId, invoiceId);
  if (!invoice) return null;
  const recipientEmail = invoice.customerSnapshot.email?.trim() ?? "";
  if (!recipientEmail) return null;
  return {
    tenantId,
    invoiceId,
    reminderKind,
    recipientEmail,
    documentNumber: invoice.documentNumber,
    displayDocumentNumber: formatInvoicingInvoiceDisplayNumber(invoice.documentNumber, invoice.revision),
    dueDate: invoice.dueDate ?? "",
    outstandingMinor: invoice.totalIncludingTaxMinor,
    currencyCode: invoice.currencyCode,
    customerName: invoice.customerSnapshot.organizationName
  };
};

export const processInvoicingPaymentReminder = async (
  tenantId: string,
  invoiceId: string,
  reminderKind: InvoicingPaymentReminderKind
): Promise<{ sent: boolean; reason?: string; emailJob?: InvoicingPaymentReminderEmailJobPayload }> => {
  const invoice = await getInvoiceById(tenantId, invoiceId);
  if (!invoice) return { sent: false, reason: "not_found" };
  if (invoice.status !== "invoice_sent" && invoice.status !== "invoice_overdue") {
    return { sent: false, reason: "ineligible_status" };
  }
  if (!invoice.dueDate || invoice.totalIncludingTaxMinor <= 0) return { sent: false, reason: "no_balance" };

  const cfg = await getInvoicingConfiguration(tenantId);
  if (!cfg || !invoicingEmailMomentIsEnabled(cfg, "payment_reminder")) {
    return { sent: false, reason: "disabled" };
  }

  const offsets = resolveInvoicingReminderOffsets(cfg);
  const triggerDate = invoicingPaymentReminderTriggerDate(invoice.dueDate, reminderKind, offsets);
  if (triggerDate > todayIso()) return { sent: false, reason: "not_due" };
  if (await reminderAlreadySent(tenantId, invoiceId, reminderKind)) {
    return { sent: false, reason: "already_sent" };
  }

  const recipientEmail = invoice.customerSnapshot.email?.trim() ?? "";
  if (!recipientEmail) {
    await insertInvoicingAuditEvent({
      tenantId,
      eventKind: "invoice_payment_reminder_sent",
      documentKind: "invoice",
      documentId: invoiceId,
      actorUserId: null,
      payload: { reminderKind, skipped: true, reason: "no_customer_email" }
    });
    return { sent: false, reason: "no_customer_email" };
  }

  const reminderId = randomUUID();
  const now = new Date();
  if (isMysql()) {
    await mysqlDb().insert(mysql.invoicingPaymentReminders).values({
      id: reminderId,
      tenantId,
      invoiceId,
      reminderKind,
      recipientEmail,
      sentAt: now
    });
  } else {
    await pgDb().insert(pg.invoicingPaymentReminders).values({
      id: reminderId,
      tenantId,
      invoiceId,
      reminderKind,
      recipientEmail,
      sentAt: now
    });
  }

  await insertInvoicingAuditEvent({
    tenantId,
    eventKind: "invoice_payment_reminder_sent",
    documentKind: "invoice",
    documentId: invoiceId,
    actorUserId: null,
    payload: { reminderKind, recipientEmail }
  });

  return {
    sent: true,
    emailJob: {
      tenantId,
      invoiceId,
      reminderKind
    }
  };
};

export const invoicingLifecycleJobId = (
  kind: "expire-offer" | "mark-overdue" | "payment-reminder",
  tenantId: string,
  documentId: string,
  extra?: string
): string => `${kind}:${tenantId}:${documentId}${extra ? `:${extra}` : ""}`;
