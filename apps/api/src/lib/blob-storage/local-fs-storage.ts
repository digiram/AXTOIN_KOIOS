/**
 * Local filesystem blob storage adapter.
 *
 * Writes tenant blobs under `resolveApiFilesRoot()` using validated relative paths
 * from `blob-paths.ts`.
 *
 * Responsibilities:
 * - Implement `BlobStorage` read/write/delete for the local backend
 * - Create parent directories on write
 * - Ignore missing files on delete
 */

import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { BlobStorage, BlobStorageContext } from "./types.js";
import {
  absPathFromEmployeeDocumentRel,
  absPathFromMailboxAttachmentRel,
  absPathFromRel,
  isSafeEmployeeDocumentRelPath,
  isSafeMailboxAttachmentRelPath,
  isSafePhotoRelPath,
  resolveApiFilesRoot
} from "../blob-paths.js";

const resolveAbs = (rel: string): string => {
  const root = resolveApiFilesRoot();
  if (isSafePhotoRelPath(rel)) return absPathFromRel(root, rel);
  if (isSafeEmployeeDocumentRelPath(rel)) return absPathFromEmployeeDocumentRel(root, rel);
  if (isSafeMailboxAttachmentRelPath(rel)) return absPathFromMailboxAttachmentRel(root, rel);
  throw new Error("invalid_blob_rel_path");
};

/** Creates a `BlobStorage` implementation backed by the local uploads directory. */
export const createLocalFsBlobStorage = (): BlobStorage => ({
  async write(rel, body, _ctx) {
    const abs = resolveAbs(rel);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, body);
  },
  async read(rel, _ctx) {
    return readFile(resolveAbs(rel));
  },
  async delete(rel) {
    if (!rel.trim()) return;
    try {
      await unlink(resolveAbs(rel));
    } catch (e: unknown) {
      const code = e && typeof e === "object" && "code" in e ? String((e as NodeJS.ErrnoException).code) : "";
      if (code !== "ENOENT") throw e;
    }
  }
});
