/**
 * HrmModuleAvailabilityHook.
 *
 * Adapter over tenant module availability for workforce route gates and nav visibility.
 *
 * Responsibilities:
 * - Surface platform workforce (HRM) enablement and assigned module role
 * - Derive `hasWorkforceAccess` for {@link HrmModuleGate}
 *
 * Depends on:
 * - `TenantModuleAvailabilityProvider`
 */

import { useTenantModuleAvailability } from "../../contexts/TenantModuleAvailabilityContext.js";

/**
 * Reads cached workforce availability from {@link TenantModuleAvailabilityProvider}.
 *
 * @returns `hrmEnabled`, `workforceRole`, `hasWorkforceAccess`, and loading/error state
 */
export const useHrmModuleAvailability = () => {
  const { workforce, loading, loadError, reload } = useTenantModuleAvailability();
  const hasWorkforceAccess = workforce.hrmEnabled === true && workforce.workforceRole != null;

  return {
    hrmEnabled: workforce.hrmEnabled,
    workforceRole: workforce.workforceRole,
    hasWorkforceAccess,
    loading,
    loadError:
      loadError || (workforce.hrmEnabled === null && !loading ? "Could not load workforce availability." : ""),
    reload
  };
};
