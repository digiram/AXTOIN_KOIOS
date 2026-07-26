/**
 * Database URL composition — `src/database-url.ts`.
 *
 * Asserts Supabase-style URL assembly and `getDatabaseUrl` precedence.
 */

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { composeSupabaseDatabaseUrl, getDatabaseUrl } from "../src/database-url.js";

describe("database-url / supabase", () => {
  const orig: Record<string, string | undefined> = {};

  const keys = [
    "DATABASE_DIALECT",
    "DATABASE_URL",
    "SUPABASE_DATABASE_URL",
    "SUPABASE_PROJECT_REF",
    "SUPABASE_DB_PASSWORD",
    "SUPABASE_DB_REGION",
    "SUPABASE_DB_POOLER",
    "DATABASE_HOST",
    "DATABASE_NAME",
    "DATABASE_USER",
    "DATABASE_PASSWORD",
    "DATABASE_PORT",
  ] as const;

  afterEach(() => {
    for (const key of keys) {
      if (orig[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = orig[key];
      }
    }
  });

  const snapshotEnv = () => {
    for (const key of keys) {
      orig[key] = process.env[key];
      delete process.env[key];
    }
  };

  it("prefers DATABASE_URL over Supabase-specific vars", () => {
    snapshotEnv();
    process.env.DATABASE_DIALECT = "supabase";
    process.env.DATABASE_URL = "postgresql://explicit:secret@host:5432/postgres";
    process.env.SUPABASE_PROJECT_REF = "abc";
    process.env.SUPABASE_DB_PASSWORD = "pw";
    assert.equal(getDatabaseUrl(), "postgresql://explicit:secret@host:5432/postgres");
  });

  it("uses SUPABASE_DATABASE_URL when DATABASE_URL is unset", () => {
    snapshotEnv();
    process.env.DATABASE_DIALECT = "supabase";
    process.env.SUPABASE_DATABASE_URL = "postgresql://pooler:pw@pooler.supabase.com:6543/postgres";
    assert.equal(getDatabaseUrl(), "postgresql://pooler:pw@pooler.supabase.com:6543/postgres");
  });

  it("composes transaction pooler URL from project ref, password, and region", () => {
    snapshotEnv();
    process.env.SUPABASE_PROJECT_REF = "myref";
    process.env.SUPABASE_DB_PASSWORD = "p@ss";
    process.env.SUPABASE_DB_REGION = "eu-west-1";
    const url = composeSupabaseDatabaseUrl();
    assert.equal(
      url,
      "postgresql://postgres.myref:p%40ss@aws-0-eu-west-1.pooler.supabase.com:6543/postgres"
    );
  });

  it("composes session pooler URL on port 5432", () => {
    snapshotEnv();
    process.env.SUPABASE_PROJECT_REF = "myref";
    process.env.SUPABASE_DB_PASSWORD = "secret";
    process.env.SUPABASE_DB_REGION = "us-east-1";
    process.env.SUPABASE_DB_POOLER = "session";
    const url = composeSupabaseDatabaseUrl();
    assert.equal(
      url,
      "postgresql://postgres.myref:secret@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
    );
  });

  it("composes direct connection URL", () => {
    snapshotEnv();
    process.env.SUPABASE_PROJECT_REF = "myref";
    process.env.SUPABASE_DB_PASSWORD = "secret";
    process.env.SUPABASE_DB_POOLER = "direct";
    const url = composeSupabaseDatabaseUrl();
    assert.equal(url, "postgresql://postgres:secret@db.myref.supabase.co:5432/postgres");
  });

  it("getDatabaseUrl uses composed Supabase URL when dialect is supabase", () => {
    snapshotEnv();
    process.env.DATABASE_DIALECT = "supabase";
    process.env.SUPABASE_PROJECT_REF = "myref";
    process.env.SUPABASE_DB_PASSWORD = "secret";
    process.env.SUPABASE_DB_REGION = "eu-west-1";
    process.env.SUPABASE_DB_POOLER = "transaction";
    assert.equal(
      getDatabaseUrl(),
      "postgresql://postgres.myref:secret@aws-0-eu-west-1.pooler.supabase.com:6543/postgres"
    );
  });
});
