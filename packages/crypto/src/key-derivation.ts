/**
 * Purpose-specific subkeys derived from `FIELD_ENCRYPTION_KEY` (HKDF-SHA256).
 *
 * Operators can set one root secret; blind-index HMAC uses a derived key so encryption
 * and search never share raw key material. Override with `SEARCH_INDEX_KEY` when needed
 * (e.g. independent search-token rotation).
 */

import { hkdfSync } from "node:crypto";

import { kekFromEnv } from "./key-provider.js";

const KEY_BYTES = 32;

/** HKDF info string for blind search index HMAC (versioned for future rotation). */
export const SEARCH_INDEX_DERIVATION_INFO = "starter:field-search-index:v1";

/** Derives a 256-bit search-index HMAC key from the field encryption KEK. */
export const deriveSearchIndexKeyFromKek = (kekBase64: string): string => {
  const kek = Buffer.from(kekBase64, "base64");
  if (kek.byteLength !== KEY_BYTES) {
    throw new Error("FIELD_ENCRYPTION_KEY must decode to 32 bytes");
  }
  const derived = hkdfSync("sha256", kek, "", SEARCH_INDEX_DERIVATION_INFO, KEY_BYTES);
  return Buffer.from(derived).toString("base64");
};

/**
 * Resolves the blind-index HMAC key:
 * 1. `SEARCH_INDEX_KEY` when set (optional override)
 * 2. HKDF derive from `FIELD_ENCRYPTION_KEY`
 * 3. `null` when field encryption is disabled
 */
export const searchIndexKeyFromEnv = (): string | null => {
  const explicit = process.env.SEARCH_INDEX_KEY?.trim();
  if (explicit) return explicit;
  const kek = kekFromEnv();
  if (!kek) return null;
  return deriveSearchIndexKeyFromKek(kek);
};
