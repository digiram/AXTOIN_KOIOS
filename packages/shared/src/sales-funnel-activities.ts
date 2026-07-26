/**
 * Sales funnel manual activity logging schemas.
 *
 * User-logged notes, calls, emails, and meetings on BDR leads or sales deals,
 * stored in `sales_funnel_activities` with optional CRM contact links.
 *
 * Responsibilities:
 * - Validate activity create body (type, body, direction, schedule, contacts)
 * - Parse stored `contactIds` from activity JSON payload
 *
 * Related:
 * - `sales-funnel-leads.ts`, `sales-funnel-deals.ts`
 */
import { z } from "zod";

/** User-logged funnel activities (notes, calls, etc.) — stored on `sales_funnel_activities`. */
export const SALES_FUNNEL_MANUAL_ACTIVITY_TYPES = [
  "note",
  "call",
  "email",
  "mail",
  "meeting",
  "conversation"
] as const;

export type SalesFunnelManualActivityType = (typeof SALES_FUNNEL_MANUAL_ACTIVITY_TYPES)[number];

export const salesFunnelManualActivitySchema = z
  .object({
    activityType: z.enum(SALES_FUNNEL_MANUAL_ACTIVITY_TYPES),
    body: z.string().trim().min(1).max(8000),
    direction: z.enum(["INBOUND", "OUTBOUND"]).optional(),
    /** ISO-8601 instant or local `YYYY-MM-DDTHH:mm` from the activity form. */
    scheduledAt: z.string().trim().max(40).optional().nullable(),
    /** CRM contacts on the lead/deal linked to this activity (subset of record contacts). */
    contactIds: z.array(z.string().uuid()).max(20).optional()
  })
  .strict();

export type SalesFunnelManualActivityInput = z.infer<typeof salesFunnelManualActivitySchema>;

/** Reads `contactIds` from activity payload. */
export const parseSalesFunnelActivityContactIds = (
  payload: Record<string, unknown> | null | undefined
): string[] => {
  if (!payload) return [];
  const raw = payload.contactIds;
  if (Array.isArray(raw)) {
    const ids = raw
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .map((x) => x.trim());
    return [...new Set(ids)];
  }
  return [];
};
