/**
 * Sales funnel field encryption helpers.
 */

import { decryptRowAtBoundary, encryptRowAtBoundary } from "./repo-boundary.js";
import { sensitiveFieldsForTable } from "./registry.js";

export const SALES_FUNNEL_BDR_LEADS_TABLE_KEY = "sales_funnel_bdr_leads";
export const SALES_FUNNEL_SALES_DEALS_TABLE_KEY = "sales_funnel_sales_deals";

export const openSalesFunnelRow = decryptRowAtBoundary;

export const sealSalesFunnelRow = async (
  tableKey: string,
  tenantId: string,
  row: Record<string, unknown>,
  entityId: string,
  changedFields?: Set<string>
): Promise<Record<string, unknown>> =>
  encryptRowAtBoundary(tableKey, tenantId, row, { entityId, changedFields });

export const sealSalesFunnelPatch = async (
  tableKey: string,
  tenantId: string,
  patch: Record<string, unknown>,
  entityId: string
): Promise<Record<string, unknown>> => {
  const sensitive = sensitiveFieldsForTable(tableKey);
  const changedFields = new Set(
    Object.keys(patch).filter((key) => sensitive.includes(key))
  );
  if (changedFields.size === 0) return patch;
  return sealSalesFunnelRow(tableKey, tenantId, patch, entityId, changedFields);
};

export const syncSalesFunnelSearchTokens = async (
  tableKey: string,
  tenantId: string,
  entityId: string,
  plainRow: Record<string, unknown>,
  encryptedRow: Record<string, unknown>,
  changedFields: Set<string>
): Promise<void> => {
  const { getFieldEncryptionMiddleware } = await import("./middleware.js");
  const middleware = getFieldEncryptionMiddleware();
  if (!middleware?.hasSearchIndex()) return;
  await middleware.syncSearchTokensForRow({
    tableKey,
    tenantId,
    entityId,
    row: encryptedRow,
    plainRow,
    changedFields
  });
};
