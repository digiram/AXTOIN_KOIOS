/**
 * shared-contract.test.
 *
 * Smoke tests that `@starter/shared` Zod schemas resolve correctly through the web bundle import path.
 *
 * Under test: `loginSchema` password length rules.
 */
import { describe, expect, it } from "vitest";

import { loginSchema } from "@starter/shared";

describe("shared contracts (web bundle path)", () => {
  it("loginSchema rejects short password", () => {
    const r = loginSchema.safeParse({ email: "a@b.co", password: "short" });
    expect(r.success).toBe(false);
  });

  it("loginSchema accepts valid payload", () => {
    const r = loginSchema.safeParse({ email: "a@b.co", password: "12345678" });
    expect(r.success).toBe(true);
  });
});
