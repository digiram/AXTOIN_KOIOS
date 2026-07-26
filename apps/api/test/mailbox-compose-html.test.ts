/**
 * Mailbox compose HTML sanitization — `sanitizeMailboxComposeHtml` in `src/lib/mailbox-compose-html.ts`.
 *
 * Asserts allowed tags/attributes and stripping of unsafe markup.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sanitizeMailboxComposeHtml } from "../src/lib/mailbox-compose-html.js";

describe("sanitizeMailboxComposeHtml", () => {
  it("strips script tags and javascript: links", () => {
    const out = sanitizeMailboxComposeHtml(
      '<p>Hi</p><script>alert(1)</script><a href="javascript:alert(1)">x</a>'
    );
    assert.ok(out);
    assert.ok(!out.includes("<script"));
    assert.ok(!out.includes("javascript:"));
    assert.ok(out.includes("Hi"));
  });

  it("returns null for empty input", () => {
    assert.equal(sanitizeMailboxComposeHtml(""), null);
    assert.equal(sanitizeMailboxComposeHtml("   "), null);
  });
});
