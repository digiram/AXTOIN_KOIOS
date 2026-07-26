/**
 * AdminWorkforceLayout.
 *
 * Tabbed shell for tenant admin workforce hub routes (employees, org chart, organization).
 *
 * Responsibilities:
 * - Render section tabs with active state from pathname
 * - Host nested workforce routes via `<Outlet />`
 *
 * Related:
 * - Child routes mount under `/admin/workforce/*` behind {@link HrmModuleGate}
 */

import { NavLink, Outlet, useLocation } from "react-router-dom";

const tabListClass =
  "mb-6 flex w-full min-w-0 flex-nowrap gap-1 overflow-x-auto overflow-y-hidden rounded-full bg-slate-100 p-1 ring-1 ring-slate-900/5 [scrollbar-width:thin]";
const tabButtonBase =
  "min-h-[2.5rem] min-w-0 shrink-0 flex-1 rounded-full px-3 py-2 text-center text-sm transition-all duration-200 sm:px-4";
const tabActive = "bg-white font-semibold text-indigo-700 shadow-sm ring-1 ring-slate-200/80";
const tabIdle = "font-medium text-slate-600 hover:bg-white/60 hover:text-slate-900";

/**
 * Workforce hub tab layout: employees, organization chart, and leadership chart.
 *
 * @returns Tab strip and outlet for nested workforce pages
 */
export const AdminWorkforceLayout = () => {
  const { pathname } = useLocation();
  const onEmployees = pathname.includes("/admin/workforce/employees");
  const onChart = pathname.includes("/admin/workforce/chart");
  const onOrganization =
    pathname === "/admin/workforce/organization" || pathname === "/admin/workforce/organization/";

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
      <div className={`${tabListClass} shrink-0`} role="tablist" aria-label="Workforce sections">
        <NavLink
          to="/admin/workforce/employees"
          role="tab"
          aria-selected={onEmployees}
          className={({ isActive }) => `${tabButtonBase} ${isActive ? tabActive : tabIdle}`}
        >
          Employees
        </NavLink>
        <NavLink
          to="/admin/workforce/organization"
          end
          role="tab"
          aria-selected={onOrganization}
          className={({ isActive }) => `${tabButtonBase} ${isActive ? tabActive : tabIdle}`}
        >
          Organization
        </NavLink>
        <NavLink
          to="/admin/workforce/chart"
          end
          role="tab"
          aria-selected={onChart}
          className={({ isActive }) => `${tabButtonBase} ${isActive ? tabActive : tabIdle}`}
        >
          Organizational Structure & Leadership
        </NavLink>
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  );
};
