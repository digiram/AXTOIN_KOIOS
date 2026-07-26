/**
 * Envelope encryption helpers — wrap/unwrap tenant DEKs with a KEK.
 */

import {
  generateDek,
  type KeyProvider,
  parseWrappedDek,
  serializeWrappedDek,
  type WrappedDek
} from "./key-provider.js";

export type TenantDekBundle = {
  /** Plaintext DEK (memory only). */
  dek: Buffer;
  /** KEK wrap version from `tenants.dek_key_version`. */
  dekKeyVersion: number;
};

/** Creates a new random DEK and wraps it with the active KEK. */
export const createWrappedTenantDek = (keyProvider: KeyProvider): { plainDek: Buffer; wrapped: WrappedDek } => {
  const plainDek = generateDek();
  const wrapped = keyProvider.wrapDek(plainDek);
  return { plainDek, wrapped };
};

/** Unwraps a stored tenant DEK blob. */
export const unwrapTenantDek = (encryptedDek: string, keyProvider: KeyProvider): TenantDekBundle => {
  const wrapped = parseWrappedDek(encryptedDek);
  const dek = keyProvider.unwrapDek(wrapped);
  return { dek, dekKeyVersion: wrapped.keyVersion };
};

/** Serializes wrapped DEK for DB storage. */
export const storeWrappedDek = (wrapped: WrappedDek): string => serializeWrappedDek(wrapped);

export { parseWrappedDek, serializeWrappedDek, type WrappedDek };
