/**
 * User row field encryption helpers.
 */

import { isFieldCipherEnvelope } from "@starter/crypto";

import { getFieldEncryptionMiddleware } from "./middleware.js";

export const USERS_TABLE_KEY = "users";

export const decryptUserSensitiveRow = async (
  row: Record<string, unknown>
): Promise<Record<string, unknown>> => {
  const middleware = getFieldEncryptionMiddleware();
  if (!middleware) return row;
  const tenantId = (row.tenantId as string | null | undefined) ?? null;
  return middleware.decryptForRead({
    tableKey: USERS_TABLE_KEY,
    tenantId,
    row
  });
};

export const encryptUserSensitiveFields = async (args: {
  tenantId: string | null;
  row: Record<string, unknown>;
  changedFields?: Set<string>;
  entityId?: string;
}): Promise<Record<string, unknown>> => {
  const middleware = getFieldEncryptionMiddleware();
  if (!middleware) return args.row;
  return middleware.encryptForWrite({
    tableKey: USERS_TABLE_KEY,
    tenantId: args.tenantId,
    row: args.row,
    changedFields: args.changedFields,
    entityId: args.entityId
  });
};

/** Decrypts `users.email` from SFENC1 ciphertext or returns plaintext when encryption is off. */
export const decryptStoredUserEmail = async (args: {
  email: string;
  tenantId: string | null;
  userId: string;
}): Promise<string> => {
  const middleware = getFieldEncryptionMiddleware();
  if (middleware && isFieldCipherEnvelope(args.email)) {
    const plain = await decryptUserSensitiveRow({
      id: args.userId,
      tenantId: args.tenantId,
      email: args.email
    });
    return String(plain.email ?? "");
  }
  return args.email;
};
