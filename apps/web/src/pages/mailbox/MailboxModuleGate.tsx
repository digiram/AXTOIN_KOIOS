/**
 * Mailbox module gate.
 *
 * Route guard for tenant mailbox screens: blocks child routes when the platform module is disabled or the signed-in user lacks a module role.
 *
 * Responsibilities:
 * - Wrap nested routes with mailbox access checks
 * - Render platform-off and no-access messaging via ModuleAccessGate
 *
 * Related:
 * - Route: /admin/mailbox
 * - docs/guidelines/modules-index.md
 *
 * Security:
 * - Relies on JWT module roles; does not accept client-supplied tenant ids
 */
import { Outlet } from "react-router-dom";

import { ModuleAccessGate } from "../../components/ModuleAccessGate.js";

/** Blocks mailbox routes when platform-disabled or the user has no module role. */
export const MailboxModuleGate = () => (
  <ModuleAccessGate
    module="mailbox"
    platformOffTitle="Mailbox is turned off"
    platformOffMessage="Your platform administrator has disabled the mailbox module. Inbox and calendar features are not available until it is enabled again."
  >
    <Outlet />
  </ModuleAccessGate>
);
