/**
 * Mailbox Sync Errors.
 *
 * Supporting module for tenant mailbox: mailbox Sync Errors.
 *
 * Responsibilities:
 * - Provide types, helpers, or components consumed by mailbox pages
 *
 * Related:
 * - Route: /admin/mailbox
 */
import { isMailboxOAuthReconnectRequired } from "@starter/shared";

import type { MailboxConnection } from "./mailboxTypes.js";
import { externalMailboxConnections } from "./mailboxSyncActions.js";

/** Shared constant or class token for mailbox presentation. */
export const connectionHasSyncError = (connection: MailboxConnection): boolean =>
  !connection.isSystemNotifications &&
  connection.syncStatus === "error" &&
  Boolean(connection.syncError?.trim());

/** Shared constant or class token for mailbox presentation. */
export const mailboxConnectionsWithSyncErrors = (
  connections: MailboxConnection[]
): MailboxConnection[] => externalMailboxConnections(connections).filter(connectionHasSyncError);

/** Connections whose sync errors apply to the current mailbox view. */
export const resolveInboxSyncErrorConnections = (
  connections: MailboxConnection[],
  connectionFilterId: string | null
): MailboxConnection[] => {
  const failing = mailboxConnectionsWithSyncErrors(connections);
  if (connectionFilterId) {
    return failing.filter((connection) => connection.id === connectionFilterId);
  }
  return failing;
};

/** Short label for dropdown / compact UI. */
export const mailboxSyncErrorShortLabel = (connection: MailboxConnection): string => {
  if (isMailboxOAuthReconnectRequired(connection.syncError)) {
    return "Sign-in expired";
  }
  return "Sync issue";
};

/** One-line inbox notice; prefix with account name when viewing a merged mailbox. */
export const mailboxSyncErrorInboxMessage = (
  connection: MailboxConnection,
  options: { includeAccountName: boolean }
): string => {
  const needsReconnect = isMailboxOAuthReconnectRequired(connection.syncError);
  if (options.includeAccountName) {
    return needsReconnect
      ? `${connection.displayName} needs to be reconnected.`
      : `${connection.displayName} is not syncing right now.`;
  }
  return needsReconnect
    ? "This account needs to be reconnected."
    : "This account is not syncing right now.";
};

/** Full message for settings — plain language, no HTTP codes. */
export const mailboxSyncErrorSettingsMessage = (connection: MailboxConnection): string => {
  if (isMailboxOAuthReconnectRequired(connection.syncError)) {
    return `We couldn't refresh access to ${connection.displayName}. Use Reconnect below to sign in again — your existing mail will stay in place.`;
  }
  return `Email sync stopped for ${connection.displayName}. Open Sync & refresh to try again, or disconnect and reconnect the account.`;
};

/** Shared constant or class token for mailbox presentation. */
export const connectionSupportsGuidedReconnect = (connection: MailboxConnection): boolean =>
  !connection.isSystemNotifications &&
  (connection.provider === "gmail" || connection.provider === "microsoft") &&
  connection.syncStatus === "error" &&
  isMailboxOAuthReconnectRequired(connection.syncError);

/** Shared constant or class token for mailbox presentation. */
export const mailboxOAuthProviderForConnection = (
  connection: MailboxConnection
): "google" | "microsoft" | null => {
  if (connection.provider === "gmail") return "google";
  if (connection.provider === "microsoft") return "microsoft";
  return null;
};
