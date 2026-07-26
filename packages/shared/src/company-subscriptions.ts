/**
 * Company subscriptions module — vendor/SaaS registry contracts.
 *
 * Zod schemas and helpers for tenant-scoped vendor subscriptions (distinct from
 * realm/Stripe billing). Covers provider kinds, cadence, plans, and status enums.
 *
 * Responsibilities:
 * - Validate CRUD bodies for providers, plans, and subscription rows
 * - Export status/kind enums used by API routes and tenant admin UI
 *
 * Related:
 * - `docs/company-subscriptions-module.md`
 * - `company-subscription-cadence-dates.ts`, `company-subscription-recurring-cost.ts`
 *
 * Security:
 * - Tenant scope enforced in API; schemas carry business fields only.
 */
import { z } from "zod";

export const COMPANY_SUBSCRIPTION_STATUSES = [
  "active",
  "trial",
  "pending_renewal",
  "expired",
  "cancelled"
] as const;
export type CompanySubscriptionStatus = (typeof COMPANY_SUBSCRIPTION_STATUSES)[number];
export const companySubscriptionStatusSchema = z.enum(COMPANY_SUBSCRIPTION_STATUSES);

/** `singular` — cost/dates/cadence on the provider; `seated` — on each plan. */
export const COMPANY_SUBSCRIPTION_KINDS = ["singular", "seated"] as const;
export type CompanySubscriptionKind = (typeof COMPANY_SUBSCRIPTION_KINDS)[number];
export const companySubscriptionKindSchema = z.enum(COMPANY_SUBSCRIPTION_KINDS);

export const subscriptionKindLabel = (kind: CompanySubscriptionKind): string => {
  switch (kind) {
    case "singular":
      return "Singular";
    case "seated":
      return "Seated";
    default:
      return kind;
  }
};

export const isSingularCompanySubscription = (kind: CompanySubscriptionKind): boolean => kind === "singular";

export const isSeatedCompanySubscription = (kind: CompanySubscriptionKind): boolean => kind === "seated";

export const COMPANY_SUBSCRIPTION_SEAT_STATUSES = ["active", "pending", "disabled", "removed"] as const;
export type CompanySubscriptionSeatStatus = (typeof COMPANY_SUBSCRIPTION_SEAT_STATUSES)[number];
export const companySubscriptionSeatStatusSchema = z.enum(COMPANY_SUBSCRIPTION_SEAT_STATUSES);

export const COMPANY_SUBSCRIPTION_CADENCE_KINDS = [
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
  "custom"
] as const;
export type CompanySubscriptionCadenceKind = (typeof COMPANY_SUBSCRIPTION_CADENCE_KINDS)[number];
export const companySubscriptionCadenceKindSchema = z.enum(COMPANY_SUBSCRIPTION_CADENCE_KINDS);

export const COMPANY_SUBSCRIPTION_CADENCE_UNITS = ["day", "week", "month", "year"] as const;
export const companySubscriptionCadenceUnitSchema = z.enum(COMPANY_SUBSCRIPTION_CADENCE_UNITS);

const isoDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .optional()
  .nullable();

const currencyCode = z
  .string()
  .trim()
  .length(3)
  .transform((s) => s.toUpperCase())
  .optional()
  .nullable();

const amountMinor = z.number().int().min(0).optional().nullable();

const FULL_PAN_RE = /\b(?:\d[ -]*?){13,19}\b/;
const CVV_RE = /\b(?:cvv|cvc|security code)\s*[:=]?\s*\d{3,4}\b/i;

const safeBillingMetadataString = (label: string) =>
  z
    .string()
    .trim()
    .max(512)
    .optional()
    .nullable()
    .superRefine((val, ctx) => {
      if (!val) return;
      if (FULL_PAN_RE.test(val.replace(/\*/g, ""))) {
        ctx.addIssue({ code: "custom", message: `${label} must not contain full card numbers` });
      }
      if (CVV_RE.test(val)) {
        ctx.addIssue({ code: "custom", message: `${label} must not contain CVV/CVC` });
      }
    });

