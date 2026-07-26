/**
 * Integration test harness — requires Postgres (or MySQL) reachable via `DATABASE_*` / `DATABASE_URL`.
 * Skips when `RUN_INTEGRATION_TESTS` is not `1` or `true`.
 */

import "../env-bootstrap.js";

import { pingDatabase } from "@starter/db";

import { buildApp } from "../../src/app.js";
import { resolveJwtAccessSecret } from "../../src/lib/jwt-secret.js";
import { runMigrations } from "@starter/db";

export const integrationTestsEnabled = (): boolean => {
  const flag = process.env.RUN_INTEGRATION_TESTS?.trim().toLowerCase();
  return flag === "1" || flag === "true";
};

/** True when flag is set and database is reachable (avoids hanging local `pnpm test`). */
export const canRunIntegrationTests = async (): Promise<boolean> => {
  if (!integrationTestsEnabled()) return false;
  const ping = await pingDatabase();
  return ping.ok;
};

let migrated = false;

export const ensureIntegrationMigrations = async (): Promise<void> => {
  if (migrated) return;
  await runMigrations();
  migrated = true;
};

export const createIntegrationApp = async () => {
  const nodeEnv = process.env.NODE_ENV ?? "test";
  const jwtAccessSecret = resolveJwtAccessSecret({ nodeEnv });
  const app = await buildApp({
    jwtAccessSecret,
    logHttp: false
  });
  await app.ready();
  return app;
};

export const jsonBody = (payload: unknown) => ({
  payload: JSON.stringify(payload),
  headers: { "content-type": "application/json" }
});

export const authHeader = (accessToken: string) => ({
  headers: { authorization: `Bearer ${accessToken}` }
});
