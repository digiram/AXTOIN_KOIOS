/**
 * Single-field encrypt/decrypt at repo boundaries (credentials, SMTP passwords, API secrets).
 */

import { decryptField, encryptField, isFieldCipherEnvelope } from "@starter/crypto";

import { getFieldEncryptionMiddleware, getTableConfig } from "./middleware.js";

export const encryptSecretAtBoundary = async (args: {
  tableKey: string;
  tenantId: string | null;
  fieldName: string;
  plaintext: string;
}): Promise<string> => {
  if (!(args.plaintext ?? "").trim()) return "";
  const middleware = getFieldEncryptionMiddleware();
  if (!middleware) {
    throw new Error("FIELD_ENCRYPTION_KEY must be set to store encrypted secrets");
  }
  const cfg = getTableConfig(args.tableKey);
  if (!cfg) throw new Error(`Unknown encryption table: ${args.tableKey}`);
  const def = cfg.fields[args.fieldName];
  if (!def?.sensitive) throw new Error(`Field ${args.fieldName} is not registered as sensitive`);
  const scope = await middleware.resolveFieldCryptoScope(args.tenantId);
  return encryptField(
    args.plaintext,
    scope.dek,
    { scopeId: scope.scopeId, table: cfg.tableName, field: args.fieldName },
    scope.kv
  );
};

export const decryptSecretAtBoundary = async (args: {
  tableKey: string;
  tenantId: string | null;
  fieldName: string;
  stored: string;
}): Promise<string> => {
  if (!(args.stored ?? "").trim()) return "";
  if (isFieldCipherEnvelope(args.stored)) {
    const middleware = getFieldEncryptionMiddleware();
    if (!middleware) {
      throw new Error("FIELD_ENCRYPTION_KEY must be set to read encrypted secrets");
    }
    const cfg = getTableConfig(args.tableKey);
    if (!cfg) throw new Error(`Unknown encryption table: ${args.tableKey}`);
    const scope = await middleware.resolveFieldCryptoScope(args.tenantId);
    return decryptField(args.stored, scope.dek, {
      scopeId: scope.scopeId,
      table: cfg.tableName,
      field: args.fieldName
    });
  }
  return args.stored;
};
