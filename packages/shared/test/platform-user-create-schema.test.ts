/**
 * Tests for super-admin user creation request validation.
 *
 * Under test: `../src/platform-users.js`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { platformUserCreateBodySchema } from "../src/platform-users.js";

describe("platformUserCreateBodySchema", () => {
  it("accepts existing tenant by id", () => {
    const r = platformUserCreateBodySchema.safeParse({
      email: "user@acme.com",
      tenantId: "11111111-1111-1111-1111-111111111111"
    });
    assert.equal(r.success, true);
  });

  it("accepts new tenant by name", () => {
    const r = platformUserCreateBodySchema.safeParse({
      email: "user@acme.com",
      tenantName: "acme.com",
      role: "tenant_admin"
    });
    assert.equal(r.success, true);
  });

  it("rejects both tenantId and tenantName", () => {
    const r = platformUserCreateBodySchema.safeParse({
      email: "user@acme.com",
      tenantId: "11111111-1111-1111-1111-111111111111",
      tenantName: "acme.com"
    });
    assert.equal(r.success, false);
  });

  it("rejects neither tenantId nor tenantName", () => {
    const r = platformUserCreateBodySchema.safeParse({
      email: "user@acme.com"
    });
    assert.equal(r.success, false);
  });
});
