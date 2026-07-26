/**
 * Mailbox Accounts page.
 *
 * Tenant mailbox screen mounted under AppShell at /admin/mailbox.
 *
 * Responsibilities:
 * - Load and render primary mailbox data for the route
 * - Wire user actions to tenant API endpoints
 * - Compose shared module components and modals
 *
 * Related:
 * - Route: /admin/mailbox
 *
 * Security:
 * - Tenant-scoped API calls via authenticated session
 */
import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Mail, Plus, RefreshCw, Signature } from "lucide-react";

import { useMailboxLayout } from "./MailboxLayout.js";
import { MailboxConnectAccountWizardModal,
  type MailboxImapConnectInput
} from "./MailboxConnectAccountWizardModal.js";
import { MailboxConnectionSettingsSyncNotice } from "./MailboxSyncErrorUi.js";
import { MailboxSyncSettingsPanel, useMailboxSyncPollTick } from "./MailboxSyncSettingsPanel.js";
import { MAILBOX_SETTINGS_GRID_COLS, MAILBOX_VIEWPORT_COLUMN, MailboxAccountToolbar } from "./mailboxShell.js";
import { MailboxComingSoon } from "./mailboxUi.js";
import { MailboxAccentStripe, shouldShowConnectionAccents } from "./mailboxAccent.js";
import type { MailboxConnection } from "./mailboxTypes.js";
import { useMailboxApi } from "./useMailboxApi.js";
import { useMailboxDisplayFormatters } from "./useMailboxDisplayFormatters.js";

type SettingsSection = "accounts" | "sync" | "signatures";

const SETTINGS_SECTIONS: {
  key: SettingsSection;
  label: string;
  description: string;
  icon: ReactNode;
  comingSoon?: boolean;
}[] = [
  {
    key: "accounts",
    label: "Connected accounts",
    description: "Gmail, Microsoft 365, and IMAP/SMTP",
    icon: <Mail className="h-4 w-4" aria-hidden />
  },
  {
    key: "sync",
    label: "Sync & refresh",
    description: "Background worker sync (automatic)",
    icon: <RefreshCw className="h-4 w-4" aria-hidden />
  },
  {
    key: "signatures",
    label: "Signatures",
    description: "Default reply and compose signatures",
    icon: <Signature className="h-4 w-4" aria-hidden />,
    comingSoon: true
  }
];

