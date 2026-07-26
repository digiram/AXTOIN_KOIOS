/**
 * Invoicing email moment catalog and tenant configuration helpers.
 *
 * Defines automatable email triggers (quote sent, payment reminder, dispute flows)
 * and resolves per-tenant enablement from stored JSON configuration.
 *
 * Responsibilities:
 * - Export moment keys, UI definitions, and PATCH schema
 * - Merge defaults with tenant overrides (including legacy payment reminder flag)
 *
 * Related:
 * - `docs/invoicing-quoting-module.md`
 * - `invoicing-lifecycle.ts`, `invoicing.ts`
 */
import { z } from "zod";

/** Stable keys for each automatable invoicing email trigger. */
export const INVOICING_EMAIL_MOMENT_KEYS = [
  "quote_sent",
  "offer_sent",
  "offer_decision",
  "invoice_sent",
  "payment_reminder",
  "payment_received",
  "dispute_opened",
  "dispute_acknowledged",
  "dispute_full_credit",
  "dispute_denied"
] as const;

export type InvoicingEmailMomentKey = (typeof INVOICING_EMAIL_MOMENT_KEYS)[number];

/** Zod enum for PATCH keys and stored configuration overrides. */
export const invoicingEmailMomentKeySchema = z.enum(INVOICING_EMAIL_MOMENT_KEYS);

export type InvoicingEmailMomentCategory = "quoting" | "invoicing";

/** UI/catalog row: key, label, description, and quoting vs invoicing grouping. */
export type InvoicingEmailMomentDefinition = {
  key: InvoicingEmailMomentKey;
  label: string;
  description: string;
  category: InvoicingEmailMomentCategory;
};

export const INVOICING_EMAIL_MOMENT_DEFINITIONS: InvoicingEmailMomentDefinition[] = [
  {
    key: "quote_sent",
    label: "Quote sent",
    description:
      "Sends the quote PDF and summary when a team member emails a draft quote or resends an archived quote.",
    category: "quoting"
  },
  {
    key: "offer_sent",
    label: "Offer sent",
    description:
      "Sends the offer PDF when an offer is marked as sent or when a team member resends a sent offer.",
    category: "quoting"
  },
  {
    key: "offer_decision",
    label: "Offer decision confirmation",
    description:
      "Confirms to the customer when an offer is accepted or rejected, including proof or rejection details when provided.",
    category: "quoting"
  },
  {
    key: "invoice_sent",
    label: "Invoice sent",
    description:
      "Sends the invoice PDF when an invoice is sent, resent, or when a revised invoice is issued after partial payment.",
    category: "invoicing"
  },
  {
    key: "payment_reminder",
    label: "Payment reminder",
    description:
      "Automated first and second reminders for unpaid sent or overdue invoices, based on the due-date offsets configured below.",
    category: "invoicing"
  },
  {
    key: "payment_received",
    label: "Payment received",
    description: "Confirms to the customer when a payment fully settles an invoice.",
    category: "invoicing"
  },
  {
    key: "dispute_opened",
    label: "Dispute opened",
    description: "Notifies the customer when an invoice is marked as disputed.",
    category: "invoicing"
  },
  {
    key: "dispute_acknowledged",
    label: "Dispute acknowledged",
    description: "Sends your company response and payment plan when a dispute is acknowledged.",
    category: "invoicing"
  },
  {
    key: "dispute_full_credit",
    label: "Dispute full credit",
    description: "Confirms to the customer when a dispute is resolved with a full credit on the invoice.",
    category: "invoicing"
  },
  {
    key: "dispute_denied",
    label: "Dispute denied",
    description: "Explains to the customer when a dispute is denied and the invoice remains payable.",
    category: "invoicing"
  }
];

/** Full enablement map — all moment keys default to enabled unless overridden. */
export type InvoicingEmailMomentsEnabled = Record<InvoicingEmailMomentKey, boolean>;

