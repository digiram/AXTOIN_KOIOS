/**
 * Encryption scope resolution — tenant DEK vs platform KEK-direct.
 */

import type { KeyProvider } from "@starter/crypto";

import { blindIndexScopeId } from "./registry.js";

export const PLATFORM_SCOPE_ID = "platform";

export type FieldCryptoScope = {
  /** AAD scope for SFENC1 (`tenantId` or `platform`). */
  scopeId: string;
  /** Blind-index HMAC material (same as scopeId for realm; `platform` for super-admin rows). */
  blindIndexScopeId: string;
  /** `field_search_tokens.tenant_id` — null for platform-scoped entities. */
  tokenTenantId: string | null;
  dek: Buffer;
  kv: number;
};

const decodeKek = (kekBase64: string): Buffer => {
  const dek = Buffer.from(kekBase64, "base64");
  if (dek.byteLength !== 32) {
    throw new Error("FIELD_ENCRYPTION_KEY must decode to 32 bytes");
  }
  return dek;
};

/** Platform operators (`tenant_id` IS NULL) use KEK-direct envelope encryption. */
export const platformFieldCryptoScope = (keyProvider: KeyProvider, kekBase64: string): FieldCryptoScope => ({
  scopeId: PLATFORM_SCOPE_ID,
  blindIndexScopeId: PLATFORM_SCOPE_ID,
  tokenTenantId: null,
  dek: decodeKek(kekBase64),
  kv: keyProvider.getActiveKekVersion()
});

export const realmFieldCryptoScope = (
  tenantId: string,
  dek: Buffer,
  dekKeyVersion: number
): FieldCryptoScope => ({
  scopeId: tenantId,
  blindIndexScopeId: blindIndexScopeId(tenantId),
  tokenTenantId: tenantId,
  dek,
  kv: dekKeyVersion
});
