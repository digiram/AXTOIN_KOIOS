/**
 * Job queue backend factory.
 *
 * Selects BullMQ or database implementation based on `usesDatabaseBackend()` and
 * exposes a process-wide singleton for background job enqueue and inspection.
 */

import { usesDatabaseBackend } from "@starter/shared";

import { createBullmqJobProducer } from "./bullmq-producer.js";
import { createDatabaseJobProducer } from "./database-producer.js";
import type { JobProducer } from "./types.js";

let cached: JobProducer | undefined;

/** Returns the process-wide `JobProducer` singleton. */
export const getJobProducer = (): JobProducer => {
  if (cached) return cached;
  cached = usesDatabaseBackend() ? createDatabaseJobProducer() : createBullmqJobProducer();
  return cached;
};

export const resetJobProducerForTests = (): void => {
  cached = undefined;
};

export type { JobEnqueueOptions, JobProducer, JobSnapshot } from "./types.js";
