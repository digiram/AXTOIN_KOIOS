/**
 * SalesModuleAvailabilityHook.
 *
 * Adapter over tenant module availability for Sales route gates and nav visibility.
 *
 * Responsibilities:
 * - Surface platform Sales enablement, CRM prerequisite flag, and module role
 * - Derive `hasSalesAccess` for {@link SalesModuleGate}
 *
 * Depends on:
 * - `TenantModuleAvailabilityProvider`
 */

import { useTenantModuleAvailability } from "../../contexts/TenantModuleAvailabilityContext.js";

/**
 * Reads cached Sales availability from {@link TenantModuleAvailabilityProvider}.
 *
 * @returns `salesFunnelEnabled`, `crmEnabled`, `salesRole`, access flags, and loading state
 */
export const useSalesModuleAvailability = () => {
  const { sales, loading, loadError, reload } = useTenantModuleAvailability();
  const hasSalesAccess = sales.salesFunnelEnabled === true && sales.salesRole != null;

  return {
    salesFunnelEnabled: sales.salesFunnelEnabled,
    crmEnabled: sales.crmEnabled,
    salesRole: sales.salesRole,
    hasSalesAccess,
    loading,
    loadError: loadError || (sales.salesFunnelEnabled === null && !loading ? "Could not load Sales availability." : ""),
    reload
  };
};
