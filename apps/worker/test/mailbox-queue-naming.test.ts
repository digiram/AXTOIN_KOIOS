/**
 * Unit tests for mailbox sync queue naming.
 *
 * Asserts `resolveMailboxSyncQueueName` matches the `{prod|dev}-mail-sync` contract
 * shared with API job producers under `apps/worker/src/mailbox-sync-worker.ts`.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveMailboxSyncQueueName } from "../src/mailbox-sync-worker.js";

const mailboxSyncQueueName = (nodeEnv: string | undefined) =>
  `${nodeEnv === "production" ? "prod" : "dev"}-mail-sync`;

describe("worker mail-sync queue naming", () => {
  it("uses dev-mail-sync outside production", () => {
    process.env.NODE_ENV = "development";
    assert.equal(mailboxSyncQueueName("development"), "dev-mail-sync");
    assert.equal(resolveMailboxSyncQueueName(), "dev-mail-sync");
  });

  it("uses prod-mail-sync in production", () => {
    process.env.NODE_ENV = "production";
    assert.equal(mailboxSyncQueueName("production"), "prod-mail-sync");
    assert.equal(resolveMailboxSyncQueueName(), "prod-mail-sync");
  });
});
