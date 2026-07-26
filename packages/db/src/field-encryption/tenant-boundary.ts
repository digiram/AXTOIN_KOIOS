/**
 * Tenant row field encryption (`tenants.name` uses platform KEK scope).
 */

import { decryptRowAtBoundary, encryptRowAtBoundary } from "./repo-boundary.js";
import { PLATFORM_SCOPE_ID } from "./scope.js";

export const TENANTS_TABLE_KEY = "tenants";

export const openTenantRow = async (row: Record<string, unknown>): Promise<Record<string, unknown>> =>
  decryptRowAtBoundary(TENANTS_TABLE_KEY, null, row, (plain) => plain);

export const sealTenantFields = async (
  row: Record<string, unknown>,
  entityId: string,
  changedFields?: Set<string>
): Promise<Record<string, unknown>> =>
  encryptRowAtBoundary(TENANTS_TABLE_KEY, null, row, { entityId, changedFields });

export const sealTenantName = async (
  entityId: string,
  plainName: string
): Promise<string> => {
  const encrypted = await sealTenantFields({ name: plainName }, entityId, new Set(["name"]));
  return String(encrypted.name ?? plainName);
};

export { PLATFORM_SCOPE_ID };
