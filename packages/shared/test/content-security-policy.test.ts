/**
 * Tests for CSP mode resolution and directive serialization.
 *
 * Asserts meta-only production mode and Hostinger-safe header behavior.
 *
 * Under test: `../src/content-security-policy.js`
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  apiHttpContentSecurityPolicy,
  cspHttpHeaderBytes,
  metaContentSecurityPolicy,
  resolveCspMode,
  securityHeaders,
  shouldUseMetaCspOnly,
  STRIPE_CSP_HOSTS
} from "../src/content-security-policy.js";

describe("shouldUseMetaCspOnly", () => {
  const origNodeEnv = process.env.NODE_ENV;
  const origCspInMeta = process.env.CSP_IN_META;

  afterEach(() => {
    if (origNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = origNodeEnv;
    if (origCspInMeta === undefined) delete process.env.CSP_IN_META;
    else process.env.CSP_IN_META = origCspInMeta;
  });

  it("returns false in development", () => {
    assert.equal(shouldUseMetaCspOnly({ nodeEnv: "development" }), false);
  });

  it("returns true in production by default", () => {
    assert.equal(shouldUseMetaCspOnly({ nodeEnv: "production" }), true);
  });

  it("returns false in production when CSP_IN_META=off", () => {
    assert.equal(shouldUseMetaCspOnly({ nodeEnv: "production", cspInMeta: "off" }), false);
    assert.equal(shouldUseMetaCspOnly({ nodeEnv: "production", cspInMeta: "false" }), false);
  });
});

describe("metaContentSecurityPolicy", () => {
  it("builds a compact web policy without wildcards or frame-ancestors", () => {
    const csp = metaContentSecurityPolicy();
    assert.ok(csp.startsWith("default-src 'self'"));
    assert.ok(csp.includes("script-src 'self' 'unsafe-inline'"));
    assert.ok(csp.includes("style-src 'self' 'unsafe-inline'"));
    assert.ok(csp.includes("img-src 'self' data: blob:"));
    assert.ok(csp.includes("connect-src 'self'"));
    assert.ok(csp.includes("js.stripe.com"));
    assert.ok(!csp.includes("frame-ancestors"));
    assert.ok(!csp.includes("https:"));
    assert.ok(!csp.includes("*"));
    assert.ok(!csp.includes("; "));
  });

  it("omits unsafe-inline from script-src when strictScriptSrc is set", () => {
    const csp = metaContentSecurityPolicy({ strictScriptSrc: true });
    assert.match(csp, /script-src 'self' js\.stripe\.com/);
    assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
    assert.ok(csp.includes("style-src 'self' 'unsafe-inline'"));
  });

  it("adds extra connect-src hosts without duplicating 'self'", () => {
    const csp = metaContentSecurityPolicy({ connectSrcHosts: ["api.example.com", "api.example.com"] });
    assert.ok(csp.includes("connect-src 'self' api.stripe.com api.example.com"));
  });
});

describe("securityHeaders", () => {
  it("omits CSP in meta-only production mode", () => {
    const headers = securityHeaders({ nodeEnv: "production" });
    assert.equal(headers["Content-Security-Policy"], undefined);
    assert.equal(headers["X-Frame-Options"], "DENY");
    assert.equal(headers["Strict-Transport-Security"], "max-age=31536000; includeSubDomains");
  });

  it("includes API CSP in development", () => {
    const headers = securityHeaders({ nodeEnv: "development", surface: "api" });
    assert.equal(headers["Content-Security-Policy"], apiHttpContentSecurityPolicy());
    assert.equal(headers["Strict-Transport-Security"], undefined);
  });

  it("includes web CSP when opted out of meta-only", () => {
    const headers = securityHeaders({
      nodeEnv: "production",
      cspInMeta: "off",
      surface: "web"
    });
    assert.equal(headers["Content-Security-Policy"], metaContentSecurityPolicy());
  });

  it("reports zero CSP header bytes in meta-only mode", () => {
    assert.equal(cspHttpHeaderBytes({ nodeEnv: "production" }), 0);
    assert.ok(cspHttpHeaderBytes({ nodeEnv: "development", surface: "api" }) > 0);
  });

  it("exposes csp mode labels", () => {
    assert.equal(resolveCspMode({ nodeEnv: "production" }), "meta-only");
    assert.equal(resolveCspMode({ nodeEnv: "production", cspInMeta: "off" }), "http-header");
  });

  it("includes Stripe frame hosts in meta policy only via frame-src", () => {
    const csp = metaContentSecurityPolicy();
    for (const host of STRIPE_CSP_HOSTS.frameSrc) {
      assert.ok(csp.includes(host));
    }
  });
});
