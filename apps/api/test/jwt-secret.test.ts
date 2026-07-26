/**
 * JWT access secret resolution — `resolveJwtAccessSecret` in `src/lib/jwt-secret.ts`.
 *
 * Asserts minimum length, env fallbacks, and production boot requirements.
 */

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { JWT_ACCESS_SECRET_MIN_LENGTH, resolveJwtAccessSecret } from "../src/lib/jwt-secret.js";

describe("resolveJwtAccessSecret", () => {
  const orig = process.env.JWT_ACCESS_SECRET;
  const origNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (orig === undefined) delete process.env.JWT_ACCESS_SECRET;
    else process.env.JWT_ACCESS_SECRET = orig;
    if (origNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = origNodeEnv;
  });

  it("throws in production when secret is missing", () => {
    process.env.NODE_ENV = "production";
    delete process.env.JWT_ACCESS_SECRET;
    assert.throws(
      () => resolveJwtAccessSecret({ nodeEnv: "production" }),
      /JWT_ACCESS_SECRET must be set/
    );
  });

  it("throws in production when secret is too short", () => {
    process.env.NODE_ENV = "production";
    process.env.JWT_ACCESS_SECRET = "x".repeat(JWT_ACCESS_SECRET_MIN_LENGTH - 1);
    assert.throws(
      () => resolveJwtAccessSecret({ nodeEnv: "production" }),
      /JWT_ACCESS_SECRET must be set/
    );
  });

  it("returns trimmed secret in production when long enough", () => {
    process.env.NODE_ENV = "production";
    const s = "p".repeat(JWT_ACCESS_SECRET_MIN_LENGTH);
    process.env.JWT_ACCESS_SECRET = `  ${s}  `;
    assert.equal(resolveJwtAccessSecret({ nodeEnv: "production" }), s);
  });

  it("returns dev fallback in non-production when unset", () => {
    process.env.NODE_ENV = "development";
    delete process.env.JWT_ACCESS_SECRET;
    assert.equal(resolveJwtAccessSecret({ nodeEnv: "development" }), "dev-access-secret");
  });
});
