/**
 * Sales funnel contact links on leads and deals.
 *
 * CRM contacts attached to pipeline records with an optional role label
 * (tenant-defined via `sales-funnel-contact-roles.ts`).
 *
 * Responsibilities:
 * - Validate contact link shape on create/patch bodies
 * - Normalize legacy `contactIds`-only patches into `{ contactId, role }` rows
 *
 * Related:
 * - `sales-funnel-leads.ts`, `sales-funnel-deals.ts`
 */
import { z } from "zod";

/** One CRM contact linked to a lead or deal with optional role label. */
export const salesFunnelContactLinkSchema = z
  .object({
    contactId: z.string().uuid(),
    role: z.string().trim().max(128).optional().default("")
  })
  .strict();

export type SalesFunnelContactLink = z.infer<typeof salesFunnelContactLinkSchema>;

/**
 * Prefer `contacts` when present; fall back to bare `contactIds` (empty role).
 *
 * @returns Normalized link rows, or `undefined` when neither patch field is set.
 */
export const resolveSalesFunnelContactsPatch = (patch: {
  contacts?: SalesFunnelContactLink[];
  contactIds?: string[];
}): SalesFunnelContactLink[] | undefined => {
  if (patch.contacts !== undefined) {
    return patch.contacts.map((c) => ({ contactId: c.contactId, role: c.role ?? "" }));
  }
  if (patch.contactIds !== undefined) {
    return patch.contactIds.map((contactId) => ({ contactId, role: "" }));
  }
  return undefined;
};
