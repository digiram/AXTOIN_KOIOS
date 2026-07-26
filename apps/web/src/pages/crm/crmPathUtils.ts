/**
 * CrmPathUtils.
 *
 * Pure helpers for resolving tenant CRM URL prefixes from the signed-in realm role.
 *
 * Responsibilities:
 * - Map `tenant_admin` vs other roles to `/admin/crm` or `/user/crm`
 * - Export the `CrmTenantPrefix` union used by path hooks and redirects
 */

import type { UserRole } from "@starter/shared";

/** CRM route prefix for tenant admin (`/admin/crm`) or standard user (`/user/crm`) layouts. */
export type CrmTenantPrefix = "/admin/crm" | "/user/crm";

/**
 * Tenant admins use `/admin/crm`; otherwise `/user/crm`.
 *
 * @param role - Realm JWT role; undefined falls through to user prefix
 * @returns Absolute CRM path prefix for links and redirects
 */
export function crmBasePathForRole(role: UserRole | undefined): CrmTenantPrefix {
  return role === "tenant_admin" ? "/admin/crm" : "/user/crm";
}
