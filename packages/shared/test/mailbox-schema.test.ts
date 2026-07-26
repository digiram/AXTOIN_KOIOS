/**
 * Tests for mailbox module Zod schemas.
 *
 * Under test: `../src/mailbox.js`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAILBOX_OWNER_SCOPES,
  MAILBOX_SYNC_CALENDAR_JOB_NAME,
  mailboxCalendarEventCreateBodySchema,
  mailboxComposeBodySchema,
  mailboxImapConnectBodySchema,
  mailboxSyncAccountJobId,
  mailboxSyncCalendarJobId,
  mailboxSyncJobDefaults,
  mailboxSyncScanJobId,
  pickMailboxAccentColor
} from "../src/mailbox.js";
import { TENANT_MODULE_KEYS } from "../src/module-roles.js";
import { platformJobQueueIdSchema } from "../src/platform-jobs.js";

describe("mailbox shared schemas", () => {
  it("includes workforce_agent in MAILBOX_OWNER_SCOPES", () => {
    assert.ok(MAILBOX_OWNER_SCOPES.includes("workforce_agent"));
  });

  it("includes mailbox in TENANT_MODULE_KEYS", () => {
    assert.ok(TENANT_MODULE_KEYS.includes("mailbox"));
  });

  it("cycles mailbox accent colors", () => {
    assert.equal(pickMailboxAccentColor(0), "#6366f1");
    assert.equal(pickMailboxAccentColor(8), "#6366f1");
    assert.equal(pickMailboxAccentColor(-1), "#0d9488");
  });

  it("accepts valid IMAP connect body", () => {
    const parsed = mailboxImapConnectBodySchema.safeParse({
      emailAddress: "user@example.com",
      imapHost: "imap.example.com",
      smtpHost: "smtp.example.com",
      username: "user@example.com",
      password: "secret"
    });
    assert.equal(parsed.success, true);
  });

  it("accepts valid compose body", () => {
    const parsed = mailboxComposeBodySchema.safeParse({
      accountId: "00000000-0000-0000-0000-000000000099",
      to: [{ email: "recipient@example.com" }],
      subject: "Hello",
      bodyText: "Hi"
    });
    assert.equal(parsed.success, true);
  });

  it("accepts valid calendar event create body", () => {
    const parsed = mailboxCalendarEventCreateBodySchema.safeParse({
      connectionId: "00000000-0000-0000-0000-000000000099",
      title: "Team sync",
      startsAt: "2026-06-17T09:00:00.000Z",
      endsAt: "2026-06-17T10:00:00.000Z",
      attendees: [{ email: "guest@example.com" }],
      addVideoMeeting: true
    });
    assert.equal(parsed.success, true);
  });

  it("includes mail-sync in platform job queue ids", () => {
    assert.equal(platformJobQueueIdSchema.safeParse("mail-sync").success, true);
  });

  it("builds stable mailbox sync job ids without colons", () => {
    const accountId = "00000000-0000-0000-0000-000000000001";
    assert.equal(mailboxSyncScanJobId("2026-06-15T12"), "mailbox-sync-scan-2026-06-15T12");
    assert.equal(mailboxSyncAccountJobId(accountId), `mailbox-sync-account-${accountId}`);
    assert.equal(mailboxSyncCalendarJobId(accountId), `mailbox-sync-calendar-${accountId}`);
    assert.ok(!mailboxSyncAccountJobId(accountId).includes(":"));
  });

  it("defines retry defaults for mailbox sync jobs", () => {
    assert.equal(mailboxSyncJobDefaults.attempts, 5);
    assert.equal(mailboxSyncJobDefaults.backoff?.type, "exponential");
    assert.equal(MAILBOX_SYNC_CALENDAR_JOB_NAME, "mailbox-sync-calendar");
  });
});
