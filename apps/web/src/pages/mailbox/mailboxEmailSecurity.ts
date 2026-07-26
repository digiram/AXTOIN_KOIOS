/**
 * Mailbox Email Security.
 *
 * DOMPurify-based sanitization and remote-resource blocking for untrusted mailbox HTML.
 *
 * Responsibilities:
 * - Sanitize message HTML and strip meta refresh redirects
 * - Block or allow remote images/CSS based on user trust preferences (localStorage)
 * - Build CSP strings for sandboxed email iframe previews
 *
 * Related:
 * - mailboxEmailHtml.ts
 * - MailboxInboxPage.tsx
 *
 * Security:
 * - Never render unsanitized HTML; remote resources blocked by default (Gmail/Outlook-style)
 * - Trusted-sender allowlist stored in browser localStorage only
 */
import DOMPurify from "isomorphic-dompurify";

const TRUSTED_SENDERS_STORAGE_KEY = "mailbox-trusted-email-senders-v1";

DOMPurify.addHook("uponSanitizeElement", (node, data) => {
  if (data.tagName !== "meta" || !(node instanceof Element)) return;
  const httpEquiv = node.getAttribute("http-equiv");
  if (httpEquiv && httpEquiv.toLowerCase() === "refresh") {
    node.parentNode?.removeChild(node);
  }
});

/** Inline SVG placeholder shown when remote images are blocked (no network request). */
export const MAILBOX_BLOCKED_IMAGE_PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='64' viewBox='0 0 96 64'%3E%3Crect width='96' height='64' fill='%23f1f5f9'/%3E%3Cpath d='M28 42l10-12 8 8 12-16 10 20H28z' fill='%23cbd5e1'/%3E%3Ccircle cx='36' cy='24' r='5' fill='%23cbd5e1'/%3E%3C/svg%3E";

const EMAIL_PURIFY_CONFIG = {
  WHOLE_DOCUMENT: true,
  RETURN_DOM: false,
  RETURN_DOM_FRAGMENT: false,
  FORCE_BODY: false,
  ALLOWED_URI_REGEXP:
    /^(?:(?:https?|mailto|tel|cid|data|blob):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  FORBID_TAGS: [
    "script",
    "iframe",
    "object",
    "embed",
    "form",
    "input",
    "button",
    "textarea",
    "select",
    "option",
    "frame",
    "frameset",
    "applet",
    "base"
  ],
  FORBID_ATTR: ["srcdoc"],
  ADD_TAGS: ["style"],
  ADD_ATTR: ["target", "rel", "referrerpolicy", "data-mailbox-blocked-src", "data-mailbox-blocked-href"]
};

/** Helper for mailbox client logic. */
export function normalizeMailboxSenderEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Helper for mailbox client logic. */
export function readTrustedMailboxSenders(): Set<string> {
  if (typeof localStorage === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(TRUSTED_SENDERS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === "string").map(normalizeMailboxSenderEmail));
  } catch {
    return new Set();
  }
}

/** Helper for mailbox client logic. */
export function writeTrustedMailboxSenders(senders: Iterable<string>): void {
  if (typeof localStorage === "undefined") return;
  const unique = [...new Set([...senders].map(normalizeMailboxSenderEmail))].sort();
  localStorage.setItem(TRUSTED_SENDERS_STORAGE_KEY, JSON.stringify(unique));
}

/** Helper for mailbox client logic. */
export function isTrustedMailboxSender(email: string, trusted = readTrustedMailboxSenders()): boolean {
  const normalized = normalizeMailboxSenderEmail(email);
  return normalized.length > 0 && trusted.has(normalized);
}

/** Helper for mailbox client logic. */
export function addTrustedMailboxSender(email: string): Set<string> {
  const trusted = readTrustedMailboxSenders();
  trusted.add(normalizeMailboxSenderEmail(email));
  writeTrustedMailboxSenders(trusted);
  return trusted;
}

/** True when the URL would trigger a network fetch to a third-party host. */
export function isRemoteMailboxResourceUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (/^cid:/i.test(trimmed)) return false;
  if (/^data:/i.test(trimmed)) return false;
  if (/^blob:/i.test(trimmed)) return false;
  if (/^mailto:/i.test(trimmed)) return false;
  if (/^tel:/i.test(trimmed)) return false;
  if (/^#/.test(trimmed)) return false;
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (trimmed.startsWith("//")) return true;
  return false;
}

