/**
 * SalesContactRolesSettingsPage.
 *
 * Sales settings screen for managing contact role labels linked to funnel records.
 *
 * Responsibilities:
 * - List roles from `/v1/tenant/sales/contact-roles` with usage counts
 * - Add and delete roles with confirmation when in use
 *
 * Depends on:
 * - {@link useSalesApi}
 *
 * Security:
 * - Mutations require Sales module write access (enforced server-side)
 */

import { Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { API_BASE_URL } from "../../lib/api.js";
import { useSalesApi } from "./useSalesApi.js";

type ContactRoleRow = {
  id: string;
  label: string;
  sortOrder: number;
  usageCount: number;
};

const inputClass =
  "w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/30";

/**
 * Settings page for Sales funnel contact role labels.
 *
 * @returns Contact roles CRUD UI under `/admin/sales/settings/contact-roles`
 */
export const SalesContactRolesSettingsPage = () => {
  const { authedFetch } = useSalesApi();
  const [roles, setRoles] = useState<ContactRoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addErr, setAddErr] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteErr, setDeleteErr] = useState("");

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const res = await authedFetch(`${API_BASE_URL}/tenant/sales/contact-roles`);
      if (!res?.ok) {
        setError("Could not load contact roles.");
        return;
      }
      const j = (await res.json()) as { roles: ContactRoleRow[] };
      setRoles(j.roles ?? []);
    } catch {
      setError("Could not load contact roles.");
    } finally {
      setLoading(false);
    }
  }, [authedFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  const addRole = async () => {
    const label = newLabel.trim();
    if (!label) {
      setAddErr("Enter a role name.");
      return;
    }
    setAddBusy(true);
    setAddErr("");
    try {
      const res = await authedFetch(`${API_BASE_URL}/tenant/sales/contact-roles`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label })
      });
      if (!res) return;
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { message?: string } | null;
        setAddErr(j?.message ?? "Could not add role.");
        return;
      }
      setNewLabel("");
      await load();
    } catch {
      setAddErr("Could not add role.");
    } finally {
      setAddBusy(false);
    }
  };

  const deleteRole = async (id: string) => {
    setDeleteErr("");
    setDeleteBusy(true);
    try {
      const res = await authedFetch(`${API_BASE_URL}/tenant/sales/contact-roles/${encodeURIComponent(id)}`, {
        method: "DELETE"
      });
      if (!res) return;
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { message?: string } | null;
        setDeleteErr(j?.message ?? "Could not delete role.");
        return;
      }
      setPendingDeleteId(null);
      await load();
    } catch {
      setDeleteErr("Could not delete role.");
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="w-full min-w-0 max-w-none space-y-6">
      <p className="text-sm leading-relaxed text-stone-600">
        Define role labels for contacts linked to BDR leads and Sales deals (for example Decision maker, Champion).
        Members pick from this list in the lead and deal side panel.{" "}
        <Link to="/admin/sales/bdr" className="font-medium text-indigo-600 underline hover:text-indigo-500">
          Back to BDR board
        </Link>
      </p>

      {error ? (
        <p className="text-sm text-rose-600" role="alert">
          {error}
        </p>
      ) : null}
      {deleteErr ? (
        <p className="text-sm text-rose-600" role="alert">
          {deleteErr}
        </p>
      ) : null}

      <section className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm sm:p-6">
        <h3 className="text-sm font-semibold text-slate-800">Add role</h3>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="min-w-[12rem] flex-1 text-xs font-medium text-stone-600">
            Role name
            <input
              className={`${inputClass} mt-1`}
              value={newLabel}
              disabled={addBusy}
              placeholder="e.g. Decision maker"
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void addRole();
              }}
            />
          </label>
          <button
            type="button"
            disabled={addBusy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            onClick={() => void addRole()}
          >
            <Plus className="h-4 w-4" aria-hidden />
            {addBusy ? "Adding…" : "Add role"}
          </button>
        </div>
        {addErr ? (
          <p className="mt-2 text-xs text-rose-600" role="alert">
            {addErr}
          </p>
        ) : null}
      </section>

      <div className="w-full min-w-0 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[32rem] table-auto border-collapse text-left text-sm">
          <caption className="sr-only">Sales contact roles</caption>
          <thead className="bg-slate-50">
            <tr>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500"
              >
                Role
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500"
              >
                In use
              </th>
              <th scope="col" className="w-[5rem] px-4 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {loading ? (
              <tr>
                <td colSpan={3} className="px-4 py-12 text-center text-sm text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : roles.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-12 text-center text-sm text-slate-500">
                  No roles yet. Add one above to enable role dropdowns on leads and deals.
                </td>
              </tr>
            ) : (
              roles.map((r) => {
                const pending = pendingDeleteId === r.id;
                return (
                  <tr key={r.id} className="bg-white">
                    <td className="px-4 py-3 font-medium text-stone-900">{r.label}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-stone-600">{r.usageCount}</td>
                    <td className="px-4 py-3 text-right">
                      {pending ? (
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            disabled={deleteBusy}
                            className="rounded-lg bg-rose-600 px-2 py-1 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                            onClick={() => void deleteRole(r.id)}
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            className="rounded-lg border border-stone-200 px-2 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50"
                            onClick={() => setPendingDeleteId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={r.usageCount > 0}
                          title={
                            r.usageCount > 0
                              ? "Remove this role from all leads and deals before deleting"
                              : "Delete role"
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-stone-200 px-2 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => setPendingDeleteId(r.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
