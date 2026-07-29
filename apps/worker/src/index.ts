/**
 * Worker process entrypoint (`@starter/worker`).
 *
 * Boots background job consumers for email, subscription billing, invoicing lifecycle,
 * and mailbox sync. Chooses queue backend from `QUEUE_STRATEGY`. Optionally starts a
 * tiny HTTP liveness server (`GET /health`) when `WORKER_PORT` or platform `PORT` is set
 * (Hostinger jobs hostname keep-alive).
 *
 * Responsibilities:
 * - Validate minimal env and database connectivity before subscribing to queues
 * - `local` — delegate to SQL `background_jobs` poller (`database-worker.ts`)
 * - `external` — BullMQ workers over Redis (`REDIS_URL`)
 * - Wire shared email handlers and domain-specific worker modules
 * - Optional health HTTP for PaaS process keep-alive (`health-server.ts`)
 *
 * Depends on:
 * - `@starter/db`, `@starter/logger`, `@starter/shared`
 * - `./env-bootstrap.js` (repo-root `.env` before any env reads)
 *
 * Security:
 * - Job payloads carry tenant ids; handlers must scope DB access server-side
 * - Redis URL must not be logged with credentials
 */

import "./env-bootstrap.js";
import {
  INVOICING_PAYMENT_REMINDER_EMAIL_JOB_NAME,
  PLATFORM_QUEUE_TEST_JOB_NAME,
  usesDatabaseBackend
} from "@starter/shared";
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { createLogger, printDevServiceReady, resolveLogLevel } from "@starter/logger";
import { assertMinimalBootEnv, getDb } from "@starter/db";

import { startDatabaseWorkers } from "./database-worker.js";
import { startWorkerHealthServer } from "./health-server.js";
import {
  resolveInvoicingLifecycleQueueName,
  startInvoicingLifecycleWorker
} from "./invoicing-lifecycle-worker.js";
import { resolveMailboxSyncQueueName, startMailboxSyncWorker } from "./mailbox-sync-worker.js";
import {
  resolveSubscriptionBillingQueueName,
  startSubscriptionBillingWorker
} from "./subscription-billing-worker.js";
import {
  sendInvoicingPaymentReminderEmailJob,
  sendWelcomeEmailJob
} from "./tenant-mail-jobs.js";

const workerDevBootStartedAt = Date.now();
const log = createLogger("worker");
const nodeEnv = process.env.NODE_ENV ?? "development";

try {
  assertMinimalBootEnv({ nodeEnv, role: "worker" });
} catch (err) {
  log.fatal(err, "Minimal environment configuration incomplete — refusing to start");
  process.exit(1);
}

startWorkerHealthServer();

const queuePrefix = nodeEnv === "production" ? "prod" : "dev";
const queueName = `${queuePrefix}-email`;

try {
  getDb();
  log.debug("Database connection verified for worker");
} catch (err) {
  log.fatal(err, "Database connection failed — refusing to start");
  process.exit(1);
}