const REMOTE_URL_IN_CSS = /url\(\s*(['"]?)(https?:\/\/|\/\/)[^)'"]+\1\s*\)/gi;

function blockRemoteUrlsInCss(css: string): { css: string; blockedCount: number } {
  let blockedCount = 0;
  const cssOut = css.replace(REMOTE_URL_IN_CSS, () => {
    blockedCount += 1;
    return "url(about:blank)";
  });
  return { css: cssOut, blockedCount };
}

function parseEmailHtmlDocument(html: string): Document {
  const parser = new DOMParser();
  return parser.parseFromString(html, "text/html");
}

function serializeEmailHtmlDocument(doc: Document, original: string): string {
  const serialized = doc.documentElement?.outerHTML ?? "";
  if (!serialized) return original;
  if (/^<!DOCTYPE\s+html/i.test(original.trim())) {
    return `<!DOCTYPE html>${serialized}`;
  }
  return serialized;
}

function countRemoteResourcesInDocument(doc: Document): number {
  let count = 0;

  for (const img of doc.querySelectorAll("img[src]")) {
    const src = img.getAttribute("src");
    if (src && isRemoteMailboxResourceUrl(src)) count += 1;
  }

  for (const el of doc.querySelectorAll("[style]")) {
    const style = el.getAttribute("style");
    if (style && REMOTE_URL_IN_CSS.test(style)) count += 1;
    REMOTE_URL_IN_CSS.lastIndex = 0;
  }

  for (const styleEl of doc.querySelectorAll("style")) {
    const css = styleEl.textContent ?? "";
    if (REMOTE_URL_IN_CSS.test(css)) count += 1;
    REMOTE_URL_IN_CSS.lastIndex = 0;
  }

  for (const link of doc.querySelectorAll('link[href][rel~="stylesheet"], link[href][rel="stylesheet"]')) {
    const href = link.getAttribute("href");
    if (href && isRemoteMailboxResourceUrl(href)) count += 1;
  }

  for (const media of doc.querySelectorAll("video[src], audio[src], source[src], video[poster]")) {
    const attr = media.hasAttribute("poster") ? "poster" : "src";
    const value = media.getAttribute(attr);
    if (value && isRemoteMailboxResourceUrl(value)) count += 1;
  }

  return count;
}

function blockRemoteResourcesInDocument(doc: Document): number {
  let blockedCount = 0;

  for (const img of doc.querySelectorAll("img[src]")) {
    const src = img.getAttribute("src");
    if (src && isRemoteMailboxResourceUrl(src)) {
      img.setAttribute("data-mailbox-blocked-src", src);
      img.setAttribute("src", MAILBOX_BLOCKED_IMAGE_PLACEHOLDER);
      blockedCount += 1;
    }
  }

  for (const el of doc.querySelectorAll("[style]")) {
    const style = el.getAttribute("style");
    if (!style) continue;
    const { css, blockedCount: cssBlocked } = blockRemoteUrlsInCss(style);
    if (cssBlocked > 0) {
      el.setAttribute("style", css);
      blockedCount += cssBlocked;
    }
  }

  for (const styleEl of doc.querySelectorAll("style")) {
    const css = styleEl.textContent ?? "";
    const { css: nextCss, blockedCount: cssBlocked } = blockRemoteUrlsInCss(css);
    if (cssBlocked > 0) {
      styleEl.textContent = nextCss;
      blockedCount += cssBlocked;
    }
  }

  for (const link of doc.querySelectorAll("link[href]")) {
    const href = link.getAttribute("href");
    if (href && isRemoteMailboxResourceUrl(href)) {
      link.setAttribute("data-mailbox-blocked-href", href);
      link.removeAttribute("href");
      blockedCount += 1;
    }
  }

  for (const media of doc.querySelectorAll("video[src], audio[src], source[src]")) {
    const src = media.getAttribute("src");
    if (src && isRemoteMailboxResourceUrl(src)) {
      media.setAttribute("data-mailbox-blocked-src", src);
      media.removeAttribute("src");
      blockedCount += 1;
    }
  }

  for (const video of doc.querySelectorAll("video[poster]")) {
    const poster = video.getAttribute("poster");
    if (poster && isRemoteMailboxResourceUrl(poster)) {
      video.setAttribute("data-mailbox-blocked-src", poster);
      video.removeAttribute("poster");
      blockedCount += 1;
    }
  }

  return blockedCount;
}

/** Strip XSS primitives while keeping typical marketing/newsletter markup. */
export function sanitizeMailboxEmailHtml(html: string): string {
  const trimmed = html.trim();
  if (!trimmed) return trimmed;
  return String(DOMPurify.sanitize(trimmed, EMAIL_PURIFY_CONFIG));
}

/** React component for mailbox UI. */
export type MailboxEmailSecurityResult = {
  html: string;
  blockedRemoteResourceCount: number;
  hasBlockedRemoteResources: boolean;
};

/** Helper for mailbox client logic. */
export function secureMailboxEmailHtml(
  html: string,
  options?: { allowRemoteResources?: boolean }
): MailboxEmailSecurityResult {
  const allowRemoteResources = options?.allowRemoteResources ?? false;
  const sanitized = sanitizeMailboxEmailHtml(html);
  if (!sanitized.trim()) {
    return { html: sanitized, blockedRemoteResourceCount: 0, hasBlockedRemoteResources: false };
  }

  const doc = parseEmailHtmlDocument(sanitized);
  const blockedRemoteResourceCount = allowRemoteResources
    ? countRemoteResourcesInDocument(doc)
    : blockRemoteResourcesInDocument(doc);

  return {
    html: serializeEmailHtmlDocument(doc, sanitized),
    blockedRemoteResourceCount,
    hasBlockedRemoteResources: blockedRemoteResourceCount > 0
  };
}

/** Helper for mailbox client logic. */
export function mailboxEmailContentSecurityPolicy(allowRemoteResources: boolean): string {
  if (allowRemoteResources) {
    return [
      "default-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-src 'none'",
      "object-src 'none'",
      "connect-src 'none'",
      "script-src 'none'",
      "style-src 'unsafe-inline' https: http:",
      "img-src https: http: cid: data:",
      "font-src https: http: data:",
      "media-src https: http: cid: data:"
    ].join("; ");
  }

  return [
    "default-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "connect-src 'none'",
    "script-src 'none'",
    "style-src 'unsafe-inline'",
    "img-src cid: data:",
    "font-src cid: data:",
    "media-src cid: data:"
  ].join("; ");
}
