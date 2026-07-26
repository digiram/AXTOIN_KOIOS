/**
 * Tests for mailbox calendar recurrence and reminder helpers.
 *
 * Under test: `../src/calendar-event.js`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildCalendarRrule,
  computeRecurrencePreview,
  defaultStopRecurrenceDate,
  parseCalendarRrule
} from "../src/calendar-event.js";

describe("calendar-event helpers", () => {
  it("builds and parses RRULE", () => {
    const rrule = buildCalendarRrule({
      freq: "weekly",
      interval: 2,
      stopRecurrenceDate: "2026-12-31",
      allDay: false
    });
    assert.ok(rrule?.includes("FREQ=WEEKLY"));
    assert.ok(rrule?.includes("INTERVAL=2"));
    const parsed = parseCalendarRrule(rrule);
    assert.equal(parsed?.freq, "weekly");
    assert.equal(parsed?.interval, 2);
  });

  it("defaults stop recurrence to 4th occurrence", () => {
    const start = new Date(2026, 5, 1, 9, 0, 0, 0);
    assert.equal(defaultStopRecurrenceDate(start, "weekly", 1), "2026-06-22");
  });

  it("computes recurrence preview dates", () => {
    const start = new Date(2026, 5, 1, 9, 0, 0, 0);
    const preview = computeRecurrencePreview({
      start,
      freq: "daily",
      interval: 1,
      stopRecurrenceDate: "2026-06-04"
    });
    assert.equal(preview.last, "2026-06-04");
  });
});
