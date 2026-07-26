/**
 * Fail-fast validation for minimal shared env (API + worker) before DB connect or migrations.
 */

import { getDatabaseUrl } from "./database-url.js";
import { dialectFromEnv } from "./schema.js";

export type BootEnvRole = "api" | "worker";

export type MinimalBootEnvOptions = {
  nodeEnv: string;
  role: BootEnvRole;
};

const queueStrategyFromEnv = (): "local" | "external" =>
  process.env.QUEUE_STRATEGY?.trim().toLowerCase() === "local" ? "local" : "external";

const sqlDialectSupportsLocalQueue = (): boolean => {
  const dialect = dialectFromEnv();
  return dialect === "mysql" || dialect === "postgres" || dialect === "supabase";
};

/**
 * Returns human-readable problems when required env is missing or inconsistent.
 * Empty array means the process can proceed to connect/migrate.
 */
export const collectMinimalBootEnvErrors = (opts: MinimalBootEnvOptions): string[] => {
  const errors: string[] = [];
  const isProd = opts.nodeEnv === "production";

  try {
    getDatabaseUrl();
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  if (queueStrategyFromEnv() === "local" && !sqlDialectSupportsLocalQueue()) {
    errors.push(
      "QUEUE_STRATEGY=local requires DATABASE_DIALECT to be postgres, supabase, or mysql."
    );
  }

  if (queueStrategyFromEnv() === "external" && isProd && !(process.env.REDIS_URL?.trim())) {
    errors.push(
      "REDIS_URL must be set when QUEUE_STRATEGY=external (or unset) and NODE_ENV=production."
    );
  }

  if (queueStrategyFromEnv() === "external" && isProd) {
    const redisUrl = process.env.REDIS_URL?.trim() ?? "";
    const tlsMode = process.env.REDIS_TLS?.trim().toLowerCase();
    if (tlsMode === "require" && redisUrl && !redisUrl.startsWith("rediss://")) {
      errors.push("REDIS_TLS=require but REDIS_URL does not use the rediss:// scheme.");
    }
  }

  return errors;
};

/**
 * @throws Error listing every missing or invalid minimal env requirement.
 */
export const assertMinimalBootEnv = (opts: MinimalBootEnvOptions): void => {
  const errors = collectMinimalBootEnvErrors(opts);
  if (errors.length === 0) return;

  const prefix =
    opts.role === "api"
      ? "API cannot start — environment incomplete:"
      : "Worker cannot start — environment incomplete:";
  throw new Error(`${prefix}\n${errors.map((line) => `- ${line}`).join("\n")}`);
};
