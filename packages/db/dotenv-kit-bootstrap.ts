/**
 * Runs before Drizzle Kit reads `process.env` for `getDatabaseUrl()`.
 * Loads repo-root `.env` then cwd `.env` (CLI often runs with cwd at repo root or `packages/db`).
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const pkgDbRoot = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(pkgDbRoot, "..", "..", ".env") });
dotenv.config();
