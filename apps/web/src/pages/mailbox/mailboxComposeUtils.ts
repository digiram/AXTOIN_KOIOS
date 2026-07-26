/**
 * Mailbox Compose utilities.
 *
 * Pure helpers supporting mailbox forms, calendars, or document workflows.
 *
 * Responsibilities:
 * - Normalize and validate client-side form or display values
 * - Keep page components free of duplicated transformation logic
 *
 * Related:
 * - Route: /admin/mailbox
 */
import type { MailboxAddress } from "@starter/shared";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition-colors placeholder:text-slate-400 accent-indigo-600 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20";

export { inputClass as mailboxComposeInputClass };

/** Helper for mailbox client logic. */
export function bodyTextFromDraft(bodyText: string | null | undefined, bodyHtml: string | null | undefined): string {
  if (bodyText?.trim()) return bodyText;
  if (!bodyHtml) return "";
  return bodyHtml
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .trim();
}

/** Helper for mailbox client logic. */
export function bodyHtmlFromText(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<p>${escaped.replace(/\n/g, "<br/>")}</p>`;
}

/** Helper for mailbox client logic. */
export function plainTextFromHtml(html: string): string {
  if (!html.trim()) return "";
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n");
  const stripped = withBreaks.replace(/<[^>]+>/g, "");
  return stripped
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Helper for mailbox client logic. */
export function htmlFromDraft(bodyText: string | null | undefined, bodyHtml: string | null | undefined): string {
  if (bodyHtml?.trim()) return bodyHtml;
  if (bodyText?.trim()) return bodyHtmlFromText(bodyText);
  return "";
}

/** Helper for mailbox client logic. */
export function appendMailboxRecipient(
  recipients: MailboxAddress[],
  address: MailboxAddress
): MailboxAddress[] {
  const email = address.email.trim().toLowerCase();
  if (!email) return recipients;
  if (recipients.some((entry) => entry.email.trim().toLowerCase() === email)) {
    return recipients;
  }
  return [...recipients, address];
}

/** Helper for mailbox client logic. */
export function removeMailboxRecipient(recipients: MailboxAddress[], email: string): MailboxAddress[] {
  const normalized = email.trim().toLowerCase();
  return recipients.filter((entry) => entry.email.trim().toLowerCase() !== normalized);
}

/** Helper for mailbox client logic. */
export function formatRecipientChip(address: MailboxAddress): string {
  return address.name?.trim() ? `${address.name.trim()} <${address.email}>` : address.email;
}

/** Helper for mailbox client logic. */
export function formatMailboxAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes >= 10_240 ? 0 : 1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const mailboxAttachmentFileExt = (filename: string): string => {
  const match = /\.([^.]+)$/.exec(filename.trim());
  return match ? match[1]!.toLowerCase() : "";
};

/** Helper for mailbox client logic. */
export function formatMailboxAttachmentTypeLabel(mimeType: string, filename: string): string {
  const mime = mimeType.trim().toLowerCase();
  const ext = mailboxAttachmentFileExt(filename);

  if (mime === "application/pdf" || ext === "pdf") return "PDF";
  if (
    mime.includes("wordprocessingml") ||
    mime.includes("msword") ||
    ["doc", "docx", "odt", "rtf"].includes(ext)
  ) {
    return "Word document";
  }
  if (
    mime.includes("spreadsheetml") ||
    mime.includes("ms-excel") ||
    mime === "text/csv" ||
    ["xls", "xlsx", "ods", "csv"].includes(ext)
  ) {
    return "Spreadsheet";
  }
  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "Image";
  if (mime.startsWith("text/") || ["txt", "md", "json", "xml", "html", "htm"].includes(ext)) return "Text file";
  if (mime.startsWith("video/")) return "Video";
  if (mime.startsWith("audio/")) return "Audio";
  if (mime.includes("zip") || ["zip", "rar", "7z", "gz", "tar"].includes(ext)) return "Archive";
  if (ext) return ext.toUpperCase();
  if (mime && mime !== "application/octet-stream") return mime;
  return "File";
}
