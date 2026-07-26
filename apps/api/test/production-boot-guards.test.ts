/**
 * Production boot guards — `assertProductionBootConfig` in `src/lib/production-boot-guards.ts`.
 *
 * Asserts unsafe dev defaults are rejected when `NODE_ENV=production`.
 */

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { assertProductionBootConfig } from "../src/lib/production-boot-guards.js";

describe("assertProductionBootConfig", () => {
  const keys = [
    "NODE_ENV",
    "FIELD_ENCRYPTION_KEY",
    "BOOTSTRAP_SUPER_ADMIN_EMAIL",
    "BOOTSTRAP_SUPER_ADMIN_PASSWORD",
    "ALLOW_BOOTSTRAP_SUPER_ADMIN",
    "AUTO_MIGRATE",
    "REFRESH_TOKEN_IN_COOKIE",
    "CORS_CREDENTIALS",
    "CORS_ORIGINS"
  ] as const;

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

  it("no-op in non-production", () => {
    save();
    process.env.NODE_ENV = "development";
    delete process.env.FIELD_ENCRYPTION_KEY;
    assert.doesNotThrow(() => assertProductionBootConfig({ nodeEnv: "development" }));
  });

  it("throws in production when FIELD_ENCRYPTION_KEY is missing", () => {
    save();
    process.env.NODE_ENV = "production";
    delete process.env.FIELD_ENCRYPTION_KEY;
    assert.throws(
      () => assertProductionBootConfig({ nodeEnv: "production" }),
      /FIELD_ENCRYPTION_KEY must be set/
    );
  });

  it("throws in production when FIELD_ENCRYPTION_KEY is not 32 bytes", () => {
    save();
    process.env.NODE_ENV = "production";
    process.env.FIELD_ENCRYPTION_KEY = Buffer.from("short").toString("base64");
    assert.throws(
      () => assertProductionBootConfig({ nodeEnv: "production" }),
      /32 bytes/
    );
  });

  it("throws in production when bootstrap env is set without allow flag", () => {
    save();
    process.env.NODE_ENV = "production";
    process.env.FIELD_ENCRYPTION_KEY = Buffer.alloc(32).toString("base64");
    process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL = "ops@example.com";
    process.env.BOOTSTRAP_SUPER_ADMIN_PASSWORD = "password12";
    delete process.env.ALLOW_BOOTSTRAP_SUPER_ADMIN;
    process.env.REFRESH_TOKEN_IN_COOKIE = "false";
    assert.throws(
      () => assertProductionBootConfig({ nodeEnv: "production" }),
      /ALLOW_BOOTSTRAP_SUPER_ADMIN/
    );
  });

  it("throws in production when AUTO_MIGRATE is an ambiguous truthy value", () => {
    save();
    process.env.NODE_ENV = "production";
    process.env.FIELD_ENCRYPTION_KEY = Buffer.alloc(32).toString("base64");
    process.env.AUTO_MIGRATE = "true";
    process.env.REFRESH_TOKEN_IN_COOKIE = "false";
    assert.throws(
      () => assertProductionBootConfig({ nodeEnv: "production" }),
      /AUTO_MIGRATE='true' is ambiguous/
    );
  });

  it("passes in production with AUTO_MIGRATE=force (deliberate prod opt-in)", () => {
    save();
    process.env.NODE_ENV = "production";
    process.env.FIELD_ENCRYPTION_KEY = Buffer.alloc(32).toString("base64");
    delete process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL;
    delete process.env.BOOTSTRAP_SUPER_ADMIN_PASSWORD;
    process.env.AUTO_MIGRATE = "force";
    process.env.REFRESH_TOKEN_IN_COOKIE = "false";
    assert.doesNotThrow(() => assertProductionBootConfig({ nodeEnv: "production" }));
  });

  it("throws in production when cookie refresh is on without CORS credentials", () => {
    save();
    process.env.NODE_ENV = "production";
    process.env.FIELD_ENCRYPTION_KEY = Buffer.alloc(32).toString("base64");
    process.env.REFRESH_TOKEN_IN_COOKIE = "true";
    process.env.CORS_ORIGINS = "https://app.example.com";
    delete process.env.CORS_CREDENTIALS;
    assert.throws(
      () => assertProductionBootConfig({ nodeEnv: "production" }),
      /CORS_CREDENTIALS/
    );
  });

  it("passes when production flags and encryption key are valid", () => {
    save();
    process.env.NODE_ENV = "production";
    process.env.FIELD_ENCRYPTION_KEY = Buffer.alloc(32).toString("base64");
    delete process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL;
    delete process.env.BOOTSTRAP_SUPER_ADMIN_PASSWORD;
    process.env.AUTO_MIGRATE = "off";
    process.env.REFRESH_TOKEN_IN_COOKIE = "false";
    assert.doesNotThrow(() => assertProductionBootConfig({ nodeEnv: "production" }));
  });
});
