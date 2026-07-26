/**
 * CORS origin policy — `buildCorsOptions` in `src/lib/cors-config.ts`.
 *
 * Asserts allowlist behavior for `NODE_ENV` and `CORS_ORIGINS`.
 */

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { buildCorsOptions } from "../src/lib/cors-config.js";

describe("buildCorsOptions origin", () => {
  const origNode = process.env.NODE_ENV;
  const origCors = process.env.CORS_ORIGINS;

  afterEach(() => {
    if (origNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = origNode;
    if (origCors === undefined) delete process.env.CORS_ORIGINS;
    else process.env.CORS_ORIGINS = origCors;
  });

  it("denies cross-origin in production when CORS_ORIGINS is unset", () => {
    process.env.NODE_ENV = "production";
    delete process.env.CORS_ORIGINS;
    const o = buildCorsOptions();
    assert.equal(o.origin, false);
  });

  it("denies cross-origin in production when CORS_ORIGINS is only whitespace/commas", () => {
    process.env.NODE_ENV = "production";
    process.env.CORS_ORIGINS = "  , , ";
    const o = buildCorsOptions();
    assert.equal(o.origin, false);
  });

  it("uses allowlist in production when CORS_ORIGINS is set", () => {
    process.env.NODE_ENV = "production";
    process.env.CORS_ORIGINS = "https://app.example";
    const o = buildCorsOptions();
    assert.equal(o.origin, "https://app.example");
  });

  it("reflects request origin in non-production when CORS_ORIGINS is unset", () => {
    process.env.NODE_ENV = "development";
    delete process.env.CORS_ORIGINS;
    const o = buildCorsOptions();
    assert.equal(o.origin, true);
  });
});
