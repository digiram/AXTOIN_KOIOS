/**
 * Platform user administration schemas.
 *
 * Query, create, and update contracts for super-admin user management across
 * platform and realm tenants.
 *
 * Responsibilities:
 * - Validate list query filters (role, realm, pagination, sort)
 * - Validate user create/update bodies for `/platform/users`
 *
 * Related:
 * - `tenant-users.ts` for tenant-scoped user admin
 *
 * Security:
 * - Super-admin routes only; role enum restricts privilege escalation surface.
 */
import { z } from "zod";

export const platformRealmFilterSchema = z.enum(["all", "platform", "realm"]);

export const platformUsersSortSchema = z.enum([
  "email",
  "displayName",
  "role",
  "createdAt",
  "tenantName"
]);

/** Query string for `GET /platform/users` (platform super-admin only). */
export const platformUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sort: platformUsersSortSchema.default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
  q: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((s) => (s && s.length > 0 ? s : undefined)),
  role: z.enum(["super_admin", "tenant_admin", "tenant_user"]).optional(),
  realm: platformRealmFilterSchema.default("all")
});

export type PlatformUsersQueryInput = z.infer<typeof platformUsersQuerySchema>;

/** Route params for `/platform/users/:userId/...` (UUID primary key). */
export const platformUserIdParamsSchema = z.object({
  userId: z.string().uuid()
});

export type PlatformUserIdParams = z.infer<typeof platformUserIdParamsSchema>;

/** Query string for `GET /platform/tenants` (tenant picker for provisioning). */
export const platformTenantsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  q: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((s) => (s && s.length > 0 ? s : undefined))
});

export type PlatformTenantsQueryInput = z.infer<typeof platformTenantsQuerySchema>;

/** Body for `POST /platform/users` — provision a realm user into an existing or new tenant. */
export const platformUserCreateBodySchema = z
  .object({
    email: z.string().trim().email().max(320),
    displayName: z
      .string()
      .trim()
      .max(255)
      .optional()
      .transform((s) => (s && s.length > 0 ? s : undefined)),
    role: z.enum(["tenant_admin", "tenant_user"]).default("tenant_user"),
    tenantId: z.string().uuid().optional(),
    tenantName: z.string().trim().min(1).max(255).optional()
  })
  .superRefine((data, ctx) => {
    const hasId = Boolean(data.tenantId);
    const hasName = Boolean(data.tenantName?.trim());
    if (hasId === hasName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide exactly one of tenantId (existing tenant) or tenantName (new tenant)."
      });
    }
  });

export type PlatformUserCreateBody = z.infer<typeof platformUserCreateBodySchema>;
