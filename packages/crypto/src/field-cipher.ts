/**
 * Per-field AES-256-GCM encryption with scope/table/field AAD binding.
 *
 * Wire format persisted in DB columns: `SFENC1:` + JSON `{ kv, iv, tag, ct }`.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { IV_SIZE, TAG_SIZE } from "./key-provider.js";

export const FIELD_CIPHER_PREFIX = "SFENC1:";

export type FieldCipherContext = {
  /** Tenant id or `platform` for global scope. */
  scopeId: string;
  table: string;
  field: string;
};

export type FieldEnvelope = {
  /** KEK version used when the field was written (for platform KEK-direct) or DEK wrap generation marker. */
  kv: number;
  iv: string;
  tag: string;
  ct: string;
};

const buildAad = (ctx: FieldCipherContext): Buffer =>
  Buffer.from(`${ctx.scopeId}\0${ctx.table}\0${ctx.field}`, "utf8");

const isBlank = (value: string | null | undefined): boolean => (value ?? "").trim() === "";

/** Returns true when the stored value uses the SFENC1 envelope format. */
export const isFieldCipherEnvelope = (stored: string | null | undefined): boolean =>
  typeof stored === "string" && stored.startsWith(FIELD_CIPHER_PREFIX);

/** Parses an SFENC1 envelope from a stored column value. */
export const parseFieldEnvelope = (stored: string): FieldEnvelope => {
  if (!stored.startsWith(FIELD_CIPHER_PREFIX)) {
    throw new Error("Not an SFENC1 field envelope");
  }
  const parsed = JSON.parse(stored.slice(FIELD_CIPHER_PREFIX.length)) as FieldEnvelope;
  if (
    typeof parsed.kv !== "number" ||
    typeof parsed.iv !== "string" ||
    typeof parsed.tag !== "string" ||
    typeof parsed.ct !== "string"
  ) {
    throw new Error("Invalid SFENC1 envelope");
  }
  return parsed;
};

/** Serializes a field envelope for DB storage. */
export const serializeFieldEnvelope = (envelope: FieldEnvelope): string =>
  FIELD_CIPHER_PREFIX + JSON.stringify(envelope);

/**
 * Encrypts a single field value with tenant DEK or platform KEK.
 * Empty/whitespace plaintext returns `""` (no envelope).
 */
export const encryptField = (
  plaintext: string,
  dek: Buffer,
  ctx: FieldCipherContext,
  keyVersion: number
): string => {
  if (isBlank(plaintext)) return "";
  if (dek.byteLength !== 32) {
    throw new Error("Encryption key must be 32 bytes");
  }
  const iv = randomBytes(IV_SIZE);
  const cipher = createCipheriv("aes-256-gcm", dek, iv);
  cipher.setAAD(buildAad(ctx));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return serializeFieldEnvelope({
    kv: keyVersion,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ct: ciphertext.toString("base64")
  });
};

/**
 * Decrypts an SFENC1 envelope. Fail closed on auth/tag/AAD errors.
 */
export const decryptField = (stored: string, dek: Buffer, ctx: FieldCipherContext): string => {
  if (isBlank(stored)) return "";
  if (!isFieldCipherEnvelope(stored)) {
    throw new Error("Expected SFENC1 envelope for decryption");
  }
  const envelope = parseFieldEnvelope(stored);
  const iv = Buffer.from(envelope.iv, "base64");
  const tag = Buffer.from(envelope.tag, "base64");
  const ciphertext = Buffer.from(envelope.ct, "base64");
  const decipher = createDecipheriv("aes-256-gcm", dek, iv);
  decipher.setAAD(buildAad(ctx));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
};

const MAX_FIELD_CIPHER_NESTING = 8;

/** True when decrypting once still yields an SFENC1 envelope (accidental double encryption). */
export const hasNestedFieldCipherEnvelope = (
  stored: string,
  dek: Buffer,
  ctx: FieldCipherContext
): boolean => {
  if (!isFieldCipherEnvelope(stored)) return false;
  return isFieldCipherEnvelope(decryptField(stored, dek, ctx));
};

/**
 * Decrypts nested SFENC1 envelopes left by accidental re-encryption of ciphertext.
 * Normal rows unwrap in a single pass; depth is capped to avoid runaway loops.
 */
export const unwrapFieldCipherEnvelope = (
  stored: string,
  dek: Buffer,
  ctx: FieldCipherContext,
  maxDepth = MAX_FIELD_CIPHER_NESTING
): string => {
  if (isBlank(stored)) return "";
  let value = stored;
  let depth = 0;
  while (isFieldCipherEnvelope(value)) {
    if (depth >= maxDepth) {
      throw new Error("Field cipher nesting depth exceeded");
    }
    value = decryptField(value, dek, ctx);
    depth++;
  }
  return value;
};

/** Reads the key version embedded in an SFENC1 envelope. */
export const fieldEnvelopeKeyVersion = (stored: string): number => parseFieldEnvelope(stored).kv;

export { IV_SIZE, TAG_SIZE };
