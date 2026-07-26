/**
 * Minimal boot env validation — `src/boot-env.ts`.
 *
 * Asserts required startup variables and aggregated error reporting.
 */

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { assertMinimalBootEnv, collectMinimalBootEnvErrors } from "../src/boot-env.js";

describe("boot-env / minimal startup validation", () => {
  const keys = [
    "NODE_ENV",
    "DATABASE_DIALECT",
    "DATABASE_URL",
    "DATABASE_HOST",
    "DATABASE_NAME",
    "DATABASE_USER",
    "DATABASE_PASSWORD",
    "QUEUE_STRATEGY",
    "REDIS_URL"
  ] as const;

  const orig: Partial<Record<(typeof keys)[number], string | undefined>> = {};

  afterEach(() => {
    for (const key of keys) {
      if (orig[key] === undefined) delete process.env[key];
      else process.env[key] = orig[key];
    }
  });

  const snapshot = () => {
    for (const key of keys) {
      orig[key] = process.env[key];
      delete process.env[key];
    }
  };

  const withPostgresParts = () => {
    process.env.DATABASE_DIALECT = "postgres";
    process.env.DATABASE_HOST = "localhost";
    process.env.DATABASE_NAME = "template";
    process.env.DATABASE_USER = "postgres";
    process.env.DATABASE_PASSWORD = "secret";
  };

  it("passes when database parts and local queue are configured", () => {
    snapshot();
    withPostgresParts();
    process.env.QUEUE_STRATEGY = "local";
    assert.deepEqual(collectMinimalBootEnvErrors({ nodeEnv: "development", role: "api" }), []);
    assert.doesNotThrow(() => assertMinimalBootEnv({ nodeEnv: "development", role: "worker" }));
  });

  it("reports missing database configuration", () => {
    snapshot();
    process.env.DATABASE_DIALECT = "postgres";
    const errors = collectMinimalBootEnvErrors({ nodeEnv: "development", role: "api" });
    assert.ok(errors.length > 0);
    assert.match(errors[0]!, /DATABASE_URL|DATABASE_HOST/i);
  });

  it("requires REDIS_URL in production when using external queue", () => {
    snapshot();
    withPostgresParts();
    process.env.NODE_ENV = "production";
    process.env.QUEUE_STRATEGY = "external";
    delete process.env.REDIS_URL;
    const errors = collectMinimalBootEnvErrors({ nodeEnv: "production", role: "worker" });
    assert.ok(errors.some((e) => e.includes("REDIS_URL")));
  });

  it("does not require REDIS_URL in development when external queue uses default", () => {
    snapshot();
    withPostgresParts();
    process.env.NODE_ENV = "development";
    process.env.QUEUE_STRATEGY = "external";
    delete process.env.REDIS_URL;
    assert.deepEqual(collectMinimalBootEnvErrors({ nodeEnv: "development", role: "worker" }), []);
  });
});
