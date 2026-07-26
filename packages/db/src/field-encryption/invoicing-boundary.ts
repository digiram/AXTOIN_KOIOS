/**
 * Invoicing field encryption helpers (Phase 2).
 */

import { encryptRowAtBoundary, decryptRowAtBoundary } from "./repo-boundary.js";
import { sensitiveFieldsForTable } from "./registry.js";

export const INVOICING_QUOTE_TABLE_KEY = "invoicing_quotes";
export const INVOICING_OFFER_TABLE_KEY = "invoicing_offers";
export const INVOICING_INVOICE_TABLE_KEY = "invoicing_invoices";
export const INVOICING_CONFIG_TABLE_KEY = "invoicing_tenant_configuration";
export const INVOICING_AUDIT_EVENTS_TABLE_KEY = "invoicing_audit_events";

export const openInvoicingRow = decryptRowAtBoundary;

export const sealInvoicingRow = async (
  tableKey: string,
  tenantId: string,
  row: Record<string, unknown>,
  entityId: string,
  changedFields?: Set<string>
): Promise<Record<string, unknown>> =>
  encryptRowAtBoundary(tableKey, tenantId, row, { entityId, changedFields });

export const patchHasInvoicingSensitiveFields = (
  tableKey: string,
  patch: Record<string, unknown>
): boolean => {
  const sensitive = sensitiveFieldsForTable(tableKey);
  return sensitive.some((field) => field in patch);
};

export const sealInvoicingPatch = async (
  tableKey: string,
  tenantId: string,
  patch: Record<string, unknown>,
  entityId: string
): Promise<Record<string, unknown>> => {
  if (!patchHasInvoicingSensitiveFields(tableKey, patch)) return patch;
  const changedFields = new Set(
    Object.keys(patch).filter((key) => sensitiveFieldsForTable(tableKey).includes(key))
  );
  return sealInvoicingRow(tableKey, tenantId, patch, entityId, changedFields);
};
