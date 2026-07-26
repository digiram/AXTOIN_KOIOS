/**
 * Optional SSE params for S3-compatible `PutObject` calls (bucket default encryption is not assumed).
 */

import type { ServerSideEncryption } from "@aws-sdk/client-s3";

const ALLOWED_SSE = new Set<string>(["AES256", "aws:kms"]);

export const s3PutObjectEncryptionParams = (): {
  ServerSideEncryption?: ServerSideEncryption;
  SSEKMSKeyId?: string;
} => {
  const algo = process.env.S3_SERVER_SIDE_ENCRYPTION?.trim();
  if (!algo || !ALLOWED_SSE.has(algo)) return {};
  const params: { ServerSideEncryption: ServerSideEncryption; SSEKMSKeyId?: string } = {
    ServerSideEncryption: algo as ServerSideEncryption
  };
  const kmsKeyId = process.env.S3_SSE_KMS_KEY_ID?.trim();
  if (kmsKeyId && algo === "aws:kms") {
    params.SSEKMSKeyId = kmsKeyId;
  }
  return params;
};
