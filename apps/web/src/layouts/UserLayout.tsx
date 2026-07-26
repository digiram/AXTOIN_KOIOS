/**
 * TenantMemberLayout.
 *
 * Shell for standard realm users (`/user/*`): home plus optional CRM when the user has module access.
 *
 * Responsibilities:
 * - Wrap routes in `TenantModuleAvailabilityProvider`
 * - Append CRM nav items when `hasCrmAccess` is true
 * - Delegate chrome to `AppShell` with settings link to `/user/settings`
 *
 * Related:
 * - `shellRouteMeta.metaForTenantMemberPath` for title/subtitle copy
 * - `RequireAuth` with `tenant_user` role in `App.tsx`
 */
import { useMemo } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { AppShell } from "../components/AppShell.js";
import { TenantModuleAvailabilityProvider } from "../contexts/TenantModuleAvailabilityContext.js";
import { CrmContactsIcon, CrmOrganizationsIcon, HomeIcon } from "../components/icons.js";
import { metaForTenantMemberPath } from "../lib/shellRouteMeta.js";
import { useCrmModuleAvailability } from "../pages/crm/useCrmModuleAvailability.js";

const baseNav = [{ to: "/user", label: "Home", end: true, icon: <HomeIcon /> }];

const crmNav = [
  { to: "/user/crm/organizations", label: "Organizations", end: false, icon: <CrmOrganizationsIcon /> },
  { to: "/user/crm/contacts", label: "Contacts", end: true, icon: <CrmContactsIcon /> }
];

/** Tenant member route layout: availability provider + optional CRM nav. */
export const UserLayout = () => (
  <TenantModuleAvailabilityProvider>
    <UserLayoutShell />
  </TenantModuleAvailabilityProvider>
);

const UserLayoutShell = () => {
  const { pathname } = useLocation();
  const meta = metaForTenantMemberPath(pathname);
  const { hasCrmAccess } = useCrmModuleAvailability();

  const nav = useMemo(() => {
    if (hasCrmAccess) {
      return [...baseNav, ...crmNav];
    }
    return baseNav;
  }, [hasCrmAccess]);

  return (
    <AppShell
      title={meta.title}
      headerSubtitle={meta.subtitle}
      nav={nav}
      settingsTo="/user/settings"
    >
      <Outlet />
    </AppShell>
  );
};
