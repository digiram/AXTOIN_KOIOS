/**
 * Super Add User modal.
 *
 * Modal dialog for a focused super-admin create, edit, or confirmation flow.
 *
 * Responsibilities:
 * - Collect and validate user input for a single action
 * - Submit changes to tenant APIs and surface errors inline
 *
 * Related:
 * - Route: /super-admin
 *
 * Security:
 * - Submissions use authenticated tenant API helpers
 */
import type { PlatformUserCreateBody } from "@starter/shared";
import { Building2, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { CrmModal } from "../../components/crm/CrmModal.js";
import { crmModalOutlineInputClass } from "../../components/crm/crmModalOutlineInputClass.js";
import { API_BASE_URL } from "../../lib/api.js";

type TenantOption = { id: string; name: string };

type CreateUserResult = {
  user: {
    id: string;
    email: string;
    displayName: string | null;
    role: string;
    tenantId: string | null;
    tenantName: string | null;
    createdAt: string;
  };
  temporaryPassword?: string;
  passwordSent?: boolean;
  message?: string;
  tenantCreated?: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  authHeaders: () => Record<string, string>;
  refreshSession: () => Promise<boolean>;
  logout: () => void;
  onCreated: (result: CreateUserResult) => void;
};

type TenantMode = "existing" | "new";

/** Modal UI for a focused super-admin workflow. */
export const SuperAddUserModal = ({
  open,
  onClose,
  authHeaders,
  refreshSession,
  logout,
  onCreated
}: Props) => {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<PlatformUserCreateBody["role"]>("tenant_user");
  const [tenantMode, setTenantMode] = useState<TenantMode>("existing");
  const [tenantId, setTenantId] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [tenantSearch, setTenantSearch] = useState("");
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [tenantsLoading, setTenantsLoading] = useState(false);
  const [tenantsErr, setTenantsErr] = useState("");
  const [formErr, setFormErr] = useState("");
  const [busy, setBusy] = useState(false);

  const resetForm = useCallback(() => {
    setEmail("");
    setDisplayName("");
    setRole("tenant_user");
    setTenantMode("existing");
    setTenantId("");
    setTenantName("");
    setTenantSearch("");
    setFormErr("");
    setTenantsErr("");
  }, []);

  useEffect(() => {
    if (!open) {
      resetForm();
      return;
    }
    let cancelled = false;
    setTenantsLoading(true);
    setTenantsErr("");
    (async () => {
      const params = new URLSearchParams({ page: "1", pageSize: "100" });
      if (tenantSearch.trim()) params.set("q", tenantSearch.trim());
      const url = `${API_BASE_URL}/platform/tenants?${params.toString()}`;
      try {
        let res = await fetch(url, { headers: authHeaders() });
        if (res.status === 401) {
          const ok = await refreshSession();
          if (!ok) {
            logout();
            return;
          }
          res = await fetch(url, { headers: authHeaders() });
        }
        if (!res.ok) {
          const j = (await res.json().catch(() => null)) as { message?: string } | null;
          if (!cancelled) setTenantsErr(j?.message ?? "Could not load tenants.");
          return;
        }
        const j = (await res.json()) as { tenants?: TenantOption[] };
        if (!cancelled) {
          setTenants(Array.isArray(j.tenants) ? j.tenants : []);
        }
      } catch {
        if (!cancelled) setTenantsErr("Could not load tenants.");
      } finally {
        if (!cancelled) setTenantsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, tenantSearch, authHeaders, refreshSession, logout, resetForm]);

  const submit = async () => {
    setFormErr("");
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setFormErr("Enter an email address.");
      return;
    }
    if (tenantMode === "existing" && !tenantId) {
      setFormErr("Select an organization.");
      return;
    }
    if (tenantMode === "new" && !tenantName.trim()) {
      setFormErr("Enter a name for the new organization.");
      return;
    }

    const body: Record<string, unknown> = {
      email: trimmedEmail,
      role
    };
    if (displayName.trim()) body.displayName = displayName.trim();
    if (tenantMode === "existing") {
      body.tenantId = tenantId;
    } else {
      body.tenantName = tenantName.trim();
    }

    setBusy(true);
    try {
      let res = await fetch(`${API_BASE_URL}/platform/users`, {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      if (res.status === 401) {
        const ok = await refreshSession();
        if (!ok) {
          logout();
          return;
        }
        res = await fetch(`${API_BASE_URL}/platform/users`, {
          method: "POST",
          headers: { ...authHeaders(), "content-type": "application/json" },
          body: JSON.stringify(body)
        });
      }
      const j = (await res.json().catch(() => null)) as {
        message?: string;
        user?: CreateUserResult["user"];
        temporaryPassword?: string;
        passwordSent?: boolean;
        tenantCreated?: boolean;
      } | null;
      if (!res.ok) {
        setFormErr(j?.message ?? "Could not create user.");
        return;
      }
      if (!j?.user) {
        setFormErr("Unexpected response from server.");
        return;
      }
      onCreated({
        user: j.user,
        temporaryPassword: j.temporaryPassword,
        passwordSent: j.passwordSent,
        message: j.message,
        tenantCreated: j.tenantCreated
      });
      onClose();
    } catch {
      setFormErr("Could not create user.");
    } finally {
      setBusy(false);
    }
  };

  const selectClass = `${crmModalOutlineInputClass(false)} w-full`;

  return (
    <CrmModal title="Add user" open={open} onClose={busy ? () => {} : onClose}>
      <div className="space-y-5 text-sm">
        <p className="leading-relaxed text-stone-600">
          Provision a realm account into an existing organization or create a new organization first. A temporary
          password is generated for the user (emailed in production when SMTP is configured).
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="super-add-user-email" className="mb-1.5 block text-xs font-medium text-stone-600">
              Email
            </label>
            <input
              id="super-add-user-email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={selectClass}
              disabled={busy}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="super-add-user-display" className="mb-1.5 block text-xs font-medium text-stone-600">
              Display name <span className="font-normal text-stone-400">(optional)</span>
            </label>
            <input
              id="super-add-user-display"
              type="text"
              autoComplete="off"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={selectClass}
              disabled={busy}
            />
          </div>
          <div>
            <label htmlFor="super-add-user-role" className="mb-1.5 block text-xs font-medium text-stone-600">
              Role
            </label>
            <select
              id="super-add-user-role"
              value={role}
              onChange={(e) => setRole(e.target.value as PlatformUserCreateBody["role"])}
              className={selectClass}
              disabled={busy}
            >
              <option value="tenant_user">Member</option>
              <option value="tenant_admin">Tenant admin</option>
            </select>
          </div>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold uppercase tracking-wide text-stone-500">Organization</legend>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm has-[:checked]:border-amber-400 has-[:checked]:bg-amber-50">
              <input
                type="radio"
                name="super-add-user-tenant-mode"
                value="existing"
                checked={tenantMode === "existing"}
                onChange={() => setTenantMode("existing")}
                disabled={busy}
                className="text-amber-600 focus:ring-amber-400/40"
              />
              Existing organization
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm has-[:checked]:border-amber-400 has-[:checked]:bg-amber-50">
              <input
                type="radio"
                name="super-add-user-tenant-mode"
                value="new"
                checked={tenantMode === "new"}
                onChange={() => setTenantMode("new")}
                disabled={busy}
                className="text-amber-600 focus:ring-amber-400/40"
              />
              <Plus className="h-3.5 w-3.5 text-stone-500" aria-hidden strokeWidth={2} />
              New organization
            </label>
          </div>

          {tenantMode === "existing" ? (
            <div className="space-y-2">
              <label htmlFor="super-add-user-tenant-search" className="mb-1.5 block text-xs font-medium text-stone-600">
                Search organizations
              </label>
              <input
                id="super-add-user-tenant-search"
                type="search"
                placeholder="Filter by name…"
                autoComplete="off"
                value={tenantSearch}
                onChange={(e) => setTenantSearch(e.target.value)}
                className={selectClass}
                disabled={busy}
              />
              <label htmlFor="super-add-user-tenant" className="mb-1.5 block text-xs font-medium text-stone-600">
                Organization
              </label>
              <select
                id="super-add-user-tenant"
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                className={selectClass}
                disabled={busy || tenantsLoading}
              >
                <option value="">{tenantsLoading ? "Loading…" : "Select organization…"}</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              {tenantsErr ? <p className="text-xs text-rose-600">{tenantsErr}</p> : null}
            </div>
          ) : (
            <div>
              <label htmlFor="super-add-user-tenant-name" className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-stone-600">
                <Building2 className="h-3.5 w-3.5 text-stone-500" aria-hidden strokeWidth={2} />
                New organization name
              </label>
              <input
                id="super-add-user-tenant-name"
                type="text"
                placeholder="e.g. acme.com or Acme Corp"
                autoComplete="off"
                value={tenantName}
                onChange={(e) => setTenantName(e.target.value)}
                className={selectClass}
                disabled={busy}
              />
              <p className="mt-1.5 text-xs text-stone-500">
                Must be unique. If the name already exists, the user is added to that organization instead.
              </p>
            </div>
          )}
        </fieldset>

        {formErr ? (
          <p className="text-sm text-rose-600" role="alert">
            {formErr}
          </p>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2 border-t border-stone-100 pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-800 shadow-sm hover:bg-stone-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create user"}
          </button>
        </div>
      </div>
    </CrmModal>
  );
};
