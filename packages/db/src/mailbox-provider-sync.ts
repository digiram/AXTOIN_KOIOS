/**
 * Push local mailbox changes to external providers.
 *
 * Bridges tenant-scoped thread operations (read/star/folder/delete/empty trash) to Gmail,
 * Microsoft Graph, or IMAP connectors when the account uses an external provider.
 *
 * Responsibilities:
 * - Resolve provider message refs for a thread and apply push operations
 * - Batch thread updates and empty-trash across inbox connections
 * - Persist provider id remaps after upstream mutations
 *
 * Depends on:
 * - `mailbox-repos` for tenant-scoped account/thread/message reads
 * - `mailbox-connectors` for provider-specific apply/send
 *
 * Security:
 * - All repo calls include `tenantId` from JWT context; skip when provider is internal-only.
 * - Connectors refresh OAuth tokens via encrypted storage in repos — tokens never logged here.
 */

import type { MailboxFolder } from "@starter/shared";

import {
  applyMailboxProviderIdUpdates,
  getMailboxAccountById,
  getMailboxThreadById,
  listMailboxConnectionsForInbox,
  listMailboxMessagesForThread,
  type MailboxAccountRow
} from "./mailbox-repos.js";
import { createMailConnectorForAccount } from "./mailbox-connectors/index.js";
import type { ProviderPushOperation } from "./mailbox-connectors/types.js";

export const EXTERNAL_MAILBOX_PROVIDERS = new Set(["gmail", "microsoft", "imap"]);

export const isExternalMailboxProvider = (provider: string): boolean =>
  EXTERNAL_MAILBOX_PROVIDERS.has(provider);

export const listProviderMessageRefsForThread = async (
  tenantId: string,
  threadId: string
): Promise<{ providerMessageId: string; messageId?: string | null }[]> => {
  const messages = await listMailboxMessagesForThread(tenantId, threadId);
  return messages
    .filter((message) => !message.isDraft && message.providerMessageId)
    .map((message) => ({
      providerMessageId: message.providerMessageId!,
      messageId: message.messageId
    }));
};

export const pushThreadChangesToProvider = async (input: {
  tenantId: string;
  account: MailboxAccountRow;
  threadId: string;
  operation: ProviderPushOperation;
}): Promise<void> => {
  if (!isExternalMailboxProvider(input.account.provider)) return;
  const refs = await listProviderMessageRefsForThread(input.tenantId, input.threadId);
  if (refs.length === 0) return;
  const connector = await createMailConnectorForAccount(input.account);
  const capabilities = connector.getCapabilities();
  if (input.operation.type === "read" && !capabilities.readState) return;
  if (input.operation.type === "star" && !capabilities.star) return;
  if (input.operation.type === "folder" && !capabilities.folderMove) return;
  if (input.operation.type === "delete" && !capabilities.permanentDelete) return;
  await connector.refreshAuthIfNeeded();
  const result = await connector.applyProviderChanges(refs, input.operation);
  if (result.providerIdUpdates?.length) {
    await applyMailboxProviderIdUpdates(input.tenantId, input.account.id, result.providerIdUpdates);
  }
};

export const pushThreadsChangesToProvider = async (input: {
  tenantId: string;
  threadIds: string[];
  operation: ProviderPushOperation;
}): Promise<void> => {
  for (const threadId of input.threadIds) {
    const thread = await getMailboxThreadById(input.tenantId, threadId);
    if (!thread) continue;
    const account = await getMailboxAccountById(input.tenantId, thread.accountId);
    if (!account) continue;
    await pushThreadChangesToProvider({
      tenantId: input.tenantId,
      account,
      threadId,
      operation: input.operation
    });
  }
};

export const pushFolderMoveToProvider = async (input: {
  tenantId: string;
  account: MailboxAccountRow;
  threadId: string;
  folder: MailboxFolder;
  previousFolder?: MailboxFolder | null;
}): Promise<void> => {
  await pushThreadChangesToProvider({
    tenantId: input.tenantId,
    account: input.account,
    threadId: input.threadId,
    operation: {
      type: "folder",
      folder: input.folder,
      previousFolder: input.previousFolder ?? null
    }
  });
};

export const pushPermanentDeleteToProvider = async (input: {
  tenantId: string;
  account: MailboxAccountRow;
  threadId: string;
  sourceFolder?: MailboxFolder;
}): Promise<void> => {
  const thread = await getMailboxThreadById(input.tenantId, input.threadId);
  await pushThreadChangesToProvider({
    tenantId: input.tenantId,
    account: input.account,
    threadId: input.threadId,
    operation: {
      type: "delete",
      permanent: true,
      sourceFolder: input.sourceFolder ?? thread?.folder ?? "trash"
    }
  });
};

export const pushEmptyProviderTrashForInbox = async (
  tenantId: string,
  inboxId: string
): Promise<void> => {
  const connections = await listMailboxConnectionsForInbox(tenantId, inboxId);
  for (const account of connections) {
    if (!isExternalMailboxProvider(account.provider)) continue;
    const connector = await createMailConnectorForAccount(account);
    if (!connector.getCapabilities().emptyTrash) continue;
    await connector.refreshAuthIfNeeded();
    await connector.emptyProviderTrash();
  }
};

