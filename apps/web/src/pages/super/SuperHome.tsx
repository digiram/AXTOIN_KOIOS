/**
 * Super Home.
 *
 * Default landing screen for platform super administrators.
 *
 * Responsibilities:
 * - Explain super-admin session scope (no tenant attached)
 * - Point operators to cross-tenant tooling in the left rail
 *
 * Related:
 * - Route: /super-admin
 */
export const SuperHome = () => (
  <div className="w-full">
    <p className="leading-relaxed text-slate-600">
      You are signed in as a <strong className="font-semibold text-slate-800">super admin</strong> — no tenant is
      attached to this session. Add cross-tenant or system APIs here (billing oversight, support impersonation, feature
      flags, etc.).
    </p>
    <p className="mt-4 text-sm text-slate-500">
      Realm admins and members sign in at <code className="text-indigo-700">/login</code> with their work email — the
      realm is inferred from the email domain.
    </p>
  </div>
);
