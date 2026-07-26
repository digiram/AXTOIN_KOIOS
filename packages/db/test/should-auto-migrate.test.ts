/**
 * AUTO_MIGRATE policy — development always migrates on boot.
 */

import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import { isDevelopmentNodeEnv, shouldAutoMigrate } from "../src/migrate.js";

describe("shouldAutoMigrate", () => {
  const keys = ["NODE_ENV", "AUTO_MIGRATE"] as const;
  const snapshot: Partial<Record<(typeof keys)[number], string | undefined>> = {};

  afterEach(() => {
    for (const k of keys) {
      if (snapshot[k] === undefined) delete process.env[k];
      else process.env[k] = snapshot[k];
    }
  });

  const save = () => {
    for (const k of keys) snapshot[k] = process.env[k];
  };

  it("always migrates in development even when AUTO_MIGRATE=off", () => {
    save();
    process.env.NODE_ENV = "development";
    process.env.AUTO_MIGRATE = "off";
    assert.equal(shouldAutoMigrate(), true);
  });

  it("always migrates when NODE_ENV is unset (defaults to development)", () => {
    save();
    delete process.env.NODE_ENV;
    process.env.AUTO_MIGRATE = "off";
    assert.equal(isDevelopmentNodeEnv(), true);
    assert.equal(shouldAutoMigrate(), true);
  });

  it("does not migrate in production unless AUTO_MIGRATE=force", () => {
    save();
    process.env.NODE_ENV = "production";
    delete process.env.AUTO_MIGRATE;
    assert.equal(shouldAutoMigrate(), false);
    process.env.AUTO_MIGRATE = "force";
    assert.equal(shouldAutoMigrate(), true);
  });

  it("respects AUTO_MIGRATE=off in test environment", () => {
    save();
    process.env.NODE_ENV = "test";
    process.env.AUTO_MIGRATE = "off";
    assert.equal(shouldAutoMigrate(), false);
  });
});
