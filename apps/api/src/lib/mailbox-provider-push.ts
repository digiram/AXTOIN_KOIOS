/**
 * Mailbox provider push helpers.
 *
 * Best-effort wrappers that sync local mailbox state changes (read, star, folder,
 * delete) to connected external providers without failing the HTTP request.
 *
 * Responsibilities:
 * - Push single-thread and bulk thread operations to provider APIs
 * - Log provider failures without throwing to route handlers
 * - Load thread + account rows for push context
 *
 * Security:
 * - All repository calls scoped by `tenantId`
 */

import type { FastifyBaseLogger } from "fastify";

import {
  getMailboxAccountById,
  getMailboxThreadById,
  pushEmptyProviderTrashForInbox,
  pushFolderMoveToProvider,
  pushPermanentDeleteToProvider,
  pushThreadChangesToProvider,
  pushThreadsChangesToProvider,
  type MailboxAccountRow
} from "@starter/db";
import type { MailboxFolder } from "@starter/shared";
import type { ProviderPushOperation } from "@starter/db";

const logProviderPushFailure = (
  log: FastifyBaseLogger,
  context: Record<string, unknown>,
  err: unknown
): void => {
  log.warn(
    {
      ...context,
      err: err instanceof Error ? err.message : String(err)
    },
    "mailbox provider push failed"
  );
};

export const tryPushThreadReadState = async (input: {
  log: FastifyBaseLogger;
  tenantId: string;
  account: MailboxAccountRow;
  threadId: string;
  isRead: boolean;
}): Promise<void> => {
  try {
    await pushThreadChangesToProvider({
      tenantId: input.tenantId,
      account: input.account,
      threadId: input.threadId,
      operation: { type: "read", isRead: input.isRead }
    });
  } catch (err) {
    logProviderPushFailure(input.log, { threadId: input.threadId, op: "read" }, err);
  }
};

export const tryPushThreadStarState = async (input: {
  log: FastifyBaseLogger;
  tenantId: string;
  account: MailboxAccountRow;
  threadId: string;
  isStarred: boolean;
}): Promise<void> => {
  try {
    await pushThreadChangesToProvider({
      tenantId: input.tenantId,
      account: input.account,
      threadId: input.threadId,
      operation: { type: "star", isStarred: input.isStarred }
    });
  } catch (err) {
    logProviderPushFailure(input.log, { threadId: input.threadId, op: "star" }, err);
  }
};

export const tryPushThreadFolderMove = async (input: {
  log: FastifyBaseLogger;
  tenantId: string;
  account: MailboxAccountRow;
  threadId: string;
  folder: MailboxFolder;
  previousFolder?: MailboxFolder | null;
}): Promise<void> => {
  try {
    await pushFolderMoveToProvider(input);
  } catch (err) {
    logProviderPushFailure(input.log, { threadId: input.threadId, op: "folder" }, err);
  }
};

export const tryPushThreadsBulk = async (input: {
  log: FastifyBaseLogger;
  tenantId: string;
  threadIds: string[];
  operation: ProviderPushOperation;
}): Promise<void> => {
  try {
    await pushThreadsChangesToProvider({
      tenantId: input.tenantId,
      threadIds: input.threadIds,
      operation: input.operation
    });
  } catch (err) {
    logProviderPushFailure(input.log, { threadIds: input.threadIds, op: input.operation.type }, err);
  }
};

export const tryPushPermanentDelete = async (input: {
  log: FastifyBaseLogger;
  tenantId: string;
  account: MailboxAccountRow;
  threadId: string;
  sourceFolder?: MailboxFolder;
}): Promise<void> => {
  try {
    await pushPermanentDeleteToProvider(input);
  } catch (err) {
    logProviderPushFailure(input.log, { threadId: input.threadId, op: "delete" }, err);
  }
};

export const tryPushEmptyProviderTrash = async (input: {
  log: FastifyBaseLogger;
  tenantId: string;
  inboxId: string;
}): Promise<void> => {
  try {
    await pushEmptyProviderTrashForInbox(input.tenantId, input.inboxId);
  } catch (err) {
    logProviderPushFailure(input.log, { inboxId: input.inboxId, op: "empty-trash" }, err);
  }
};

export const loadThreadAccount = async (
  tenantId: string,
  threadId: string
): Promise<{ threadId: string; account: MailboxAccountRow } | undefined> => {
  const thread = await getMailboxThreadById(tenantId, threadId);
  if (!thread) return undefined;
  const account = await getMailboxAccountById(tenantId, thread.accountId);
  if (!account) return undefined;
  return { threadId: thread.id, account };
};
