/**
 * Application-level field encryption helpers (AES-256-GCM).
 *
 * Wire format (single base64 string persisted in DB):
 * `[12-byte IV][16-byte auth tag][ciphertext]`
 *
 * Optional **AAD** (`EncryptContext.tenantId`): when set, the tenant id is authenticated but not
 * encrypted — ciphertext cannot be swapped across tenants without failing verification.
 *
 * Key material:
 * - Expect `FIELD_ENCRYPTION_KEY` as **base64** encoding **32 raw bytes** (256-bit key).
 * - `deriveTenantKey` is a stub for future per-tenant or KMS-wrapped keys; today it returns the same
 *   root key so encrypt/decrypt stays symmetric across the starter.
 * - Empty or whitespace-only plaintext encrypts to `""` (no ciphertext); decrypting `""` yields `""`.
 *
 * Envelope field encryption (SFENC1), blind indexes, and DEK caching live in dedicated modules.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export {
  logFieldDecrypt,
  noopFieldDecryptAuditLogger,
  type FieldDecryptAuditEvent,
  type FieldDecryptAuditLogger
} from "./audit.js";
export {
  buildContainsQueryHashes,
  buildEqualityQueryHash,
  buildPrefixQueryHashes,
  buildSearchTokenSet,
  DEFAULT_NGRAM_SIZE,
  equalityToken,
  fuzzyMatchScore,
  generateNgrams,
  hashSearchToken,
  ngramSizeFromEnv,
  normalizeSearchText,
  prefixTokens,
  secureCompareTokenHash,
  type BlindIndexContext,
  type SearchTokenSet
} from "./blind-index.js";
export { DekCache, dekCacheTtlFromEnv, DEFAULT_MAX_ENTRIES, DEFAULT_TTL_MS, type DekCacheEntry, type DekCacheOptions } from "./dek-cache.js";
export {
  createWrappedTenantDek,
  parseWrappedDek,
  serializeWrappedDek,
  storeWrappedDek,
  unwrapTenantDek,
  type TenantDekBundle
} from "./envelope.js";
export {
  decryptField,
  encryptField,
  FIELD_CIPHER_PREFIX,
  fieldEnvelopeKeyVersion,
  hasNestedFieldCipherEnvelope,
  isFieldCipherEnvelope,
  parseFieldEnvelope,
  serializeFieldEnvelope,
  unwrapFieldCipherEnvelope,
  type FieldCipherContext,
  type FieldEnvelope
} from "./field-cipher.js";
export {
  DEK_BYTES,
  EnvKeyProvider,
  generateDek,
  kekFromEnv,
  keyProviderFromEnv,
  parseWrappedDek as parseWrappedDekBlob,
  serializeWrappedDek as serializeWrappedDekBlob,
  type EnvKeyProviderOptions,
  type KeyProvider,
  type WrappedDek
} from "./key-provider.js";
export {
  deriveSearchIndexKeyFromKek,
  SEARCH_INDEX_DERIVATION_INFO,
  searchIndexKeyFromEnv
} from "./key-derivation.js";

/** AES-GCM standard IV length for Node's `createCipheriv`. */
const IV_SIZE = 12;

/** GCM authentication tag length produced by `getAuthTag` / consumed by `setAuthTag`. */
const TAG_SIZE = 16;

export type EncryptContext = {
  tenantId?: string;
};

export const deriveTenantKey = (base64Key: string, _tenantId: string): Buffer => {
  const key = Buffer.from(base64Key, "base64");
  if (key.byteLength !== 32) {
    throw new Error("FIELD_ENCRYPTION_KEY must decode to 32 bytes");
  }
  return key;
};

export const encrypt = (plaintext: string, base64Key: string, context?: EncryptContext): string => {
  if ((plaintext ?? "").trim() === "") {
    return "";
  }
  const key = deriveTenantKey(base64Key, context?.tenantId ?? "global");
  const iv = randomBytes(IV_SIZE);
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  if (context?.tenantId) {
    cipher.setAAD(Buffer.from(context.tenantId));
  }

  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
};

export const decrypt = (payload: string, base64Key: string, context?: EncryptContext): string => {
  if ((payload ?? "").trim() === "") {
    return "";
  }
  const raw = Buffer.from(payload, "base64");
  const key = deriveTenantKey(base64Key, context?.tenantId ?? "global");
  const iv = raw.subarray(0, IV_SIZE);
  const tag = raw.subarray(IV_SIZE, IV_SIZE + TAG_SIZE);
  const ciphertext = raw.subarray(IV_SIZE + TAG_SIZE);

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  if (context?.tenantId) {
    decipher.setAAD(Buffer.from(context.tenantId));
  }
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
};

/** Binary AES-GCM: wire format `[12-byte IV][16-byte auth tag][ciphertext]` (not base64-wrapped). */
export const encryptBuffer = (plaintext: Buffer, base64Key: string, context?: EncryptContext): Buffer => {
  if (!plaintext?.length) {
    return Buffer.alloc(0);
  }
  const key = deriveTenantKey(base64Key, context?.tenantId ?? "global");
  const iv = randomBytes(IV_SIZE);
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  if (context?.tenantId) {
    cipher.setAAD(Buffer.from(context.tenantId));
  }

  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]);
};

export const decryptBuffer = (payload: Buffer, base64Key: string, context?: EncryptContext): Buffer => {
  if (!payload?.length) {
    return Buffer.alloc(0);
  }
  const key = deriveTenantKey(base64Key, context?.tenantId ?? "global");
  const iv = payload.subarray(0, IV_SIZE);
  const tag = payload.subarray(IV_SIZE, IV_SIZE + TAG_SIZE);
  const ciphertext = payload.subarray(IV_SIZE + TAG_SIZE);

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  if (context?.tenantId) {
    decipher.setAAD(Buffer.from(context.tenantId));
  }
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
};
