/**
 * Sales funnel stage administration schemas.
 *
 * Create, patch, reorder, and route-param validation for tenant-configurable
 * BDR and sales pipeline stages.
 *
 * Responsibilities:
 * - Validate stage CRUD and drag-reorder bodies
 *
 * Related:
 * - `sales-funnel.ts` pipeline and outcome enums
 */
import { z } from "zod";

import { salesFunnelPipelineSchema, salesFunnelStageOutcomeSchema } from "./sales-funnel.js";

export const salesFunnelStageCreateSchema = z
  .object({
    pipeline: salesFunnelPipelineSchema,
    name: z.string().trim().min(1).max(128)
  })
  .strict();

export const salesFunnelStagePatchSchema = z
  .object({
    name: z.string().trim().min(1).max(128).optional(),
    outcome: salesFunnelStageOutcomeSchema.optional(),
    closeChancePercent: z.number().int().min(0).max(100).nullable().optional(),
    readyForSales: z.boolean().optional()
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: "Provide at least one field to update" });

export const salesFunnelStageIdParamsSchema = z.object({ id: z.string().uuid() });

export const salesFunnelStageReorderSchema = z
  .object({
    pipeline: salesFunnelPipelineSchema,
    stageIds: z.array(z.string().uuid()).min(1)
  })
  .strict();

export type SalesFunnelStageCreateInput = z.infer<typeof salesFunnelStageCreateSchema>;
export type SalesFunnelStagePatchInput = z.infer<typeof salesFunnelStagePatchSchema>;
export type SalesFunnelStageReorderInput = z.infer<typeof salesFunnelStageReorderSchema>;
