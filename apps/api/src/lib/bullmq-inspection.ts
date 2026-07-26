/**
 * Read-only BullMQ **Queue** accessors for super-admin inspection (`GET /platform/job-queues*`).
 *
 * Queue names and Redis URL **must match** `apps/api/src/lib/email-queue.ts` and `apps/worker`.
 */

import type { Job, JobType } from "bullmq";
import { Queue } from "bullmq";
import { Redis } from "ioredis";

import type { PlatformJobConcreteState, PlatformJobQueueId, PlatformJobState } from "@starter/shared";

import { resolveSubscriptionBillingQueueName } from "./subscription-billing-queue.js";
import { resolveInvoicingLifecycleQueueName } from "./invoicing-lifecycle-queue.js";
import { resolveMailboxSyncQueueName } from "./mailbox-queue.js";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

export const resolveEmailQueueName = (): string =>
  `${process.env.NODE_ENV === "production" ? "prod" : "dev"}-email`;

let redis: Redis | undefined;
const queues = new Map<PlatformJobQueueId, Queue>();

const getRedis = (): Redis => {
  if (!redis) {
    redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
  }
  return redis;
};

/** Duplicate connection for BullMQ subscribers (`QueueEvents`, etc.); do not share one ioredis for Queue + QueueEvents. */
export const duplicateBullmqSubscriberConnection = (): Redis => getRedis().duplicate();

export const getInspectionQueue = (id: PlatformJobQueueId): Queue => {
  let q = queues.get(id);
  if (!q) {
    const name =
      id === "email"
        ? resolveEmailQueueName()
        : id === "subscription-billing"
          ? resolveSubscriptionBillingQueueName()
          : id === "invoicing-lifecycle"
            ? resolveInvoicingLifecycleQueueName()
            : id === "mail-sync"
              ? resolveMailboxSyncQueueName()
            : "";
    if (!name) {
      throw new Error(`Unsupported queue id: ${id}`);
    }
    q = new Queue(name, { connection: getRedis() });
    queues.set(id, q);
  }
  return q;
};

type BullGetJobType = "wait" | "active" | "delayed" | "completed" | "failed" | "paused";

/** Map UI / API state to BullMQ `JobType` values accepted by `getJobs`. */
const stateToBullTypes = (state: PlatformJobState): BullGetJobType[] => {
  switch (state) {
    case "all":
      return ["wait", "active", "delayed", "completed", "failed", "paused"];
    case "waiting":
      return ["wait"];
    case "active":
      return ["active"];
    case "delayed":
      return ["delayed"];
    case "completed":
      return ["completed"];
    case "failed":
      return ["failed"];
    case "paused":
      return ["paused"];
    default:
      return ["wait"];
  }
};

/** Map BullMQ `Job.getState()` to API row state (no aggregate `all`). */
export const bullMqStateToPlatform = (bullState: string): PlatformJobConcreteState => {
  switch (bullState) {
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
    case "wait":
      return "waiting";
    case "prioritized":
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

export const serializeJobForAdmin = (job: Job, state: PlatformJobConcreteState) => {
  const data = truncateJson(job.data ?? null);
  const returnvalue = truncateJson(job.returnvalue ?? null);
  return {
    id: job.id,
    name: job.name,
    state,
    timestamp: job.timestamp,
    processedOn: job.processedOn ?? null,
    finishedOn: job.finishedOn ?? null,
    attemptsMade: job.attemptsMade,
    data,
    returnvalue,
    failedReason: job.failedReason ? String(job.failedReason).slice(0, 4000) : null
  };
};

export const listJobsForQueue = async (
  queueId: PlatformJobQueueId,
  state: PlatformJobState,
  start: number,
  limit: number
) => {
  const queue = getInspectionQueue(queueId);
  const types = stateToBullTypes(state);
  const end = start + limit - 1;
  const jobs = await queue.getJobs(types as JobType[], start, end, false);
  if (state === "all") {
    return Promise.all(
      jobs.map(async (j) => serializeJobForAdmin(j, bullMqStateToPlatform(await j.getState())))
    );
  }
  return jobs.map((j) => serializeJobForAdmin(j, state));
};

export type PlatformQueueCounts = {
  waiting: number;
  active: number;
  delayed: number;
  completed: number;
  failed: number;
  paused: number;
  prioritized: number;
  waitingChildren: number;
};

export const getQueueCounts = async (queueId: PlatformJobQueueId) => {
  const queue = getInspectionQueue(queueId);
  return queue.getJobCounts(
    "wait",
    "waiting-children",
    "active",
    "completed",
    "failed",
    "delayed",
    "paused",
    "prioritized"
  );
};

/** Stable keys for the admin UI (`wait` → `waiting`). */
export const normalizeQueueCounts = (raw: Record<string, number>): PlatformQueueCounts => ({
  waiting: raw.wait ?? 0,
  active: raw.active ?? 0,
  delayed: raw.delayed ?? 0,
  completed: raw.completed ?? 0,
  failed: raw.failed ?? 0,
  paused: raw.paused ?? 0,
  prioritized: raw.prioritized ?? 0,
  waitingChildren: raw["waiting-children"] ?? 0
});
