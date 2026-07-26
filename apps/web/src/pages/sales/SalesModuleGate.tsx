/**
 * SalesModuleGate.
 *
 * Route outlet guard for the tenant Sales funnel module subtree.
 *
 * Responsibilities:
 * - Block when Sales is platform-disabled (with CRM prerequisite messaging when applicable)
 * - Delegate per-user module role checks to {@link ModuleAccessGate}
 *
 * Depends on:
 * - {@link useSalesModuleAvailability}
 *
 * Security:
 * - Client-side gate only; Sales API routes enforce module permissions independently
 */

import { Outlet } from "react-router-dom";

import { ModuleAccessGate } from "../../components/ModuleAccessGate.js";
import { useSalesModuleAvailability } from "./useSalesModuleAvailability.js";

/**
 * Tenant Sales routes: blocks when platform-disabled or user lacks a Sales module role.
 *
 * @returns Platform-off message, module access gate, or outlet for child sales routes
 */
export const SalesModuleGate = () => {
  const { salesFunnelEnabled, crmEnabled, loading } = useSalesModuleAvailability();

  if (!loading && salesFunnelEnabled === false) {
    return (
      <div className="px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-lg rounded-xl border border-stone-200 bg-white p-6 shadow-sm ring-1 ring-slate-900/5">
          <h2 className="text-base font-semibold text-slate-900">Sales is not available</h2>
          <p className="mt-2 text-sm leading-relaxed text-stone-600">
            {crmEnabled === false
              ? "The CRM module must be enabled platform-wide before Sales can be used."
              : "Your platform administrator has disabled the Sales module. Pipelines and APIs are unavailable until it is enabled again."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <ModuleAccessGate
      module="sales"
      platformOffTitle="Sales is not available"
      platformOffMessage="Sales is disabled."
    >
      <Outlet />
    </ModuleAccessGate>
  );
};
