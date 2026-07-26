/**
 * E2E database cleanup helpers.
 *
 * Loads repository-root `.env` so `@starter/db` can connect during Playwright teardown,
 * then deletes disposable test tenants by id after specs complete.
 *
 * Security:
 * - Only intended for E2E fixture domains; do not call against production tenants
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { deleteTenantById } from "@starter/db";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(repoRoot, ".env") });

/**
 * Deletes a tenant row created during E2E when `tenantId` is defined.
 *
 * @param tenantId - Realm id from `registerTenantViaApi`; no-op when undefined.
 */
export const deleteE2eTestTenant = async (tenantId: string | undefined): Promise<void> => {
  if (!tenantId) return;
  await deleteTenantById(tenantId);
};
