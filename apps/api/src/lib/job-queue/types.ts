/**
 * Job queue type contracts.
 *
 * Shared interfaces for enqueue options, producer methods, and job snapshots used
 * by BullMQ and database backend adapters.
 */

export type JobRemoveAgeOptions = { age: number } | boolean;

export type JobEnqueueOptions = {
  jobId?: string;
  priority?: number;
  removeOnComplete?: JobRemoveAgeOptions;
  removeOnFail?: { age: number };
  attempts?: number;
  backoffDelayMs?: number;
};

export type JobProducer = {
  add: (queueName: string, jobName: string, data: unknown, options?: JobEnqueueOptions) => Promise<{ id: string }>;
  getJob: (queueName: string, jobId: string) => Promise<JobSnapshot | null>;
  getJobsByStates: (queueName: string, states: string[]) => Promise<JobSnapshot[]>;
  removeFinishedJob: (queueName: string, jobId: string) => Promise<void>;
  isJobActive: (queueName: string, jobId: string) => Promise<boolean>;
};

export type JobSnapshot = {
  id: string;
  name: string;
  state: string;
  data: unknown;
  returnvalue: unknown;
  failedReason: string | null;
  processedOn: number | null;
  finishedOn: number | null;
  attemptsMade: number;
  timestamp: number;
};

export const retentionSecFromRemoveOnComplete = (opt: JobRemoveAgeOptions | undefined): number | undefined => {
  if (opt === undefined) return undefined;
  if (opt === true) return 0;
  if (opt === false) return undefined;
  return opt.age;
};

export const retentionSecFromRemoveOnFail = (opt: { age: number } | undefined): number | undefined => opt?.age;
