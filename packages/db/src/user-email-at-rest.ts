/**
 * User `users.email` at-rest encryption and HMAC-based `identity_key` for login
 * lookups without storing plaintext email in indexed columns.
 *
 * When `FIELD_ENCRYPTION_KEY` is unset, inserts keep plaintext email and `identity_key` of `{tenant}:{email}`.
 */

import { createHmac } from "node:crypto";

export const fieldEncryptionKeyFromEnv = (): string | null => {
  const k = process.env.FIELD_ENCRYPTION_KEY?.trim();
  return k || null;
};

const hmacHex = (keyB64: string, material: string): string =>
  createHmac("sha256", Buffer.from(keyB64, "base64")).update(material).digest("hex");

/** Realm row: lookup uses tenant + email only; invariant is one login identity per (tenant, email). */
export const identityKeyForRealmUser = (tenantId: string, emailLower: string, keyB64: string): string => {
  const h = hmacHex(keyB64, `${tenantId}\n${emailLower}`);
  return `${tenantId}:${h}`;
};

/** Platform row (`tenant_id` IS NULL): include user id in HMAC material to avoid sign-in collisions. */
export const identityKeyForSuperUser = (emailLower: string, userId: string, keyB64: string): string => {
  const h = hmacHex(keyB64, `SUPER\n${emailLower}\n${userId}`);
  return `SUPER:${h}`;
};

export const plaintextIdentityKey = (tenantId: string | null | undefined, emailLower: string): string =>
  tenantId ? `${tenantId}:${emailLower}` : `SUPER:${emailLower}`;
