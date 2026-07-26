/**
 * BullMQ job producer adapter.
 *
 * Enqueues and inspects background jobs via Redis-backed BullMQ queues when the
 * deployment is not using the database job backend.
 *
 * Responsibilities:
 * - Maintain shared Redis connection and per-queue `Queue` instances
 * - Map BullMQ job state to `JobSnapshot` for admin APIs
 * - Expose queue helpers for the worker process
 */

import { Queue } from "bullmq";
import { Redis } from "ioredis";

import type { JobEnqueueOptions, JobProducer, JobSnapshot } from "./types.js";

const ACTIVE_JOB_STATES = new Set(["active", "waiting", "delayed", "prioritized", "wait"]);

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

let redis: Redis | undefined;
const queues = new Map<string, Queue>();

const getRedis = (): Redis => {
  if (!redis) {
    redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
  }
  return redis;
};

const getQueue = (queueName: string): Queue => {
  let q = queues.get(queueName);
  if (!q) {
    q = new Queue(queueName, { connection: getRedis() });
    queues.set(queueName, q);
  }
  return q;
};

const bullJobToSnapshot = async (job: Awaited<ReturnType<Queue["getJob"]>>): Promise<JobSnapshot | null> => {
  if (!job) return null;
  const state = await job.getState();
  return {
    id: job.id != null ? String(job.id) : "",
    name: job.name,
    state,
    data: job.data ?? null,
    returnvalue: job.returnvalue ?? null,
    failedReason: job.failedReason ? String(job.failedReason).slice(0, 4000) : null,
    processedOn: job.processedOn ?? null,
    finishedOn: job.finishedOn ?? null,
    attemptsMade: job.attemptsMade,
    timestamp: job.timestamp
  };
};

/** Creates a `JobProducer` backed by BullMQ and Redis. */
export const createBullmqJobProducer = (): JobProducer => ({
  add: async (queueName, jobName, data, options?: JobEnqueueOptions) => {
    const job = await getQueue(queueName).add(jobName, data, {
      jobId: options?.jobId,
      priority: options?.priority,
      removeOnComplete: options?.removeOnComplete,
      removeOnFail: options?.removeOnFail,
      attempts: options?.attempts,
      backoff: options?.backoffDelayMs
        ? { type: "exponential", delay: options.backoffDelayMs }
        : undefined
    });
    return { id: job.id != null ? String(job.id) : "" };
  },
  getJob: async (queueName, jobId) => bullJobToSnapshot(await getQueue(queueName).getJob(jobId)),
  getJobsByStates: async (queueName, states) => {
    const types = states.flatMap((s) => (s === "waiting" ? (["waiting", "wait", "prioritized"] as const) : [s]));
    const jobs = await getQueue(queueName).getJobs(types as ("active" | "waiting" | "delayed" | "completed" | "failed")[], 0, 200);
    return Promise.all(jobs.map((j) => bullJobToSnapshot(j))).then((rows) => rows.filter((r): r is JobSnapshot => r != null));
  },
  removeFinishedJob: async (queueName, jobId) => {
    const job = await getQueue(queueName).getJob(jobId);
    if (!job) return;
    const state = await job.getState();
    if (!ACTIVE_JOB_STATES.has(state)) {
      await job.remove();
    }
  },
  isJobActive: async (queueName, jobId) => {
    const job = await getQueue(queueName).getJob(jobId);
    if (!job) return false;
    const state = await job.getState();
    return ACTIVE_JOB_STATES.has(state);
  }
});

export const getBullmqQueue = (queueName: string): Queue => getQueue(queueName);

export const duplicateBullmqSubscriberConnection = (): Redis => getRedis().duplicate();
