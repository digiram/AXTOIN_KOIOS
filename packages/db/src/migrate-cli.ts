/**
 * Apply pending Drizzle SQL migrations from the CLI (same runner as API `AUTO_MIGRATE`).
 *
 * Loads repo-root `.env` then optional cwd `.env` — matches `apps/api` env bootstrap so `DATABASE_URL`
 * / `DATABASE_DIALECT` resolve the same way when invoked from the monorepo root.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";

import { runMigrations } from "./migrate.js";

const here = path.dirname(fileURLToPath(import.meta.url));
/** `packages/db/src` → monorepo root */
const repoRoot = path.resolve(here, "../../..");

config({ path: path.join(repoRoot, ".env") });
const cwdEnv = path.resolve(process.cwd(), ".env");
if (cwdEnv !== path.join(repoRoot, ".env")) {
  config({ path: cwdEnv, override: true });
}

await runMigrations();
