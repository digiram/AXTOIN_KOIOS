/**
 * Unit tests for `resolveLogLevel` precedence and defaults.
 *
 * Module under test: `packages/logger/src/index.ts`.
 */

import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { resolveLogLevel } from "../src/index.js";

const keys = ["LOG_LEVEL", "VERBOSE", "NODE_ENV"] as const;

type Snap = Partial<Record<(typeof keys)[number], string | undefined>>;

const pick = (): Snap => {
  const s: Snap = {};
  for (const k of keys) {
    s[k] = process.env[k];
  }
  return s;
};

const apply = (s: Snap) => {
  for (const k of keys) {
    const v = s[k];
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
};

describe("resolveLogLevel", () => {
  let baseline: Snap;

  beforeEach(() => {
    baseline = pick();
  });

  afterEach(() => {
    apply(baseline);
  });

  it("honors explicit LOG_LEVEL when valid", () => {
    delete process.env.VERBOSE;
    delete process.env.NODE_ENV;
    process.env.LOG_LEVEL = "warn";
    assert.equal(resolveLogLevel(), "warn");
  });

  it("VERBOSE=true forces debug when LOG_LEVEL unset", () => {
    delete process.env.LOG_LEVEL;
    process.env.VERBOSE = "true";
    delete process.env.NODE_ENV;
    assert.equal(resolveLogLevel(), "debug");
  });

  it("defaults to debug in non-production when LOG_LEVEL and VERBOSE unset", () => {
    delete process.env.LOG_LEVEL;
    delete process.env.VERBOSE;
    process.env.NODE_ENV = "development";
    assert.equal(resolveLogLevel(), "debug");
  });

  it("defaults to info in production when LOG_LEVEL unset", () => {
    delete process.env.LOG_LEVEL;
    delete process.env.VERBOSE;
    process.env.NODE_ENV = "production";
    assert.equal(resolveLogLevel(), "info");
  });
});
