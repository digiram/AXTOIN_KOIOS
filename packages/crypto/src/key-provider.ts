/**
 * Key Encryption Key (KEK) provider abstraction.
 *
 * Swap `EnvKeyProvider` for a KMS-backed implementation (Azure Key Vault, AWS KMS, Vault)
 * without changing field encryption or envelope code.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const IV_SIZE = 12;
const TAG_SIZE = 16;
const KEY_BYTES = 32;

/** Wrapped tenant DEK blob produced by {@link KeyProvider.wrapDek}. */
export type WrappedDek = {
  keyVersion: number;
  iv: string;
  tag: string;
  ciphertext: string;
};

/** Serializes a wrapped DEK for persistence in `tenants.encrypted_dek`. */
export const serializeWrappedDek = (wrapped: WrappedDek): string => JSON.stringify(wrapped);

/** Parses a wrapped DEK from the database. */
export const parseWrappedDek = (stored: string): WrappedDek => {
  const parsed = JSON.parse(stored) as WrappedDek;
  if (
    typeof parsed.keyVersion !== "number" ||
    typeof parsed.iv !== "string" ||
    typeof parsed.tag !== "string" ||
    typeof parsed.ciphertext !== "string"
  ) {
    throw new Error("Invalid wrapped DEK format");
  }
  return parsed;
};

export interface KeyProvider {
  /** Active KEK version used for new wraps. */
  getActiveKekVersion(): number;
  /** Wraps a plaintext DEK with the KEK at `keyVersion` (defaults to active). */
  wrapDek(plainDek: Buffer, keyVersion?: number): WrappedDek;
  /** Unwraps a wrapped DEK using the KEK version stored in the blob. */
  unwrapDek(wrapped: WrappedDek): Buffer;
}

const decodeKek = (base64Key: string): Buffer => {
  const key = Buffer.from(base64Key, "base64");
  if (key.byteLength !== KEY_BYTES) {
    throw new Error("KEK must decode to 32 bytes");
  }
  return key;
};

const aesGcmEncrypt = (key: Buffer, plaintext: Buffer, aad: Buffer): { iv: string; tag: string; ciphertext: string } => {
  const iv = randomBytes(IV_SIZE);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64")
  };
};

const aesGcmDecrypt = (
  key: Buffer,
  ivB64: string,
  tagB64: string,
  ciphertextB64: string,
  aad: Buffer
): Buffer => {
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
};

export type EnvKeyProviderOptions = {
  /** Base64-encoded 32-byte KEK (`FIELD_ENCRYPTION_KEY`). */
  kekBase64: string;
  /** Active KEK version for new wraps (default 1). */
  activeVersion?: number;
};

/**
 * Environment-backed KEK provider reading `FIELD_ENCRYPTION_KEY`.
 * Supports a single active version today; multi-version maps can be added for KEK rotation.
 */
export class EnvKeyProvider implements KeyProvider {
  private readonly kek: Buffer;
  private readonly activeVersion: number;

  constructor(opts: EnvKeyProviderOptions) {
    this.kek = decodeKek(opts.kekBase64);
    this.activeVersion = opts.activeVersion ?? 1;
  }

  getActiveKekVersion(): number {
    return this.activeVersion;
  }

  wrapDek(plainDek: Buffer, keyVersion?: number): WrappedDek {
    if (plainDek.byteLength !== KEY_BYTES) {
      throw new Error("DEK must be 32 bytes");
    }
    const version = keyVersion ?? this.activeVersion;
    const aad = Buffer.from(`DEK-WRAP\0v${version}`, "utf8");
    const enc = aesGcmEncrypt(this.kek, plainDek, aad);
    return { keyVersion: version, ...enc };
  }

  unwrapDek(wrapped: WrappedDek): Buffer {
    const aad = Buffer.from(`DEK-WRAP\0v${wrapped.keyVersion}`, "utf8");
    return aesGcmDecrypt(this.kek, wrapped.iv, wrapped.tag, wrapped.ciphertext, aad);
  }
}

/** Reads KEK from `FIELD_ENCRYPTION_KEY` or returns null when unset. */
export const kekFromEnv = (): string | null => {
  const k = process.env.FIELD_ENCRYPTION_KEY?.trim();
  return k || null;
};

/** Creates an {@link EnvKeyProvider} from env, or throws when the key is missing. */
export const keyProviderFromEnv = (): EnvKeyProvider => {
  const kek = kekFromEnv();
  if (!kek) {
    throw new Error("FIELD_ENCRYPTION_KEY is not set");
  }
  return new EnvKeyProvider({ kekBase64: kek });
};

/** Generates a cryptographically secure 256-bit DEK. */
export const generateDek = (): Buffer => randomBytes(KEY_BYTES);

export { KEY_BYTES as DEK_BYTES, IV_SIZE, TAG_SIZE };
