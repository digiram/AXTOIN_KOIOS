/**
 * Refresh token hashing — `hashRefreshToken` in `src/lib/tokens.ts`.
 *
 * Asserts deterministic SHA-256 digests for stored refresh tokens.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { hashRefreshToken } from "../src/lib/tokens.js";

describe("hashRefreshToken", () => {
  it("returns stable hex sha256 for utf8 input", () => {
    const a = hashRefreshToken("opaque-refresh");
    const b = hashRefreshToken("opaque-refresh");
    assert.equal(a, b);
    assert.match(a, /^[a-f0-9]{64}$/);
  });

  it("differs for different plaintext", () => {
    assert.notEqual(hashRefreshToken("a"), hashRefreshToken("b"));
  });
});
