/**
 * Small helpers shared by Drizzle clients and migrations.
 *
 * `DATABASE_DIALECT` is `mysql`, `supabase`, or anything else maps to Postgres — keep env values
 * aligned with Docker Compose and README examples.
 *
 * `supabase` reuses the Postgres Drizzle schema (`pg-schema.ts`) and `drizzle/pg` migrations;
 * it differs in connection URL defaults and TLS for hosted Supabase Postgres.
 */

export type DbDialect = "postgres" | "mysql" | "supabase";

export const dialectFromEnv = (): DbDialect => {
  const raw = (process.env.DATABASE_DIALECT ?? "").trim().toLowerCase();
  if (raw === "mysql") {
    return "mysql";
  }
  if (raw === "supabase") {
    return "supabase";
  }
  return "postgres";
};

/** Postgres and Supabase share `pg-schema.ts` and `drizzle/pg` SQL migrations. */
export const isPostgresFamilyDialect = (dialect: DbDialect = dialectFromEnv()): boolean =>
  dialect === "postgres" || dialect === "supabase";

export const isMysqlDialect = (dialect: DbDialect = dialectFromEnv()): boolean => dialect === "mysql";
