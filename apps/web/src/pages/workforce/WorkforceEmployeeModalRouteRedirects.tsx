/**
 * WorkforceEmployeeModalRouteRedirects.
 *
 * Compatibility redirects that open employee modals via router location state.
 *
 * Responsibilities:
 * - Map `/employees/new` to list with new-employee modal state
 * - Map `/employees/:id/edit` to detail with edit modal state
 */

import { Navigate, useParams } from "react-router-dom";

/** `location.state` on employees list — opens the new-employee modal. */
export type WorkforceEmployeeModalLocationState = {
  workforceEmployeeModal?: "new" | "edit";
};

/**
 * `/admin/workforce/employees/new` → list with modal open (same as org chart +).
 */
export function WorkforceEmployeeNewRouteRedirect() {
  return <Navigate to="/admin/workforce/employees" replace state={{ workforceEmployeeModal: "new" }} />;
}

/**
 * `/admin/workforce/employees/:id/edit` → detail with edit modal open.
 */
export function WorkforceEmployeeEditRouteRedirect() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to="/admin/workforce/employees" replace />;
  return (
    <Navigate
      to={`/admin/workforce/employees/${encodeURIComponent(id)}`}
      replace
      state={{ workforceEmployeeModal: "edit" }}
    />
  );
}
