/**
 * One-off cleanup for integration/E2E tenant fixtures left in a dev database.
 *
 * Usage (from repo root): pnpm --filter @starter/db db:purge-test-fixtures
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
dotenv.config({ path: path.join(repoRoot, ".env") });

const { pingDatabase, purgeTestFixtureTenants, TEST_TENANT_NAME_LIKE_PATTERNS } = await import("./index.js");

const ping = await pingDatabase();
if (!ping.ok) {
  console.error(`Database unreachable: ${ping.error ?? "unknown"}`);
  process.exit(1);
}

const removed = await purgeTestFixtureTenants();
console.log(
  `Removed ${removed} test fixture tenant(s) (name patterns: ${TEST_TENANT_NAME_LIKE_PATTERNS.join(", ")}).`
);
