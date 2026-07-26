/**
 * CrmModuleAvailabilityHook.
 *
 * Thin adapter over tenant module availability for CRM route gates and nav visibility.
 *
 * Responsibilities:
 * - Surface platform CRM enablement and assigned module role
 * - Derive `hasCrmAccess` for {@link CrmModuleGate}
 *
 * Depends on:
 * - `TenantModuleAvailabilityProvider` (loaded once per tenant session)
 */

import { useTenantModuleAvailability } from "../../contexts/TenantModuleAvailabilityContext.js";

/**
 * Reads cached CRM availability from {@link TenantModuleAvailabilityProvider}.
 *
 * @returns `crmEnabled`, `crmRole`, `hasCrmAccess`, loading/error state, and `reload`
 */
export const useCrmModuleAvailability = () => {
  const { crm, loading, loadError, reload } = useTenantModuleAvailability();
  const hasCrmAccess = crm.crmEnabled === true && crm.crmRole != null;

  return {
    crmEnabled: crm.crmEnabled,
    crmRole: crm.crmRole,
    hasCrmAccess,
    loading,
    loadError: loadError || (crm.crmEnabled === null && !loading ? "Could not load CRM availability." : ""),
    reload
  };
};
