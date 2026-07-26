/**
 * Auth lookup key fallbacks — `src/tenant-name-at-rest.ts` and `src/user-email-at-rest.ts`.
 *
 * Asserts HMAC lookup keys vs plaintext dev fallbacks for tenant/user resolution.
 */

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { afterEach, describe, it } from "node:test";

import { computeTenantNameLookupKey, plaintextTenantNameLookupKey } from "../src/tenant-name-at-rest.js";
import {
  identityKeyForRealmUser,
  plaintextIdentityKey
} from "../src/user-email-at-rest.js";

const TEST_KEY_B64 = Buffer.alloc(32, 7).toString("base64");

describe("auth lookup key fallbacks", () => {
  afterEach(() => {
    delete process.env.FIELD_ENCRYPTION_KEY;
  });

  it("HMAC tenant lookup differs from plaintext legacy key when encryption is enabled", () => {
    process.env.FIELD_ENCRYPTION_KEY = TEST_KEY_B64;
    const hmacKey = computeTenantNameLookupKey("company.com");
    const plainKey = plaintextTenantNameLookupKey("company.com");
    assert.notEqual(hmacKey, plainKey);
    assert.equal(plainKey, "company.com");
  });

  it("HMAC realm identity key differs from plaintext legacy key when encryption is enabled", () => {
    process.env.FIELD_ENCRYPTION_KEY = TEST_KEY_B64;
    const tenantId = "tenant-abc";
    const email = "ramli@company.com";
    const hmacKey = identityKeyForRealmUser(tenantId, email, TEST_KEY_B64);
    const plainKey = plaintextIdentityKey(tenantId, email);
    assert.notEqual(hmacKey, plainKey);
    assert.equal(plainKey, `${tenantId}:${email}`);
    assert.match(hmacKey, new RegExp(`^${tenantId}:[0-9a-f]{64}$`));
  });

  it("plaintext tenant lookup matches computeTenantNameLookupKey when encryption is disabled", () => {
    const plainKey = plaintextTenantNameLookupKey("Company.COM");
    assert.equal(computeTenantNameLookupKey("Company.COM"), plainKey);
    assert.equal(plainKey, "company.com");
  });

  it("tenant HMAC is stable for the same realm name and key", () => {
    process.env.FIELD_ENCRYPTION_KEY = TEST_KEY_B64;
    const expected = createHmac("sha256", Buffer.from(TEST_KEY_B64, "base64"))
      .update("tenant_name\ncompany.com")
      .digest("hex");
    assert.equal(computeTenantNameLookupKey("company.com"), expected);
  });
});
