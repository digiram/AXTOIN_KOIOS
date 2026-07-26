/**
 * Calendar reply ICS builder — `src/mailbox-connectors/calendar-reply-ics.ts`.
 *
 * Asserts PARTSTAT/RSVP ICS fragments for mailbox calendar responses.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildCalendarReplyIcs,
  buildCalendarReplySubject,
  calendarRsvpPartStat
} from "../src/mailbox-connectors/calendar-reply-ics.js";

describe("calendar reply ICS", () => {
  const baseInput = {
    icsUid: "uid-123@google.com",
    icsSequence: 2,
    organizerEmail: "organizer@example.com",
    attendeeEmail: "attendee@example.com",
    attendeeName: "Alex Attendee",
    title: "Quarterly planning",
    startsAt: new Date("2026-06-20T10:00:00.000Z"),
    endsAt: new Date("2026-06-20T11:00:00.000Z")
  } as const;

  it("maps RSVP responses to iCalendar PARTSTAT values", () => {
    assert.equal(calendarRsvpPartStat("accepted"), "ACCEPTED");
    assert.equal(calendarRsvpPartStat("declined"), "DECLINED");
    assert.equal(calendarRsvpPartStat("tentative"), "TENTATIVE");
  });

  it("builds METHOD:REPLY calendar payloads", () => {
    const ics = buildCalendarReplyIcs({ ...baseInput, response: "accepted" });
    assert.match(ics, /METHOD:REPLY/);
    assert.match(ics, /UID:uid-123@google\.com/);
    assert.match(ics, /SEQUENCE:2/);
    assert.match(ics, /PARTSTAT=ACCEPTED/);
    assert.match(ics, /ORGANIZER:mailto:organizer@example\.com/);
    assert.match(ics, /ATTENDEE;.*:mailto:attendee@example\.com/);
    assert.match(ics, /DTSTART:20260620T100000Z/);
    assert.match(ics, /DTEND:20260620T110000Z/);
  });

  it("builds human-readable subjects", () => {
    assert.equal(buildCalendarReplySubject("accepted", "Sync"), "Accepted: Sync");
    assert.equal(buildCalendarReplySubject("declined", "Sync"), "Declined: Sync");
    assert.equal(buildCalendarReplySubject("tentative", "Sync"), "Tentatively accepted: Sync");
  });
});
