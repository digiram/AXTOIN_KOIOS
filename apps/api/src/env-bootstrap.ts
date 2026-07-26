/**
 * Loads environment variables before any module reads `process.env`.
 *
 * `dotenv/config` alone only loads `.env` from **current working directory**. Developers often run the API
 * from `apps/api`, where no `.env` exists — the real file lives at the **repository root**. We load that
 * first, then optionally overlay `<cwd>/.env` when paths differ (local overrides).
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const entryDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(entryDir, "../../..");

dotenv.config({ path: path.join(repoRoot, ".env") });

const cwdEnvPath = path.resolve(process.cwd(), ".env");
if (cwdEnvPath !== path.join(repoRoot, ".env")) {
  dotenv.config({ path: cwdEnvPath, override: true });
}
