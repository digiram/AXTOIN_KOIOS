/**
 * Shared encrypt/decrypt helpers for repo persistence boundaries.
 */

import { getFieldEncryptionMiddleware } from "./middleware.js";

export const decryptRowAtBoundary = async <T>(
  tableKey: string,
  tenantId: string | null,
  row: Record<string, unknown>,
  mapPlain: (plain: Record<string, unknown>) => T
): Promise<T> => {
  const middleware = getFieldEncryptionMiddleware();
  if (!middleware) return mapPlain(row);
  const plain = await middleware.decryptForRead({ tableKey, tenantId, row });
  return mapPlain(plain);
};

export const encryptRowAtBoundary = async (
  tableKey: string,
  tenantId: string | null,
  row: Record<string, unknown>,
  opts?: { changedFields?: Set<string>; entityId?: string }
): Promise<Record<string, unknown>> => {
  const middleware = getFieldEncryptionMiddleware();
  if (!middleware) return row;
  return middleware.encryptForWrite({
    tableKey,
    tenantId,
    row,
    changedFields: opts?.changedFields,
    entityId: opts?.entityId
  });
};
