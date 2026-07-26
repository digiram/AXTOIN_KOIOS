/**
 * Tests for tenant realm settings PATCH validation.
 *
 * Under test: `../src/tenant-realm-settings.js`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  tenantRealmGeneralPutBodySchema,
  tenantSelfRegistrationQuerySchema
} from "../src/tenant-realm-settings.js";

describe("tenantRealmGeneralPutBodySchema", () => {
  it("accepts realm self-register flag", () => {
    const r = tenantRealmGeneralPutBodySchema.safeParse({ realmSelfRegisterEnabled: false });
    assert.equal(r.success, true);
  });

  it("accepts MFA enforced flag alone", () => {
    const r = tenantRealmGeneralPutBodySchema.safeParse({ mfaEnforced: true });
    assert.equal(r.success, true);
  });

  it("rejects missing flags", () => {
    assert.equal(tenantRealmGeneralPutBodySchema.safeParse({}).success, false);
  });
});

describe("tenantSelfRegistrationQuerySchema", () => {
  it("parses empty query", () => {
    const r = tenantSelfRegistrationQuerySchema.safeParse({});
    assert.equal(r.success, true);
    assert.equal(r.data.email, undefined);
  });

  it("parses valid email", () => {
    const r = tenantSelfRegistrationQuerySchema.safeParse({ email: "a@example.com" });
    assert.equal(r.success, true);
    assert.equal(r.data.email, "a@example.com");
  });

  it("rejects invalid email", () => {
    assert.equal(tenantSelfRegistrationQuerySchema.safeParse({ email: "not-an-email" }).success, false);
  });
});
