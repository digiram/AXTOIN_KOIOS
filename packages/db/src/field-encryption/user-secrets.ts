/**
 * User-row secret fields (MFA TOTP, tax id) via SFENC1 middleware.
 */

import { isFieldCipherEnvelope } from "@starter/crypto";

import { decryptSecretAtBoundary, encryptSecretAtBoundary } from "./secret-boundary.js";

const USERS_TABLE_KEY = "users";

export type UserSecretField =
  | "encryptedTaxId"
  | "mfaTotpSecretEncrypted"
  | "mfaTotpPendingSecretEncrypted";

export const sealUserSecretAtBoundary = async (
  tenantId: string | null,
  fieldName: UserSecretField,
  plaintext: string
): Promise<string> =>
  encryptSecretAtBoundary({
    tableKey: USERS_TABLE_KEY,
    tenantId,
    fieldName,
    plaintext
  });

export const openUserSecretAtBoundary = async (
  tenantId: string | null,
  fieldName: UserSecretField,
  stored: string
): Promise<string> => {
  if (!(stored ?? "").trim()) return "";
  if (isFieldCipherEnvelope(stored)) {
    return decryptSecretAtBoundary({
      tableKey: USERS_TABLE_KEY,
      tenantId,
      fieldName,
      stored
    });
  }
  return stored;
};

export const sealUserTaxIdAtRest = async (tenantId: string, taxId: string): Promise<string> =>
  sealUserSecretAtBoundary(tenantId, "encryptedTaxId", taxId);

export const openUserTaxIdAtRest = async (tenantId: string, stored: string): Promise<string> =>
  openUserSecretAtBoundary(tenantId, "encryptedTaxId", stored);

export const sealUserMfaTotpSecretAtRest = async (
  tenantId: string | null,
  secret: string
): Promise<string> => sealUserSecretAtBoundary(tenantId, "mfaTotpSecretEncrypted", secret);

export const openUserMfaTotpSecretAtRest = async (
  tenantId: string | null,
  stored: string
): Promise<string> => openUserSecretAtBoundary(tenantId, "mfaTotpSecretEncrypted", stored);

export const sealUserMfaTotpPendingSecretAtRest = async (
  tenantId: string | null,
  secret: string
): Promise<string> => sealUserSecretAtBoundary(tenantId, "mfaTotpPendingSecretEncrypted", secret);

export const openUserMfaTotpPendingSecretAtRest = async (
  tenantId: string | null,
  stored: string
): Promise<string> => openUserSecretAtBoundary(tenantId, "mfaTotpPendingSecretEncrypted", stored);
