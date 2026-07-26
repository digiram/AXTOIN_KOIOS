/**
 * Smoke test that `@starter/shared` resolves in the mobile workspace.
 *
 * Asserts `loginSchema` accepts a minimal valid login payload (Metro/tsconfig path).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loginSchema } from "../../../packages/shared/src/index.ts";

describe("@starter/shared in mobile workspace", () => {
  it("loginSchema accepts minimal valid payload", () => {
    const r = loginSchema.safeParse({ email: "user@example.com", password: "12345678" });
    assert.equal(r.success, true);
  });
});
