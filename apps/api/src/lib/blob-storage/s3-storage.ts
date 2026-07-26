/**
 * S3-compatible blob storage adapter.
 *
 * Stores tenant blobs in an S3 bucket with server-side encryption parameters
 * from `@starter/db` when `BLOB_STORAGE_BACKEND=s3`.
 *
 * Responsibilities:
 * - Implement `BlobStorage` via AWS SDK v3
 * - Validate relative paths before object key construction
 * - Apply optional key prefix and custom endpoint settings
 *
 * Security:
 * - Rejects unsafe relative paths before upload or download
 * - Uses `s3PutObjectEncryptionParams()` for at-rest encryption
 */

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { s3PutObjectEncryptionParams } from "@starter/db";

import type { BlobStorage, BlobStorageContext } from "./types.js";
import { isSafeEmployeeDocumentRelPath, isSafeMailboxAttachmentRelPath, isSafePhotoRelPath } from "../blob-paths.js";

const assertSafeRel = (rel: string): void => {
  if (
    !isSafePhotoRelPath(rel) &&
    !isSafeEmployeeDocumentRelPath(rel) &&
    !isSafeMailboxAttachmentRelPath(rel)
  ) {
    throw new Error("invalid_blob_rel_path");
  }
};

const objectKey = (rel: string): string => rel.replace(/\\/g, "/");

/** Creates a `BlobStorage` implementation backed by S3 (or S3-compatible storage). */
export const createS3BlobStorage = (): BlobStorage => {
  const bucket = process.env.S3_BUCKET?.trim();
  if (!bucket) {
    throw new Error("S3_BUCKET must be set when BLOB_STORAGE_BACKEND=s3");
  }
  const prefix = (process.env.S3_KEY_PREFIX ?? "").trim().replace(/^\/+|\/+$/g, "");
  const region = process.env.S3_REGION?.trim() || "us-east-1";
  const endpoint = process.env.S3_ENDPOINT?.trim();

  const client = new S3Client({
    region,
    endpoint: endpoint || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true"
  });

  const fullKey = (rel: string) => (prefix ? `${prefix}/${objectKey(rel)}` : objectKey(rel));

  return {
    async write(rel, body, _ctx) {
      assertSafeRel(rel);
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: fullKey(rel),
          Body: body,
          ...s3PutObjectEncryptionParams()
        })
      );
    },
    async read(rel, _ctx) {
      assertSafeRel(rel);
      const out = await client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: fullKey(rel)
        })
      );
      const bytes = await out.Body?.transformToByteArray();
      if (!bytes) throw new Error("s3_empty_object");
      return Buffer.from(bytes);
    },
    async delete(rel) {
      if (!rel.trim()) return;
      assertSafeRel(rel);
      await client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: fullKey(rel)
        })
      );
    }
  };
};
