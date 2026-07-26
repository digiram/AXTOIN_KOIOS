/**
 * Augments Fastify request typing for fields populated after JWT verification (`plugins/tenant.ts`).
 *
 * Keeps route handlers strongly typed when accessing `request.userId` / `request.tenantId`.
 */

import "@fastify/jwt";

import type { TenantModuleRolesMap } from "@starter/shared";

declare module "fastify" {
  interface FastifyRequest {
    /** Realm id from JWT; undefined for platform super-admin sessions. */
    tenantId?: string;
    userId?: string;
    /** From JWT `role` claim after `requireTenantContext`. */
    role?: string;
    /** From JWT `mr` claim — per-module roles for realm members. */
    moduleRoles?: TenantModuleRolesMap;
  }
}
