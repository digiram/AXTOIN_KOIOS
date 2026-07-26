/**
 * Company Subscriptions Module Availability hook.
 *
 * Reads cached company subscriptions module availability from TenantModuleAvailabilityContext for gating nav and empty states.
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

/** Reads cached company subscriptions availability from {@link TenantModuleAvailabilityProvider}. */
export const useCompanySubscriptionsModuleAvailability = () => {
  const { companySubscriptions, loading, loadError, reload } = useTenantModuleAvailability();
  const hasCompanySubscriptionsAccess =
    companySubscriptions.companySubscriptionsEnabled === true &&
    companySubscriptions.companySubscriptionsRole != null;

  return {
    companySubscriptionsEnabled: companySubscriptions.companySubscriptionsEnabled,
    companySubscriptionsRole: companySubscriptions.companySubscriptionsRole,
    hasCompanySubscriptionsAccess,
    loading,
    loadError:
      loadError ||
      (companySubscriptions.companySubscriptionsEnabled === null && !loading
        ? "Could not load company subscriptions availability."
        : ""),
    reload
  };
};
