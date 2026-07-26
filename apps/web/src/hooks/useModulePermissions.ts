/**
 * useModulePermissions.
 *
 * Unified hook for optional-module authorization in tenant UI: platform enablement, resolved module role,
 * and read/write/delete permission helpers.
 *
 * Responsibilities:
 * - Delegate per-module availability to existing `use*ModuleAvailability` hooks
 * - Merge API role with JWT `moduleRoles` via `resolveModuleRole`
 * - Expose `canRead`, `canWrite`, `canDelete`, and `hasAccess` for gates and buttons
 *
 * Security:
 * - UI-only; API routes enforce module permissions independently
 */
import {
  modulePermissionAllowed,
  resolveModuleRole,
  type ModulePermission,
  type ModuleRole,
  type TenantModuleKey
} from "@starter/shared";

import { useAuth } from "../auth/AuthContext.js";
import { useCrmModuleAvailability } from "../pages/crm/useCrmModuleAvailability.js";
import { useSalesModuleAvailability } from "../pages/sales/useSalesModuleAvailability.js";
import { useCompanySubscriptionsModuleAvailability } from "../pages/company-subscriptions/useCompanySubscriptionsModuleAvailability.js";
import { useInvoicingModuleAvailability } from "../pages/invoicing/useInvoicingModuleAvailability.js";
import { useMailboxModuleAvailability } from "../pages/mailbox/useMailboxModuleAvailability.js";
import { useHrmModuleAvailability } from "../pages/workforce/useHrmModuleAvailability.js";

type ModuleAvailability = {
  platformEnabled: boolean | null;
  moduleRole: ModuleRole | null;
  loading: boolean;
  loadError: string;
  reload: () => void;
};

const useModuleAvailability = (module: TenantModuleKey): ModuleAvailability => {
  const crm = useCrmModuleAvailability();
  const sales = useSalesModuleAvailability();
  const workforce = useHrmModuleAvailability();
  const companySubscriptions = useCompanySubscriptionsModuleAvailability();
  const invoicing = useInvoicingModuleAvailability();
  const mailbox = useMailboxModuleAvailability();

  switch (module) {
    case "crm":
      return {
        platformEnabled: crm.crmEnabled,
        moduleRole: crm.crmRole,
        loading: crm.loading,
        loadError: crm.loadError,
        reload: crm.reload
      };
    case "sales":
      return {
        platformEnabled: sales.salesFunnelEnabled,
        moduleRole: sales.salesRole,
        loading: sales.loading,
        loadError: sales.loadError,
        reload: sales.reload
      };
    case "workforce":
      return {
        platformEnabled: workforce.hrmEnabled,
        moduleRole: workforce.workforceRole,
        loading: workforce.loading,
        loadError: workforce.loadError,
        reload: workforce.reload
      };
    case "company_subscriptions":
      return {
        platformEnabled: companySubscriptions.companySubscriptionsEnabled,
        moduleRole: companySubscriptions.companySubscriptionsRole,
        loading: companySubscriptions.loading,
        loadError: companySubscriptions.loadError,
        reload: companySubscriptions.reload
      };
    case "invoicing":
      return {
        platformEnabled: invoicing.invoicingEnabled,
        moduleRole: invoicing.invoicingRole,
        loading: invoicing.loading,
        loadError: invoicing.loadError,
        reload: invoicing.reload
      };
    case "mailbox":
      return {
        platformEnabled: mailbox.mailboxEnabled,
        moduleRole: mailbox.mailboxRole,
        loading: mailbox.loading,
        loadError: mailbox.loadError,
        reload: mailbox.reload
      };
  }
};

/**
 * Resolve platform flag, module role, and permission booleans for a tenant module key.
 *
 * @param module - One of `TENANT_MODULE_KEYS` (crm, sales, workforce, etc.).
 */
export const useModulePermissions = (module: TenantModuleKey) => {
  const { user } = useAuth();
  const { platformEnabled, moduleRole: roleFromApi, loading, loadError, reload } =
    useModuleAvailability(module);

  const moduleRole: ModuleRole | null =
    roleFromApi ?? (user ? resolveModuleRole(module, user.role, user.moduleRoles ?? {}) : null);

  const allows = (permission: ModulePermission) => modulePermissionAllowed(moduleRole, permission);
  const hasAccess = platformEnabled === true && moduleRole != null;

  return {
    module,
    platformEnabled,
    moduleRole,
    hasAccess,
    loading,
    loadError,
    reload,
    canRead: allows("read"),
    canWrite: allows("write"),
    canDelete: allows("delete")
  };
};
