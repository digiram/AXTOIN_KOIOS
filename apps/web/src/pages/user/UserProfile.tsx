/**
 * UserProfile
 *
 * Read-only profile summary for the signed-in realm member.
 *
 * Responsibilities:
 * - Display email, tenant id, and role from `AuthContext`
 *
 * Security:
 * - Data comes from the access JWT/session context; no client-side tenant switching.
 */
import { useAuth } from "../../auth/AuthContext.js";

/** Profile fields panel for `/user/profile`. */
export const UserProfile = () => {
  const { user } = useAuth();

  return (
    <div className="w-full">
      <dl className="grid gap-4 text-sm">
        <div>
          <dt className="text-slate-500">Email</dt>
          <dd className="mt-1 font-mono text-slate-800">{user?.email ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Tenant id</dt>
          <dd className="mt-1 break-all font-mono text-xs text-slate-600">{user?.tenantId ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Role</dt>
          <dd className="mt-1 capitalize text-slate-800">{user?.role ?? "—"}</dd>
        </div>
      </dl>
    </div>
  );
};
