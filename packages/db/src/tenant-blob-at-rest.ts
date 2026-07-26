/**
 * Tenant-scoped binary blob encryption via SFENC1 envelope (tenant DEK).
 * Wire format: `[SFP2 magic][SFENC1 JSON envelope of base64 payload]`
 */

import { encryptSecretAtBoundary, decryptSecretAtBoundary } from "./field-encryption/secret-boundary.js";
import { getFieldEncryptionMiddleware } from "./field-encryption/middleware.js";

export const TENANT_BLOB_SFENC_MAGIC = Buffer.from("SFP2");

const BLOB_TABLE_KEY = "tenant_blob_payload";
const BLOB_FIELD = "data";

export const isTenantBlobEncryptedAtRest = (stored: Buffer): boolean =>
  stored.length >= TENANT_BLOB_SFENC_MAGIC.length &&
  stored.subarray(0, TENANT_BLOB_SFENC_MAGIC.length).equals(TENANT_BLOB_SFENC_MAGIC);

const isSfencTenantBlob = (stored: Buffer): boolean =>
  stored.length >= TENANT_BLOB_SFENC_MAGIC.length &&
  stored.subarray(0, TENANT_BLOB_SFENC_MAGIC.length).equals(TENANT_BLOB_SFENC_MAGIC);

export const encodeTenantBlobAtRest = async (plainBody: Buffer, tenantId: string): Promise<Buffer> => {
  if (!plainBody.length) return plainBody;
  const envelope = await encryptSecretAtBoundary({
    tableKey: BLOB_TABLE_KEY,
    tenantId,
    fieldName: BLOB_FIELD,
    plaintext: plainBody.toString("base64")
  });
  if (!envelope) return plainBody;
  return Buffer.concat([TENANT_BLOB_SFENC_MAGIC, Buffer.from(envelope, "utf8")]);
};

export const decodeTenantBlobAtRest = async (stored: Buffer, tenantId: string): Promise<Buffer> => {
  if (!isTenantBlobEncryptedAtRest(stored)) return stored;
  if (!isSfencTenantBlob(stored)) {
    throw new Error("Unsupported tenant blob encryption format");
  }
  const envelope = stored.subarray(TENANT_BLOB_SFENC_MAGIC.length).toString("utf8");
  const plainB64 = await decryptSecretAtBoundary({
    tableKey: BLOB_TABLE_KEY,
    tenantId,
    fieldName: BLOB_FIELD,
    stored: envelope
  });
  return Buffer.from(plainB64, "base64");
};
