/**
 * Loads repo-root `.env` for API tests (same paths as `src/env-bootstrap.ts`).
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const entryDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(entryDir, "../../..");

dotenv.config({ path: path.join(repoRoot, ".env") });

const integrationFlag = process.env.RUN_INTEGRATION_TESTS?.trim().toLowerCase();
if (integrationFlag === "1" || integrationFlag === "true") {
  if (process.env.NODE_ENV?.trim().toLowerCase() !== "production") {
    process.env.NODE_ENV = "test";
  }
}
