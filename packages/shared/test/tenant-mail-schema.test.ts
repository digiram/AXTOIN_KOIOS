/**
 * Tests for tenant outbound mail settings schemas.
 *
 * Under test: `../src/tenant-mail.js`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { tenantMailSmtpPutBodySchema } from "../src/tenant-mail.js";

describe("tenantMailSmtpPutBodySchema", () => {
  it("allows empty host and from email for platform fallback", () => {
    const r = tenantMailSmtpPutBodySchema.safeParse({
      host: "",
      port: 587,
      secure: false,
      fromName: "",
      fromEmail: "",
      smtpEnabled: true
    });
    assert.equal(r.success, true);
  });

  it("requires valid from email when host is set", () => {
    assert.equal(
      tenantMailSmtpPutBodySchema.safeParse({
        host: "smtp.example.com",
        port: 587,
        secure: false,
        fromName: "Acme",
        fromEmail: "",
        smtpEnabled: true
      }).success,
      false
    );
    assert.equal(
      tenantMailSmtpPutBodySchema.safeParse({
        host: "smtp.example.com",
        port: 587,
        secure: false,
        fromName: "Acme",
        fromEmail: "not-an-email",
        smtpEnabled: true
      }).success,
      false
    );
    assert.equal(
      tenantMailSmtpPutBodySchema.safeParse({
        host: "smtp.example.com",
        port: 587,
        secure: false,
        fromName: "Acme",
        fromEmail: "billing@acme.com",
        smtpEnabled: true
      }).success,
      true
    );
  });
});
