/**
 * Blob relative path validation and resolution.
 *
 * Canonical path builders and safety checks for tenant-scoped binary storage
 * (profile photos, documents, mailbox attachments, invoicing logos).
 *
 * Responsibilities:
 * - Validate relative paths against UUID and folder conventions
 * - Resolve safe relative paths to absolute filesystem paths
 * - Expose `resolveApiFilesRoot` for local storage backend
 *
 * Security:
 * - Rejects path traversal and malformed tenant or entity IDs
 * - Extension allowlists per blob category
 */

import { join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const WORKFORCE_EMPLOYEE_DOCUMENTS_FOLDER = "workforce-employee-documents";
const COMPANY_SUBSCRIPTION_PROVIDER_DOCUMENTS_FOLDER = "company-subscription-provider-documents";
const MAILBOX_ATTACHMENTS_FOLDER = "mailbox-attachments";

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

/** On-disk uploads default root (`apps/api/files`). Override with `API_FILES_ROOT` in tests. */
export const resolveApiFilesRoot = (): string => {
  const override = process.env.API_FILES_ROOT?.trim();
  if (override) return override;
  return join(fileURLToPath(new URL("../..", import.meta.url)), "files");
};

const INVOICING_LOGO_FOLDER = "invoicing";
const INVOICING_LOGO_BASENAME = "logo";

export const isSafeInvoicingLogoRelPath = (rel: string): boolean => {
  const n = rel.replace(/\\/g, "/").trim();
  const parts = n.split("/").filter(Boolean);
  if (parts.length !== 3) return false;
  const [tenantId, folder, file] = parts;
  if (!UUID_RE.test(tenantId)) return false;
  if (folder !== INVOICING_LOGO_FOLDER) return false;
  const dot = file.lastIndexOf(".");
  if (dot <= 0) return false;
  const base = file.slice(0, dot);
  const ext = file.slice(dot + 1).toLowerCase();
  if (base !== INVOICING_LOGO_BASENAME) return false;
  if (!["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) return false;
  return true;
};

export const relPathForInvoicingCompanyLogo = (tenantId: string, ext: string): string =>
  `${tenantId}/${INVOICING_LOGO_FOLDER}/${INVOICING_LOGO_BASENAME}.${ext}`;

export const isSafePhotoRelPath = (rel: string): boolean => {
  const n = rel.replace(/\\/g, "/").trim();
  const parts = n.split("/").filter(Boolean);
  if (parts.length !== 3) return false;
  const [tenantId, folder, file] = parts;
  if (!UUID_RE.test(tenantId)) return false;
  if (folder !== "crm-contacts" && folder !== "workforce-employees") return false;
  const dot = file.lastIndexOf(".");
  if (dot <= 0) return false;
  const idPart = file.slice(0, dot);
  const ext = file.slice(dot + 1).toLowerCase();
  if (!UUID_RE.test(idPart)) return false;
  if (!["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) return false;
  return true;
};

export const absPathFromRel = (filesRoot: string, rel: string): string => {
  if (!isSafePhotoRelPath(rel)) throw new Error("invalid_photo_rel_path");
  const abs = normalize(join(filesRoot, ...rel.split("/")));
  const relDiff = relative(normalize(filesRoot), abs);
  if (relDiff.startsWith("..") || relDiff.includes("..")) throw new Error("path_escape");
  return abs;
};

export const isSafeEmployeeDocumentRelPath = (rel: string): boolean => {
  const n = rel.replace(/\\/g, "/").trim();
  const parts = n.split("/").filter(Boolean);
  if (parts.length !== 4) return false;
  const [tenantId, folder, employeeId, file] = parts;
  if (!UUID_RE.test(tenantId) || folder !== WORKFORCE_EMPLOYEE_DOCUMENTS_FOLDER || !UUID_RE.test(employeeId)) {
    return false;
  }
  const dot = file.lastIndexOf(".");
  if (dot <= 0) return false;
  const idPart = file.slice(0, dot);
  const ext = file.slice(dot + 1).toLowerCase();
  if (!UUID_RE.test(idPart)) return false;
  if (ext.length < 2 || ext.length > 16 || !/^[a-z0-9]+$/.test(ext)) return false;
  return DOCUMENT_STORAGE_EXT_ALLOW.has(ext);
};

export const absPathFromEmployeeDocumentRel = (filesRoot: string, rel: string): string => {
  if (!isSafeEmployeeDocumentRelPath(rel)) throw new Error("invalid_employee_document_rel_path");
  const abs = normalize(join(filesRoot, ...rel.split("/")));
  const relDiff = relative(normalize(filesRoot), abs);
  if (relDiff.startsWith("..") || relDiff.includes("..")) throw new Error("path_escape");
  return abs;
};

export const isSafeCompanySubscriptionProviderDocumentRelPath = (rel: string): boolean => {
  const n = rel.replace(/\\/g, "/").trim();
  const parts = n.split("/").filter(Boolean);
  if (parts.length !== 4) return false;
  const [tenantId, folder, providerId, file] = parts;
  if (
    !UUID_RE.test(tenantId) ||
    folder !== COMPANY_SUBSCRIPTION_PROVIDER_DOCUMENTS_FOLDER ||
    !UUID_RE.test(providerId)
  ) {
    return false;
  }
  const dot = file.lastIndexOf(".");
  if (dot <= 0) return false;
  const idPart = file.slice(0, dot);
  const ext = file.slice(dot + 1).toLowerCase();
  if (!UUID_RE.test(idPart)) return false;
  if (ext.length < 2 || ext.length > 16 || !/^[a-z0-9]+$/.test(ext)) return false;
  return DOCUMENT_STORAGE_EXT_ALLOW.has(ext);
};

export const relPathForCompanySubscriptionProviderDocument = (
  tenantId: string,
  providerId: string,
  documentId: string,
  storageExt: string
): string =>
  `${tenantId}/${COMPANY_SUBSCRIPTION_PROVIDER_DOCUMENTS_FOLDER}/${providerId}/${documentId}.${storageExt}`;

export const absPathFromCompanySubscriptionProviderDocumentRel = (filesRoot: string, rel: string): string => {
  if (!isSafeCompanySubscriptionProviderDocumentRelPath(rel)) {
    throw new Error("invalid_company_subscription_provider_document_rel_path");
  }
  const abs = normalize(join(filesRoot, ...rel.split("/")));
  const relDiff = relative(normalize(filesRoot), abs);
  if (relDiff.startsWith("..") || relDiff.includes("..")) throw new Error("path_escape");
  return abs;
};

export const isSafeMailboxAttachmentRelPath = (rel: string): boolean => {
  const n = rel.replace(/\\/g, "/").trim();
  const parts = n.split("/").filter(Boolean);
  if (parts.length !== 4) return false;
  const [tenantId, folder, messageId, file] = parts;
  if (!UUID_RE.test(tenantId) || folder !== MAILBOX_ATTACHMENTS_FOLDER || !UUID_RE.test(messageId)) {
    return false;
  }
  const dot = file.lastIndexOf(".");
  if (dot <= 0) return false;
  const idPart = file.slice(0, dot);
  const ext = file.slice(dot + 1).toLowerCase();
  if (!UUID_RE.test(idPart)) return false;
  if (ext.length < 1 || ext.length > 16 || !/^[a-z0-9]+$/.test(ext)) return false;
  return DOCUMENT_STORAGE_EXT_ALLOW.has(ext);
};

export const relPathForMailboxAttachment = (
  tenantId: string,
  messageId: string,
  attachmentId: string,
  storageExt: string
): string => `${tenantId}/${MAILBOX_ATTACHMENTS_FOLDER}/${messageId}/${attachmentId}.${storageExt}`;

export const absPathFromMailboxAttachmentRel = (filesRoot: string, rel: string): string => {
  if (!isSafeMailboxAttachmentRelPath(rel)) throw new Error("invalid_mailbox_attachment_rel_path");
  const abs = normalize(join(filesRoot, ...rel.split("/")));
  const relDiff = relative(normalize(filesRoot), abs);
  if (relDiff.startsWith("..") || relDiff.includes("..")) throw new Error("path_escape");
  return abs;
};
