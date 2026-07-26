/**
 * CrmModuleGate.
 *
 * Route outlet guard for the tenant CRM module subtree.
 *
 * Responsibilities:
 * - Block rendering when CRM is platform-disabled or the user lacks a CRM role
 * - Show loading and retry UI while module availability is fetched
 * - Render nested CRM routes via `<Outlet />` when access is granted
 *
 * Depends on:
 * - {@link useCrmModuleAvailability}
 *
 * Security:
 * - Client-side gate only; CRM API handlers enforce module permissions independently
 */

import { Outlet } from "react-router-dom";

import { useCrmModuleAvailability } from "./useCrmModuleAvailability.js";

/**
 * Tenant CRM routes: blocks the subtree when the platform has disabled CRM or the user has no CRM role.
 *
 * @returns Loading, error, disabled, no-access, or outlet for child CRM routes
 */
export const CrmModuleGate = () => {
  const { crmEnabled, hasCrmAccess, loading, loadError, reload } = useCrmModuleAvailability();

  if (loading) {
    return (
      <div className="px-4 py-10 sm:px-6">
        <p className="text-sm text-stone-500">Loading…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="px-4 py-10 sm:px-6">
        <p className="text-sm text-rose-600">{loadError}</p>
        <button
          type="button"
          className="mt-4 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 shadow-sm hover:bg-stone-50"
          onClick={() => void reload()}
        >
          Retry
        </button>
      </div>
    );
  }

  if (crmEnabled === false) {
    return (
      <div className="px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-lg rounded-xl border border-stone-200 bg-white p-6 shadow-sm ring-1 ring-slate-900/5">
          <h2 className="text-base font-semibold text-slate-900">CRM is turned off</h2>
          <p className="mt-2 text-sm leading-relaxed text-stone-600">
            Your platform administrator has disabled the CRM module. Organizations, contacts, relationships, and
            activities are not available until it is enabled again.
          </p>
        </div>
      </div>
    );
  }

  if (!hasCrmAccess) {
    return (
      <div className="px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-lg rounded-xl border border-amber-200/80 bg-amber-50/40 p-6 shadow-sm ring-1 ring-amber-900/5">
          <h2 className="text-base font-semibold text-slate-900">No CRM access</h2>
          <p className="mt-2 text-sm leading-relaxed text-stone-600">
            You do not have a CRM role on this organization. Ask your tenant administrator to assign Manager, User, or
            Viewer access on the Users page.
          </p>
        </div>
      </div>
    );
  }

  return <Outlet />;
};
