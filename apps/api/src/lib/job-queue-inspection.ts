/**
 * Job queue inspection for super-admin UI — BullMQ or database backend.
 */

import type { Job } from "bullmq";

import {
  countBackgroundJobsByStatus,
  listBackgroundJobs,
  type BackgroundJobRow
} from "@starter/db";
import type { PlatformJobConcreteState, PlatformJobQueueId, PlatformJobState } from "@starter/shared";
import { usesDatabaseBackend } from "@starter/shared";

import {
  bullMqStateToPlatform,
  getInspectionQueue,
  listJobsForQueue as listBullJobsForQueue,
  getQueueCounts as getBullQueueCounts,
  normalizeQueueCounts,
  serializeJobForAdmin
} from "./bullmq-inspection.js";
import { resolveEmailQueueName } from "./email-queue.js";
import { resolveInvoicingLifecycleQueueName } from "./invoicing-lifecycle-queue.js";
import { resolveMailboxSyncQueueName } from "./mailbox-queue.js";
import { resolveSubscriptionBillingQueueName } from "./subscription-billing-queue.js";

export { duplicateBullmqSubscriberConnection } from "./job-queue/bullmq-producer.js";
export { normalizeQueueCounts, bullMqStateToPlatform, resolveEmailQueueName };

const resolveQueueName = (id: PlatformJobQueueId): string => {
  switch (id) {
    case "email":
      return resolveEmailQueueName();
    case "subscription-billing":
      return resolveSubscriptionBillingQueueName();
    case "invoicing-lifecycle":
      return resolveInvoicingLifecycleQueueName();
    case "mail-sync":
      return resolveMailboxSyncQueueName();
    default:
      return id;
  }
};

const dbStateToPlatform = (status: string): PlatformJobConcreteState => {
  switch (status) {
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "delayed":
      return "delayed";
    case "active":
      return "active";
    case "paused":
      return "paused";
    case "waiting":
      return "waiting";
    default:
      return "waiting";
  }
};

const truncateJson = (value: unknown, max = 1800): unknown => {
  try {
    const s = JSON.stringify(value);
    if (s.length <= max) return value;
    return JSON.parse(s.slice(0, max)) as unknown;
  } catch {
    return "[unserializable]";
  }
};

const serializeDbJobForAdmin = (row: BackgroundJobRow) => {
  let data: unknown = null;
  let returnvalue: unknown = null;
  try {
    data = JSON.parse(row.payload);
  } catch {
    data = row.payload;
  }
  if (row.result) {
    try {
      returnvalue = JSON.parse(row.result);
    } catch {
      returnvalue = row.result;
    }
  }
  return {
    id: row.dedupeKey ?? row.id,
    name: row.jobName,
    state: dbStateToPlatform(row.status),
    timestamp: row.createdAt.getTime(),
    processedOn: row.processedAt ? row.processedAt.getTime() : null,
    finishedOn: row.finishedAt ? row.finishedAt.getTime() : null,
    attemptsMade: row.attempts,
    data: truncateJson(data),
    returnvalue: truncateJson(returnvalue),
    failedReason: row.error ? String(row.error).slice(0, 4000) : null
  };
};

export const listJobsForQueue = async (
  queueId: PlatformJobQueueId,
  state: PlatformJobState,
  start: number,
  limit: number
) => {
  if (usesDatabaseBackend()) {
    const rows = await listBackgroundJobs({
      queueName: resolveQueueName(queueId),
      state,
      start,
      limit
    });
    return rows.map(serializeDbJobForAdmin);
  }
  return listBullJobsForQueue(queueId, state, start, limit);
};

export const getQueueCounts = async (queueId: PlatformJobQueueId) => {
  if (usesDatabaseBackend()) {
    const raw = await countBackgroundJobsByStatus(resolveQueueName(queueId));
    return {
      waiting: raw.waiting ?? 0,
      active: raw.active ?? 0,
      delayed: raw.delayed ?? 0,
      completed: raw.completed ?? 0,
      failed: raw.failed ?? 0,
      paused: raw.paused ?? 0,
      prioritized: 0,
      waitingChildren: 0
    };
  }
  const raw = await getBullQueueCounts(queueId);
  return normalizeQueueCounts(raw as Record<string, number>);
};

/** BullMQ-only queue accessor (redis inspection / mailbox sync status in redis mode). */
export { getInspectionQueue, serializeJobForAdmin };
export type { Job };
