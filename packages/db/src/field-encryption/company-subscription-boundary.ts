/**
 * Company subscription seat field encryption helpers.
 */

import { decryptRowAtBoundary, encryptRowAtBoundary } from "./repo-boundary.js";
import { sensitiveFieldsForTable } from "./registry.js";

export const COMPANY_SUBSCRIPTION_SEATS_TABLE_KEY = "company_subscription_seats";

export const openCompanySubscriptionSeatRow = (
  tenantId: string,
  row: Record<string, unknown>
): Promise<Record<string, unknown>> =>
  decryptRowAtBoundary(COMPANY_SUBSCRIPTION_SEATS_TABLE_KEY, tenantId, row, (plain) => plain);

export const sealCompanySubscriptionSeatFields = async (
  tenantId: string,
  row: Record<string, unknown>,
  entityId: string,
  changedFields?: Set<string>
): Promise<Record<string, unknown>> =>
  encryptRowAtBoundary(COMPANY_SUBSCRIPTION_SEATS_TABLE_KEY, tenantId, row, {
    entityId,
    changedFields
  });

export const sealCompanySubscriptionSeatPatch = async (
  tenantId: string,
  patch: Record<string, unknown>,
  entityId: string
): Promise<Record<string, unknown>> => {
  const sensitive = sensitiveFieldsForTable(COMPANY_SUBSCRIPTION_SEATS_TABLE_KEY);
  const changedFields = new Set(
    Object.keys(patch).filter((key) => sensitive.includes(key))
  );
  if (changedFields.size === 0) return patch;
  return sealCompanySubscriptionSeatFields(tenantId, patch, entityId, changedFields);
};
