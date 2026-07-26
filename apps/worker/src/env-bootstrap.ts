/**
 * Environment bootstrap for the worker process.
 *
 * Loads repository-root `.env` before any module reads `process.env`, then optionally
 * overlays `<cwd>/.env` when paths differ. Mirrors `apps/api/src/env-bootstrap.ts`.
 *
 * Responsibilities:
 * - Resolve monorepo root from this file's location
 * - Apply root `.env`, then cwd override when not the same path
 *
 * Notes:
 * - Must be imported first from `index.ts` (side-effect module)
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
