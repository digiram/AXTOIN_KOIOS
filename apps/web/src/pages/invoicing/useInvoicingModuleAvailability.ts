/**
 * Invoicing Module Availability hook.
 *
 * Reads cached invoicing and quoting module availability from TenantModuleAvailabilityContext for gating nav and empty states.
 *
 * Responsibilities:
 * - Expose platform enablement and user module role
 * - Surface loading and reload helpers for availability fetch errors
 *
 * Related:
 * - TenantModuleAvailabilityProvider
 *
 * Security:
 * - Availability derived from authenticated tenant session
 */
import { useTenantModuleAvailability } from "../../contexts/TenantModuleAvailabilityContext.js";

/** Reads cached invoicing availability from {@link TenantModuleAvailabilityProvider}. */
export const useInvoicingModuleAvailability = () => {
  const { invoicing, loading, loadError, reload } = useTenantModuleAvailability();
  const hasInvoicingAccess = invoicing.invoicingEnabled === true && invoicing.invoicingRole != null;

  return {
    invoicingEnabled: invoicing.invoicingEnabled,
    invoicingRole: invoicing.invoicingRole,
    hasInvoicingAccess,
    loading,
    loadError:
      loadError || (invoicing.invoicingEnabled === null && !loading ? "Could not load invoicing availability." : ""),
    reload
  };
};
