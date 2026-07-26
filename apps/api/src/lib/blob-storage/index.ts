/**
 * Blob storage backend factory.
 *
 * Selects local filesystem or S3 implementation from `BLOB_STORAGE_BACKEND` and
 * exposes a process-wide singleton for tenant-scoped binary I/O.
 *
 * Responsibilities:
 * - Read backend choice from environment
 * - Lazily construct and cache the active `BlobStorage` implementation
 * - Re-export storage types for consumers
 */

import { createLocalFsBlobStorage } from "./local-fs-storage.js";
import { createS3BlobStorage } from "./s3-storage.js";
import type { BlobStorage } from "./types.js";

let cached: BlobStorage | undefined;

export type BlobStorageBackend = "local" | "s3";

/** Returns the configured blob storage backend from `BLOB_STORAGE_BACKEND`. */
export const blobStorageBackendFromEnv = (): BlobStorageBackend => {
  const raw = (process.env.BLOB_STORAGE_BACKEND ?? "local").trim().toLowerCase();
  return raw === "s3" ? "s3" : "local";
};

/** Returns the process-wide `BlobStorage` singleton. */
export const getBlobStorage = (): BlobStorage => {
  if (cached) return cached;
  cached = blobStorageBackendFromEnv() === "s3" ? createS3BlobStorage() : createLocalFsBlobStorage();
  return cached;
};

/** Test-only: clear singleton after env changes (`API_FILES_ROOT`, `BLOB_STORAGE_BACKEND`). */
export const resetBlobStorageForTests = (): void => {
  cached = undefined;
};

export type { BlobStorage, BlobStorageContext } from "./types.js";