/** Route page component for tenant mailbox under AppShell. */
export const MailboxAccountsPage = () => {
  const { apiFetch } = useMailboxApi();
  const { formatDateTime } = useMailboxDisplayFormatters();
  const { accountId, accounts, connections, loadingAccounts, reloadAccounts } = useMailboxLayout();
  const [searchParams] = useSearchParams();
  const [activeSection, setActiveSection] = useState<SettingsSection>("accounts");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardBusy, setWizardBusy] = useState(false);
  const [wizardError, setWizardError] = useState("");

  useEffect(() => {
    if (searchParams.get("oauth_error") === "email_mismatch") {
      setWizardError("You signed in with a different email address. Please reconnect using the same account.");
      setWizardOpen(true);
      setActiveSection("accounts");
    } else if (searchParams.get("oauth_error")) {
      setWizardError("Sign-in was cancelled or failed. Please try again.");
      setWizardOpen(true);
    }
    if (searchParams.get("connected")) {
      setActiveSection("sync");
      void reloadAccounts();
    }
    if (searchParams.get("reconnected")) {
      setActiveSection("sync");
      void reloadAccounts();
    }
  }, [reloadAccounts, searchParams]);

  const connectOAuth = async (provider: "google" | "microsoft") => {
    setWizardError("");
    setWizardBusy(true);
    try {
      const res = await apiFetch(`/tenant/mailbox/oauth/${provider}/start`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        setWizardError(
          body?.message ??
            (res.status === 503
              ? `${provider === "google" ? "Google" : "Microsoft"} mailbox sign-in is not configured on this server.`
              : "Could not start sign-in. Please try again.")
        );
        return;
      }
      const json = (await res.json()) as { url: string };
      window.location.href = json.url;
    } finally {
      setWizardBusy(false);
    }
  };

  const connectImap = async (input: MailboxImapConnectInput) => {
    setWizardError("");
    setWizardBusy(true);
    try {
      const res = await apiFetch("/tenant/mailbox/accounts/imap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input)
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        setWizardError(body?.message ?? "Could not connect this account. Check your settings and password.");
        return;
      }
      setWizardOpen(false);
      setActiveSection("sync");
      await reloadAccounts();
    } finally {
      setWizardBusy(false);
    }
  };

  const disconnect = async (id: string) => {
    await apiFetch(`/tenant/mailbox/accounts/${id}`, { method: "DELETE" });
    await reloadAccounts();
  };

  const externalConnections = connections.filter((c) => !c.isSystemNotifications);
  const showConnectionAccents = shouldShowConnectionAccents(connections);
  const { tick: syncPollTick, requestFastPoll: requestSyncFastPoll } = useMailboxSyncPollTick(
    activeSection === "sync" && externalConnections.length > 0
  );

  const activeMeta = SETTINGS_SECTIONS.find((s) => s.key === activeSection)!;
  const mailboxLabel = accounts.find((a) => a.id === accountId)?.displayName ?? "this mailbox";

  return (
    <div className={MAILBOX_VIEWPORT_COLUMN}>
      <MailboxAccountToolbar />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className={`grid shrink-0 ${MAILBOX_SETTINGS_GRID_COLS}`}>
          <header className="flex items-center border-b border-r border-slate-200 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Settings</p>
          </header>
          <header className="flex items-center border-b border-slate-200 px-6 py-3">
            <h2 className="min-w-0 text-base font-semibold leading-snug text-slate-900">
              <span>{activeMeta.label}</span>
              <span className="font-normal text-slate-300" aria-hidden>
                {" "}
                ·{" "}
              </span>
              <span className="text-sm font-normal text-slate-500">{activeMeta.description}</span>
            </h2>
          </header>
        </div>

        <div className={`grid min-h-0 flex-1 ${MAILBOX_SETTINGS_GRID_COLS}`}>
          <nav
            className="flex min-h-0 flex-col overflow-y-auto border-r border-slate-200 bg-slate-50/50"
            aria-label="Mailbox settings"
          >
            <ul className="flex-1 p-2">
              {SETTINGS_SECTIONS.map((section) => {
                const active = activeSection === section.key;
                return (
                  <li key={section.key}>
                    <button
                      type="button"
                      disabled={section.comingSoon}
                      aria-current={active ? "page" : undefined}
                      className={[
                        "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                        active ? "bg-indigo-50 text-indigo-900 ring-1 ring-indigo-100" : "text-slate-700 hover:bg-white",
                        section.comingSoon ? "cursor-not-allowed opacity-60" : ""
                      ].join(" ")}
                      onClick={() => !section.comingSoon && setActiveSection(section.key)}
                    >
                      <span className={active ? "text-indigo-600" : "text-slate-400"}>{section.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="text-sm font-medium">{section.label}</span>
                          {section.comingSoon ? <MailboxComingSoon /> : null}
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-500">{section.description}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <section className="flex min-h-0 min-w-0 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              {activeSection === "accounts" ? (
                <AccountsSettingsPanel
                  connections={connections}
                  loading={loadingAccounts}
                  mailboxLabel={mailboxLabel}
                  showConnectionAccents={showConnectionAccents}
                  onAddAccount={() => {
                    setWizardError("");
                    setWizardOpen(true);
                  }}
                  onDisconnect={(id) => void disconnect(id)}
                />
              ) : activeSection === "sync" ? (
                <MailboxSyncSettingsPanel
                  connections={externalConnections}
                  showConnectionAccents={showConnectionAccents}
                  formatDateTime={formatDateTime}
                  pollTick={syncPollTick}
                  onRequestFastPoll={requestSyncFastPoll}
                />
              ) : (
                <SettingsComingSoonPanel label={activeMeta.label} />
              )}
            </div>
          </section>
        </div>
      </div>

      <MailboxConnectAccountWizardModal
        open={wizardOpen}
        busy={wizardBusy}
        error={wizardError}
        onClose={() => {
          if (wizardBusy) return;
          setWizardOpen(false);
          setWizardError("");
        }}
        onConnectOAuth={(provider) => void connectOAuth(provider)}
        onConnectImap={(input) => void connectImap(input)}
      />
    </div>
  );
};

const AccountsSettingsPanel = ({
  connections,
  loading,
  mailboxLabel,
  showConnectionAccents,
  onAddAccount,
  onDisconnect
}: {
  connections: MailboxConnection[];
  loading: boolean;
  mailboxLabel: string;
  showConnectionAccents: boolean;
  onAddAccount: () => void;
  onDisconnect: (id: string) => void;
}) => {
  const externalConnections = connections.filter((c) => !c.isSystemNotifications);

  return (
    <div className="mx-auto w-4/5 min-w-[80%] space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50/40 p-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900">Email accounts</h3>
          <p className="mt-1 text-sm text-slate-600">
            Connect Gmail, Microsoft 365, or any IMAP provider. Messages from every connection appear in one inbox for{" "}
            <span className="font-medium text-slate-800">{mailboxLabel}</span>.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700"
          onClick={onAddAccount}
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add account
        </button>
      </div>

      <div className="rounded-lg border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-900">Connected accounts</h3>
        {showConnectionAccents ? (
          <p className="mt-1 text-xs text-slate-500">
            Color bars identify each account — including system notifications — in the inbox and account selector.
          </p>
        ) : null}
        {loading && connections.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Loading connections…</p>
        ) : connections.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-4 py-8 text-center">
            <p className="text-sm font-medium text-slate-700">No email accounts yet</p>
            <p className="mt-1 text-sm text-slate-500">
              Add Gmail, Microsoft 365, or IMAP to start receiving mail in your mailbox.
            </p>
            <button
              type="button"
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50"
              onClick={onAddAccount}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add your first account
            </button>
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {connections.map((connection) => (
              <li
                key={connection.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3 pl-1"
              >
                <MailboxAccentStripe color={connection.color} show={showConnectionAccents} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900">{connection.displayName}</p>
                  <p className="text-xs text-slate-500">
                    {connection.connectionType}
                    {connection.emailAddress ? ` · ${connection.emailAddress}` : ""}
                  </p>
                  <MailboxConnectionSettingsSyncNotice connection={connection} />
                </div>
                <div className="flex gap-2">
                  {!connection.isSystemNotifications ? (
                    <button
                      type="button"
                      className="text-sm font-medium text-red-700 hover:underline"
                      onClick={() => onDisconnect(connection.id)}
                    >
                      Disconnect
                    </button>
                  ) : (
                    <span className="text-xs text-slate-500">Always on</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {!loading && externalConnections.length > 0 ? (
          <button
            type="button"
            className="mt-3 text-sm font-medium text-indigo-700 hover:underline"
            onClick={onAddAccount}
          >
            Add another account
          </button>
        ) : null}
      </div>
    </div>
  );
};

const SettingsComingSoonPanel = ({ label }: { label: string }) => (
  <div className="mx-auto flex min-h-[12rem] w-4/5 min-w-[80%] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/40 px-6 py-10 text-center">
    <p className="text-sm font-medium text-slate-700">{label}</p>
    <p className="max-w-sm text-sm text-slate-500">This setting will be available in a future update.</p>
    <MailboxComingSoon label="Coming soon" />
  </div>
);
