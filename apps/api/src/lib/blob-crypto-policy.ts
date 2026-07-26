/**
 * At-rest blob encryption policy — refuse silent plaintext outside explicit dev opt-in.
 */

const isTruthy = (v: string | undefined): boolean => v === "true" || v === "1";

export const allowPlaintextBlobStorage = (): boolean => {
  if (isTruthy(process.env.ALLOW_PLAINTEXT_BLOB_STORAGE)) return true;
  const nodeEnv = process.env.NODE_ENV?.trim().toLowerCase() ?? "development";
  return nodeEnv !== "production" && nodeEnv !== "test";
};

export const fieldEncryptionKeyOrThrow = (): string => {
  const key = process.env.FIELD_ENCRYPTION_KEY?.trim();
  if (key) return key;
  if (allowPlaintextBlobStorage()) {
    throw new Error("field_encryption_key_unset");
  }
  throw new Error("FIELD_ENCRYPTION_KEY must be set for encrypted blob storage");
};

export const assertBlobWriteAllowed = (): void => {
  const key = process.env.FIELD_ENCRYPTION_KEY?.trim();
  if (key) return;
  if (allowPlaintextBlobStorage()) return;
  const err = new Error(
    "FIELD_ENCRYPTION_KEY must be set to store uploads, or set ALLOW_PLAINTEXT_BLOB_STORAGE=true for local-only plaintext."
  );
  (err as Error & { statusCode: number }).statusCode = 503;
  throw err;
};
