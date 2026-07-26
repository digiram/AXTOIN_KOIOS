/**
 * `pg` pool options shared by the runtime client and migration runner.
 *
 * Supabase-hosted Postgres requires TLS; when `DATABASE_DIALECT=supabase` we append `sslmode=require`
 * when missing and pass `ssl.rejectUnauthorized: false` (Supabase pooler certs).
 */

import type { PoolConfig } from "pg";

import { dialectFromEnv } from "./schema.js";

const appendSslModeRequire = (connectionString: string): string => {
  if (/[?&]sslmode=/i.test(connectionString)) {
    return connectionString;
  }
  const sep = connectionString.includes("?") ? "&" : "?";
  return `${connectionString}${sep}sslmode=require`;
};

const pgSslEnabled = (): boolean => {
  const mode = process.env.DATABASE_SSL?.trim().toLowerCase();
  return mode === "require" || mode === "true" || mode === "1";
};

export const getPgPoolConfig = (connectionString: string): PoolConfig => {
  if (dialectFromEnv() === "supabase") {
    return {
      connectionString: appendSslModeRequire(connectionString),
      ssl: { rejectUnauthorized: false },
    };
  }
  if (pgSslEnabled()) {
    const rejectUnauthorized = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED?.trim().toLowerCase() !== "false";
    return {
      connectionString: appendSslModeRequire(connectionString),
      ssl: rejectUnauthorized ? true : { rejectUnauthorized: false }
    };
  }
  return { connectionString };
};
