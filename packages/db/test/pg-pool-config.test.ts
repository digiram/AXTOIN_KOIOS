/**
 * Postgres pool configuration — `getPgPoolConfig` in `src/pg-pool-config.ts`.
 *
 * Asserts env-driven pool limits and SSL options.
 */

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { getPgPoolConfig } from "../src/pg-pool-config.js";

describe("pg-pool-config", () => {
  const origDialect = process.env.DATABASE_DIALECT;

  afterEach(() => {
    if (origDialect === undefined) {
      delete process.env.DATABASE_DIALECT;
    } else {
      process.env.DATABASE_DIALECT = origDialect;
    }
  });

  it("adds sslmode=require and ssl options for supabase dialect", () => {
    process.env.DATABASE_DIALECT = "supabase";
    const config = getPgPoolConfig("postgresql://u:p@host:6543/postgres");
    assert.equal(config.connectionString, "postgresql://u:p@host:6543/postgres?sslmode=require");
    assert.deepEqual(config.ssl, { rejectUnauthorized: false });
  });

  it("does not duplicate sslmode when already present", () => {
    process.env.DATABASE_DIALECT = "supabase";
    const config = getPgPoolConfig("postgresql://u:p@host:6543/postgres?sslmode=verify-full");
    assert.equal(config.connectionString, "postgresql://u:p@host:6543/postgres?sslmode=verify-full");
  });

  it("returns connection string only for postgres dialect", () => {
    process.env.DATABASE_DIALECT = "postgres";
    const config = getPgPoolConfig("postgresql://u:p@localhost:5432/db");
    assert.equal(config.connectionString, "postgresql://u:p@localhost:5432/db");
    assert.equal(config.ssl, undefined);
  });
});