/** API list row combining catalog definition with resolved `enabled` flag. */
export type InvoicingEmailMomentApiRow = InvoicingEmailMomentDefinition & { enabled: boolean };

/** Tenant invoicing configuration fragment stored in DB JSON columns. */
export type InvoicingEmailMomentsConfiguration = {
  emailMomentsEnabled?: Partial<Record<InvoicingEmailMomentKey, boolean>> | null;
  paymentRemindersEnabled?: boolean;
};

export const INVOICING_EMAIL_MOMENT_DISABLED_MESSAGE =
  "This email is disabled in Invoicing configuration.";

/** All moments enabled — baseline before applying tenant overrides. */
export const defaultInvoicingEmailMomentsEnabled = (): InvoicingEmailMomentsEnabled =>
  Object.fromEntries(INVOICING_EMAIL_MOMENT_KEYS.map((key) => [key, true])) as InvoicingEmailMomentsEnabled;

/** Parses JSON string or object overrides; ignores unknown keys and invalid booleans. */
export const parseInvoicingEmailMomentsOverrides = (
  raw: unknown
): Partial<Record<InvoicingEmailMomentKey, boolean>> => {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return {};
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const result: Partial<Record<InvoicingEmailMomentKey, boolean>> = {};
  for (const key of INVOICING_EMAIL_MOMENT_KEYS) {
    const value = (parsed as Record<string, unknown>)[key];
    if (typeof value === "boolean") result[key] = value;
  }
  return result;
};

/** Merges defaults with tenant config, including legacy `paymentRemindersEnabled` alias. */
export const resolveInvoicingEmailMomentsEnabled = (
  configuration: InvoicingEmailMomentsConfiguration | null | undefined
): InvoicingEmailMomentsEnabled => {
  const enabled = defaultInvoicingEmailMomentsEnabled();
  const overrides = configuration?.emailMomentsEnabled ?? {};
  for (const key of INVOICING_EMAIL_MOMENT_KEYS) {
    if (overrides[key] !== undefined) enabled[key] = overrides[key]!;
  }
  if (overrides.payment_reminder === undefined && configuration?.paymentRemindersEnabled !== undefined) {
    enabled.payment_reminder = configuration.paymentRemindersEnabled;
  }
  return enabled;
};

/** Lookup helper when caller already resolved the full enabled map. */
export const isInvoicingEmailMomentEnabled = (
  enabled: InvoicingEmailMomentsEnabled,
  key: InvoicingEmailMomentKey
): boolean => enabled[key];

/** Convenience: resolve config then test a single moment key (used before enqueue/send). */
export const invoicingEmailMomentIsEnabled = (
  configuration: InvoicingEmailMomentsConfiguration | null | undefined,
  key: InvoicingEmailMomentKey
): boolean => isInvoicingEmailMomentEnabled(resolveInvoicingEmailMomentsEnabled(configuration), key);

export const serializeInvoicingEmailMomentsForApi = (
  enabled: InvoicingEmailMomentsEnabled
): InvoicingEmailMomentApiRow[] =>
  INVOICING_EMAIL_MOMENT_DEFINITIONS.map((definition) => ({
    ...definition,
    enabled: enabled[definition.key]
  }));

/** Maps document kind to the email moment key used when sending PDF emails. */
export const invoicingDocumentKindToEmailMomentKey = (
  kind: "quote" | "offer" | "invoice"
): InvoicingEmailMomentKey => {
  switch (kind) {
    case "quote":
      return "quote_sent";
    case "offer":
      return "offer_sent";
    case "invoice":
      return "invoice_sent";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
};

/** PATCH body for tenant invoicing email moment toggles (at least one key required). */
export const invoicingEmailMomentsPatchSchema = z
  .record(invoicingEmailMomentKeySchema, z.boolean())
  .refine((value) => Object.keys(value).length > 0, { message: "Provide at least one email moment to update" });

export type InvoicingEmailMomentsPatchInput = z.infer<typeof invoicingEmailMomentsPatchSchema>;
