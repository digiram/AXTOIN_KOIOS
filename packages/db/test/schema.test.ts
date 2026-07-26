/**
 * Schema dialect resolution — `dialectFromEnv` in `src/schema.ts`.
 *
 * Asserts Postgres vs MySQL selection from environment variables.
 */

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { dialectFromEnv } from "../src/schema.js";

describe("schema / dialectFromEnv", () => {
  const origDialect = process.env.DATABASE_DIALECT;

  afterEach(() => {
    if (origDialect === undefined) {
      delete process.env.DATABASE_DIALECT;
    } else {
      process.env.DATABASE_DIALECT = origDialect;
    }
  });

  it("defaults to postgres when DATABASE_DIALECT is unset or other value", () => {
    delete process.env.DATABASE_DIALECT;
    assert.equal(dialectFromEnv(), "postgres");
    process.env.DATABASE_DIALECT = "pg";
    assert.equal(dialectFromEnv(), "postgres");
  });

  it("returns mysql only when DATABASE_DIALECT is mysql", () => {
    process.env.DATABASE_DIALECT = "mysql";
    assert.equal(dialectFromEnv(), "mysql");
  });

  it("returns supabase when DATABASE_DIALECT is supabase", () => {
    process.env.DATABASE_DIALECT = "supabase";
    assert.equal(dialectFromEnv(), "supabase");
  });
});
