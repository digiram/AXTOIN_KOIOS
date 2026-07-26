/**
 * Mailbox sync BullMQ worker and shared job processor.
 *
 * Polls provider mailboxes, persists messages and attachments, parses calendar invites,
 * and schedules periodic scan fan-out. Used by both Redis and SQL queue strategies.
 *
 * Responsibilities:
 * - Resolve `{prod|dev}-mail-sync` queue name (aligned with API producers)
 * - Scan due accounts, sync delta pages, enqueue calendar follow-ups
 * - Dedupe active jobs per account via stable job ids
 *
 * Depends on:
 * - `@starter/db` mailbox connectors and storage, `@starter/shared` job constants
 *
 * Security:
 * - OAuth tokens live in DB; reconnect-required errors stop retry storms
 * - Attachment size, count, and extension limits enforced before blob write
 *
 * Related:
 * - [`docs/mailbox-module.md`](../../../docs/mailbox-module.md)
 */

import { randomUUID } from "node:crypto";

import {
  MAILBOX_ATTACHMENT_BLOCKED_EXTENSIONS,
  MAILBOX_ATTACHMENT_MAX_FILE_BYTES,
  MAILBOX_ATTACHMENT_MAX_FILES_PER_MESSAGE,
  MAILBOX_ATTACHMENT_MAX_TOTAL_BYTES,
  MAILBOX_PARSE_INVITE_JOB_NAME,
  MAILBOX_SYNC_ACCOUNT_JOB_NAME,
  MAILBOX_SYNC_CALENDAR_JOB_NAME,
  MAILBOX_SYNC_SCAN_BATCH,
  MAILBOX_SYNC_SCAN_JOB_NAME,
  isMailboxOAuthReconnectRequired,
  mailboxSyncAccountJobId,
  mailboxSyncCalendarJobId,
  mailboxSyncJobDefaults,
  mailboxSyncScanJobId
} from "@starter/shared";
import { Queue, Worker, type Job, type JobsOptions } from "bullmq";
import { Redis } from "ioredis";
import { createLogger } from "@starter/logger";
import {
  advanceMailboxSyncFolderState,
  createMailConnectorForAccount,
  extractIcsFromMailboxMessage,
  getMailboxAccountById,
  getMailboxCalendarByAccountId,
  getMailboxMessageById,
  insertMailboxAttachment,
  insertMailboxMessage,
  listAccountsDueForSync,
  mailboxAttachmentStorageExt,
  messageExistsByProviderId,
  parseAndUpsertIcsInvite,
  parseMailboxSyncFolderState,
  reconcileMailboxMessageFromProvider,
  relPathForMailboxAttachment,
  serializeMailboxSyncFolderState,
  syncLinkedMailboxCalendarForAccount,
  updateMailboxAccountSyncState,
  updateMailboxThread,
  upsertMailboxThread,
  writeMailboxAttachmentBlob,
  type MailboxAccountRow
} from "@starter/db";

const log = createLogger("mailbox-sync-worker");

const ACTIVE_JOB_STATES = new Set(["active", "waiting", "delayed", "prioritized"]);

const persistInboundAttachments = async (input: {
  tenantId: string;
  messageId: string;
  attachments: { filename: string; mimeType: string; content: Buffer }[];
}): Promise<void> => {
  let totalBytes = 0;
  let count = 0;
  for (const attachment of input.attachments) {
    if (count >= MAILBOX_ATTACHMENT_MAX_FILES_PER_MESSAGE) break;
    if (attachment.content.length > MAILBOX_ATTACHMENT_MAX_FILE_BYTES) continue;
    const ext = mailboxAttachmentStorageExt(attachment.filename);
    if (MAILBOX_ATTACHMENT_BLOCKED_EXTENSIONS.has(ext)) continue;
    if (totalBytes + attachment.content.length > MAILBOX_ATTACHMENT_MAX_TOTAL_BYTES) break;
    const attachmentId = randomUUID();
    const blobPath = relPathForMailboxAttachment(
      input.tenantId,
      input.messageId,
      attachmentId,
      ext
    );
    await writeMailboxAttachmentBlob(blobPath, attachment.content, input.tenantId);
    await insertMailboxAttachment({
      tenantId: input.tenantId,
      messageId: input.messageId,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.content.length,
      blobPath
    });
    totalBytes += attachment.content.length;
    count += 1;
  }
};

