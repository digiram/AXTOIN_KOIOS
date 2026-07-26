/**
 * Tenant-facing mailbox sync job snapshot (read-only via job producer / BullMQ).
 */

import type { Job, JobType } from "bullmq";

import {
  MAILBOX_SYNC_ACCOUNT_JOB_NAME,
  MAILBOX_SYNC_CALENDAR_JOB_NAME,
  type MailboxSyncJobKind,
  type MailboxSyncJobState,
  type MailboxSyncJobStatus,
  mailboxSyncAccountJobId,
  mailboxSyncCalendarJobId
} from "@starter/shared";

import { getJobProducer, type JobSnapshot } from "./job-queue/index.js";
import { getMailboxSyncQueue, mailboxSyncUsesBullmqInspection, resolveMailboxSyncQueueName } from "./mailbox-queue.js";

const ACTIVE_QUEUE_TYPES: JobType[] = ["active", "waiting", "delayed", "prioritized"];
const VISIBLE_QUEUE_TYPES: JobType[] = [...ACTIVE_QUEUE_TYPES, "completed", "failed"];

const accountIdFromJob = (job: Job | JobSnapshot): string | null => {
  const data = job.data as { accountId?: string };
  return data.accountId ?? null;
};

const bullStateToSyncJobState = (bullState: string): MailboxSyncJobState => {
  switch (bullState) {
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "delayed":
      return "delayed";
    case "active":
      return "active";
    case "waiting":
    case "wait":
    case "prioritized":
      return "waiting";
    default:
      return "unknown";
  }
};

const jobKindForName = (name: string): MailboxSyncJobKind | null => {
  if (name === MAILBOX_SYNC_ACCOUNT_JOB_NAME) return "mail";
  if (name === MAILBOX_SYNC_CALENDAR_JOB_NAME) return "calendar";
  return null;
};

const jobLabelForKind = (kind: MailboxSyncJobKind): string => {
  switch (kind) {
    case "mail":
      return "Email sync";
    case "calendar":
      return "Calendar sync";
  }
};

const describeJobDetail = (name: string, state: MailboxSyncJobState, returnvalue: unknown): string | null => {
  if (state === "active") {
    if (name === MAILBOX_SYNC_ACCOUNT_JOB_NAME) return "Fetching and reconciling mail…";
    if (name === MAILBOX_SYNC_CALENDAR_JOB_NAME) return "Syncing calendar events…";
    return "Running…";
  }
  if (state === "waiting") return "Queued";
  if (state === "delayed") return "Waiting for retry";
  if (returnvalue && typeof returnvalue === "object") {
    const result = returnvalue as Record<string, unknown>;
    if (name === MAILBOX_SYNC_ACCOUNT_JOB_NAME) {
      if (result.skipped === true) return "Skipped (account not found)";
      if (result.continued === true) {
        const inserted = Number(result.inserted ?? 0);
        const reconciled = Number(result.reconciled ?? 0);
        return `Imported ${inserted}, updated ${reconciled} — continuing folder sync…`;
      }
      if (result.continued === false) {
        const inserted = Number(result.inserted ?? 0);
        const reconciled = Number(result.reconciled ?? 0);
        return `Complete (${inserted} new, ${reconciled} updated)`;
      }
    }
    if (name === MAILBOX_SYNC_CALENDAR_JOB_NAME && result.synced === true) {
      return "Calendar sync complete";
    }
  }
  if (state === "completed") return "Complete";
  return null;
};

const serializeSnapshot = (job: JobSnapshot): MailboxSyncJobStatus | null => {
  const kind = jobKindForName(job.name);
  if (!kind) return null;
  const state = bullStateToSyncJobState(job.state);
  return {
    kind,
    name: job.name,
    label: jobLabelForKind(kind),
    jobId: job.id,
    state,
    detail: describeJobDetail(job.name, state, job.returnvalue ?? null),
    failedReason: job.failedReason,
    processedOn: job.processedOn,
    finishedOn: job.finishedOn
  };
};

const serializeMailboxSyncJob = async (job: Job): Promise<MailboxSyncJobStatus | null> => {
  const kind = jobKindForName(job.name);
  if (!kind) return null;
  const state = bullStateToSyncJobState(await job.getState());
  return {
    kind,
    name: job.name,
    label: jobLabelForKind(kind),
    jobId: job.id != null ? String(job.id) : "",
    state,
    detail: describeJobDetail(job.name, state, job.returnvalue ?? null),
    failedReason: job.failedReason ? String(job.failedReason).slice(0, 4000) : null,
    processedOn: job.processedOn ?? null,
    finishedOn: job.finishedOn ?? null
  };
};

export const getMailboxAccountSyncJobs = async (accountId: string): Promise<MailboxSyncJobStatus[]> => {
  const queueName = resolveMailboxSyncQueueName();
  const trackedIds = new Set([
    mailboxSyncAccountJobId(accountId),
    mailboxSyncCalendarJobId(accountId)
  ]);

  const merged = new Map<string, MailboxSyncJobStatus>();

  if (mailboxSyncUsesBullmqInspection()) {
    const queue = getMailboxSyncQueue();
    const byId = await Promise.all(
      [...trackedIds].map(async (jobId) => {
        const job = await queue.getJob(jobId);
        return job ? serializeMailboxSyncJob(job) : null;
      })
    );
    for (const row of byId) {
      if (row?.jobId) merged.set(row.jobId, row);
    }
    const queueJobs = await queue.getJobs(VISIBLE_QUEUE_TYPES, 0, 200);
    for (const job of queueJobs.filter((j) => accountIdFromJob(j) === accountId && jobKindForName(j.name) != null)) {
      const row = await serializeMailboxSyncJob(job);
      if (row?.jobId) merged.set(row.jobId, row);
    }
  } else {
    const producer = getJobProducer();
    for (const jobId of trackedIds) {
      const job = await producer.getJob(queueName, jobId);
      const row = job ? serializeSnapshot(job) : null;
      if (row?.jobId) merged.set(row.jobId, row);
    }
    const jobs = await producer.getJobsByStates(queueName, VISIBLE_QUEUE_TYPES);
    for (const job of jobs.filter((j) => accountIdFromJob(j) === accountId && jobKindForName(j.name) != null)) {
      const row = serializeSnapshot(job);
      if (row?.jobId) merged.set(row.jobId, row);
    }
  }

  const order: MailboxSyncJobKind[] = ["mail", "calendar"];
  const stateRank = (state: MailboxSyncJobState): number => {
    switch (state) {
      case "active":
        return 0;
      case "waiting":
      case "delayed":
        return 1;
      case "failed":
        return 2;
      case "completed":
        return 3;
      default:
        return 4;
    }
  };

  return [...merged.values()].sort((a, b) => {
    const kindOrder = order.indexOf(a.kind) - order.indexOf(b.kind);
    if (kindOrder !== 0) return kindOrder;
    return stateRank(a.state) - stateRank(b.state);
  });
};