export const companySubscriptionBillingMetadataSchema = z
  .object({
    paymentMethodRef: safeBillingMetadataString("Payment method reference"),
    bankAccountRef: safeBillingMetadataString("Bank account reference"),
    costCenter: safeBillingMetadataString("Cost center"),
    purchaseOwner: safeBillingMetadataString("Purchase owner"),
    procurementContact: safeBillingMetadataString("Procurement contact"),
    vendorAccountNumber: safeBillingMetadataString("Vendor account number"),
    renewalOwner: safeBillingMetadataString("Renewal owner")
  })
  .strict()
  .optional()
  .nullable();

export const companySubscriptionCadenceFieldsSchema = z
  .object({
    cadenceKind: companySubscriptionCadenceKindSchema,
    cadenceIntervalCount: z.number().int().min(1).max(9999).optional().nullable(),
    cadenceIntervalUnit: companySubscriptionCadenceUnitSchema.optional().nullable()
  })
  .superRefine((data, ctx) => {
    if (data.cadenceKind === "custom") {
      if (!data.cadenceIntervalCount) {
        ctx.addIssue({ code: "custom", message: "cadenceIntervalCount is required for custom cadence", path: ["cadenceIntervalCount"] });
      }
      if (!data.cadenceIntervalUnit) {
        ctx.addIssue({ code: "custom", message: "cadenceIntervalUnit is required for custom cadence", path: ["cadenceIntervalUnit"] });
      }
    }
  });

const companySubscriptionProviderFieldsSchema = z
  .object({
    name: z.string().trim().min(1).max(512),
    vendorName: z.string().trim().max(512).optional().nullable(),
    category: z.string().trim().max(128).optional().nullable(),
    description: z.string().trim().max(10000).optional().nullable(),
    status: companySubscriptionStatusSchema.optional(),
    subscriptionKind: companySubscriptionKindSchema.optional(),
    ownerEmployeeId: z.string().uuid().optional().nullable(),
    renewalDate: isoDateString,
    contractStartDate: isoDateString,
    contractEndDate: isoDateString,
    cadenceKind: companySubscriptionCadenceKindSchema.optional(),
    cadenceIntervalCount: z.number().int().min(1).max(9999).optional().nullable(),
    cadenceIntervalUnit: companySubscriptionCadenceUnitSchema.optional().nullable(),
    amountMinor: amountMinor,
    currencyCode: currencyCode,
    billingMetadata: companySubscriptionBillingMetadataSchema,
    notes: z.string().trim().max(10000).optional().nullable()
  })
  .strict();

export const companySubscriptionProviderCreateSchema = companySubscriptionProviderFieldsSchema.superRefine(
  (data, ctx) => {
    const cadence = companySubscriptionCadenceFieldsSchema.safeParse({
      cadenceKind: data.cadenceKind ?? "monthly",
      cadenceIntervalCount: data.cadenceIntervalCount,
      cadenceIntervalUnit: data.cadenceIntervalUnit
    });
    if (!cadence.success) {
      for (const issue of cadence.error.issues) ctx.addIssue(issue);
    }
  }
);

export const companySubscriptionProviderPatchSchema = companySubscriptionProviderFieldsSchema.partial().strict();

export const companySubscriptionProviderIdParamsSchema = z.object({ id: z.string().uuid() }).strict();

export const companySubscriptionProvidersListQuerySchema = z
  .object({
    q: z.string().trim().max(200).optional(),
    status: companySubscriptionStatusSchema.optional(),
    category: z.string().trim().max(128).optional(),
    cadenceKind: companySubscriptionCadenceKindSchema.optional(),
    renewalWithinDays: z.coerce.number().int().min(1).max(365).optional(),
    sort: z.enum(["name", "renewal_date", "status", "updated_at"]).optional(),
    order: z.enum(["asc", "desc"]).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional()
  })
  .strict();

