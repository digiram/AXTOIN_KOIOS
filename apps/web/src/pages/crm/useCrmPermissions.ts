/**
 * CrmPermissionsHook.
 *
 * Resolves the signed-in user's CRM module role and read/write/delete flags for UI gating.
 *
 * Responsibilities:
 * - Read platform CRM enablement and per-user module role
 * - Expose `canRead`, `canWrite`, and `canDelete` for list and detail actions
 *
 * Depends on:
 * - `useModulePermissions` with module key `crm`
 *
 * Security:
 * - UI-only; API routes re-check `tenant_user_module_roles` independently
 */

import { useModulePermissions } from "../../hooks/useModulePermissions.js";

/**
 * CRM module role helpers (Manager / User / Viewer).
 *
 * @returns Platform enablement, role, access flags, and loading/error state
 */
export const useCrmPermissions = () => {
  const perms = useModulePermissions("crm");
  return {
    crmEnabled: perms.platformEnabled,
    crmRole: perms.moduleRole,
    hasCrmAccess: perms.hasAccess,
    loading: perms.loading,
    loadError: perms.loadError,
    reload: perms.reload,
    canRead: perms.canRead,
    canWrite: perms.canWrite,
    canDelete: perms.canDelete
  };
};