if (usesDatabaseBackend()) {
  log.info({
    msg: "Worker boot sequence started",
    nodeEnv: process.env.NODE_ENV ?? "development",
    logLevel: resolveLogLevel(),
    queueStrategy: "local"
  });
  startDatabaseWorkers(workerDevBootStartedAt);
} else {
  /** Empty or whitespace `REDIS_URL=` in `.env` would otherwise bypass `??` and break ioredis. */
  const redisUrlFromEnv = process.env.REDIS_URL?.trim();
  const redisUrl = redisUrlFromEnv || "redis://localhost:6379";

  const redisTarget = (() => {
    try {
      const u = new URL(redisUrl);
      return {
        host: u.hostname || "localhost",
        port: u.port || "6379",
        source: redisUrlFromEnv ? ("env" as const) : ("default" as const)
      };
    } catch {
      return {
        host: "invalid-url",
        port: "-",
        source: redisUrlFromEnv ? ("env" as const) : ("default" as const)
      };
    }
  })();

  log.info({
    msg: "Worker boot sequence started",
    nodeEnv: process.env.NODE_ENV ?? "development",
    logLevel: resolveLogLevel(),
    queueName,
    queueStrategy: "external",
    redisUrlConfigured: Boolean(redisUrlFromEnv),
    redisConnectHost: redisTarget.host,
    redisConnectPort: redisTarget.port,
    redisUrlSource: redisTarget.source
  });

  const REDIS_RETRY_MS = 30_000;

  const isUnreachableRedisError = (err: unknown): boolean => {
    if (!err || typeof err !== "object") return false;
    const e = err as NodeJS.ErrnoException & { errors?: unknown[]; name?: string };
    if (e.code === "ECONNREFUSED") return true;
    if (e.name === "AggregateError" && Array.isArray(e.errors)) {
      return e.errors.some(
        (sub) =>
          sub &&
          typeof sub === "object" &&
          "code" in sub &&
          (sub as NodeJS.ErrnoException).code === "ECONNREFUSED"
      );
    }
    return false;
  };

  let lastRedisUnreachableLog = 0;

  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    retryStrategy: () => REDIS_RETRY_MS
  });

  redis.on("connect", () => {
    log.info(
      {
        host: redisTarget.host,
        port: redisTarget.port,
        redisUrlSource: redisTarget.source
      },
      "Redis TCP connection established"
    );
  });

  redis.on("error", (err) => {
    const now = Date.now();
    if (isUnreachableRedisError(err)) {
      if (now - lastRedisUnreachableLog < REDIS_RETRY_MS) return;
      lastRedisUnreachableLog = now;
      log.error(
        { err },
        `Redis unreachable — next reconnect attempt in ${REDIS_RETRY_MS / 1000}s (set REDIS_URL or start Redis).`
      );
      return;
    }
    log.error({ err }, "Redis client error");
  });

  const emailQueue = new Queue(queueName, {
    connection: redis
  });

  const worker = new Worker(
    queueName,
    async (job) => {
      if (job.name === "welcome-email") {
        log.info(
          {
            jobId: job.id,
            tenantId: job.data?.tenantId,
            userId: job.data?.userId
          },
          "Processing welcome-email job"
        );
        return sendWelcomeEmailJob(
          { tenantId: String(job.data?.tenantId ?? ""), userId: String(job.data?.userId ?? "") },
          log
        );
      }
      if (job.name === PLATFORM_QUEUE_TEST_JOB_NAME) {
        log.info({ jobId: job.id }, "Processing platform-queue-test probe job");
        return { ok: true, probe: true };
      }
      if (job.name === INVOICING_PAYMENT_REMINDER_EMAIL_JOB_NAME) {
        log.info(
          {
            jobId: job.id,
            tenantId: job.data?.tenantId,
            invoiceId: job.data?.invoiceId,
            reminderKind: job.data?.reminderKind
          },
          "Processing invoicing payment reminder email"
        );
        return sendInvoicingPaymentReminderEmailJob(job.data, log);
      }
      log.warn({ jobId: job.id, jobName: job.name }, "Unknown job type — no handler");
      return { handled: false };
    },
    { connection: redis }
  );

  worker.on("failed", (job, err) => {
    log.error(
      { err, jobId: job?.id, jobName: job?.name },
      "Job failed after retries"
    );
  });

  worker.on("completed", (job) => {
    log.debug({ jobId: job.id, jobName: job.name }, "Job completed");
  });

  const subscriptionBillingWorker = startSubscriptionBillingWorker(redis);

  subscriptionBillingWorker.once("ready", () => {
    log.info({ queueName: resolveSubscriptionBillingQueueName() }, "Subscription billing worker ready");
  });

  const invoicingLifecycleWorker = startInvoicingLifecycleWorker(redis);

  invoicingLifecycleWorker.once("ready", () => {
    log.info({ queueName: resolveInvoicingLifecycleQueueName() }, "Invoicing lifecycle worker ready");
  });

  const mailboxSyncWorker = startMailboxSyncWorker(redis);

  mailboxSyncWorker.worker.once("ready", () => {
    log.info({ queueName: resolveMailboxSyncQueueName() }, "Mailbox sync worker ready");
  });

  worker.once("ready", () => {
    log.info({ queueName }, "Worker subscribed and draining queue");
    if ((process.env.NODE_ENV ?? "development") !== "production") {
      const readyMs = Date.now() - workerDevBootStartedAt;
      printDevServiceReady("@starter/worker", readyMs, [
        { label: "Redis", value: `${redisTarget.host}:${redisTarget.port}` },
        { label: "Queue", value: queueName }
      ]);
      void import("../../../scripts/dev-process-registry.mjs").then((m) =>
        m.markDevProcessReady({ pid: process.pid })
      );
    }
  });
}
