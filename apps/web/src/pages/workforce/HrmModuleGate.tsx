/**
 * HrmModuleGate.
 *
 * Route outlet guard for the tenant workforce module subtree.
 *
 * Responsibilities:
 * - Block when workforce is platform-disabled or user lacks a workforce role
 * - Render nested workforce routes via {@link ModuleAccessGate}
 *
 * Security:
 * - Client-side gate only; workforce API routes enforce module permissions independently
 */

import { Outlet } from "react-router-dom";

import { ModuleAccessGate } from "../../components/ModuleAccessGate.js";

/**
 * Tenant workforce routes: blocks when platform-disabled or user has no workforce role.
 *
 * @returns Module access gate wrapping child workforce routes
 */
export const HrmModuleGate = () => (
  <ModuleAccessGate
    module="workforce"
    platformOffTitle="Workforce is turned off"
    platformOffMessage="Your platform administrator has disabled the workforce module. The org chart and employee records are not available until it is enabled again."
  >
    <Outlet />
  </ModuleAccessGate>
);
