/**
 * Mailbox attachment blob I/O.
 *
 * Validates, encrypts, and stores mailbox message attachments under tenant-scoped
 * blob paths with extension and size guards from shared constants.
 *
 * Responsibilities:
 * - Derive safe storage extensions from original filenames
 * - Write/read/delete encrypted attachment bytes via `BlobStorage`
 *
 * Security:
 * - Blocks disallowed extensions and oversize uploads
 * - Tenant-bound at-rest encryption via `encodeTenantBlobAtRest`
 */

import {
  MAILBOX_ATTACHMENT_BLOCKED_EXTENSIONS,
  MAILBOX_ATTACHMENT_MAX_FILE_BYTES
} from "@starter/shared";
import { decodeTenantBlobAtRest, encodeTenantBlobAtRest } from "@starter/db";

import { getBlobStorage } from "./blob-storage/index.js";
import { relPathForMailboxAttachment } from "./blob-paths.js";

export const mailboxAttachmentStorageExt = (filename: string): string => {
  const base = filename.trim().split(/[/\\]/).pop() ?? "attachment";
  const dot = base.lastIndexOf(".");
  const ext = dot > 0 ? base.slice(dot + 1).toLowerCase() : "bin";
  if (!ext || MAILBOX_ATTACHMENT_BLOCKED_EXTENSIONS.has(ext)) {
    throw new Error("attachment_extension_blocked");
  }
  if (!/^[a-z0-9]{1,16}$/.test(ext)) throw new Error("attachment_extension_invalid");
  return ext;
};

export const assertMailboxAttachmentUpload = (input: {
  filename: string;
  sizeBytes: number;
}): void => {
  if (input.sizeBytes <= 0) throw new Error("attachment_empty");
  if (input.sizeBytes > MAILBOX_ATTACHMENT_MAX_FILE_BYTES) throw new Error("attachment_too_large");
  mailboxAttachmentStorageExt(input.filename);
};

export const writeMailboxAttachmentBytes = async (input: {
  tenantId: string;
  messageId: string;
  attachmentId: string;
  filename: string;
  bytes: Buffer;
}): Promise<{ blobPath: string; storageExt: string }> => {
  const storageExt = mailboxAttachmentStorageExt(input.filename);
  const blobPath = relPathForMailboxAttachment(
    input.tenantId,
    input.messageId,
    input.attachmentId,
    storageExt
  );
  const body = await encodeTenantBlobAtRest(input.bytes, input.tenantId);
  await getBlobStorage().write(blobPath, body, { tenantId: input.tenantId });
  return { blobPath, storageExt };
};

export const readMailboxAttachmentBytes = async (
  blobPath: string,
  ctx: { tenantId: string }
): Promise<Buffer> => {
  const stored = await getBlobStorage().read(blobPath, ctx);
  return await decodeTenantBlobAtRest(stored, ctx.tenantId);
};

export const deleteMailboxAttachmentBlob = async (blobPath: string): Promise<void> => {
  if (!blobPath.trim()) return;
  await getBlobStorage().delete(blobPath);
};
