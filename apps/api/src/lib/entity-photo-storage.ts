/**
 * Entity photo and document blob I/O.
 *
 * Tenant-scoped read/write/delete for profile photos, workforce documents,
 * company-subscription provider files, and invoicing logo assets via `BlobStorage`.
 *
 * Responsibilities:
 * - Validate image uploads and map MIME types to storage extensions
 * - Encrypt blobs at rest with tenant-bound AES-GCM when `FIELD_ENCRYPTION_KEY` is set
 * - Re-export safe path helpers from `blob-paths.ts`
 * - Load invoicing logo data URLs for email templates
 *
 * Security:
 * - Tenant-scoped encryption context on all read/write paths
 * - Path validation before delete; rejects traversal
 */

import { decryptBuffer, encryptBuffer } from "@starter/crypto";

import { assertBlobWriteAllowed, fieldEncryptionKeyOrThrow } from "./blob-crypto-policy.js";
import { assertImageMimeMatchesBuffer } from "./image-magic-bytes.js";

import {
  absPathFromEmployeeDocumentRel,
  absPathFromCompanySubscriptionProviderDocumentRel,
  absPathFromRel,
  isSafeCompanySubscriptionProviderDocumentRelPath,
  isSafeEmployeeDocumentRelPath,
  isSafeInvoicingLogoRelPath,
  isSafePhotoRelPath,
  relPathForCompanySubscriptionProviderDocument,
  relPathForInvoicingCompanyLogo,
  resolveApiFilesRoot
} from "./blob-paths.js";
import { getBlobStorage } from "./blob-storage/index.js";

export {
  absPathFromEmployeeDocumentRel,
  absPathFromCompanySubscriptionProviderDocumentRel,
  absPathFromRel,
  isSafeCompanySubscriptionProviderDocumentRelPath,
  isSafeEmployeeDocumentRelPath,
  isSafeInvoicingLogoRelPath,
  isSafePhotoRelPath,
  relPathForCompanySubscriptionProviderDocument,
  relPathForInvoicingCompanyLogo,
  resolveApiFilesRoot
};

/** Encrypted blobs at rest use this magic prefix (legacy plaintext files have no prefix). */
export const PROFILE_PHOTO_FILE_MAGIC = Buffer.from("SFP1");

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif"
};

/** Tenant-scoped AES-GCM (same as profile photos / field encryption). */
export type ProfilePhotoCryptoContext = {
  tenantId: string;
};

export type TenantSecretBlobContext = ProfilePhotoCryptoContext;

export const allowedProfilePhotoMimes = (): string[] => Object.keys(MIME_TO_EXT);

export const extForProfilePhotoMime = (mime: string): string | null => MIME_TO_EXT[mime.toLowerCase()] ?? null;

export const assertProfilePhotoUpload = (buffer: Buffer, mime: string): void => {
  assertImageMimeMatchesBuffer(buffer, mime);
};

export const relPathForContactPhoto = (tenantId: string, contactId: string, ext: string): string =>
  `${tenantId}/crm-contacts/${contactId}.${ext}`;

export const relPathForEmployeePhoto = (tenantId: string, employeeId: string, ext: string): string =>
  `${tenantId}/workforce-employees/${employeeId}.${ext}`;

const isEncryptedAtRestBlob = (stored: Buffer): boolean =>
  stored.length >= PROFILE_PHOTO_FILE_MAGIC.length &&
  stored.subarray(0, PROFILE_PHOTO_FILE_MAGIC.length).equals(PROFILE_PHOTO_FILE_MAGIC);

const encodePlainBufferAtRest = (plainBody: Buffer, ctx: ProfilePhotoCryptoContext): Buffer => {
  assertBlobWriteAllowed();
  const key = process.env.FIELD_ENCRYPTION_KEY?.trim();
  if (!key) {
    return plainBody;
  }
  const encrypted = encryptBuffer(plainBody, key, { tenantId: ctx.tenantId });
  return Buffer.concat([PROFILE_PHOTO_FILE_MAGIC, encrypted]);
};

const decodeStoredBufferAtRest = (stored: Buffer, ctx: ProfilePhotoCryptoContext): Buffer => {
  if (!isEncryptedAtRestBlob(stored)) {
    return stored;
  }
  const key = fieldEncryptionKeyOrThrow();
  return decryptBuffer(stored.subarray(PROFILE_PHOTO_FILE_MAGIC.length), key, { tenantId: ctx.tenantId });
};

export const writeProfilePhotoFile = async (
  _filesRoot: string,
  rel: string,
  plainBody: Buffer,
  context: ProfilePhotoCryptoContext
): Promise<void> => {
  const body = encodePlainBufferAtRest(plainBody, context);
  await getBlobStorage().write(rel, body, { tenantId: context.tenantId });
};

