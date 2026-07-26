/**
 * Integration tests for SQL-backed worker job dispatch.
 *
 * Requires `RUN_INTEGRATION_TESTS=1` and a reachable database. Enqueues a platform
 * probe job and asserts `runOneDatabaseQueueJob` completes the row under test.
 *
 * Module under test: `apps/worker/src/database-worker.ts`, `database-enqueue.ts`.
 */

import "../src/env-bootstrap.js";

const integrationFlag = process.env.RUN_INTEGRATION_TESTS?.trim().toLowerCase();
if (integrationFlag === "1" || integrationFlag === "true") {
  if (process.env.NODE_ENV?.trim().toLowerCase() !== "production") {
    process.env.NODE_ENV = "test";
  }
}

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

import { getBackgroundJobByDedupeKey, pingDatabase, runMigrations } from "@starter/db";
import { PLATFORM_QUEUE_TEST_JOB_NAME } from "@starter/shared";

import { dbEnqueueJob } from "../src/database-enqueue.js";
import { runOneDatabaseQueueJob } from "../src/database-worker.js";

const integrationTestsEnabled = (): boolean => {
  const flag = process.env.RUN_INTEGRATION_TESTS?.trim().toLowerCase();
  return flag === "1" || flag === "true";
};

const canRunIntegrationTests = async (): Promise<boolean> => {
  if (!integrationTestsEnabled()) return false;
  return (await pingDatabase()).ok;
};

const describeIntegration = (await canRunIntegrationTests()) ? describe : describe.skip;

describeIntegration("integration: database worker job dispatch", () => {
  const queueName = `${process.env.NODE_ENV === "production" ? "prod" : "dev"}-email`;
  let dedupeKey: string | undefined;

  before(async () => {
    process.env.QUEUE_STRATEGY = "local";
    await runMigrations();
  });

  after(async () => {
    dedupeKey = undefined;
  });

  it("processes platform-queue-test job to completion", async () => {
    dedupeKey = `int-probe-${randomUUID().slice(0, 8)}`;
    await dbEnqueueJob(queueName, PLATFORM_QUEUE_TEST_JOB_NAME, {}, { jobId: dedupeKey });

    const processed = await runOneDatabaseQueueJob(queueName);
    assert.equal(processed, true);

    const row = await getBackgroundJobByDedupeKey(queueName, dedupeKey);
    assert.ok(row);
    assert.equal(row.status, "completed");
    const result = row.result ? (JSON.parse(row.result) as { ok?: boolean; probe?: boolean }) : null;
    assert.equal(result?.ok, true);
    assert.equal(result?.probe, true);
  });
});
