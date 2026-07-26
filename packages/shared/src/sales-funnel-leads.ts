/**
 * BDR lead pipeline HTTP contracts.
 *
 * Zod schemas for business-development leads: create/patch, promote to deal,
 * list filters, notes, and tag JSON helpers.
 *
 * Responsibilities:
 * - Validate lead CRUD, promotion, and kanban list queries
 * - Parse/stringify tag arrays stored as JSON columns
 *
 * Related:
 * - `sales-funnel-deals.ts`, `sales-funnel-contacts.ts`
 */
import { z } from "zod";

import { salesFunnelContactLinkSchema } from "./sales-funnel-contacts.js";

export const salesFunnelBdrLeadCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(255),
    description: z.string().trim().max(8000).optional().default(""),
    stageKey: z.string().trim().min(1).max(64).optional(),
    tags: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
    ownerUserId: z.string().uuid().optional().nullable(),
    crmOrganizationId: z.string().uuid().optional().nullable(),
    contactIds: z.array(z.string().uuid()).max(50).optional(),
    contacts: z.array(salesFunnelContactLinkSchema).max(50).optional()
  })
  .strict();

export const salesFunnelBdrLeadPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(255).optional(),
    description: z.string().trim().max(8000).optional(),
    stageKey: z.string().trim().min(1).max(64).optional(),
    tags: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
    ownerUserId: z.string().uuid().optional().nullable(),
    crmOrganizationId: z.string().uuid().optional().nullable(),
    archived: z.boolean().optional(),
    contactIds: z.array(z.string().uuid()).max(50).optional(),
    contacts: z.array(salesFunnelContactLinkSchema).max(50).optional()
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: "Provide at least one field to update" });

export const salesFunnelBdrLeadStagePatchSchema = z
  .object({
    stageKey: z.string().trim().min(1).max(64)
  })
  .strict();

export const salesFunnelBdrLeadIdParamsSchema = z.object({ id: z.string().uuid() });
export type SalesFunnelBdrLeadIdParams = z.infer<typeof salesFunnelBdrLeadIdParamsSchema>;

export const salesFunnelBdrLeadsListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  stageKey: z.string().trim().max(64).optional(),
  ownerUserId: z.string().uuid().optional(),
  tag: z.string().trim().max(64).optional(),
  includeArchived: z.coerce.boolean().optional(),
  /** When true, restrict to records shown on the kanban board (active only). Not intended for HTTP query strings. */
  onlyPipelineActive: z.coerce.boolean().optional(),
  /** Pipeline visibility: active, inactive, or archived-only. Omit for all non-archived. */
  pipelineActive: z.enum(["active", "inactive", "archived"]).optional()
});

export const salesFunnelBdrLeadNoteSchema = z
  .object({
    body: z.string().trim().min(1).max(8000)
  })
  .strict();

export const salesFunnelBdrLeadPromoteSchema = z
  .object({
    stageKey: z.string().trim().min(1).max(64).optional()
  })
  .strict();

export type SalesFunnelBdrLeadPromoteInput = z.infer<typeof salesFunnelBdrLeadPromoteSchema>;

export type SalesFunnelBdrLeadCreateInput = z.infer<typeof salesFunnelBdrLeadCreateSchema>;
export type SalesFunnelBdrLeadPatchInput = z.infer<typeof salesFunnelBdrLeadPatchSchema>;
export type SalesFunnelBdrLeadsListQueryInput = z.infer<typeof salesFunnelBdrLeadsListQuerySchema>;

export const parseSalesFunnelTagsJson = (json: string | null | undefined): string[] => {
  if (!json?.trim()) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t): t is string => typeof t === "string" && t.trim().length > 0);
  } catch {
    return [];
  }
};

export const stringifySalesFunnelTags = (tags: string[]): string | null => {
  const cleaned = [...new Set(tags.map((t) => t.trim()).filter(Boolean))];
  return cleaned.length ? JSON.stringify(cleaned) : null;
};
