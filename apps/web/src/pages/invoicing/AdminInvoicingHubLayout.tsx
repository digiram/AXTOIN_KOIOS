/**
 * Admin Invoicing Hub Layout.
 *
 * Layout shell providing shared navigation, context, or grid structure for invoicing and quoting sub-routes.
 *
 * Responsibilities:
 * - Host nested router outlets and module-wide UI chrome
 * - Share module state across child routes where applicable
 *
 * Related:
 * - Route: /admin/invoicing
 */
import { NavLink, Outlet, useLocation } from "react-router-dom";

const tabListClass =
  "mb-6 flex w-full min-w-0 flex-nowrap gap-1 overflow-x-auto overflow-y-hidden rounded-full bg-slate-100 p-1 ring-1 ring-slate-900/5 [scrollbar-width:thin]";
const tabButtonBase =
  "min-h-[2.5rem] min-w-0 shrink-0 flex-1 rounded-full px-3 py-2 text-center text-sm transition-all duration-200 sm:px-4";
const tabActive = "bg-white font-semibold text-indigo-700 shadow-sm ring-1 ring-slate-200/80";
const tabIdle = "font-medium text-slate-600 hover:bg-white/60 hover:text-slate-900";

/** Hub tabs for documents, payments, configuration, and catalog — detail routes sit outside this layout. */
export const AdminInvoicingHubLayout = () => {
  const { pathname } = useLocation();
  const onDocuments = pathname === "/admin/invoicing" || pathname === "/admin/invoicing/";
  const onPayments = pathname.includes("/admin/invoicing/payments");
  const onConfiguration = pathname.includes("/admin/invoicing/configuration");
  const onCatalog = pathname.includes("/admin/invoicing/catalog");

  return (
    <div className="w-full min-w-0">
      <div className={tabListClass} role="tablist" aria-label="Invoicing sections">
        <NavLink
          to="/admin/invoicing"
          end
          role="tab"
          aria-selected={onDocuments}
          className={({ isActive }) => `${tabButtonBase} ${isActive ? tabActive : tabIdle}`}
        >
          Invoicing &amp; quoting
        </NavLink>
        <NavLink
          to="/admin/invoicing/payments"
          end
          role="tab"
          aria-selected={onPayments}
          className={({ isActive }) => `${tabButtonBase} ${isActive ? tabActive : tabIdle}`}
        >
          Payments
        </NavLink>
        <NavLink
          to="/admin/invoicing/configuration"
          end
          role="tab"
          aria-selected={onConfiguration}
          className={({ isActive }) => `${tabButtonBase} ${isActive ? tabActive : tabIdle}`}
        >
          Configuration
        </NavLink>
        <NavLink
          to="/admin/invoicing/catalog"
          end
          role="tab"
          aria-selected={onCatalog}
          className={({ isActive }) => `${tabButtonBase} ${isActive ? tabActive : tabIdle}`}
        >
          Catalog
        </NavLink>
      </div>
      <Outlet />
    </div>
  );
};
