/**
 * Mailbox provider connector contracts and sync state helpers.
 *
 * Defines the `MailConnector` interface implemented by Gmail, Microsoft Graph, and IMAP/SMTP
 * connectors, plus shared message/sync types consumed by `mailbox-repos` and sync workers.
 *
 * Responsibilities:
 * - Provider-agnostic sync folder cursor state (inbox → sent cycle)
 * - Raw inbound/outbound message shapes and push-operation types
 * - `MailConnector` capability surface (sync, send, apply local changes upstream)
 *
 * Depends on:
 * - `@starter/shared` mailbox address/folder types
 * - `mailbox-repos` account row type (credentials decrypted at connector boundary)
 *
 * Security:
 * - Connectors receive decrypted secrets from repos; callers must scope by `tenant_id` before loading accounts.
 * - OAuth tokens and IMAP passwords must not appear in logs or error payloads.
 */

import type { MailboxAddress, MailboxFolder } from "@starter/shared";

import type { MailboxAccountRow } from "../mailbox-repos.js";

export type RawMailboxAttachment = {
  filename: string;
  mimeType: string;
  content: Buffer;
};

export type MailboxSyncFolder = "inbox" | "sent";

export type MailboxSyncFolderState = {
  folder: MailboxSyncFolder;
  pageCursor: string | null;
};

/** Parses persisted sync cursor JSON; invalid values restart inbox sync from page one. */
export const parseMailboxSyncFolderState = (raw: string | null): MailboxSyncFolderState => {
  if (!raw) return { folder: "inbox", pageCursor: null };
  try {
    const parsed = JSON.parse(raw) as Partial<MailboxSyncFolderState>;
    if (parsed.folder === "inbox" || parsed.folder === "sent") {
      return { folder: parsed.folder, pageCursor: parsed.pageCursor ?? null };
    }
  } catch {
    // Invalid cursor — restart inbox sync.
  }
  return { folder: "inbox", pageCursor: null };
};

/** Serializes sync state; returns null when inbox has no cursor (default). */
export const serializeMailboxSyncFolderState = (state: MailboxSyncFolderState): string | null => {
  if (state.folder === "inbox" && !state.pageCursor) return null;
  return JSON.stringify(state);
};

/** Advances inbox→sent folder cycle after a page completes; marks full cycle when sent finishes. */
export const advanceMailboxSyncFolderState = (
  state: MailboxSyncFolderState,
  pageCursor: string | null
): { nextState: MailboxSyncFolderState; cycleComplete: boolean } => {
  if (pageCursor) {
    return { nextState: { folder: state.folder, pageCursor }, cycleComplete: false };
  }
  if (state.folder === "inbox") {
    return { nextState: { folder: "sent", pageCursor: null }, cycleComplete: false };
  }
  return { nextState: { folder: "inbox", pageCursor: null }, cycleComplete: true };
};

export type RawMailboxMessage = {
  providerMessageId: string;
  providerThreadId?: string | null;
  from: MailboxAddress;
  to: MailboxAddress[];
  cc: MailboxAddress[];
  bcc: MailboxAddress[];
  subject: string;
  snippet: string;
  bodyText?: string | null;
  bodyHtml?: string | null;
  messageId?: string | null;
  inReplyTo?: string | null;
  referencesHeader?: string | null;
  receivedAt: Date;
  hasAttachments: boolean;
  hasCalendarInvite: boolean;
  calendarIcs?: string | null;
  attachments?: RawMailboxAttachment[];
  folder: MailboxFolder;
  isRead: boolean;
  isStarred: boolean;
  direction: "inbound" | "outbound";
};

export type SyncFolderResult = {
  messages: RawMailboxMessage[];
  pageCursor: string | null;
};

export type OutboundMailboxAttachment = {
  filename: string;
  mimeType: string;
  content: Buffer;
};

export type OutboundMailboxMessage = {
  to: MailboxAddress[];
  cc: MailboxAddress[];
  bcc: MailboxAddress[];
  subject: string;
  bodyHtml?: string;
  bodyText?: string;
  inReplyTo?: string | null;
  referencesHeader?: string | null;
  attachments?: OutboundMailboxAttachment[];
};

export type SendResult = {
  providerMessageId: string;
  messageId: string;
};

export type CalendarReplyInput = {
  icsUid: string;
  icsSequence?: number;
  organizerEmail: string;
  attendeeEmail: string;
  attendeeName?: string | null;
  response: "accepted" | "declined" | "tentative";
  title: string;
  startsAt: Date;
  endsAt: Date;
};

export type MailboxProviderCapabilities = {
  readState: boolean;
  star: boolean;
  folderMove: boolean;
  permanentDelete: boolean;
  emptyTrash: boolean;
};

export type MailboxProviderMessageRef = {
  providerMessageId: string;
  messageId?: string | null;
};

export type ProviderPushReadState = { type: "read"; isRead: boolean };
export type ProviderPushStar = { type: "star"; isStarred: boolean };
export type ProviderPushFolder = {
  type: "folder";
  folder: MailboxFolder;
  previousFolder?: MailboxFolder | null;
};
export type ProviderPushDelete = {
  type: "delete";
  permanent: boolean;
  sourceFolder?: MailboxFolder;
};

export type ProviderPushOperation =
  | ProviderPushReadState
  | ProviderPushStar
  | ProviderPushFolder
  | ProviderPushDelete;

export type ProviderIdUpdate = {
  from: string;
  to: string;
};

export type ProviderApplyResult = {
  providerIdUpdates?: ProviderIdUpdate[];
};

/** Provider adapter for mailbox sync, send, and upstream mutation of local changes. */
export interface MailConnector {
  getCapabilities(): MailboxProviderCapabilities;
  syncDelta(state: MailboxSyncFolderState): Promise<SyncFolderResult>;
  applyProviderChanges(
    messages: MailboxProviderMessageRef[],
    operation: ProviderPushOperation
  ): Promise<ProviderApplyResult>;
  emptyProviderTrash(): Promise<void>;
  send(message: OutboundMailboxMessage): Promise<SendResult>;
  sendCalendarReply(input: CalendarReplyInput): Promise<void>;
  refreshAuthIfNeeded(): Promise<void>;
}

export type ConnectorFactory = (account: MailboxAccountRow) => Promise<MailConnector>;