export const companySubscriptionPlanCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(512),
    sku: z.string().trim().max(256).optional().nullable(),
    seatCount: z.number().int().min(0).max(1_000_000).optional().nullable(),
    amountMinor: amountMinor,
    currencyCode: currencyCode,
    cadenceKind: companySubscriptionCadenceKindSchema.optional(),
    cadenceIntervalCount: z.number().int().min(1).max(9999).optional().nullable(),
    cadenceIntervalUnit: companySubscriptionCadenceUnitSchema.optional().nullable(),
    startDate: isoDateString,
    endDate: isoDateString,
    renewalDate: isoDateString,
    autoRenew: z.boolean().optional(),
    notes: z.string().trim().max(10000).optional().nullable()
  })
  .strict();

export const companySubscriptionPlanPatchSchema = companySubscriptionPlanCreateSchema.partial().strict();

export const companySubscriptionPlanParamsSchema = z
  .object({
    providerId: z.string().uuid(),
    id: z.string().uuid()
  })
  .strict();

const companySubscriptionSeatFieldsSchema = z
  .object({
    employeeId: z.string().uuid().optional().nullable(),
    displayName: z.string().trim().max(512).optional().nullable(),
    email: z.string().trim().email().max(320).optional().nullable(),
    seatType: z.string().trim().max(128).optional().nullable(),
    status: companySubscriptionSeatStatusSchema.optional(),
    startDate: isoDateString,
    endDate: isoDateString,
    notes: z.string().trim().max(10000).optional().nullable()
  })
  .strict();

export const companySubscriptionSeatCreateSchema = companySubscriptionSeatFieldsSchema.superRefine((data, ctx) => {
  if (!data.employeeId && !data.displayName?.trim() && !data.email?.trim()) {
    ctx.addIssue({
      code: "custom",
      message: "Provide employeeId or displayName/email for the seat assignment"
    });
  }
});

export const companySubscriptionSeatPatchSchema = companySubscriptionSeatFieldsSchema.partial().strict();

export const companySubscriptionSeatParamsSchema = z
  .object({
    providerId: z.string().uuid(),
    planId: z.string().uuid(),
    id: z.string().uuid()
  })
  .strict();

export const companySubscriptionProviderDocumentParamsSchema = z
  .object({
    providerId: z.string().uuid(),
    id: z.string().uuid()
  })
  .strict();

export const companySubscriptionProviderIdOnlyParamsSchema = z.object({ providerId: z.string().uuid() }).strict();

export const companySubscriptionPlanIdOnlyParamsSchema = z
  .object({
    providerId: z.string().uuid(),
    planId: z.string().uuid()
  })
  .strict();

export type CompanySubscriptionProviderCreateInput = z.infer<typeof companySubscriptionProviderCreateSchema>;
export type CompanySubscriptionProviderPatchInput = z.infer<typeof companySubscriptionProviderPatchSchema>;
export type CompanySubscriptionProvidersListQueryInput = z.infer<typeof companySubscriptionProvidersListQuerySchema>;
export type CompanySubscriptionPlanCreateInput = z.infer<typeof companySubscriptionPlanCreateSchema>;
export type CompanySubscriptionPlanPatchInput = z.infer<typeof companySubscriptionPlanPatchSchema>;
export type CompanySubscriptionSeatCreateInput = z.infer<typeof companySubscriptionSeatCreateSchema>;
export type CompanySubscriptionSeatPatchInput = z.infer<typeof companySubscriptionSeatPatchSchema>;
export type CompanySubscriptionBillingMetadata = z.infer<NonNullable<typeof companySubscriptionBillingMetadataSchema>>;

export const parseCompanySubscriptionBillingMetadataJson = (
  raw: string | null | undefined
): CompanySubscriptionBillingMetadata | null => {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    const r = companySubscriptionBillingMetadataSchema.safeParse(parsed);
    return r.success ? (r.data ?? null) : null;
  } catch {
    return null;
  }
};

export const stringifyCompanySubscriptionBillingMetadataForDb = (
  val: CompanySubscriptionBillingMetadata | null | undefined
): string => {
  if (val == null) return "{}";
  const r = companySubscriptionBillingMetadataSchema.safeParse(val);
  return r.success && r.data ? JSON.stringify(r.data) : "{}";
};
