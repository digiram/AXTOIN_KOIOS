/**
 * Tenant `tenants.name` at-rest encryption and `name_lookup_key` for exact realm lookup
 * without storing plaintext in indexed columns when `FIELD_ENCRYPTION_KEY` is set.
 */

import { createHmac } from "node:crypto";

export const fieldEncryptionKeyFromEnv = (): string | null => {
  const k = process.env.FIELD_ENCRYPTION_KEY?.trim();
  return k || null;
};

const hmacHex = (keyB64: string, material: string): string =>
  createHmac("sha256", Buffer.from(keyB64, "base64")).update(material).digest("hex");

/** Stable lookup key for realm resolution (corporate domain / personal realm key). */
export const tenantNameLookupKey = (nameTrimmed: string, keyB64: string): string => {
  const normalized = nameTrimmed.trim().toLowerCase();
  return hmacHex(keyB64, `tenant_name\n${normalized}`);
};

/** Plaintext lookup when field encryption is disabled (local dev). */
export const plaintextTenantNameLookupKey = (nameTrimmed: string): string => nameTrimmed.trim().toLowerCase();

export const computeTenantNameLookupKey = (nameTrimmed: string): string => {
  const keyB64 = fieldEncryptionKeyFromEnv();
  if (!keyB64) return plaintextTenantNameLookupKey(nameTrimmed);
  return tenantNameLookupKey(nameTrimmed, keyB64);
};
