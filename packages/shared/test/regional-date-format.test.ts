/**
 * Tests for regional date format parsing and display formatting.
 *
 * Under test: `../src/regional-date-format.js`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatRegionalCalendarDate } from "../src/regional-date-format.js";

describe("formatRegionalCalendarDate", () => {
  const ymd = "2026-06-14";
  const locale = "en-US";
  const timezone = "UTC";

  it("formats slash, dash, and named variants per regional family", () => {
    assert.equal(formatRegionalCalendarDate(ymd, "us", locale, timezone), "06/14/2026");
    assert.equal(formatRegionalCalendarDate(ymd, "us_dash", locale, timezone), "06-14-2026");
    assert.equal(formatRegionalCalendarDate(ymd, "us_named", locale, timezone), "Jun 14, 2026");

    assert.equal(formatRegionalCalendarDate(ymd, "europe", locale, timezone), "14/06/2026");
    assert.equal(formatRegionalCalendarDate(ymd, "europe_dash", locale, timezone), "14-06-2026");
    assert.equal(formatRegionalCalendarDate(ymd, "europe_named", locale, timezone), "14 Jun 2026");

    assert.equal(formatRegionalCalendarDate(ymd, "iso", locale, timezone), "2026-06-14");
    assert.equal(formatRegionalCalendarDate(ymd, "iso_named", locale, timezone), "2026 Jun 14");
  });
});
