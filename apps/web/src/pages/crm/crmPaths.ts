/**
 * CrmPathsHook.
 *
 * React hook returning the CRM URL prefix for the current realm member.
 *
 * Responsibilities:
 * - Read signed-in role from `useAuth`
 * - Delegate prefix resolution to {@link crmBasePathForRole}
 *
 * Related:
 * - Used by CRM list, detail, and legacy edit redirect routes
 */

import { useAuth } from "../../auth/AuthContext.js";

import { crmBasePathForRole, type CrmTenantPrefix } from "./crmPathUtils.js";

/**
 * Tenant CRM routes live under the admin or user layout (`/admin/crm/...` or `/user/crm/...`).
 *
 * @returns `/admin/crm` for tenant admins, otherwise `/user/crm`
 */
export function useCrmBasePath(): CrmTenantPrefix {
  const { user } = useAuth();
  return crmBasePathForRole(user?.role);
}
