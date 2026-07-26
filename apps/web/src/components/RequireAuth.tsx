/**
 * RequireAuth
 *
 * React Router layout gate that protects authenticated route subtrees.
 *
 * Responsibilities:
 * - Hold anonymous users until session is ready, then redirect to `/login`
 * - Optionally restrict by `UserRole` and bounce mismatched roles to their home route
 * - Render nested routes via `<Outlet />` when authorized
 *
 * Related:
 * - `AuthContext`; route definitions in `App.tsx`
 *
 * Security:
 * - Client-side gate — all API calls still require valid JWT regardless.
 */
import type { ReactElement } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import type { UserRole } from "@starter/shared";

import { useAuth } from "../auth/AuthContext.js";

const homeForRole = (role: UserRole): string => {
  if (role === "super_admin") return "/super-admin";
  if (role === "tenant_admin") return "/admin";
  return "/user";
};

/**
 * Layout gate: anonymous users go to `/login`; wrong role is bounced to the matching home route.
 */
export const RequireAuth = ({ roles }: { roles?: UserRole[] }): ReactElement => {
  const { ready, user } = useAuth();
  const location = useLocation();

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500">
        Loading session…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (roles?.length && !roles.includes(user.role)) {
    return <Navigate to={homeForRole(user.role)} replace />;
  }

  return <Outlet />;
};
