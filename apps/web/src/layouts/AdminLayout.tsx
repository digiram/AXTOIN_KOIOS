/**
 * TenantAdminLayout.
 *
 * Shell for realm administrators (`/admin/*`): left-rail navigation, header meta from the current path,
 * and optional module links when platform flags and module roles allow access.
 *
 * Responsibilities:
 * - Wrap routes in `TenantModuleAvailabilityProvider` for shared availability fetches
 * - Build dynamic nav (CRM, sales, workforce, company subscriptions, invoicing, mailbox)
 * - Delegate chrome to `AppShell` with settings link to `/admin/settings`
 *
 * Related:
 * - `shellRouteMeta.metaForTenantAdminPath` for title/subtitle copy
 * - `RequireAuth` with `tenant_admin` role in `App.tsx`
 */
import { useMemo } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { AppShell } from "../components/AppShell.js";
import { TenantModuleAvailabilityProvider } from "../contexts/TenantModuleAvailabilityContext.js";
import {
  CrmContactsIcon,
  CrmOrganizationsIcon,
  CompanySubscriptionsIcon,
  InvoicingIcon,
  MailboxIcon,
  DashboardIcon,
  SystemConfigIcon,
  UsersIcon,
  SalesIcon,
  WorkforceIcon
} from "../components/icons.js";
import { metaForTenantAdminPath } from "../lib/shellRouteMeta.js";
import { useAuth } from "../auth/AuthContext.js";
import { useCompanySubscriptionsModuleAvailability } from "../pages/company-subscriptions/useCompanySubscriptionsModuleAvailability.js";
import { useInvoicingModuleAvailability } from "../pages/invoicing/useInvoicingModuleAvailability.js";
import { useMailboxModuleAvailability } from "../pages/mailbox/useMailboxModuleAvailability.js";
import { useCrmModuleAvailability } from "../pages/crm/useCrmModuleAvailability.js";
import { useSalesModuleAvailability } from "../pages/sales/useSalesModuleAvailability.js";
import { useHrmModuleAvailability } from "../pages/workforce/useHrmModuleAvailability.js";

const baseNav = [
  { to: "/admin", label: "Dashboard", end: true, icon: <DashboardIcon /> },
  { to: "/admin/users", label: "Users", end: true, icon: <UsersIcon /> },
  { to: "/admin/system", label: "System", end: false, icon: <SystemConfigIcon /> }
];

const crmNav = [
  { to: "/admin/crm/organizations", label: "Organizations", end: false, icon: <CrmOrganizationsIcon /> },
  { to: "/admin/crm/contacts", label: "Contacts", end: true, icon: <CrmContactsIcon /> }
];

const workforceNavItem = {
  to: "/admin/workforce",
  label: "Workforce",
  end: false,
  icon: <WorkforceIcon />
};

const salesNavItem = {
  to: "/admin/sales",
  label: "Sales",
  end: false,
  icon: <SalesIcon />
};

const companySubscriptionsNavItem = {
  to: "/admin/company-subscriptions",
  label: "Company subscriptions",
  end: false,
  icon: <CompanySubscriptionsIcon />
};

const invoicingNavItem = {
  to: "/admin/invoicing",
  label: "Invoicing & quoting",
  end: false,
  icon: <InvoicingIcon />
};

const mailboxNavItem = {
  to: "/admin/mailbox",
  label: "Mailbox",
  end: false,
  icon: <MailboxIcon />
};

/** Tenant admin route layout: availability provider + dynamic module nav. */
export const AdminLayout = () => (
  <TenantModuleAvailabilityProvider>
    <AdminLayoutShell />
  </TenantModuleAvailabilityProvider>
);

const AdminLayoutShell = () => {
  const { pathname } = useLocation();
  const meta = metaForTenantAdminPath(pathname);
  const { user } = useAuth();
  const { crmEnabled, hasCrmAccess } = useCrmModuleAvailability();
  const showCrmNav = crmEnabled === true && (user?.role === "tenant_admin" || hasCrmAccess);
  const { hrmEnabled, hasWorkforceAccess } = useHrmModuleAvailability();
  const { salesFunnelEnabled, hasSalesAccess } = useSalesModuleAvailability();
  const { companySubscriptionsEnabled, hasCompanySubscriptionsAccess } =
    useCompanySubscriptionsModuleAvailability();
  const { invoicingEnabled, hasInvoicingAccess } = useInvoicingModuleAvailability();
  const { mailboxEnabled, hasMailboxAccess } = useMailboxModuleAvailability();

  const nav = useMemo(() => {
    const items = [...baseNav];
    if (showCrmNav) {
      items.push(...crmNav);
    }
    if (salesFunnelEnabled === true && (user?.role === "tenant_admin" || hasSalesAccess)) {
      items.push(salesNavItem);
    }
    if (hrmEnabled === true && (user?.role === "tenant_admin" || hasWorkforceAccess)) {
      items.push(workforceNavItem);
    }
    if (
      companySubscriptionsEnabled === true &&
      (user?.role === "tenant_admin" || hasCompanySubscriptionsAccess)
    ) {
      items.push(companySubscriptionsNavItem);
    }
    if (invoicingEnabled === true && (user?.role === "tenant_admin" || hasInvoicingAccess)) {
      items.push(invoicingNavItem);
    }
    if (mailboxEnabled === true && (user?.role === "tenant_admin" || hasMailboxAccess)) {
      items.push(mailboxNavItem);
    }
    return items;
  }, [
    showCrmNav,
    hasSalesAccess,
    hasWorkforceAccess,
    hasCompanySubscriptionsAccess,
    hasInvoicingAccess,
    hasMailboxAccess,
    hrmEnabled,
    salesFunnelEnabled,
    companySubscriptionsEnabled,
    invoicingEnabled,
    mailboxEnabled,
    user?.role
  ]);

  return (
    <AppShell title={meta.title} headerSubtitle={meta.subtitle} settingsTo="/admin/settings" nav={nav}>
      <Outlet />
    </AppShell>
  );
};
