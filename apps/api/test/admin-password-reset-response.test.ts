/**
 * Admin password reset response shape — `buildAdminPasswordResetResponse` in `src/lib/admin-password-reset-response.ts`.
 *
 * Asserts dev-only plain password exposure vs production-safe responses.
 */

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { buildAdminPasswordResetResponse } from "../src/lib/admin-password-reset-response.js";

describe("buildAdminPasswordResetResponse", () => {
  const origEnv = process.env.NODE_ENV;
  const origPlain = process.env.ADMIN_PASSWORD_RESET_RETURN_PLAIN;

  afterEach(() => {
    if (origEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = origEnv;
    if (origPlain === undefined) delete process.env.ADMIN_PASSWORD_RESET_RETURN_PLAIN;
    else process.env.ADMIN_PASSWORD_RESET_RETURN_PLAIN = origPlain;
  });

  it("returns plaintext in non-production", () => {
    process.env.NODE_ENV = "development";
    delete process.env.ADMIN_PASSWORD_RESET_RETURN_PLAIN;
    const out = buildAdminPasswordResetResponse("secretpw");
    assert.deepEqual(out, { ok: true, temporaryPassword: "secretpw" });
  });

  it("hides plaintext in production by default", () => {
    process.env.NODE_ENV = "production";
    delete process.env.ADMIN_PASSWORD_RESET_RETURN_PLAIN;
    const out = buildAdminPasswordResetResponse("secretpw");
    assert.equal(out.ok, true);
    assert.ok("passwordReset" in out && out.passwordReset === true);
    assert.ok("message" in out && typeof out.message === "string");
    assert.ok(!("temporaryPassword" in out));
  });

  it("returns plaintext in production when override env is set", () => {
    process.env.NODE_ENV = "production";
    process.env.ADMIN_PASSWORD_RESET_RETURN_PLAIN = "true";
    const out = buildAdminPasswordResetResponse("secretpw");
    assert.deepEqual(out, { ok: true, temporaryPassword: "secretpw" });
  });
});
