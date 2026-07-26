/**
 * Mailbox Types.
 *
 * Shared mailbox types, presets, or security helpers consumed by mailbox pages.
 *
 * Responsibilities:
 * - Centralize constants and pure functions for the mailbox module
 * - Document invariants for HTML sanitization or provider presets where applicable
 *
 * Related:
 * - Route: /admin/mailbox
 */
import type { MailboxEmbeddedSentEmail } from "@starter/shared";

export type { MailboxEmbeddedSentEmail };

/** React component for mailbox UI. */
export type MailboxAccount = {
  id: string;
  displayName: string;
  color?: string;
  emailAddress?: string;
  provider?: string;
  ownerScope?: string;
  ownerEmployeeId?: string | null;
  connections?: MailboxConnection[];
};

/** React component for mailbox UI. */
export type MailboxSelectorOption = {
  value: string;
  label: string;
  inboxId: string;
  connectionId: string | null;
  /** Solid stripe for a single connection / mailbox. */
  accentColor?: string;
  /** Merged inbox view — gradient of all connection colors (e.g. “My mailbox”). */
  accentGradientColors?: string[];
  /** Show a warning icon when this mailbox view has a sync error. */
  showSyncWarning?: boolean;
};

/** React component for mailbox UI. */
export type MailboxConnection = {
  id: string;
  inboxId: string;
  displayName: string;
  emailAddress: string;
  provider: string;
  connectionType: string;
  isSystemNotifications: boolean;
  color?: string;
  syncStatus: string;
  syncError: string | null;
  lastSyncedAt: string | null;
};

/** React component for mailbox UI. */
export type MailboxThread = {
  id: string;
  accountId: string;
  subject: string;
  snippet: string;
  folder: string;
  lastMessageAt: string;
  unreadCount: number;
  isStarred: boolean;
  hasCalendarInvite?: boolean;
  from?: { email: string; name?: string | null } | null;
};

/** React component for mailbox UI. */
export type MailboxAttachment = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
};

/** React component for mailbox UI. */
export type MailboxCalendarInvite = {
  eventId: string;
  status: string;
  organizer: { email: string; name?: string | null };
};

/** React component for mailbox UI. */
export type MailboxMessage = {
  id: string;
  subject: string;
  snippet: string;
  bodyHtml: string | null;
  bodyText: string | null;
  from: { email: string; name?: string | null };
  to?: { email: string; name?: string | null }[];
  receivedAt: string;
  internalSource: string | null;
  actionUrl: string | null;
  embeddedSentEmail: MailboxEmbeddedSentEmail | null;
  isRead: boolean;
  isDraft?: boolean;
  hasAttachments: boolean;
  hasCalendarInvite: boolean;
  calendarInvite: MailboxCalendarInvite | null;
  attachments?: MailboxAttachment[];
};

/** React component for mailbox UI. */
export type MailboxFolderKey = "inbox" | "sent" | "drafts" | "trash" | "archive";

/** React component for mailbox UI. */
export type MailboxSyncLaneStatus = {
  syncStatus: string;
  syncError: string | null;
  lastSyncedAt: string | null;
};

/** React component for mailbox UI. */
export type MailboxSyncJobStatus = {
  kind: "mail" | "calendar";
  name: string;
  label: string;
  jobId: string;
  state: "waiting" | "active" | "completed" | "failed" | "delayed" | "unknown";
  detail: string | null;
  failedReason: string | null;
  processedOn: number | null;
  finishedOn: number | null;
};

/** React component for mailbox UI. */
export type MailboxAccountSyncStatus = {
  account: MailboxSyncLaneStatus;
  calendar: MailboxSyncLaneStatus | null;
  jobs: MailboxSyncJobStatus[];
};
