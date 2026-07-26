/**
 * Super-admin job queue **push** channel: one BullMQ `QueueEvents` subscriber fans out debounced activity pings
 * to WebSocket clients (see `platform-job-queues-ws.ts`).
 */

import { QueueEvents } from "bullmq";

import { duplicateBullmqSubscriberConnection } from "./job-queue/bullmq-producer.js";
import { resolveEmailQueueName } from "./email-queue.js";
import { usesDatabaseBackend } from "@starter/shared";

const OPEN = 1;

/** Minimal surface from `ws` used for fan-out (avoid a direct `ws` type import). */
type JobQueueSocket = {
  readonly readyState: number;
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
  on: (event: "close", listener: () => void) => void;
};

let queueEvents: QueueEvents | undefined;
let subscriberRedis: ReturnType<typeof duplicateBullmqSubscriberConnection> | undefined;
const sockets = new Set<JobQueueSocket>();

let debounceTimer: ReturnType<typeof setTimeout> | undefined;

const broadcast = (): void => {
  const payload = JSON.stringify({ type: "job_queues_activity", at: Date.now() });
  for (const s of sockets) {
    if (s.readyState === OPEN) {
      try {
        s.send(payload);
      } catch {
        sockets.delete(s);
      }
    } else {
      sockets.delete(s);
    }
  }
};

const scheduleBroadcast = (): void => {
  if (debounceTimer) return;
  debounceTimer = setTimeout(() => {
    debounceTimer = undefined;
    broadcast();
  }, 300);
};

const QUEUE_EVENT_NAMES = [
  "added",
  "removed",
  "waiting",
  "active",
  "completed",
  "failed",
  "delayed",
  "progress",
  "stalled"
] as const;

export const ensureJobQueueQueueEvents = async (): Promise<boolean> => {
  if (usesDatabaseBackend()) return false;
  if (queueEvents) return true;
  try {
    subscriberRedis = duplicateBullmqSubscriberConnection();
    const name = resolveEmailQueueName();
    queueEvents = new QueueEvents(name, { connection: subscriberRedis });
    await queueEvents.waitUntilReady();
    for (const ev of QUEUE_EVENT_NAMES) {
      queueEvents.on(ev, scheduleBroadcast);
    }
    return true;
  } catch {
    await shutdownJobQueueWsHub();
    return false;
  }
};

export const addJobQueueWsClient = (socket: JobQueueSocket): void => {
  sockets.add(socket);
};

export const removeJobQueueWsClient = (socket: JobQueueSocket): void => {
  sockets.delete(socket);
};

export const shutdownJobQueueWsHub = async (): Promise<void> => {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = undefined;
  }
  for (const s of sockets) {
    try {
      s.close(1001, "server shutdown");
    } catch {
      /* ignore */
    }
  }
  sockets.clear();
  if (queueEvents) {
    try {
      await queueEvents.close();
    } catch {
      /* ignore */
    }
    queueEvents = undefined;
  }
  if (subscriberRedis) {
    try {
      subscriberRedis.disconnect();
    } catch {
      /* ignore */
    }
    subscriberRedis = undefined;
  }
};
