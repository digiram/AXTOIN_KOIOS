/**
 * Mailbox Email Html.
 *
 * Prepare mailbox message HTML for sandboxed iframe preview so email CSS
 * (global selectors, style tags, linked sheets) cannot affect the host app.
 * All hyperlinks open in a new browser tab, not inside the preview iframe.
 *
 * Responsibilities:
 * - Sanitize and rewrite message HTML before iframe srcDoc assignment
 * - Inject strict CSP and optional viewport fill for inbox preview panes
 * - Delegate DOMPurify sanitization to mailboxEmailSecurity helpers
 *
 * Related:
 * - mailboxEmailSecurity.ts
 * - MailboxInboxPage.tsx
 *
 * Security:
 * - HTML is sanitized (DOMPurify); remote images/CSS blocked by default
 * - Strict CSP is injected into the preview document
 */
import {
  mailboxEmailContentSecurityPolicy,
  secureMailboxEmailHtml,
  type MailboxEmailSecurityResult
} from "./mailboxEmailSecurity.js";

const OPEN_NEW_TAB_REL = "noopener noreferrer nofollow";

const mergeRelAttribute = (existing: string): string => {
  const tokens = new Set(existing.split(/\s+/).filter(Boolean));
  tokens.add("noopener");
  tokens.add("noreferrer");
  tokens.add("nofollow");
  return [...tokens].join(" ");
};

const rewriteAnchorAttributes = (attrs: string): string => {
  let next = attrs;

  if (/\btarget\s*=/i.test(next)) {
    next = next.replace(/\btarget\s*=\s*(["'])[^"']*\1/i, 'target="_blank"');
    next = next.replace(/\btarget\s*=\s*[^\s>]+/i, 'target="_blank"');
  } else {
    next += ' target="_blank"';
  }

  if (/\brel\s*=/i.test(next)) {
    next = next.replace(/\brel\s*=\s*(["'])([^"']*)\1/i, (_, __, rel) => `rel="${mergeRelAttribute(rel)}"`);
  } else {
    next += ` rel="${OPEN_NEW_TAB_REL}"`;
  }

  if (/\breferrerpolicy\s*=/i.test(next)) {
    next = next.replace(/\breferrerpolicy\s*=\s*(["'])[^"']*\1/i, 'referrerpolicy="no-referrer"');
    next = next.replace(/\breferrerpolicy\s*=\s*[^\s>]+/i, 'referrerpolicy="no-referrer"');
  } else {
    next += ' referrerpolicy="no-referrer"';
  }

  return next;
};

/** Rewrites `<a href>` tags and injects `<base target="_blank">` where applicable. */
export function rewriteEmailLinksToOpenInNewTab(html: string): string {
  const withAnchors = html.replace(
    /<a\b([^>]*?)>/gi,
    (_, attrs) => `<a${rewriteAnchorAttributes(attrs)}>`
  );
  return injectBaseTargetBlank(withAnchors);
}

function injectBaseTargetBlank(html: string): string {
  if (/<base\b/i.test(html)) {
    return html.replace(/<base\b([^>]*?)(\s*\/?)>/i, (_, attrs, close) => {
      let nextAttrs = attrs;
      if (/\btarget\s*=/i.test(nextAttrs)) {
        nextAttrs = nextAttrs.replace(/\btarget\s*=\s*(["'])[^"']*\1/i, 'target="_blank"');
        nextAttrs = nextAttrs.replace(/\btarget\s*=\s*[^\s>]+/i, 'target="_blank"');
      } else {
        nextAttrs += ' target="_blank"';
      }
      return `<base${nextAttrs}${close}>`;
    });
  }

  if (/<head[\s>]/i.test(html)) {
    return html.replace(/<head(\s[^>]*)?>/i, (match) => `${match}\n<base target="_blank">`);
  }

  if (/<html[\s>]/i.test(html)) {
    return html.replace(/<html(\s[^>]*)?>/i, (match) => `${match}\n<head><base target="_blank"></head>`);
  }

  return html;
}

function injectContentSecurityPolicy(html: string, allowRemoteResources: boolean): string {
  const csp = mailboxEmailContentSecurityPolicy(allowRemoteResources);
  const meta = `<meta http-equiv="Content-Security-Policy" content="${csp}">`;

  if (/<head[\s>]/i.test(html)) {
    return html.replace(/<head(\s[^>]*)?>/i, (match) => `${match}\n${meta}`);
  }

  if (/<html[\s>]/i.test(html)) {
    return html.replace(/<html(\s[^>]*)?>/i, (match) => `${match}\n<head>${meta}</head>`);
  }

  return html;
}

/** Options for building a sandboxed mailbox message iframe document. */
export type MailboxEmailIframeOptions = {
  fillViewport?: boolean;
  allowRemoteResources?: boolean;
};

/** Sanitized HTML plus srcDoc string ready for iframe rendering. */
export type MailboxEmailIframeResult = MailboxEmailSecurityResult & {
  srcDoc: string;
};

/** Sanitizes message HTML, rewrites links, injects CSP, and returns iframe srcDoc. */
export function prepareMailboxEmailForIframe(
  bodyHtml: string,
  options?: MailboxEmailIframeOptions
): MailboxEmailIframeResult {
  const fillViewport = options?.fillViewport ?? false;
  const allowRemoteResources = options?.allowRemoteResources ?? false;
  const secured = secureMailboxEmailHtml(bodyHtml, { allowRemoteResources });
  const safeHtml = rewriteEmailLinksToOpenInNewTab(secured.html);

  const viewportStyles = fillViewport
    ? "html, body { margin: 0; padding: 0; height: 100%; overflow: auto; background: transparent; }"
    : "html, body { margin: 0; padding: 0; background: transparent; }";

  const trimmed = safeHtml.trim();
  if (!trimmed) {
    return {
      ...secured,
      srcDoc: "<!DOCTYPE html><html><head><meta charset=\"utf-8\"/></head><body></body></html>"
    };
  }

  let srcDoc: string;
  if (/^<!DOCTYPE\s+html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed)) {
    srcDoc = trimmed;
  } else {
    srcDoc = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<base target="_blank">
<style>
  ${viewportStyles}
  img { max-width: 100%; height: auto; }
</style>
</head>
<body>${trimmed}</body>
</html>`;
  }

  srcDoc = injectContentSecurityPolicy(srcDoc, allowRemoteResources);

  return {
    ...secured,
    srcDoc
  };
}
