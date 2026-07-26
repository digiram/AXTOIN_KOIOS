/**
 * Response header byte budget — `src/lib/response-header-budget.ts` and Helmet wiring.
 *
 * Asserts Hostinger-safe header size limits and CSP placement policy.
 */

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import helmet from "@fastify/helmet";
import Fastify from "fastify";

import { API_CSP_DIRECTIVES } from "@starter/shared";

import { buildHelmetOptions } from "../src/lib/helmet-config.js";
import {
  createResponseHeaderBudgetHook,
  DEFAULT_RESPONSE_HEADER_MAX_BYTES,
  measureResponseHeaderBytes,
  resolveResponseHeaderMaxBytes
} from "../src/lib/response-header-budget.js";

describe("resolveResponseHeaderMaxBytes", () => {
  const orig = process.env.RESPONSE_HEADER_MAX_BYTES;
  afterEach(() => {
    if (orig === undefined) delete process.env.RESPONSE_HEADER_MAX_BYTES;
    else process.env.RESPONSE_HEADER_MAX_BYTES = orig;
  });

  it("falls back to the default when unset", () => {
    assert.equal(resolveResponseHeaderMaxBytes(undefined), DEFAULT_RESPONSE_HEADER_MAX_BYTES);
  });

  it("parses a valid override", () => {
    assert.equal(resolveResponseHeaderMaxBytes("4096"), 4096);
  });

  it("ignores invalid or below-floor values", () => {
    assert.equal(resolveResponseHeaderMaxBytes("not-a-number"), DEFAULT_RESPONSE_HEADER_MAX_BYTES);
    assert.equal(resolveResponseHeaderMaxBytes("16"), DEFAULT_RESPONSE_HEADER_MAX_BYTES);
  });
});

describe("measureResponseHeaderBytes", () => {
  it("sums header line bytes and reports the largest header", () => {
    const { totalBytes, largest } = measureResponseHeaderBytes({
      "content-type": "application/json",
      "content-security-policy": "default-src 'none'"
    });
    assert.equal(totalBytes, 32 + 45);
    assert.equal(largest?.name, "content-security-policy");
  });

  it("counts array values (e.g. set-cookie) as one line each", () => {
    const { totalBytes } = measureResponseHeaderBytes({
      "set-cookie": ["a=1", "b=2"]
    });
    assert.equal(totalBytes, 17 * 2);
  });

  it("ignores undefined header values", () => {
    const { totalBytes } = measureResponseHeaderBytes({ "x-missing": undefined });
    assert.equal(totalBytes, 0);
  });
});

describe("API response header budget (guard)", () => {
  it("omits CSP HTTP header in production meta-only mode (Hostinger)", async () => {
    const origNodeEnv = process.env.NODE_ENV;
    const origCspInMeta = process.env.CSP_IN_META;
    process.env.NODE_ENV = "production";
    delete process.env.CSP_IN_META;

    const prodApp = Fastify({ logger: false });
    prodApp.addHook("onSend", createResponseHeaderBudgetHook());

    try {
      await prodApp.register(helmet, buildHelmetOptions());
      prodApp.get("/health", async () => ({ status: "ok" }));
      await prodApp.ready();

      const res = await prodApp.inject({ method: "GET", url: "/health" });
      assert.equal(res.statusCode, 200);
      assert.equal(res.headers["content-security-policy"], undefined);
      assert.equal(res.headers["x-frame-options"], "DENY");

      const { totalBytes } = measureResponseHeaderBytes(
        res.headers as Record<string, string | string[] | number | undefined>
      );
      assert.ok(totalBytes < 1536, `Response headers unexpectedly large (${String(totalBytes)} bytes)`);
    } finally {
      await prodApp.close();
      if (origNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = origNodeEnv;
      if (origCspInMeta === undefined) delete process.env.CSP_IN_META;
      else process.env.CSP_IN_META = origCspInMeta;
    }
  });

  it("serves a compact CSP in development and keeps headers within budget", async () => {
    const origNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";

    const devApp = Fastify({ logger: false });
    devApp.addHook("onSend", createResponseHeaderBudgetHook());

    try {
      await devApp.register(helmet, buildHelmetOptions());
      devApp.get("/health", async () => ({ status: "ok" }));
      await devApp.ready();

      const res = await devApp.inject({ method: "GET", url: "/health" });
      assert.equal(res.statusCode, 200);

      const csp = res.headers["content-security-policy"];
      assert.equal(typeof csp, "string");
      assert.ok((csp as string).includes("default-src 'none'"));
      assert.ok(!(csp as string).includes("upgrade-insecure-requests"));
      assert.ok(
        (csp as string).length < 256,
        `CSP unexpectedly large (${String((csp as string).length)} chars): ${csp as string}`
      );

      const { totalBytes } = measureResponseHeaderBytes(
        res.headers as Record<string, string | string[] | number | undefined>
      );
      assert.ok(totalBytes < 1536, `Response headers exceed lean baseline (${String(totalBytes)} bytes)`);
    } finally {
      await devApp.close();
      if (origNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = origNodeEnv;
    }
  });

  it("exposes a compact CSP directive set (no https: wildcards / upgrade-insecure-requests)", () => {
    const serialized = Object.values(API_CSP_DIRECTIVES).flat().join(" ");
    assert.ok(!serialized.includes("https:"));
    assert.ok(!serialized.includes("upgrade-insecure-requests"));
  });
});
