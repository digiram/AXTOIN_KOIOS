/**
 * Invoicing module gate.
 *
 * Route guard for tenant invoicing and quoting screens: blocks child routes when the platform module is disabled or the signed-in user lacks a module role.
 *
 * Responsibilities:
 * - Wrap nested routes with invoicing and quoting access checks
 * - Render platform-off and no-access messaging via ModuleAccessGate
 *
 * Related:
 * - Route: /admin/invoicing
 * - docs/guidelines/modules-index.md
 *
 * Security:
 * - Relies on JWT module roles; does not accept client-supplied tenant ids
 */
import { Outlet } from "react-router-dom";

import { ModuleAccessGate } from "../../components/ModuleAccessGate.js";

/** Blocks invoicing & quoting routes when platform-disabled or the user has no module role. */
export const InvoicingModuleGate = () => (
  <ModuleAccessGate
    module="invoicing"
    platformOffTitle="Invoicing & quoting is turned off"
    platformOffMessage="Your platform administrator has disabled the invoicing module. Commercial documents are not available until it is enabled again."
  >
    <Outlet />
  </ModuleAccessGate>
);
