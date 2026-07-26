/**
 * Tenant-defined contact role labels for sales funnel links.
 *
 * Optional labels (e.g. "Decision maker") assigned when linking CRM contacts
 * to BDR leads or sales deals.
 *
 * Responsibilities:
 * - Validate create body and `:id` route params for `/tenant/sales/contact-roles`
 *
 * Related:
 * - `sales-funnel-contacts.ts`
 */
import { z } from "zod";

/** Body for creating a reusable contact role label. */
export const salesFunnelContactRoleCreateSchema = z
  .object({
    label: z.string().trim().min(1).max(128)
  })
  .strict();

/** Route params for contact role CRUD by UUID. */
export const salesFunnelContactRoleIdParamsSchema = z
  .object({
    id: z.string().uuid()
  })
  .strict();

export type SalesFunnelContactRoleCreateInput = z.infer<typeof salesFunnelContactRoleCreateSchema>;
export type SalesFunnelContactRoleIdParams = z.infer<typeof salesFunnelContactRoleIdParamsSchema>;