export const readProfilePhotoBytes = async (
  _filesRoot: string,
  rel: string,
  context: ProfilePhotoCryptoContext
): Promise<Buffer> => {
  const stored = await getBlobStorage().read(rel, { tenantId: context.tenantId });
  return decodeStoredBufferAtRest(stored, context);
};

export const deleteProfilePhotoFile = async (_filesRoot: string, rel: string | null | undefined): Promise<void> => {
  if (!rel || !rel.trim()) return;
  if (!isSafePhotoRelPath(rel) && !isSafeInvoicingLogoRelPath(rel)) return;
  await getBlobStorage().delete(rel);
};

export const mimeForStoredPhotoName = (filename: string): string => {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif"
  };
  return map[ext] ?? "application/octet-stream";
};

/** Loads tenant invoicing logo bytes as a data URL for MJML email templates. */
export const loadInvoicingEmailLogoDataUrl = async (
  tenantId: string,
  companyLogoRelPath: string | null | undefined
): Promise<string | null> => {
  const rel = companyLogoRelPath?.trim();
  if (!rel) return null;
  try {
    const bytes = await readProfilePhotoBytes(resolveApiFilesRoot(), rel, { tenantId });
    const name = rel.split("/").pop() ?? "logo.png";
    const mime = mimeForStoredPhotoName(name);
    return `data:${mime};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
};

const WORKFORCE_EMPLOYEE_DOCUMENTS_FOLDER = "workforce-employee-documents";

const DOCUMENT_STORAGE_EXT_ALLOW = new Set([
  "pdf",
  "doc",
  "docx",
  "txt",
  "rtf",
  "md",
  "odt",
  "ods",
  "odp",
  "xls",
  "xlsx",
  "csv",
  "ppt",
  "pptx",
  "png",
  "jpeg",
  "jpg",
  "gif",
  "webp",
  "zip",
  "json",
  "xml",
  "bin"
]);

export const normalizeEmployeeDocumentStorageExt = (originalFilename: string): string => {
  const base = originalFilename.replace(/\\/g, "/").split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  const raw = dot >= 0 ? base.slice(dot + 1) : "";
  const ext = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (ext.length > 0 && ext.length <= 16 && DOCUMENT_STORAGE_EXT_ALLOW.has(ext)) return ext;
  return "bin";
};

export const relPathForEmployeeDocument = (
  tenantId: string,
  employeeId: string,
  documentId: string,
  storageExt: string
): string => `${tenantId}/${WORKFORCE_EMPLOYEE_DOCUMENTS_FOLDER}/${employeeId}/${documentId}.${storageExt}`;

export const writeEmployeeDocumentFile = async (
  _filesRoot: string,
  rel: string,
  plainBody: Buffer,
  context: ProfilePhotoCryptoContext
): Promise<void> => {
  const body = encodePlainBufferAtRest(plainBody, context);
  await getBlobStorage().write(rel, body, { tenantId: context.tenantId });
};

export const readEmployeeDocumentBytes = async (
  _filesRoot: string,
  rel: string,
  context: ProfilePhotoCryptoContext
): Promise<Buffer> => {
  const stored = await getBlobStorage().read(rel, { tenantId: context.tenantId });
  return decodeStoredBufferAtRest(stored, context);
};

export const deleteEmployeeDocumentFile = async (_filesRoot: string, rel: string | null | undefined): Promise<void> => {
  if (!rel || !rel.trim()) return;
  if (!isSafeEmployeeDocumentRelPath(rel)) return;
  await getBlobStorage().delete(rel);
};

export const writeCompanySubscriptionProviderDocumentFile = async (
  _filesRoot: string,
  rel: string,
  plainBody: Buffer,
  context: ProfilePhotoCryptoContext
): Promise<void> => {
  const body = encodePlainBufferAtRest(plainBody, context);
  await getBlobStorage().write(rel, body, { tenantId: context.tenantId });
};

export const readCompanySubscriptionProviderDocumentBytes = async (
  _filesRoot: string,
  rel: string,
  context: ProfilePhotoCryptoContext
): Promise<Buffer> => {
  const stored = await getBlobStorage().read(rel, { tenantId: context.tenantId });
  return decodeStoredBufferAtRest(stored, context);
};

export const deleteCompanySubscriptionProviderDocumentFile = async (
  _filesRoot: string,
  rel: string | null | undefined
): Promise<void> => {
  if (!rel || !rel.trim()) return;
  if (!isSafeCompanySubscriptionProviderDocumentRelPath(rel)) return;
  await getBlobStorage().delete(rel);
};
