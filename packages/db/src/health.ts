/**
 * Database reachability for readiness probes.
 */

import { sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { getDb } from "./client.js";
import * as mysql from "./mysql-schema.js";
import * as pg from "./pg-schema.js";
import { dialectFromEnv } from "./schema.js";

export type DbPingResult = {
  ok: boolean;
  dialect: string;
  error?: string;
};

export const pingDatabase = async (): Promise<DbPingResult> => {
  const dialect = dialectFromEnv();
  try {
    const probe = sql`SELECT 1`;
    if (dialect === "mysql") {
      await (getDb() as MySql2Database<typeof mysql>).execute(probe);
    } else {
      await (getDb() as NodePgDatabase<typeof pg>).execute(probe);
    }
    return { ok: true, dialect };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, dialect, error: message };
  }
};