/** BullMQ queue name for mailbox sync jobs (`dev-mail-sync` / `prod-mail-sync`). */
export const resolveMailboxSyncQueueName = (): string =>
  `${process.env.NODE_ENV === "production" ? "prod" : "dev"}-mail-sync`;

const resolveMailboxSyncScanIntervalMs = (): number =>
  Math.max(
    60_000,
    Number.parseInt(process.env.MAILBOX_SYNC_SCAN_INTERVAL_MS ?? "300000", 10) || 300_000
  );

const isMailboxJobActive = async (queue: Queue, jobId: string): Promise<boolean> => {
  const existing = await queue.getJob(jobId);
  if (!existing) return false;
  const state = await existing.getState();
  return ACTIVE_JOB_STATES.has(state);
};

const clearFinishedMailboxJob = async (queue: Queue, jobId: string): Promise<void> => {
  const existing = await queue.getJob(jobId);
  if (!existing) return;
  const state = await existing.getState();
  if (!ACTIVE_JOB_STATES.has(state)) {
    await existing.remove();
  }
};

const isAccountMailSyncActive = async (queue: Queue, accountId: string): Promise<boolean> => {
  if (await isMailboxJobActive(queue, mailboxSyncAccountJobId(accountId))) return true;
  const jobs = await queue.getJobs([...ACTIVE_JOB_STATES] as ("active" | "waiting" | "delayed" | "prioritized")[]);
  return jobs.some(
    (job) =>
      job.name === MAILBOX_SYNC_ACCOUNT_JOB_NAME &&
      (job.data as { accountId?: string }).accountId === accountId
  );
};

const enqueueMailboxJob = async (
  queue: Queue,
  name: string,
  data: Record<string, unknown>,
  options: JobsOptions
): Promise<boolean> => {
  const jobId = options.jobId != null ? String(options.jobId) : undefined;
  const accountId =
    name === MAILBOX_SYNC_ACCOUNT_JOB_NAME ? (data.accountId as string | undefined) : undefined;

  if (accountId && (await isAccountMailSyncActive(queue, accountId))) {
    return false;
  }
  if (jobId && (await isMailboxJobActive(queue, jobId))) {
    return false;
  }
  if (jobId) {
    await clearFinishedMailboxJob(queue, jobId);
  }

  try {
    await queue.add(name, data, { ...mailboxSyncJobDefaults, ...options });
    return true;
  } catch (err) {
    if (jobId && (await isMailboxJobActive(queue, jobId))) {
      return false;
    }
    if (accountId && (await isAccountMailSyncActive(queue, accountId))) {
      return false;
    }
    throw err;
  }
};

/**
 * Enqueues periodic mailbox scan jobs on the given queue.
 *
 * Side effects: immediate scan enqueue plus `setInterval` driven by `MAILBOX_SYNC_SCAN_INTERVAL_MS`.
 */
export const schedulePeriodicMailboxSyncScan = (queue: Queue): void => {
  const everyMs = resolveMailboxSyncScanIntervalMs();

  const enqueueScan = async (): Promise<void> => {
    try {
      await enqueueMailboxJob(
        queue,
        MAILBOX_SYNC_SCAN_JOB_NAME,
        { requestedAt: new Date().toISOString() },
        {
          jobId: mailboxSyncScanJobId(new Date().toISOString().slice(0, 13))
        }
      );
    } catch (err) {
      log.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "mailbox sync scan enqueue failed"
      );
    }
  };

  void enqueueScan();
  setInterval(() => void enqueueScan(), everyMs);
  log.info({ everyMs }, "mailbox background sync scan scheduled");
};

const enqueueCalendarSync = async (queue: Queue, account: MailboxAccountRow): Promise<void> => {
  if (account.provider !== "gmail" && account.provider !== "microsoft") return;
  const jobId = mailboxSyncCalendarJobId(account.id);
  if (await isMailboxJobActive(queue, jobId)) return;
  await clearFinishedMailboxJob(queue, jobId);
  await enqueueMailboxJob(
    queue,
    MAILBOX_SYNC_CALENDAR_JOB_NAME,
    { tenantId: account.tenantId, accountId: account.id },
    { jobId }
  );
};

