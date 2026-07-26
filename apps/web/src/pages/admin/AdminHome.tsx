/**
 * Admin Home.
 *
 * Default landing screen for tenant administrators after sign-in.
 *
 * Responsibilities:
 * - Orient realm admins to tenant-scoped tooling under /admin
 * - Link to platform-wide super-admin console when relevant
 *
 * Related:
 * - Route: /admin
 */
export const AdminHome = () => (
  <div className="w-full">
    <p className="leading-relaxed text-slate-600">
      Tenant admins scope operations to their realm only (invite flows, settings). Platform-wide tooling belongs under{" "}
      <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm font-mono text-indigo-700 ring-1 ring-slate-200">
        /super-admin
      </code>
      . Regular users use{" "}
      <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm font-mono text-indigo-700 ring-1 ring-slate-200">
        /user
      </code>
      .
    </p>
  </div>
);
