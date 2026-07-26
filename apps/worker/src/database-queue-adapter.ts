/**
 * BullMQ `Queue` shim over SQL `background_jobs`.
 *
 * Lets mailbox and lifecycle workers fan out child jobs when `QUEUE_STRATEGY=local`
 * without branching every call site on queue backend.
 *
 * Responsibilities:
 * - `add`, `getJob`, `getJobs` compatible with BullMQ consumer code paths
 * - Map dedupe keys and row status to BullMQ job states
 *
 * Depends on:
 * - `./database-enqueue.js` for insert and finished-job cleanup
 *
 * Notes:
 * - Only implements the subset of `Queue` used by worker modules today
 */

import {
  BACKGROUND_JOB_ACTIVE_STATUSES,
  BACKGROUND_JOB_TERMINAL_STATUSES,
  getBackgroundJobByDedupeKeyAnyStatus,
  getBackgroundJobById,
  listBackgroundJobsForQueueByStatuses,
  type BackgroundJobRow,
  type BackgroundJobStatus
} from "@starter/db";

import { dbClearFinishedJob, dbEnqueueJob, type DbJobEnqueueOptions } from "./database-enqueue.js";

/**
 * Minimal BullMQ `Queue` surface backed by `background_jobs` rows.
 *
 * @param queueName - Target queue (e.g. `dev-mail-sync`).
 */
export class DatabaseQueueAdapter {
  constructor(private readonly queueName: string) {}

  /** Enqueues a job row; returns BullMQ-compatible `{ id }` handle. */
  async add(name: string, data: Record<string, unknown>, opts?: DbJobEnqueueOptions & { jobId?: string; priority?: number }) {
    const { id } = await dbEnqueueJob(this.queueName, name, data, opts);
    return { id: opts?.jobId ?? id };
  }

  /** Loads a job by dedupe key or row id when it belongs to this queue. */
  async getJob(jobId: string): Promise<DatabaseJobAdapter | undefined> {
    const row = (await getBackgroundJobByDedupeKeyAnyStatus(this.queueName, jobId)) ?? (await getBackgroundJobById(jobId));
    if (!row || row.queueName !== this.queueName) return undefined;
    return new DatabaseJobAdapter(row);
  }

  /** Lists jobs whose SQL status maps to the requested BullMQ state names. */
  async getJobs(states: string[]): Promise<DatabaseJobAdapter[]> {
    const wantActive = states.some((s) => ["active", "waiting", "delayed", "prioritized", "wait"].includes(s));
    const wantTerminal = states.some((s) => s === "completed" || s === "failed");
    const statuses: BackgroundJobStatus[] = [];
    if (wantActive) statuses.push(...BACKGROUND_JOB_ACTIVE_STATUSES);
    if (wantTerminal) statuses.push(...BACKGROUND_JOB_TERMINAL_STATUSES);
    const rows = await listBackgroundJobsForQueueByStatuses(this.queueName, statuses);
    return rows
      .filter((row) => states.includes(row.status) || (states.includes("waiting") && row.status === "waiting"))
      .map((row) => new DatabaseJobAdapter(row));
  }
}

class DatabaseJobAdapter {
  constructor(private readonly row: BackgroundJobRow) {}

  get id(): string {
    return this.row.dedupeKey ?? this.row.id;
  }

  get name(): string {
    return this.row.jobName;
  }

  get data(): unknown {
    try {
      return JSON.parse(this.row.payload);
    } catch {
      return this.row.payload;
    }
  }

  async getState(): Promise<string> {
    if (this.row.status === "waiting") return "waiting";
    if (this.row.status === "active") return "active";
    if (this.row.status === "delayed") return "delayed";
    if (this.row.status === "completed") return "completed";
    if (this.row.status === "failed") return "failed";
    return this.row.status;
  }

  async remove(): Promise<void> {
    if (this.row.dedupeKey) {
      await dbClearFinishedJob(this.row.queueName, this.row.dedupeKey);
    }
  }
}
