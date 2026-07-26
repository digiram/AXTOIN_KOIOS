/**
 * Tenant user administration schemas.
 *
 * List query, route params, and create/update bodies for realm tenant admins
 * managing users within their JWT-scoped tenant.
 *
 * Responsibilities:
 * - Validate paginated user list filters and sort options
 * - Validate user CRUD route params and request bodies
 *
 * Related:
 * - `platform-users.ts` (super-admin cross-tenant view)
 * - `module-roles.ts` for per-module role assignment
 *
 * Security:
 * - Tenant scope enforced in API from JWT; no client-supplied tenant id.
 */
import { z } from "zod";

export const tenantUsersSortSchema = z.enum(["email", "displayName", "role", "createdAt"]);

/** Query string for `GET /tenant/users` (realm tenant administrator — scoped to JWT `tenantId`). */
export const tenantUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sort: tenantUsersSortSchema.default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
  q: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((s) => (s && s.length > 0 ? s : undefined)),
  role: z.enum(["tenant_admin", "tenant_user"]).optional()
});

export type TenantUsersQueryInput = z.infer<typeof tenantUsersQuerySchema>;

export const tenantUserIdParamsSchema = z.object({
  userId: z.string().uuid()
});

export type TenantUserIdParams = z.infer<typeof tenantUserIdParamsSchema>;
