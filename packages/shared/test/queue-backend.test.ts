/**
 * Tests for queue backend and database dialect resolution from env.
 *
 * Under test: `../src/queue-backend.js`
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  DATABASE_QUEUE_DEFAULTS,
  databaseDialectFromEnv,
  queueStrategyFromEnv,
  sqlDialectSupportsLocalQueue,
  usesDatabaseBackend,
  usesRedisBackend
} from "../src/queue-backend.js";

describe("queue strategy env", () => {
  const orig = { ...process.env };

  afterEach(() => {
    process.env = { ...orig };
  });

  it("defaults to external (redis) when unset", () => {
    delete process.env.QUEUE_STRATEGY;
    assert.equal(queueStrategyFromEnv(), "external");
    assert.equal(usesRedisBackend(), true);
    assert.equal(usesDatabaseBackend(), false);
  });

  it("selects the local (database) strategy", () => {
    process.env.QUEUE_STRATEGY = "local";
    assert.equal(queueStrategyFromEnv(), "local");
    assert.equal(usesDatabaseBackend(), true);
    assert.equal(usesRedisBackend(), false);
  });

  it("enables local queue for postgres, supabase, and mysql dialects", () => {
    process.env.QUEUE_STRATEGY = "local";
    for (const dialect of ["postgres", "supabase", "mysql"] as const) {
      process.env.DATABASE_DIALECT = dialect;
      assert.equal(sqlDialectSupportsLocalQueue(), true);
      assert.equal(usesDatabaseBackend(), true);
    }
  });

  it("ignores unknown values and falls back to external", () => {
    process.env.QUEUE_STRATEGY = "nonsense";
    assert.equal(queueStrategyFromEnv(), "external");
  });

  it("exposes a built-in poll interval default", () => {
    assert.equal(DATABASE_QUEUE_DEFAULTS.pollIntervalMs, 5000);
  });
});
