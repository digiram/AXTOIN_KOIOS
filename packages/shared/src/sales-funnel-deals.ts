/**
 * Sales deal pipeline HTTP contracts.
 *
 * Zod schemas for sales-team deals: create/patch, stage moves, list filters,
 * notes, and expected value currency pairs.
 *
 * Responsibilities:
 * - Validate deal CRUD and list query params
 * - Enforce expected value minor/currency pairing invariants
 *
 * Related:
 * - `sales-funnel-contacts.ts`, `sales-funnel.ts`
 */
import { z } from "zod";

import { salesFunnelContactLinkSchema } from "./sales-funnel-contacts.js";

const expectedDealCurrencySchema = z
  .string()
  .trim()
  .length(3)
  .transform((s) => s.toUpperCase());

const expectedDealValueMinorSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

const refineExpectedDealValuePair = (data: {
  expectedValueMinor?: number | null | undefined;
  expectedValueCurrency?: string | null | undefined;
}): boolean => {
  const m = data.expectedValueMinor;
  const c = data.expectedValueCurrency;
  if (m == null && (c == null || c === undefined)) return true;
  if (m == null && c !== null && c !== undefined) return false;
  if (m != null && (c == null || c === undefined)) return false;
  if (m === null && c === null) return true;
  return m != null && c != null;
};

const refinePatchExpectedDealValue = (data: {
  expectedValueMinor?: number | null;
  expectedValueCurrency?: string | null;
}): boolean => {
  const hasM = data.expectedValueMinor !== undefined;
  const hasC = data.expectedValueCurrency !== undefined;
  if (!hasM && !hasC) return true;
  if (hasM !== hasC) return false;
  const m = data.expectedValueMinor;
  const c = data.expectedValueCurrency;
  if (m === null && c === null) return true;
  if (m != null && c != null && m >= 0) return true;
  return false;
};

export const salesFunnelSalesDealCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(255),
    description: z.string().trim().max(8000).optional().default(""),
    stageKey: z.string().trim().min(1).max(64).optional(),
    tags: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
    ownerUserId: z.string().uuid().optional().nullable(),
    crmOrganizationId: z.string().uuid().optional().nullable(),
    promotedFromLeadId: z.string().uuid().optional().nullable(),
    contactIds: z.array(z.string().uuid()).max(50).optional(),
    contacts: z.array(salesFunnelContactLinkSchema).max(50).optional(),
    expectedValueMinor: expectedDealValueMinorSchema.optional().nullable(),
    expectedValueCurrency: expectedDealCurrencySchema.optional().nullable()
  })
  .strict()
  .superRefine((data, ctx) => {
    if (refineExpectedDealValuePair(data)) return;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Expected deal size requires both amount (minor units) and currency, or omit both."
    });
  });

export const salesFunnelDealOutcomeBucketSchema = z.enum(["won", "lost"]);

export const salesFunnelSalesDealPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(255).optional(),
    description: z.string().trim().max(8000).optional(),
    stageKey: z.string().trim().min(1).max(64).optional(),
    tags: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
    ownerUserId: z.string().uuid().optional().nullable(),
    crmOrganizationId: z.string().uuid().optional().nullable(),
    archived: z.boolean().optional(),
    outcomeBucket: salesFunnelDealOutcomeBucketSchema.optional(),
    contactIds: z.array(z.string().uuid()).max(50).optional(),
    contacts: z.array(salesFunnelContactLinkSchema).max(50).optional(),
    expectedValueMinor: expectedDealValueMinorSchema.optional().nullable(),
    expectedValueCurrency: expectedDealCurrencySchema.optional().nullable()
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: "Provide at least one field to update" })
  .superRefine((data, ctx) => {
    if (refinePatchExpectedDealValue(data)) return;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "expectedValueMinor and expectedValueCurrency must be updated together (both set or both null to clear)."
    });
  });

export const salesFunnelSalesDealStagePatchSchema = z
  .object({
    stageKey: z.string().trim().min(1).max(64)
  })
  .strict();

export const salesFunnelSalesDealIdParamsSchema = z.object({ id: z.string().uuid() });
export type SalesFunnelSalesDealIdParams = z.infer<typeof salesFunnelSalesDealIdParamsSchema>;

export const salesFunnelSalesDealsListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  stageKey: z.string().trim().max(64).optional(),
  ownerUserId: z.string().uuid().optional(),
  tag: z.string().trim().max(64).optional(),
  includeArchived: z.coerce.boolean().optional(),
  onlyPipelineActive: z.coerce.boolean().optional(),
  /** Pipeline visibility: active (on board) or inactive (promoted, won/lost, etc.). Omit for both. */
  pipelineActive: z.enum(["active", "inactive", "archived"]).optional()
});

export const salesFunnelSalesDealNoteSchema = z
  .object({
    body: z.string().trim().min(1).max(8000)
  })
  .strict();

export type SalesFunnelSalesDealCreateInput = z.infer<typeof salesFunnelSalesDealCreateSchema>;
export type SalesFunnelSalesDealPatchInput = z.infer<typeof salesFunnelSalesDealPatchSchema>;
export type SalesFunnelSalesDealsListQueryInput = z.infer<typeof salesFunnelSalesDealsListQuerySchema>;
