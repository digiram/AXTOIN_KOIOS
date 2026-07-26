/**
 * Temporary password generator.
 *
 * Produces cryptographically random alphanumeric strings for one-time admin
 * password resets without ambiguous characters.
 */

import { randomBytes } from "node:crypto";

/** Alphanumeric without ambiguous `0`/`O`/`o`, `1`/`l`/`I`. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

/** Cryptographically random string for one-time admin password resets. */
export function generateTemporaryPassword(length: number): string {
  if (length < 8 || length > 128) {
    throw new Error("generateTemporaryPassword: length must be between 8 and 128");
  }
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length]!;
  }
  return out;
}