const handleSyncScan = async (queue: Queue): Promise<{ due: number; enqueued: number }> => {
  const accounts = await listAccountsDueForSync(MAILBOX_SYNC_SCAN_BATCH);
  const bulkJobs = accounts.map((account) => ({
    name: MAILBOX_SYNC_ACCOUNT_JOB_NAME,
    data: { tenantId: account.tenantId, accountId: account.id },
    opts: {
      ...mailboxSyncJobDefaults,
      jobId: mailboxSyncAccountJobId(account.id)
    }
  }));

  let enqueued = 0;
  for (const job of bulkJobs) {
    const accountId = (job.data as { accountId: string }).accountId;
    if (await isAccountMailSyncActive(queue, accountId)) continue;
    await clearFinishedMailboxJob(queue, String(job.opts.jobId));
    try {
      await queue.add(job.name, job.data, job.opts);
      enqueued += 1;
    } catch (err) {
      if (await isAccountMailSyncActive(queue, accountId)) continue;
      throw err;
    }
  }

  log.info({ due: accounts.length, enqueued }, "mailbox sync scan fan-out complete");
  return { due: accounts.length, enqueued };
};

const handleSyncAccount = async (
  queue: Queue,
  job: Job
): Promise<Record<string, unknown>> => {
  const { tenantId, accountId } = job.data as { tenantId: string; accountId: string };
  const account = await getMailboxAccountById(tenantId, accountId);
  if (!account) return { skipped: true };

  await updateMailboxAccountSyncState(tenantId, accountId, { syncStatus: "syncing", syncError: null });
  try {
    const connector = await createMailConnectorForAccount(account);
    await connector.refreshAuthIfNeeded();
    const folderState = parseMailboxSyncFolderState(account.syncCursor);
    const result = await connector.syncDelta(folderState);
    let inserted = 0;
    let reconciled = 0;
    for (const raw of result.messages) {
      if (await messageExistsByProviderId(accountId, raw.providerMessageId)) {
        const updated = await reconcileMailboxMessageFromProvider({
          tenantId,
          accountId,
          providerMessageId: raw.providerMessageId,
          isRead: raw.isRead,
          isStarred: raw.isStarred,
          folder: raw.folder
        });
        if (updated) reconciled += 1;
        continue;
      }
      const thread = await upsertMailboxThread({
        tenantId,
        accountId,
        providerThreadId: raw.providerThreadId,
        subjectNormalized: raw.subject,
        snippet: raw.snippet,
        folder: raw.folder,
        lastMessageAt: raw.receivedAt,
        unreadDelta: raw.isRead ? 0 : 1
      });
      const message = await insertMailboxMessage({
        tenantId,
        accountId,
        threadId: thread.id,
        providerMessageId: raw.providerMessageId,
        direction: raw.direction,
        from: raw.from,
        to: raw.to,
        cc: raw.cc,
        bcc: raw.bcc,
        subject: raw.subject,
        snippet: raw.snippet,
        bodyText: raw.bodyText,
        bodyHtml: raw.bodyHtml,
        messageId: raw.messageId,
        inReplyTo: raw.inReplyTo,
        referencesHeader: raw.referencesHeader,
        receivedAt: raw.receivedAt,
        isRead: raw.isRead,
        hasAttachments: raw.hasAttachments,
        hasCalendarInvite: raw.hasCalendarInvite
      });
      if (raw.isStarred) {
        await updateMailboxThread(tenantId, thread.id, { isStarred: true });
      }
      inserted += 1;
      if (raw.attachments?.length) {
        await persistInboundAttachments({
          tenantId,
          messageId: message.id,
          attachments: raw.attachments
        });
      }
      const icsContent =
        raw.calendarIcs ??
        extractIcsFromMailboxMessage({
          bodyText: raw.bodyText ?? null,
          bodyHtml: raw.bodyHtml ?? null
        });
      if (icsContent) {
        let calendarUserId = account.ownerUserId;
        if (!calendarUserId) {
          const linkedCalendar = await getMailboxCalendarByAccountId(tenantId, accountId);
          calendarUserId = linkedCalendar?.userId ?? null;
        }
        if (calendarUserId) {
          await parseAndUpsertIcsInvite({
            tenantId,
            userId: calendarUserId,
            sourceMessageId: message.id,
            icsContent
          });
        }
      }
    }

    const { nextState, cycleComplete } = advanceMailboxSyncFolderState(folderState, result.pageCursor);
    await updateMailboxAccountSyncState(tenantId, accountId, {
      syncCursor: cycleComplete ? null : serializeMailboxSyncFolderState(nextState),
      syncStatus: "idle",
      syncError: null,
      ...(cycleComplete ? { lastSyncedAt: new Date() } : {})
    });

    if (!cycleComplete) {
      // Continuation must use a fresh job id — the current handler still holds the stable id.
      await queue.add(
        MAILBOX_SYNC_ACCOUNT_JOB_NAME,
        { tenantId, accountId },
        { ...mailboxSyncJobDefaults, priority: 1 }
      );
      return { inserted, reconciled, continued: true };
    }

    await enqueueCalendarSync(queue, account);
    return { inserted, reconciled, continued: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateMailboxAccountSyncState(tenantId, accountId, {
      syncStatus: "error",
      syncError: message,
      lastSyncedAt: new Date()
    });
    if (isMailboxOAuthReconnectRequired(message)) {
      log.warn(
        { accountId, err: message },
        "mailbox sync stopped — OAuth reconnect required"
      );
      return { skipped: true, reason: "oauth_reconnect_required", syncError: message };
    }
    throw err;
  }
};

const handleSyncCalendar = async (job: Job): Promise<Record<string, unknown>> => {
  const { tenantId, accountId } = job.data as { tenantId: string; accountId: string };
  try {
    await syncLinkedMailboxCalendarForAccount(tenantId, accountId);
    return { synced: true };
  } catch (err) {
    log.error(
      { accountId, err: err instanceof Error ? err.message : String(err) },
      "mailbox calendar sync failed"
    );
    throw err;
  }
};

const handleParseInvite = async (job: Job): Promise<Record<string, unknown>> => {
  const data = job.data as {
    tenantId: string;
    userId: string;
    messageId: string;
  };
  const message = await getMailboxMessageById(data.tenantId, data.messageId);
  if (!message) {
    return { parsed: false, reason: "message_not_found" };
  }
  const icsContent =
    extractIcsFromMailboxMessage({
      bodyText: message.bodyText,
      bodyHtml: message.bodyHtml
    }) ?? "";
  if (!icsContent) {
    return { parsed: false, reason: "no_ics" };
  }
  await parseAndUpsertIcsInvite({
    tenantId: data.tenantId,
    userId: data.userId,
    sourceMessageId: data.messageId,
    icsContent
  });
  return { parsed: true };
};

/**
 * Dispatches a mailbox sync job by name (scan, account, calendar, parse-invite).
 *
 * @param queue - Queue used for fan-out child jobs during account sync.
 * @throws When `jobName` is unknown.
 */
export const processMailboxSyncJob = async (
  jobName: string,
  data: Record<string, unknown>,
  queue: Queue
): Promise<Record<string, unknown>> => {
  if (jobName === MAILBOX_SYNC_SCAN_JOB_NAME) {
    return handleSyncScan(queue);
  }
  if (jobName === MAILBOX_SYNC_ACCOUNT_JOB_NAME) {
    return handleSyncAccount(queue, { name: jobName, data } as Job);
  }
  if (jobName === MAILBOX_SYNC_CALENDAR_JOB_NAME) {
    return handleSyncCalendar({ name: jobName, data } as Job);
  }
  if (jobName === MAILBOX_PARSE_INVITE_JOB_NAME) {
    return handleParseInvite({ name: jobName, data } as Job);
  }
  throw new Error(`Unknown mailbox job: ${jobName}`);
};

/**
 * Starts BullMQ worker and queue for external Redis strategy.
 *
 * @returns Worker instance and queue handle for readiness logging.
 */
export const startMailboxSyncWorker = (connection: Redis): { worker: Worker; queue: Queue } => {
  const queueName = resolveMailboxSyncQueueName();
  const queue = new Queue(queueName, { connection });

  const worker = new Worker(
    queueName,
    async (job) => processMailboxSyncJob(job.name, job.data as Record<string, unknown>, queue),
    { connection, concurrency: 2 }
  );

  worker.on("failed", (job, err) => {
    log.error({ jobId: job?.id, name: job?.name, err: err.message }, "mailbox sync job failed");
  });

  schedulePeriodicMailboxSyncScan(queue);

  return { worker, queue };
};
