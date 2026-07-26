/**
 * Provider label/folder mapping to internal mailbox folders.
 *
 * Normalizes Gmail label ids and Microsoft Graph well-known folder ids into the shared
 * `MailboxFolder` enum used by sync and UI.
 *
 * Responsibilities:
 * - Gmail label → folder/read/star state
 * - Microsoft Graph parent folder id → folder via well-known name map
 *
 * Security:
 * - Pure mapping helpers; no credentials or tenant data.
 */

import type { MailboxFolder } from "@starter/shared";

/** Maps Gmail API label ids to internal folder, read, and starred flags. */
export const mapGmailLabelsToMailboxState = (
  labelIds: string[]
): { folder: MailboxFolder; isRead: boolean; isStarred: boolean } => {
  const labels = new Set(labelIds);
  let folder: MailboxFolder = "inbox";
  if (labels.has("TRASH")) {
    folder = "trash";
  } else if (labels.has("SENT")) {
    folder = "sent";
  } else if (!labels.has("INBOX") && !labels.has("DRAFT")) {
    folder = "archive";
  }
  return {
    folder,
    isRead: !labels.has("UNREAD"),
    isStarred: labels.has("STARRED")
  };
};

/** Maps Microsoft Graph parent folder id to internal folder using well-known folder cache. */
export const mapGraphFolderIdToMailboxFolder = (
  parentFolderId: string | undefined,
  folderIdByWellKnown: Map<string, MailboxFolder>
): MailboxFolder => {
  if (!parentFolderId) return "inbox";
  return folderIdByWellKnown.get(parentFolderId) ?? "archive";
};

export const graphWellKnownFolderNames: { wellKnown: string; folder: MailboxFolder }[] = [
  { wellKnown: "inbox", folder: "inbox" },
  { wellKnown: "sentitems", folder: "sent" },
  { wellKnown: "deleteditems", folder: "trash" },
  { wellKnown: "archive", folder: "archive" }
];
