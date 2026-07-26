/**
 * SuperAdminLayout.
 *
 * Shell for platform operators (`/super-admin/*`): cross-tenant tools without a realm context.
 *
 * Responsibilities:
 * - Static primary nav (overview, users, jobs, integrations, subscriptions, features, mail)
 * - Pathname-driven shell title and subtitle
 * - Delegate chrome to `AppShell` with settings link to `/super-admin/settings`
 *
 * Related:
 * - `RequireAuth` with `super_admin` role in `App.tsx`
 */
import { Outlet, useLocation } from "react-router-dom";

import { AppShell } from "../components/AppShell.js";
import {
  DashboardIcon,
  FeaturesIcon,
  IntegrationsIcon,
  JobQueuesIcon,
  MailIcon,
  SubscriptionsIcon,
  UsersIcon
} from "../components/icons.js";
import { SETTINGS_SHELL_SUBTITLE, SETTINGS_SHELL_TITLE } from "../pages/settings/settingsShellCopy.js";

const nav = [
  { to: "/super-admin", label: "Overview", end: true, icon: <DashboardIcon /> },
  { to: "/super-admin/users", label: "Users", end: true, icon: <UsersIcon /> },
  { to: "/super-admin/jobs", label: "Jobs", end: true, icon: <JobQueuesIcon /> },
  { to: "/super-admin/integrations", label: "Integrations", end: true, icon: <IntegrationsIcon /> },
  { to: "/super-admin/subscriptions", label: "Subscriptions", end: true, icon: <SubscriptionsIcon /> },
  { to: "/super-admin/features", label: "Features", end: true, icon: <FeaturesIcon /> },
  { to: "/super-admin/mail", label: "Mail", end: true, icon: <MailIcon /> }
];

/** Platform super-admin route layout and pathname-based shell copy. */
export const SuperLayout = () => {
  const { pathname } = useLocation();
  const isSettings = pathname.endsWith("/settings");
  const isUsers = pathname.includes("/super-admin/users");
  const isJobs = pathname.includes("/super-admin/jobs");
  const isIntegrations = pathname.includes("/super-admin/integrations");
  const isSubscriptions = pathname.includes("/super-admin/subscriptions");
  const isFeatures = pathname.includes("/super-admin/features");
  const isMail = pathname.includes("/super-admin/mail");

  const shellTitle = isSettings
    ? SETTINGS_SHELL_TITLE
    : isMail
      ? "Mail"
      : isFeatures
        ? "Features"
        : isSubscriptions
          ? "Subscriptions"
          : isIntegrations
            ? "Integrations"
            : isJobs
              ? "Background jobs"
              : isUsers
                ? "Users"
                : "Platform";
  const shellSubtitle = isSettings
    ? SETTINGS_SHELL_SUBTITLE
    : isMail
      ? "SMTP delivery settings for platform transactional mail."
      : isFeatures
        ? "Turn platform modules on or off for every tenant (for example CRM)."
        : isSubscriptions
          ? "Subscription plans, billing rules, and generated subscription payment records across tenants."
          : isIntegrations
            ? "Platform-wide providers (geolocation, payments, and more) that all tenants and apps can use."
            : isJobs
              ? "Inspect BullMQ queues on this deployment (email worker). Completed jobs may disappear quickly when jobs use removeOnComplete."
              : isUsers
                ? "Search and review accounts across all tenants and platform operators."
                : "Cross-tenant tools and delivery configuration — no tenant is attached to this session.";

  return (
    <AppShell
      title={shellTitle}
      headerSubtitle={shellSubtitle}
      nav={nav}
      settingsTo="/super-admin/settings"
    >
      <Outlet />
    </AppShell>
  );
};
