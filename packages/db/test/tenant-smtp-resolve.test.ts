/**
 * Tenant SMTP readiness — `isTenantSmtpConfigured` in `src/mail-repos.ts`.
 *
 * Asserts required SMTP fields for outbound tenant mail.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isTenantSmtpConfigured, type TenantSmtpRow } from "../src/mail-repos.js";

const baseRow = (overrides: Partial<TenantSmtpRow> = {}): TenantSmtpRow => ({
  tenantId: "00000000-0000-0000-0000-000000000099",
  host: "",
  port: 587,
  secure: false,
  username: null,
  passwordEncrypted: null,
  fromName: "",
  fromEmail: "",
  smtpEnabled: true,
  updatedAt: new Date(),
  ...overrides
});

describe("isTenantSmtpConfigured", () => {
  it("returns false when row is undefined", () => {
    assert.equal(isTenantSmtpConfigured(undefined), false);
  });

  it("returns false when host or from email is empty", () => {
    assert.equal(isTenantSmtpConfigured(baseRow({ host: "smtp.example.com" })), false);
    assert.equal(isTenantSmtpConfigured(baseRow({ fromEmail: "noreply@example.com" })), false);
    assert.equal(isTenantSmtpConfigured(baseRow()), false);
  });

  it("returns true when host and from email are both set", () => {
    assert.equal(
      isTenantSmtpConfigured(
        baseRow({ host: "smtp.example.com", fromEmail: "noreply@example.com" })
      ),
      true
    );
  });

  it("ignores surrounding whitespace", () => {
    assert.equal(
      isTenantSmtpConfigured(
        baseRow({ host: "  ", fromEmail: "noreply@example.com" })
      ),
      false
    );
    assert.equal(
      isTenantSmtpConfigured(
        baseRow({ host: "smtp.example.com", fromEmail: "  " })
      ),
      false
    );
  });
});
