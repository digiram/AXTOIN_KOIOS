/**
 * Mailbox provider sync helpers — `src/mailbox-connectors/label-mapping.ts` and sync types.
 *
 * Asserts folder state mapping and Gmail label-to-mailbox translation.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  advanceMailboxSyncFolderState,
  parseMailboxSyncFolderState,
  serializeMailboxSyncFolderState
} from "../src/mailbox-connectors/types.js";
import { mapGmailLabelsToMailboxState } from "../src/mailbox-connectors/label-mapping.js";

describe("mailbox sync folder state", () => {
  it("rejects non-JSON sync cursors", () => {
    assert.deepEqual(parseMailboxSyncFolderState("next-page-token"), {
      folder: "inbox",
      pageCursor: null
    });
  });

  it("round-trips JSON folder state", () => {
    const state = { folder: "sent" as const, pageCursor: "abc" };
    assert.equal(serializeMailboxSyncFolderState(state), JSON.stringify(state));
    assert.deepEqual(parseMailboxSyncFolderState(JSON.stringify(state)), state);
  });

  it("advances inbox to sent when paging completes", () => {
    const advanced = advanceMailboxSyncFolderState({ folder: "inbox", pageCursor: null }, null);
    assert.equal(advanced.cycleComplete, false);
    assert.deepEqual(advanced.nextState, { folder: "sent", pageCursor: null });
  });

  it("completes cycle after sent folder", () => {
    const advanced = advanceMailboxSyncFolderState({ folder: "sent", pageCursor: null }, null);
    assert.equal(advanced.cycleComplete, true);
    assert.deepEqual(advanced.nextState, { folder: "inbox", pageCursor: null });
  });
});

describe("gmail label mapping", () => {
  it("maps inbox unread starred state", () => {
    assert.deepEqual(mapGmailLabelsToMailboxState(["INBOX", "UNREAD", "STARRED"]), {
      folder: "inbox",
      isRead: false,
      isStarred: true
    });
  });

  it("maps trash and archive", () => {
    assert.deepEqual(mapGmailLabelsToMailboxState(["TRASH"]), {
      folder: "trash",
      isRead: true,
      isStarred: false
    });
    assert.deepEqual(mapGmailLabelsToMailboxState(["IMPORTANT"]), {
      folder: "archive",
      isRead: true,
      isStarred: false
    });
  });
});
