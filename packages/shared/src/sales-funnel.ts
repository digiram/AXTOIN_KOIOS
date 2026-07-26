/**
 * Sales funnel core enums and default pipeline stages.
 *
 * Shared pipeline (`bdr` | `sales`), stage outcomes, seeded default stage lists,
 * and bulk stage patch schema used when provisioning tenant funnel config.
 *
 * Responsibilities:
 * - Export pipeline/outcome enums and default BDR/sales stage definitions
 * - Validate tenant stage configuration PATCH bodies
 *
 * Related:
 * - `docs/sales-funnel-module.md`
 * - `sales-funnel-leads.ts`, `sales-funnel-deals.ts`, `sales-funnel-stages.ts`
 */
import { z } from "zod";

export const SALES_FUNNEL_PIPELINES = ["bdr", "sales"] as const;
export const salesFunnelPipelineSchema = z.enum(SALES_FUNNEL_PIPELINES);
export type SalesFunnelPipeline = z.infer<typeof salesFunnelPipelineSchema>;

export const SALES_FUNNEL_STAGE_OUTCOMES = ["open", "won", "lost", "disqualified"] as const;
export const salesFunnelStageOutcomeSchema = z.enum(SALES_FUNNEL_STAGE_OUTCOMES);
export type SalesFunnelStageOutcome = z.infer<typeof salesFunnelStageOutcomeSchema>;

export type SalesFunnelDefaultStage = {
  stageKey: string;
  name: string;
  sortOrder: number;
  outcome: SalesFunnelStageOutcome;
};

export const DEFAULT_SALES_FUNNEL_BDR_STAGES: SalesFunnelDefaultStage[] = [
  { stageKey: "new", name: "New", sortOrder: 0, outcome: "open" },
  { stageKey: "contacting", name: "Contacting", sortOrder: 1, outcome: "open" },
  { stageKey: "qualified", name: "Qualified", sortOrder: 2, outcome: "open" },
  { stageKey: "disqualified", name: "Disqualified", sortOrder: 3, outcome: "disqualified" },
  { stageKey: "ready_for_sales", name: "Ready for Sales", sortOrder: 4, outcome: "open" }
];

export const DEFAULT_SALES_FUNNEL_SALES_STAGES: SalesFunnelDefaultStage[] = [
  { stageKey: "discovery", name: "Discovery", sortOrder: 0, outcome: "open" },
  { stageKey: "proposal", name: "Proposal", sortOrder: 1, outcome: "open" },
  { stageKey: "negotiation", name: "Negotiation", sortOrder: 2, outcome: "open" },
  { stageKey: "contract_review", name: "Contract Review", sortOrder: 3, outcome: "open" },
  { stageKey: "won", name: "Won", sortOrder: 4, outcome: "won" },
  { stageKey: "lost", name: "Lost", sortOrder: 5, outcome: "lost" }
];

export const BDR_STAGE_KEYS = DEFAULT_SALES_FUNNEL_BDR_STAGES.map((s) => s.stageKey);
export const SALES_STAGE_KEYS = DEFAULT_SALES_FUNNEL_SALES_STAGES.map((s) => s.stageKey);

const stagePatchItemSchema = z
  .object({
    stageKey: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1).max(128),
    sortOrder: z.number().int().min(0).max(999),
    outcome: salesFunnelStageOutcomeSchema.optional()
  })
  .strict();

/** Legacy bulk rename/reorder (Settings); stage keys are tenant-defined after seed. */
export const salesFunnelPipelineStagesPatchSchema = z
  .object({
    bdrStages: z.array(stagePatchItemSchema).min(1),
    salesStages: z.array(stagePatchItemSchema).min(1)
  })
  .strict();

export type SalesFunnelPipelineStagesPatchInput = z.infer<typeof salesFunnelPipelineStagesPatchSchema>;

/** Effective module availability: platform Sales flag AND CRM (dependency). */
export const isSalesFunnelModuleAvailable = (flags: {
  crmEnabled: boolean;
  salesFunnelEnabled: boolean;
}): boolean => flags.crmEnabled && flags.salesFunnelEnabled;
