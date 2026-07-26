/**
 * Tests for registration email domain extraction and consumer provider detection.
 *
 * Under test: `../src/email-domain.js`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  extractEmailDomain,
  isConsumerEmailProviderDomain,
  normalizeRegistrationEmail
} from "../src/email-domain.js";

describe("email-domain", () => {
  it("normalizeRegistrationEmail trims and lowercases", () => {
    assert.equal(normalizeRegistrationEmail("  User@Example.COM  "), "user@example.com");
  });

  it("extractEmailDomain returns lowercased host or null", () => {
    assert.equal(extractEmailDomain("user@Example.COM"), "example.com");
    assert.equal(extractEmailDomain("bad"), null);
    assert.equal(extractEmailDomain("@only.com"), null);
    assert.equal(extractEmailDomain("only@"), null);
  });

  it("isConsumerEmailProviderDomain matches known providers", () => {
    assert.equal(isConsumerEmailProviderDomain("gmail.com"), true);
    assert.equal(isConsumerEmailProviderDomain("GMAIL.COM"), true);
    assert.equal(isConsumerEmailProviderDomain("acme.corp"), false);
  });
});
