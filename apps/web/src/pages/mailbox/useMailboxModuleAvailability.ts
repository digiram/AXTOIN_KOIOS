/**
 * Mailbox Module Availability hook.
 *
 * Reads cached mailbox module availability from TenantModuleAvailabilityContext for gating nav and empty states.
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

/** Reads cached mailbox availability from {@link TenantModuleAvailabilityProvider}. */
export const useMailboxModuleAvailability = () => {
  const { mailbox, loading, loadError, reload } = useTenantModuleAvailability();
  const hasMailboxAccess = mailbox.mailboxEnabled === true && mailbox.mailboxRole != null;

  return {
    mailboxEnabled: mailbox.mailboxEnabled,
    mailboxRole: mailbox.mailboxRole,
    hasMailboxAccess,
    loading,
    loadError:
      loadError || (mailbox.mailboxEnabled === null && !loading ? "Could not load mailbox availability." : ""),
    reload
  };
};
