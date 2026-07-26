/**
 * Drizzle SQL migrations runner (programmatic).
 *
 * Lets the API apply pending migrations on startup when enabled (`AUTO_MIGRATE`), so developers
 * do not always run a separate CLI step locally. Uses Drizzle's migrator which reads
 * `drizzle/<dialect>/meta/_journal.json` and tracks applied hashes in `__drizzle_migrations`.
 *
 * Responsibilities:
 * - `shouldAutoMigrate` policy from `NODE_ENV` and `AUTO_MIGRATE`
 * - `runMigrations` against pg or mysql with a dedicated short-lived pool
 *
 * Depends on:
 * - `database-url`, `pg-pool-config`, `schema.dialectFromEnv`
 *
 * Security:
 * - Migrations run with full DDL privileges — gate production via `AUTO_MIGRATE=force` only when intended.
 * - Separate pool from `getDb()` avoids sharing a half-open connection during DDL.
 *
 * Policy (`shouldAutoMigrate`):
 * - `NODE_ENV=development` (or unset) → always migrate on boot.
 * - Production → `force`/`always` = migrate; anything else = do not migrate.
 * - Other non-production (e.g. `test`) → `off`/`false`/`0` = never; `force`/`always` = always; unset = migrate.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as drizzleMysql } from "drizzle-orm/mysql2";
import { migrate as migrateMysql } from "drizzle-orm/mysql2/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { createPool as createMysqlPool } from "mysql2/promise";
import { Pool as PgPool } from "pg";

import { getDatabaseUrl } from "./database-url.js";
import { getPgPoolConfig } from "./pg-pool-config.js";
import { dialectFromEnv } from "./schema.js";

/** Truthy values that meant "force, including production" under the old two-variable design. */
export const AMBIGUOUS_PROD_AUTO_MIGRATE_VALUES = new Set(["true", "1", "yes", "on"]);

/** True when `NODE_ENV` is development (unset counts as development). */
export const isDevelopmentNodeEnv = (): boolean => {
  const nodeEnv = process.env.NODE_ENV?.trim().toLowerCase() ?? "development";
  return nodeEnv === "development";
};

export const shouldAutoMigrate = (): boolean => {
  if (isDevelopmentNodeEnv()) {
    return true;
  }

  const raw = process.env.AUTO_MIGRATE?.trim().toLowerCase();
  if (raw === "off" || raw === "false" || raw === "0") {
    return false;
  }
  if (raw === "force" || raw === "always") {
    return true;
  }
  return process.env.NODE_ENV?.trim().toLowerCase() !== "production";
};

/** Resolves `packages/db/drizzle/pg` or `packages/db/drizzle/mysql` next to this package root. */
const migrationsFolderPath = (): string => {
  const dir = dirname(fileURLToPath(import.meta.url));
  const pkgRoot = join(dir, "..");
  return join(pkgRoot, "drizzle", dialectFromEnv() === "mysql" ? "mysql" : "pg");
};

/** Applies pending SQL migrations for the configured dialect using a dedicated pool. */
export const runMigrations = async (): Promise<void> => {
  const connectionString = getDatabaseUrl();

  const migrationsFolder = migrationsFolderPath();

  if (dialectFromEnv() === "mysql") {
    const pool = createMysqlPool(connectionString);
    const db = drizzleMysql(pool);
    try {
      await migrateMysql(db, { migrationsFolder });
    } finally {
      await pool.end();
    }
    return;
  }

  const pool = new PgPool(getPgPoolConfig(connectionString));
  const db = drizzlePg(pool);
  try {
    await migratePg(db, { migrationsFolder });
  } finally {
    await pool.end();
  }
};
