/**
 * ModuleAccessGate
 *
 * Route-level guard for optional tenant modules.
 *
 * Responsibilities:
 * - Wait for module permission probe from `useModulePermissions`
 * - Block when the platform disabled the module or the user lacks any role
 * - Show retry UI on load failure
 *
 * Related:
 * - `RequireAuth`; tenant module routes wrapped in layout gates
 *
 * Security:
 * - UI gate only — API routes enforce module permissions independently.
 */
import type { ReactNode } from "react";

import { MODULE_LABELS, type TenantModuleKey } from "@starter/shared";

import { useModulePermissions } from "../hooks/useModulePermissions.js";

type Props = {
  module: TenantModuleKey;
  platformOffTitle: string;
  platformOffMessage: string;
  children: ReactNode;
};

/** Route guard that blocks optional module pages when disabled or unauthorized. */
export const ModuleAccessGate = ({ module, platformOffTitle, platformOffMessage, children }: Props) => {
  const { platformEnabled, hasAccess, loading, loadError, reload } = useModulePermissions(module);
  const label = MODULE_LABELS[module];

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

  if (platformEnabled === false) {
    return (
      <div className="px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-lg rounded-xl border border-stone-200 bg-white p-6 shadow-sm ring-1 ring-slate-900/5">
          <h2 className="text-base font-semibold text-slate-900">{platformOffTitle}</h2>
          <p className="mt-2 text-sm leading-relaxed text-stone-600">{platformOffMessage}</p>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-lg rounded-xl border border-amber-200/80 bg-amber-50/40 p-6 shadow-sm ring-1 ring-amber-900/5">
          <h2 className="text-base font-semibold text-slate-900">No {label} access</h2>
          <p className="mt-2 text-sm leading-relaxed text-stone-600">
            You do not have a {label} role on this organization. Ask your tenant administrator to assign Manager, User,
            or Viewer access on the Users page.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
