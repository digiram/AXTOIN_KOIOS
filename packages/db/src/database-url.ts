/**
 * Builds a driver-ready JDBC-style URL for Postgres, Supabase (Postgres), or MySQL from environment variables.
 *
 * Precedence:
 * 1. **`DATABASE_URL`** — if set (after trim), used as-is. Use this for platforms that only expose
 *    a single URL, IPv6 literals, exotic query params (`sslmode`, etc.), or auth plugins.
 * 2. **Supabase (`DATABASE_DIALECT=supabase` only)** — `SUPABASE_DATABASE_URL`, or compose from
 *    `SUPABASE_PROJECT_REF` + `SUPABASE_DB_PASSWORD` (+ `SUPABASE_DB_REGION` for pooler modes;
 *    see `composeSupabaseDatabaseUrl`).
 * 3. **Composed URL** — built from `DATABASE_HOST`, `DATABASE_USER`, `DATABASE_NAME`, optional
 *    `DATABASE_PASSWORD`, optional `DATABASE_PORT` (defaults: Postgres `5432`, MySQL `3306`).
 *
 * User and password segments are passed through `encodeURIComponent` so `@`, `:`, spaces, etc.
 * do not break the URL. Database name is encoded as a single path segment.
 *
 * `DATABASE_DIALECT` (`mysql` | `supabase` | default postgres) selects scheme + default port via `dialectFromEnv`.
 */

import { dialectFromEnv } from "./schema.js";

const trim = (value: string | undefined): string => value?.trim() ?? "";

type SupabasePoolerMode = "transaction" | "session" | "direct";

const normalizeSupabasePoolerMode = (raw: string): SupabasePoolerMode => {
  const value = raw.trim().toLowerCase();
  if (value === "session" || value === "direct") {
    return value;
  }
  return "transaction";
};

/**
 * Builds a Supabase Postgres URI from `SUPABASE_PROJECT_REF` + `SUPABASE_DB_PASSWORD`
 * (+ `SUPABASE_DB_REGION` for pooler modes). Host, port, user, and database are derived from
 * the project ref / pooler mode — Supabase's connection layout is fixed, so no per-field overrides.
 * For full control (custom host/port/user), set `SUPABASE_DATABASE_URL` or `DATABASE_URL` instead.
 * Returns `null` when required parts are missing so generic `DATABASE_*` composition can run.
 */
export const composeSupabaseDatabaseUrl = (): string | null => {
  const projectRef = trim(process.env.SUPABASE_PROJECT_REF);
  const password = process.env.SUPABASE_DB_PASSWORD ?? "";

  if (!projectRef || password.length === 0) {
    return null;
  }

  const poolerMode = normalizeSupabasePoolerMode(process.env.SUPABASE_DB_POOLER ?? "");

  let host: string;
  let port: string;
  let user: string;

  if (poolerMode === "direct") {
    host = `db.${projectRef}.supabase.co`;
    port = "5432";
    user = "postgres";
  } else {
    const region = trim(process.env.SUPABASE_DB_REGION);
    if (!region) {
      return null;
    }
    host = `aws-0-${region}.pooler.supabase.com`;
    port = poolerMode === "session" ? "5432" : "6543";
    user = `postgres.${projectRef}`;
  }

  const auth = `${encodeURIComponent(user)}:${encodeURIComponent(password)}`;
  return `postgresql://${auth}@${host}:${port}/postgres`;
};

/**
 * Returns a connection string suitable for `pg`, `mysql2`, and Drizzle Kit `dbCredentials.url`.
 */
export const getDatabaseUrl = (): string => {
  const explicit = trim(process.env.DATABASE_URL);
  if (explicit.length > 0) {
    return explicit;
  }

  const dialect = dialectFromEnv();

  if (dialect === "supabase") {
    const supabaseUrl = trim(process.env.SUPABASE_DATABASE_URL);
    if (supabaseUrl.length > 0) {
      return supabaseUrl;
    }
    const composedSupabase = composeSupabaseDatabaseUrl();
    if (composedSupabase) {
      return composedSupabase;
    }
  }

  const host = trim(process.env.DATABASE_HOST);
  const database = trim(process.env.DATABASE_NAME);
  const user = trim(process.env.DATABASE_USER);
  const password = process.env.DATABASE_PASSWORD ?? "";

  if (!host || !database || !user) {
    if (dialect === "supabase") {
      throw new Error(
        "Supabase database connection: set DATABASE_URL or SUPABASE_DATABASE_URL, or set " +
          "SUPABASE_PROJECT_REF + SUPABASE_DB_PASSWORD + SUPABASE_DB_REGION. " +
          "Optional: SUPABASE_DB_POOLER (`transaction` default, `session`, `direct`; `direct` needs no region). " +
          "Ensure `.env` exists at the repository root (or cwd); API/worker load root `.env` even when launched from apps/*/."
      );
    }
    throw new Error(
      "Database connection: set DATABASE_URL, or set DATABASE_HOST, DATABASE_NAME, and DATABASE_USER " +
        "(optional DATABASE_PASSWORD; DATABASE_PORT defaults by dialect). " +
        "Ensure `.env` exists at the repository root (or cwd); API/worker load root `.env` even when launched from apps/*/."
    );
  }

  const defaultPort = dialect === "mysql" ? "3306" : "5432";
  const port = trim(process.env.DATABASE_PORT) || defaultPort;

  const scheme = dialect === "mysql" ? "mysql" : "postgresql";
  const auth =
    password.length > 0
      ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}`
      : encodeURIComponent(user);

  return `${scheme}://${auth}@${host}:${port}/${encodeURIComponent(database)}`;
};
