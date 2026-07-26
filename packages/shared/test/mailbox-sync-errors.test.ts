/**
 * Tests for mailbox IMAP sync error classification helpers.
 *
 * Under test: `../src/mailbox-sync-errors.js`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isMailboxOAuthReconnectRequired,
  MAILBOX_OAUTH_RECONNECT_HINT
} from "../src/mailbox-sync-errors.js";

describe("mailbox sync oauth errors", () => {
  it("detects invalid_grant reconnect messages", () => {
    assert.equal(
      isMailboxOAuthReconnectRequired(
        `Google token refresh failed: 400: invalid_grant: Token has been expired or revoked. ${MAILBOX_OAUTH_RECONNECT_HINT}`
      ),
      true
    );
  });

  it("detects legacy token refresh 400 messages", () => {
    assert.equal(isMailboxOAuthReconnectRequired("Google token refresh failed: 400"), true);
  });

  it("ignores unrelated sync errors", () => {
    assert.equal(isMailboxOAuthReconnectRequired("IMAP connection timed out"), false);
    assert.equal(isMailboxOAuthReconnectRequired(null), false);
  });
});
