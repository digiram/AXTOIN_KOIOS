/**
 * Mailbox Sync Errors.
 *
 * Unit tests for mailbox Sync Errors behavior in the mailbox module.
 *
 * Responsibilities:
 * - Assert edge cases and regressions for mailboxSyncErrors
 * - Document expected inputs and outputs via test names
 *
 * Related:
 * - mailboxSyncErrors.ts(x)
 */
import { describe, expect, it } from "vitest";

import type { MailboxConnection } from "./mailboxTypes.js";
import {
  connectionHasSyncError,
  connectionSupportsGuidedReconnect,
  mailboxSyncErrorInboxMessage,
  mailboxSyncErrorSettingsMessage,
  resolveInboxSyncErrorConnections
} from "./mailboxSyncErrors.js";

const connection = (overrides: Partial<MailboxConnection> = {}): MailboxConnection => ({
  id: "conn-1",
  inboxId: "inbox-1",
  displayName: "Work Gmail",
  emailAddress: "work@example.com",
  provider: "gmail",
  connectionType: "Gmail",
  isSystemNotifications: false,
  syncStatus: "error",
  syncError: "Google token refresh failed: 400",
  lastSyncedAt: null,
  ...overrides
});

describe("mailboxSyncErrors", () => {
  it("ignores system notifications", () => {
    expect(connectionHasSyncError(connection({ isSystemNotifications: true }))).toBe(false);
  });

  it("uses plain language for reconnect errors", () => {
    expect(mailboxSyncErrorInboxMessage(connection(), { includeAccountName: false })).toBe(
      "This account needs to be reconnected."
    );
    expect(mailboxSyncErrorInboxMessage(connection(), { includeAccountName: true })).toBe(
      "Work Gmail needs to be reconnected."
    );
    expect(mailboxSyncErrorSettingsMessage(connection())).toContain("Use Reconnect below");
  });

  it("offers guided reconnect for oauth token failures", () => {
    expect(connectionSupportsGuidedReconnect(connection())).toBe(true);
    expect(connectionSupportsGuidedReconnect(connection({ provider: "imap" }))).toBe(false);
  });

  it("filters inbox alerts by selected connection", () => {
    const connections = [
      connection(),
      connection({ id: "conn-2", displayName: "Personal", syncStatus: "idle", syncError: null })
    ];
    expect(resolveInboxSyncErrorConnections(connections, null)).toHaveLength(1);
    expect(resolveInboxSyncErrorConnections(connections, "conn-2")).toHaveLength(0);
    expect(resolveInboxSyncErrorConnections(connections, "conn-1")).toHaveLength(1);
  });
});
