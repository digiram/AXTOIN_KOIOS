/**
 * Tests for SMTP test endpoint request body schema.
 *
 * Under test: `../src/mail-smtp-test.js`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mailSmtpTestBodySchema } from "../src/mail-smtp-test.js";

describe("mailSmtpTestBodySchema", () => {
  it("accepts a valid recipient email", () => {
    const r = mailSmtpTestBodySchema.safeParse({ to: "ops@example.com" });
    assert.equal(r.success, true);
  });

  it("rejects invalid recipient email", () => {
    assert.equal(mailSmtpTestBodySchema.safeParse({ to: "not-an-email" }).success, false);
  });
});
