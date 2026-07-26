/**
 * Google OAuth failure formatting — `src/mailbox-connectors/google-oauth-errors.ts`.
 *
 * Asserts user-safe error messages from provider OAuth failures.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MAILBOX_OAUTH_RECONNECT_HINT } from "@starter/shared";

import { formatGoogleOAuthFailure } from "../src/mailbox-connectors/google-oauth-errors.js";

describe("formatGoogleOAuthFailure", () => {
  it("includes reconnect guidance for invalid_grant token refresh", async () => {
    const res = new Response(
      JSON.stringify({
        error: "invalid_grant",
        error_description: "Token has been expired or revoked."
      }),
      { status: 400 }
    );
    const message = await formatGoogleOAuthFailure(res, "Google token refresh", { tokenRefresh: true });
    assert.match(message, /invalid_grant/i);
    assert.match(message, /expired or revoked/i);
    assert.match(message, new RegExp(MAILBOX_OAUTH_RECONNECT_HINT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });

  it("parses nested Gmail API errors", async () => {
    const res = new Response(
      JSON.stringify({
        error: {
          message: "Insufficient Permission",
          errors: [{ reason: "insufficientPermissions" }]
        }
      }),
      { status: 403 }
    );
    const message = await formatGoogleOAuthFailure(res, "Gmail list");
    assert.match(message, /Insufficient Permission/i);
    assert.match(message, /insufficientPermissions/i);
  });
});
