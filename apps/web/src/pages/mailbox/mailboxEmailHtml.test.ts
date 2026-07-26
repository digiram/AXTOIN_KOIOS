/**
 * Mailbox Email Html.
 *
 * Unit tests for mailbox Email Html behavior in the mailbox module.
 *
 * Responsibilities:
 * - Assert edge cases and regressions for mailboxEmailHtml
 * - Document expected inputs and outputs via test names
 *
 * Related:
 * - mailboxEmailHtml.ts(x)
 */
// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import {
  prepareMailboxEmailForIframe,
  rewriteEmailLinksToOpenInNewTab
} from "./mailboxEmailHtml.js";
import {
  isRemoteMailboxResourceUrl,
  secureMailboxEmailHtml,
  sanitizeMailboxEmailHtml
} from "./mailboxEmailSecurity.js";

describe("mailboxEmailHtml", () => {
  it("rewrites anchor tags to open in a new tab", () => {
    const html = '<p>Hi <a href="https://example.com">click</a></p>';
    const out = rewriteEmailLinksToOpenInNewTab(html);
    expect(out).toContain('target="_blank"');
    expect(out).toContain("noopener");
    expect(out).toContain("noreferrer");
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('referrerpolicy="no-referrer"');
  });

  it("merges rel on anchors that already have rel", () => {
    const html = '<a href="/x" rel="nofollow">x</a>';
    const out = rewriteEmailLinksToOpenInNewTab(html);
    expect(out).toContain('target="_blank"');
    expect(out).toContain("nofollow");
    expect(out).toContain("noopener");
    expect(out).toContain("noreferrer");
  });

  it("injects base target for full HTML documents", () => {
    const html = "<!DOCTYPE html><html><head><title>t</title></head><body></body></html>";
    const out = rewriteEmailLinksToOpenInNewTab(html);
    expect(out).toContain('<base target="_blank">');
  });

  it("wraps fragments with base target in iframe srcdoc", () => {
    const out = prepareMailboxEmailForIframe('<a href="https://a.test">go</a>').srcDoc;
    expect(out).toContain("<base target=\"_blank\">");
    expect(out).toContain('target="_blank"');
    expect(out).toContain("Content-Security-Policy");
  });
});

describe("mailboxEmailSecurity", () => {
  it("detects remote resource URLs", () => {
    expect(isRemoteMailboxResourceUrl("https://tracker.example/pixel.gif")).toBe(true);
    expect(isRemoteMailboxResourceUrl("//cdn.example/logo.png")).toBe(true);
    expect(isRemoteMailboxResourceUrl("cid:abc@mail")).toBe(false);
    expect(isRemoteMailboxResourceUrl("data:image/png;base64,abc")).toBe(false);
    expect(isRemoteMailboxResourceUrl("mailto:a@b.test")).toBe(false);
  });

  it("strips script tags and inline event handlers", () => {
    const out = sanitizeMailboxEmailHtml('<p onclick="alert(1)">Hi</p><script>alert(1)</script>');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("onclick");
    expect(out).toContain("Hi");
  });

  it("strips meta refresh redirects", () => {
    const out = sanitizeMailboxEmailHtml(
      '<html><head><meta http-equiv="refresh" content="0;url=https://evil.test"></head><body>Hi</body></html>'
    );
    expect(out.toLowerCase()).not.toContain("http-equiv");
    expect(out).toContain("Hi");
  });

  it("blocks remote images by default", () => {
    const out = secureMailboxEmailHtml('<img src="https://evil.test/track.png" alt="x">');
    expect(out.html).toContain('data-mailbox-blocked-src="https://evil.test/track.png"');
    expect(out.html).toMatch(/<img[^>]+src="data:image\/svg\+xml/);
    expect(out.blockedRemoteResourceCount).toBe(1);
    expect(out.hasBlockedRemoteResources).toBe(true);
  });

  it("allows remote images when explicitly enabled", () => {
    const out = secureMailboxEmailHtml('<img src="https://cdn.test/logo.png" alt="logo">', {
      allowRemoteResources: true
    });
    expect(out.html).toContain("https://cdn.test/logo.png");
    expect(out.hasBlockedRemoteResources).toBe(true);
  });

  it("injects a restrictive CSP into iframe srcdoc", () => {
    const out = prepareMailboxEmailForIframe('<p>Hello</p>', { allowRemoteResources: false });
    expect(out.srcDoc).toContain("Content-Security-Policy");
    expect(out.srcDoc).toContain("script-src 'none'");
    expect(out.srcDoc).toContain("img-src cid: data:");
  });
});
