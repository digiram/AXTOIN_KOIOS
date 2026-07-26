/**
 * Shared Drizzle database client factory.
 *
 * `DATABASE_DIALECT` plus either `DATABASE_URL` or `DATABASE_*` / Supabase parts (see `database-url.ts`)
 * choose between Postgres (`pg`), Supabase-hosted Postgres (`pg` + TLS), and MySQL (`mysql2`).
 * Each dialect has its own Drizzle schema module (`pg-schema.ts` vs `mysql-schema.ts`) because
 * column helpers differ (e.g. `uuid().defaultRandom()` vs explicit varchar UUIDs).
 *
 * Responsibilities:
 * - Build dialect-specific Drizzle instances with the correct schema module
 * - Memoize a single pool-backed client per process via `getDb()`
 *
 * Depends on:
 * - `database-url`, `pg-pool-config`, `schema.dialectFromEnv`
 *
 * Security:
 * - Repositories must filter tenant-scoped tables by JWT `tenant_id`; this module does not enforce tenancy.
 * - Connection strings may contain secrets — never log `DATABASE_URL`.
 */

import { drizzle as drizzleMySql } from "drizzle-orm/mysql2";import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { createPool as createMySqlPool } from "mysql2/promise";
import { Pool as PgPool } from "pg";

import { getDatabaseUrl } from "./database-url.js";
import { getPgPoolConfig } from "./pg-pool-config.js";
import { dialectFromEnv } from "./schema.js";
import * as mysqlSchema from "./mysql-schema.js";
import * as pgSchema from "./pg-schema.js";

/** Creates a new Drizzle client and underlying connection pool (not memoized). */
export const createDb = () => {
  const connectionString = getDatabaseUrl();

  if (dialectFromEnv() === "mysql") {
    const pool = createMySqlPool(connectionString);
    return drizzleMySql(pool, { schema: mysqlSchema, mode: "default" });
  }

  const pool = new PgPool(getPgPoolConfig(connectionString));
  return drizzlePg(pool, { schema: pgSchema });
};

let cachedDb: ReturnType<typeof createDb> | undefined;

/** Returns the process-wide memoized Drizzle client; prefer this over `createDb()` in repositories. */
export const getDb = (): ReturnType<typeof createDb> => {
  if (!cachedDb) {
    cachedDb = createDb();
  }
  return cachedDb;
};
