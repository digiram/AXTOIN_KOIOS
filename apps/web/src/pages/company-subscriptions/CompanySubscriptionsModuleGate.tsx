/**
 * Company Subscriptions module gate.
 *
 * Route guard for tenant company subscriptions screens: blocks child routes when the platform module is disabled or the signed-in user lacks a module role.
 *
 * Responsibilities:
 * - Wrap nested routes with company subscriptions access checks
 * - Render platform-off and no-access messaging via ModuleAccessGate
 *
 * Related:
 * - Route: /admin/company-subscriptions
 * - docs/guidelines/modules-index.md
 *
 * Security:
 * - Relies on JWT module roles; does not accept client-supplied tenant ids
 */
import { Outlet } from "react-router-dom";

import { ModuleAccessGate } from "../../components/ModuleAccessGate.js";

/**
 * Tenant company subscriptions routes: blocks when platform-disabled or user has no module role.
 */
export const CompanySubscriptionsModuleGate = () => (
  <ModuleAccessGate
    module="company_subscriptions"
    platformOffTitle="Company subscriptions is turned off"
    platformOffMessage="Your platform administrator has disabled the company subscriptions module. Vendor subscription records are not available until it is enabled again."
  >
    <Outlet />
  </ModuleAccessGate>
);
