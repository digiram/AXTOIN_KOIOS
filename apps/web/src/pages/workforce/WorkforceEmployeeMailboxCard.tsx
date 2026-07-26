/**
 * WorkforceEmployeeMailboxCard.
 *
 * Agent-only mailbox configuration: connect Gmail / Microsoft / IMAP, list connections,
 * and manage mailbox members (viewer / sender / admin).
 *
 * Responsibilities:
 * - Call `/v1/tenant/mailbox/agents/:employeeId/*` when mailbox + workforce are enabled
 * - Reuse the mailbox connect wizard look-and-feel inside the employee card
 *
 * Security:
 * - Tenant-scoped; connect/members require manage rights server-side
 */

import { Loader2, Mail, Plus, Trash2, UserPlus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { mailboxConnectionTypeLabel } from "@starter/shared";
import { API_BASE_URL } from "../../lib/api.js";
import { useAuth } from "../../auth/AuthContext.js";
import { useMailboxModuleAvailability } from "../mailbox/useMailboxModuleAvailability.js";
import {
  MailboxConnectAccountWizardModal,
  type MailboxImapConnectInput
} from "../mailbox/MailboxConnectAccountWizardModal.js";
import { useWorkforceApi } from "./useWorkforceApi.js";

type AgentConnection = {
  id: string;
  inboxId: string;
  displayName: string;
  emailAddress: string;
  provider: string;
  connectionType: string;
  isSystemNotifications: boolean;
  syncStatus: string;
  syncError: string | null;
};

type AgentMember = {
  id: string;
  userId: string;
  role: "viewer" | "sender" | "admin";
};

type TenantUserOption = {
  id: string;
  email: string;
  displayName?: string | null;
};

type Props = {
  employeeId: string;
};

/**
 * Mailbox configuration card for workforce agents.
 *
 * @param employeeId - Workforce employee id (`employeeKind` must be agent server-side)
 */
export const WorkforceEmployeeMailboxCard = ({ employeeId }: Props) => {
  const { authedFetch } = useWorkforceApi();
  const { mailboxEnabled, hasMailboxAccess } = useMailboxModuleAvailability();
  const { user } = useAuth();
  const canManage = user?.role === "tenant_admin";

  const base = `${API_BASE_URL}/tenant/mailbox/agents/${encodeURIComponent(employeeId)}`;

  const [connections, setConnections] = useState<AgentConnection[]>([]);
  const [members, setMembers] = useState<AgentMember[]>([]);
  const [tenantUsers, setTenantUsers] = useState<TenantUserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardBusy, setWizardBusy] = useState(false);
  const [wizardError, setWizardError] = useState("");
  const [memberUserId, setMemberUserId] = useState("");
  const [memberBusy, setMemberBusy] = useState(false);

  const load = useCallback(async () => {
    if (mailboxEnabled !== true || !hasMailboxAccess) {
      setLoading(false);
      return;
    }
    setError("");
    setLoading(true);
    try {
      const [accountsRes, membersRes] = await Promise.all([
        authedFetch(`${base}/accounts`),
        authedFetch(`${base}/members`)
      ]);
      if (accountsRes?.status === 403 || membersRes?.status === 403) {
        setError("Mailbox access is required to manage agent mailboxes.");
        return;
      }
      if (!accountsRes?.ok) {
        setError("Could not load agent mailbox accounts.");
        return;
      }
      const accountsJson = (await accountsRes.json()) as { connections?: AgentConnection[] };
      setConnections(accountsJson.connections ?? []);
      if (membersRes?.ok) {
        const membersJson = (await membersRes.json()) as { members?: AgentMember[] };
        setMembers(membersJson.members ?? []);
      }
    } catch {
      setError("Could not load agent mailbox.");
    } finally {
      setLoading(false);
    }
  }, [authedFetch, base, hasMailboxAccess, mailboxEnabled]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!canManage || mailboxEnabled !== true) return;
    void (async () => {
      const res = await authedFetch(`${API_BASE_URL}/tenant/users?pageSize=100`);
      if (!res?.ok) return;
      const json = (await res.json()) as { users?: TenantUserOption[] };
      setTenantUsers(json.users ?? []);
    })();
  }, [authedFetch, canManage, mailboxEnabled]);

  const connectOAuth = async (provider: "google" | "microsoft") => {
    setWizardError("");
    setWizardBusy(true);
    try {
      const res = await authedFetch(`${base}/oauth/${provider}/start`);
      if (!res?.ok) {
        const body = (await res?.json().catch(() => null)) as { message?: string } | null;
        setWizardError(body?.message ?? "Could not start OAuth connect.");
        return;
      }
      const json = (await res.json()) as { url?: string };
      if (!json.url) {
        setWizardError("OAuth URL missing.");
        return;
      }
      window.location.assign(json.url);
    } catch {
      setWizardError("Could not start OAuth connect.");
    } finally {
      setWizardBusy(false);
    }
  };

  const connectImap = async (input: MailboxImapConnectInput) => {
    setWizardError("");
    setWizardBusy(true);
    try {
      const res = await authedFetch(`${base}/accounts/imap`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input)
      });
      if (!res?.ok) {
        const body = (await res?.json().catch(() => null)) as { message?: string } | null;
        setWizardError(body?.message ?? "Could not connect this account.");
        return;
      }
      setWizardOpen(false);
      await load();
    } catch {
      setWizardError("Could not connect this account.");
    } finally {
      setWizardBusy(false);
    }
  };

  const disconnect = async (connectionId: string) => {
    setError("");
    const res = await authedFetch(`${API_BASE_URL}/tenant/mailbox/accounts/${encodeURIComponent(connectionId)}`, {
      method: "DELETE"
    });
    if (!res?.ok) {
      setError("Could not disconnect account.");
      return;
    }
    await load();
  };

  const addMember = async () => {
    if (!memberUserId) return;
    setMemberBusy(true);
    setError("");
    try {
      const res = await authedFetch(`${base}/members`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: memberUserId, role: "admin" })
      });
      if (!res?.ok) {
        setError("Could not add member.");
        return;
      }
      setMemberUserId("");
      await load();
    } finally {
      setMemberBusy(false);
    }
  };

  const removeMember = async (userId: string) => {
    setError("");
    const res = await authedFetch(`${base}/members/${encodeURIComponent(userId)}`, { method: "DELETE" });
    if (!res?.ok) {
      setError("Could not remove member.");
      return;
    }
    await load();
  };

  if (mailboxEnabled === false) {
    return null;
  }

  if (mailboxEnabled === null) {
    return (
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm ring-1 ring-slate-900/5 sm:p-6">
        <p className="text-sm text-slate-500">Loading mailbox availability…</p>
      </div>
    );
  }

  if (!hasMailboxAccess) {
    return (
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm ring-1 ring-slate-900/5 sm:p-6">
        <h3 className="text-sm font-semibold text-slate-900">Mailbox</h3>
        <p className="mt-1 text-xs text-slate-500">You need Mailbox module access to configure agent mailboxes.</p>
      </div>
    );
  }

  const external = connections.filter((c) => !c.isSystemNotifications);
  const memberLabel = (m: AgentMember) => {
    const u = tenantUsers.find((row) => row.id === m.userId);
    return u?.displayName?.trim() || u?.email || m.userId;
  };

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm ring-1 ring-slate-900/5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Mailbox</h3>
          <p className="mt-1 text-xs text-slate-500">
            Connect Gmail, Microsoft 365, or IMAP accounts for this agent. Linked mailboxes appear in Mailbox for tenant
            admins and explicit members.
          </p>
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={() => {
              setWizardError("");
              setWizardOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Connect account
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="mt-3 text-sm text-rose-600" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading…
        </p>
      ) : external.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50/80 px-4 py-6 text-center">
          <Mail className="mx-auto h-8 w-8 text-slate-400" aria-hidden />
          <p className="mt-2 text-sm font-medium text-slate-700">No connected accounts</p>
          <p className="mt-1 text-xs text-slate-500">Create the mailbox at the provider, then connect it here.</p>
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {external.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200/90 px-3 py-2.5 shadow-sm"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">{c.displayName || c.emailAddress}</p>
                <p className="truncate text-xs text-slate-500">
                  {mailboxConnectionTypeLabel(c.provider as "gmail" | "microsoft" | "imap" | "internal")} ·{" "}
                  {c.emailAddress}
                  {c.syncStatus === "error" && c.syncError ? ` · Sync error` : ""}
                </p>
              </div>
              {canManage && !c.isSystemNotifications ? (
                <button
                  type="button"
                  onClick={() => void disconnect(c.id)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  Disconnect
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <div className="mt-6 border-t border-slate-100 pt-5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Members</h4>
          <p className="mt-1 text-xs text-slate-500">
            Tenant admins always have access. Add members with full access (admin) for this agent mailbox.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="min-w-[12rem] flex-1 text-xs font-medium text-slate-700">
              User
              <select
                value={memberUserId}
                onChange={(e) => setMemberUserId(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 shadow-sm"
              >
                <option value="">Select user…</option>
                {tenantUsers
                  .filter((u) => !members.some((m) => m.userId === u.id))
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.displayName?.trim() || u.email}
                    </option>
                  ))}
              </select>
            </label>
            <button
              type="button"
              disabled={!memberUserId || memberBusy}
              onClick={() => void addMember()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
            >
              <UserPlus className="h-3.5 w-3.5" aria-hidden />
              Add full access
            </button>
          </div>
          {members.length > 0 ? (
            <ul className="mt-3 space-y-1.5">
              {members.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-200/80 px-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate text-slate-800">
                    {memberLabel(m)}{" "}
                    <span className="text-xs text-slate-500">({m.role})</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void removeMember(m.userId)}
                    className="text-xs font-medium text-rose-700 hover:underline"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-slate-500">No explicit members yet.</p>
          )}
        </div>
      ) : null}

      <MailboxConnectAccountWizardModal
        open={wizardOpen}
        busy={wizardBusy}
        error={wizardError}
        onClose={() => setWizardOpen(false)}
        onConnectOAuth={connectOAuth}
        onConnectImap={connectImap}
      />
    </div>
  );
};
