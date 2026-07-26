/**
 * Mailbox attachment blob storage.
 *
 * Persists message attachment bytes under tenant-scoped paths on local disk or S3, with
 * tenant DEK envelope encryption at rest via `tenant-blob-at-rest`.
 *
 * Responsibilities:
 * - Relative path layout for mailbox attachment objects
 * - Write/read/delete with local `API_FILES_ROOT` or S3 backend
 * - Path traversal guards on local filesystem access
 *
 * Depends on:
 * - `tenant-blob-at-rest` for encrypt/decrypt with tenant DEK
 * - `s3-put-options` for optional SSE on S3 puts
 *
 * Security:
 * - `tenantId` is required for encrypt/decrypt; rel paths must match `{tenantId}/mailbox-attachments/...`.
 * - Local paths reject `..` escapes; attachment bytes are encrypted before write.
 */

import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";

import { s3PutObjectEncryptionParams } from "./s3-put-options.js";
import {
  decodeTenantBlobAtRest,
  encodeTenantBlobAtRest
} from "./tenant-blob-at-rest.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAILBOX_ATTACHMENTS_FOLDER = "mailbox-attachments";

export const relPathForMailboxAttachment = (
  tenantId: string,
  messageId: string,
  attachmentId: string,
  storageExt: string
): string => `${tenantId}/${MAILBOX_ATTACHMENTS_FOLDER}/${messageId}/${attachmentId}.${storageExt}`;

export const mailboxAttachmentStorageExt = (filename: string): string => {
  const base = filename.trim().split(/[/\\]/).pop() ?? "attachment";
  const dot = base.lastIndexOf(".");
  const ext = dot > 0 ? base.slice(dot + 1).toLowerCase() : "bin";
  return /^[a-z0-9]{1,16}$/.test(ext) ? ext : "bin";
};

const resolveApiFilesRoot = (): string => {
  const override = process.env.API_FILES_ROOT?.trim();
  if (override) return override;
  return join(fileURLToPath(new URL("../../../apps/api", import.meta.url)), "files");
};

const absPathFromRel = (rel: string): string => {
  const n = rel.replace(/\\/g, "/").trim();
  const parts = n.split("/").filter(Boolean);
  if (parts.length !== 4) throw new Error("invalid_mailbox_attachment_rel_path");
  const [tenantId, folder, messageId, file] = parts;
  if (!UUID_RE.test(tenantId) || folder !== MAILBOX_ATTACHMENTS_FOLDER || !UUID_RE.test(messageId)) {
    throw new Error("invalid_mailbox_attachment_rel_path");
  }
  const root = resolveApiFilesRoot();
  const abs = normalize(join(root, ...parts));
  const relDiff = relative(normalize(root), abs);
  if (relDiff.startsWith("..") || relDiff.includes("..")) throw new Error("path_escape");
  return abs;
};

const blobBackend = (): "local" | "s3" => {
  const raw = (process.env.BLOB_STORAGE_BACKEND ?? "local").trim().toLowerCase();
  return raw === "s3" ? "s3" : "local";
};

let s3Client: S3Client | undefined;
const getS3 = (): { client: S3Client; bucket: string; prefix: string } => {
  const bucket = process.env.S3_BUCKET?.trim();
  if (!bucket) throw new Error("S3_BUCKET must be set when BLOB_STORAGE_BACKEND=s3");
  if (!s3Client) {
    s3Client = new S3Client({
      region: process.env.S3_REGION?.trim() || "us-east-1",
      endpoint: process.env.S3_ENDPOINT?.trim() || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true"
    });
  }
  const prefix = (process.env.S3_KEY_PREFIX ?? "").trim().replace(/^\/+|\/+$/g, "");
  return { client: s3Client, bucket, prefix };
};

const s3Key = (rel: string, prefix: string): string => {
  const key = rel.replace(/\\/g, "/");
  return prefix ? `${prefix}/${key}` : key;
};

export const writeMailboxAttachmentBlob = async (
  rel: string,
  bytes: Buffer,
  tenantId: string
): Promise<void> => {
  const body = await encodeTenantBlobAtRest(bytes, tenantId);
  if (blobBackend() === "s3") {
    const { client, bucket, prefix } = getS3();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: s3Key(rel, prefix),
        Body: body,
        ...s3PutObjectEncryptionParams()
      })
    );
    return;
  }
  const abs = absPathFromRel(rel);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, body);
};

export const readMailboxAttachmentBlob = async (rel: string, tenantId: string): Promise<Buffer> => {
  let stored: Buffer;
  if (blobBackend() === "s3") {
    const { client, bucket, prefix } = getS3();
    const out = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: s3Key(rel, prefix)
      })
    );
    const bytes = await out.Body?.transformToByteArray();
    if (!bytes) throw new Error("s3_empty_object");
    stored = Buffer.from(bytes);
  } else {
    stored = await readFile(absPathFromRel(rel));
  }
  return await decodeTenantBlobAtRest(stored, tenantId);
};

export const deleteMailboxAttachmentBlob = async (rel: string): Promise<void> => {
  if (!rel.trim()) return;
  if (blobBackend() === "s3") {
    const { client, bucket, prefix } = getS3();
    await client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: s3Key(rel, prefix)
      })
    );
    return;
  }
  try {
    await unlink(absPathFromRel(rel));
  } catch (e: unknown) {
    const code = e && typeof e === "object" && "code" in e ? String((e as NodeJS.ErrnoException).code) : "";
    if (code !== "ENOENT") throw e;
  }
};
