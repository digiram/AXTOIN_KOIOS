/**
 * Platform subscription catalog and billing ledger schemas.
 *
 * Super-admin plan CRUD, subscription settings, and charge status enums for
 * realm billing (tenant pays the platform).
 *
 * Responsibilities:
 * - Validate catalog plan bodies and platform subscription settings PATCH
 * - Export duration unit, billing scope, and payment status enums
 *
 * Related:
 * - `realm-subscriptions.ts` (tenant-facing subscribe/cancel)
 * - `subscription-billing.ts` (period math)
 *
 * Security:
 * - Catalog managed by super-admin; tenant routes use separate schemas.
 */
import { z } from "zod";

export const subscriptionDurationUnitSchema = z.enum(["day", "month", "year"]);
export type SubscriptionDurationUnit = z.infer<typeof subscriptionDurationUnitSchema>;

export const subscriptionBillingScopeSchema = z.enum(["tenant", "user"]);
export type SubscriptionBillingScope = z.infer<typeof subscriptionBillingScopeSchema>;

/** Lifecycle for generated subscription charges (super-admin ledger). */
export const subscriptionPaymentStatusSchema = z.enum([
  "outstanding",
  "due",
  "overdue",
  "paid",
  "cancelled",
  "reimbursed"
]);
export type SubscriptionPaymentStatus = z.infer<typeof subscriptionPaymentStatusSchema>;

export const platformSubscriptionSettingsPutBodySchema = z
  .object({
    subscriptionsEnabled: z.boolean().optional(),
    subscriptionCurrencyCode: z.string().trim().length(3).toUpperCase().optional()
  })
  .strict()
  .refine((d) => d.subscriptionsEnabled !== undefined || d.subscriptionCurrencyCode !== undefined, {
    message: "Provide subscriptionsEnabled and/or subscriptionCurrencyCode."
  });

export type PlatformSubscriptionSettingsPutBodyInput = z.infer<
  typeof platformSubscriptionSettingsPutBodySchema
>;

export const platformSubscriptionPlanCreateBodySchema = z
  .object({
    tierName: z.string().trim().min(1).max(128),
    durationUnit: subscriptionDurationUnitSchema,
    durationCount: z.number().int().min(1).max(999),
    priceCents: z.number().int().min(0).max(999_999_999),
    allowCancelAnytime: z.boolean(),
    /** Free trial in calendar days (UTC); 0 = subscribe starts billing immediately. */
    trialDays: z.number().int().min(0).max(365).optional(),
    /** Subscriber may schedule upgrade/downgrade to another tier of the same scope, effective next `current_period_end`. */
    allowTierChangeNextPeriod: z.boolean().optional(),
    billingScope: subscriptionBillingScopeSchema,
    sortOrder: z.number().int().min(0).max(999_999).optional()
  })
  .strict();

export type PlatformSubscriptionPlanCreateBodyInput = z.infer<
  typeof platformSubscriptionPlanCreateBodySchema
>;

export const platformSubscriptionPlanUpdateBodySchema = platformSubscriptionPlanCreateBodySchema;

export type PlatformSubscriptionPlanUpdateBodyInput = z.infer<
  typeof platformSubscriptionPlanUpdateBodySchema
>;

export const platformSubscriptionPlanIdParamsSchema = z.object({
  planId: z.string().uuid()
});

export const platformSubscriptionPaymentIdParamsSchema = z.object({
  paymentId: z.string().uuid()
});

export const platformSubscriptionPlanSetDisabledBodySchema = z
  .object({
    disabled: z.boolean()
  })
  .strict();

export type PlatformSubscriptionPlanSetDisabledBodyInput = z.infer<typeof platformSubscriptionPlanSetDisabledBodySchema>;

/** Query filters for subscription payment ledger (super-admin). Dates accept ISO 8601 strings. */
export const platformSubscriptionPaymentsListQuerySchema = z
  .object({
    tenantId: z.string().uuid().optional(),
    status: subscriptionPaymentStatusSchema.optional(),
    createdFrom: z.string().optional(),
    createdTo: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(200).optional().default(50),
    offset: z.coerce.number().int().min(0).optional().default(0)
  })
  .strict();

export type PlatformSubscriptionPaymentsListQueryInput = z.infer<
  typeof platformSubscriptionPaymentsListQuerySchema
>;

/** Same filter fields as the list endpoint, without pagination (used for CSV export). */
export const platformSubscriptionPaymentsExportQuerySchema = platformSubscriptionPaymentsListQuerySchema.pick({
  tenantId: true,
  status: true,
  createdFrom: true,
  createdTo: true
});

export type PlatformSubscriptionPaymentsExportQueryInput = z.infer<
  typeof platformSubscriptionPaymentsExportQuerySchema
>;

export const platformSubscriptionPlanAuditListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).optional().default(50),
    offset: z.coerce.number().int().min(0).optional().default(0)
  })
  .strict();

export type PlatformSubscriptionPlanAuditListQueryInput = z.infer<
  typeof platformSubscriptionPlanAuditListQuerySchema
>;
