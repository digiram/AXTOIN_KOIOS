/**
 * Mailbox Sync Error UI helpers.
 *
 * Shared Tailwind class names, labels, and table chrome for mailbox list and form screens.
 *
 * Responsibilities:
 * - Export consistent data-table and field styling tokens
 * - Host small presentation helpers reused across mailbox pages
 *
 * Related:
 * - Sibling page and modal components in mailbox
 */
import { useState } from "react";
import { Link } from "react-router-dom";

import type { MailboxConnection } from "./mailboxTypes.js";
import {
  connectionSupportsGuidedReconnect,
  mailboxSyncErrorInboxMessage,
  mailboxSyncErrorSettingsMessage,
  resolveInboxSyncErrorConnections
} from "./mailboxSyncErrors.js";
import { requestMailboxConnectionReconnect } from "./mailboxSyncActions.js";
import { useMailboxApi } from "./useMailboxApi.js";

const MAILBOX_SETTINGS_PATH = "/admin/mailbox/accounts";

/** React component for mailbox UI. */
export const MailboxReconnectButton = ({
  connection,
  className,
  label = "Reconnect account"
}: {
  connection: MailboxConnection;
  className?: string;
  label?: string;
}) => {
  const { apiFetch } = useMailboxApi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!connectionSupportsGuidedReconnect(connection)) return null;

  const handleReconnect = async () => {
    setBusy(true);
    setError("");
    const result = await requestMailboxConnectionReconnect(apiFetch, connection.id);
    if (!result.ok) {
      setError(result.message ?? "Could not start reconnect.");
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={busy}
        className={
          className ??
          "inline-flex items-center rounded-md border border-amber-300 bg-white px-2 py-0.5 text-xs font-medium text-amber-950 shadow-sm transition-colors hover:bg-amber-100/80 disabled:cursor-not-allowed disabled:opacity-60"
        }
        onClick={() => void handleReconnect()}
      >
        {busy ? "Opening sign-in…" : label}
      </button>
      {error ? <span className="text-xs text-red-700">{error}</span> : null}
    </span>
  );
};

/** Compact strip between the bulk toolbar and thread day groups. */
export const MailboxInboxSyncNotice = ({
  connections,
  connectionFilterId
}: {
  connections: MailboxConnection[];
  connectionFilterId: string | null;
}) => {
  const failing = resolveInboxSyncErrorConnections(connections, connectionFilterId);
  if (failing.length === 0) return null;

  const includeAccountName = connectionFilterId == null;

  return (
    <div
      className="border-b border-amber-200/80 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-950"
      role="status"
    >
      {failing.length === 1 ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>{mailboxSyncErrorInboxMessage(failing[0]!, { includeAccountName })}</span>
          {connectionSupportsGuidedReconnect(failing[0]!) ? (
            <MailboxReconnectButton connection={failing[0]!} />
          ) : (
            <Link
              to={MAILBOX_SETTINGS_PATH}
              className="font-medium text-amber-950 underline underline-offset-2"
            >
              Open mailbox settings
            </Link>
          )}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {failing.map((connection) => (
            <li key={connection.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>{mailboxSyncErrorInboxMessage(connection, { includeAccountName: true })}</span>
              {connectionSupportsGuidedReconnect(connection) ? (
                <MailboxReconnectButton connection={connection} label="Reconnect" />
              ) : (
                <Link
                  to={MAILBOX_SETTINGS_PATH}
                  className="font-medium text-amber-950 underline underline-offset-2"
                >
                  Settings
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/** Yellow note under a connected account on the settings page. */
export const MailboxConnectionSettingsSyncNotice = ({
  connection
}: {
  connection: MailboxConnection;
}) => {
  if (connection.syncStatus !== "error" || !connection.syncError) return null;

  return (
    <div
      className="mt-2 rounded-md border border-amber-200/80 bg-amber-50 px-2.5 py-2 text-xs leading-relaxed text-amber-950"
      role="status"
    >
      <p>{mailboxSyncErrorSettingsMessage(connection)}</p>
      {connectionSupportsGuidedReconnect(connection) ? (
        <div className="mt-2">
          <MailboxReconnectButton connection={connection} />
        </div>
      ) : null}
    </div>
  );
};
