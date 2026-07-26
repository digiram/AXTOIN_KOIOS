/**
 * BullMQ producer for mailbox sync jobs (`{prod|dev}-mail-sync`).
 */

import {
  MAILBOX_PARSE_INVITE_JOB_NAME,
  MAILBOX_SYNC_ACCOUNT_JOB_NAME,
  MAILBOX_SYNC_SCAN_JOB_NAME,
  mailboxParseInviteJobId,
  mailboxSyncAccountJobId,
  mailboxSyncJobDefaults,
  mailboxSyncScanJobId
} from "@starter/shared";
import { createLogger } from "@starter/logger";

import { getJobProducer } from "./job-queue/index.js";
import { getBullmqQueue } from "./job-queue/bullmq-producer.js";
import { usesRedisBackend } from "@starter/shared";

const log = createLogger("api-mailbox-queue");

export const resolveMailboxSyncQueueName = (): string =>
  `${process.env.NODE_ENV === "production" ? "prod" : "dev"}-mail-sync`;

/** Read-only queue handle for sync status inspection (redis mode). */
export const getMailboxSyncQueue = () => getBullmqQueue(resolveMailboxSyncQueueName());

const isAccountMailSyncActive = async (accountId: string): Promise<boolean> => {
  const producer = getJobProducer();
  const queueName = resolveMailboxSyncQueueName();
  if (await producer.isJobActive(queueName, mailboxSyncAccountJobId(accountId))) return true;
  const jobs = await producer.getJobsByStates(queueName, ["active", "waiting", "delayed", "prioritized"]);
  return jobs.some(
    (job) =>
      job.name === MAILBOX_SYNC_ACCOUNT_JOB_NAME &&
      (job.data as { accountId?: string }).accountId === accountId
  );
};

export const enqueueMailboxSyncScan = async (): Promise<{ jobId: string }> => {
  const { id: jobId } = await getJobProducer().add(
    resolveMailboxSyncQueueName(),
    MAILBOX_SYNC_SCAN_JOB_NAME,
    { requestedAt: new Date().toISOString() },
    {
      ...mailboxSyncJobDefaults,
      jobId: mailboxSyncScanJobId(new Date().toISOString().slice(0, 13))
    }
  );
  log.info({ jobId }, "mailbox sync scan enqueued");
  return { jobId };
};

export const enqueueMailboxSyncAccount = async (input: {
  tenantId: string;
  accountId: string;
  /** Manual sync from UI/API — jump ahead of background scan jobs. */
  priority?: number;
}): Promise<{ jobId: string; enqueued: boolean }> => {
  const queueName = resolveMailboxSyncQueueName();
  const jobId = mailboxSyncAccountJobId(input.accountId);
  if (await isAccountMailSyncActive(input.accountId)) {
    return { jobId, enqueued: false };
  }

  await getJobProducer().removeFinishedJob(queueName, jobId);

  try {
    const result = await getJobProducer().add(
      queueName,
      MAILBOX_SYNC_ACCOUNT_JOB_NAME,
      { tenantId: input.tenantId, accountId: input.accountId },
      {
        ...mailboxSyncJobDefaults,
        jobId,
        priority: input.priority ?? 1
      }
    );
    return { jobId: result.id || jobId, enqueued: true };
  } catch (err) {
    if (await isAccountMailSyncActive(input.accountId)) {
      return { jobId, enqueued: false };
    }
    throw err;
  }
};

export const enqueueMailboxParseInvite = async (input: {
  tenantId: string;
  userId: string;
  messageId: string;
}): Promise<void> => {
  await getJobProducer().add(resolveMailboxSyncQueueName(), MAILBOX_PARSE_INVITE_JOB_NAME, input, {
    ...mailboxSyncJobDefaults,
    jobId: mailboxParseInviteJobId(input.messageId)
  });
};

/** Whether mailbox sync status reads from BullMQ directly (redis backend only). */
export const mailboxSyncUsesBullmqInspection = (): boolean => usesRedisBackend();
