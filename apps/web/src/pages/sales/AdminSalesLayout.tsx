/**
 * AdminSalesLayout.
 *
 * Tabbed shell for tenant admin Sales hub routes (BDR, records, pipeline, settings).
 *
 * Responsibilities:
 * - Render section tabs with active state from pathname
 * - Host nested sales routes via `<Outlet />`
 *
 * Related:
 * - Child routes mount under `/admin/sales/*` behind {@link SalesModuleGate}
 */

import { NavLink, Outlet, useLocation } from "react-router-dom";

const tabListClass =
  "mb-6 flex w-full min-w-0 flex-nowrap gap-1 overflow-x-auto overflow-y-hidden rounded-full bg-slate-100 p-1 ring-1 ring-slate-900/5 [scrollbar-width:thin]";
const tabButtonBase =
  "min-h-[2.5rem] min-w-0 shrink-0 flex-1 rounded-full px-3 py-2 text-center text-sm transition-all duration-200 sm:px-4";
const tabActive = "bg-white font-semibold text-indigo-700 shadow-sm ring-1 ring-slate-200/80";
const tabIdle = "font-medium text-slate-600 hover:bg-white/60 hover:text-slate-900";

/**
 * Sales hub tab layout: BDR, records, pipeline, and settings sections.
 *
 * @returns Tab strip and outlet for nested sales pages
 */
export const AdminSalesLayout = () => {
  const { pathname } = useLocation();
  const onBdr =
    pathname.includes("/admin/sales/bdr") ||
    pathname === "/admin/sales" ||
    pathname === "/admin/sales/";
  const onRecords = pathname.includes("/admin/sales/records");
  const onPipeline = pathname.includes("/admin/sales/pipeline");
  const onSettings = pathname.includes("/admin/sales/settings");

  return (
    <div className="w-full min-w-0">
      <div className={tabListClass} role="tablist" aria-label="Sales sections">
        <NavLink
          to="/admin/sales/bdr"
          end
          role="tab"
          aria-selected={onBdr}
          className={({ isActive }) => `${tabButtonBase} ${isActive ? tabActive : tabIdle}`}
        >
          BDR
        </NavLink>
        <NavLink
          to="/admin/sales/pipeline"
          end
          role="tab"
          aria-selected={onPipeline}
          className={({ isActive }) => `${tabButtonBase} ${isActive ? tabActive : tabIdle}`}
        >
          Sales
        </NavLink>
        <NavLink
          to="/admin/sales/records"
          end
          role="tab"
          aria-selected={onRecords}
          className={({ isActive }) => `${tabButtonBase} ${isActive ? tabActive : tabIdle}`}
        >
          Leads &amp; deals
        </NavLink>
        <NavLink
          to="/admin/sales/settings"
          end
          role="tab"
          aria-selected={onSettings}
          className={({ isActive }) => `${tabButtonBase} ${isActive ? tabActive : tabIdle}`}
        >
          Settings
        </NavLink>
      </div>
      <Outlet />
    </div>
  );
};
