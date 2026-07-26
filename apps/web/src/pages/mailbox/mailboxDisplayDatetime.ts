/**
 * Mailbox Display Datetime.
 *
 * Supporting module for tenant mailbox: mailbox Display Datetime.
 *
 * Responsibilities:
 * - Provide types, helpers, or components consumed by mailbox pages
 *
 * Related:
 * - Route: /admin/mailbox
 */
import { calendarYmdInTimezone, formatRegionalCalendarDate } from "@starter/shared";

import {
  resolveUserDisplayDatetimePrefs,
  type UserDisplayDatetimePrefs
} from "../../lib/userDisplayDatetime.js";
import type { MailboxCalendarEvent } from "./mailboxCalendarUtils.js";

/** Helper for mailbox client logic. */
export function previousCalendarYmd(ymd: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return ymd;
  const instant = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0));
  instant.setUTCDate(instant.getUTCDate() - 1);
  return instant.toISOString().slice(0, 10);
}

function formatClockTime(
  instant: Date,
  prefs: Partial<UserDisplayDatetimePrefs> | null | undefined
): string {
  const { locale, timezone, timeFormat } = resolveUserDisplayDatetimePrefs(prefs);
  try {
    return new Intl.DateTimeFormat(locale, {
      timeStyle: "short",
      timeZone: timezone,
      hour12: timeFormat === "12h"
    }).format(instant);
  } catch {
    return instant.toISOString();
  }
}

/** Thread list / compact timestamp: today shows clock time; yesterday shows label; else regional date. */
export function formatMailboxListTime(
  iso: string,
  prefs: Partial<UserDisplayDatetimePrefs> | null | undefined
): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;

  const { locale, timezone, dateTimeFormat } = resolveUserDisplayDatetimePrefs(prefs);
  const now = new Date();
  const dayYmd = calendarYmdInTimezone(d, timezone);
  const todayYmd = calendarYmdInTimezone(now, timezone);

  if (dayYmd === todayYmd) {
    return formatClockTime(d, prefs);
  }

  if (dayYmd === previousCalendarYmd(todayYmd)) {
    return "Yesterday";
  }

  return formatRegionalCalendarDate(dayYmd, dateTimeFormat, locale, timezone);
}

/** Relative phrase for message detail; falls back to {@link formatMailboxListTime}. */
export function formatMailboxRelativeTime(
  iso: string,
  prefs: Partial<UserDisplayDatetimePrefs> | null | undefined
): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;

  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return formatMailboxListTime(iso, prefs);
}

/** Clock time only (message header). */
export function formatMailboxClockTime(
  iso: string,
  prefs: Partial<UserDisplayDatetimePrefs> | null | undefined
): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return formatClockTime(d, prefs);
}

/** Calendar month heading, e.g. June 2026. */
export function formatMailboxMonthYear(
  viewMonth: Date,
  prefs: Partial<UserDisplayDatetimePrefs> | null | undefined
): string {
  const { locale, timezone } = resolveUserDisplayDatetimePrefs(prefs);
  const instant = new Date(Date.UTC(viewMonth.getFullYear(), viewMonth.getMonth(), 15, 12, 0, 0));
  try {
    return new Intl.DateTimeFormat(locale, {
      month: "long",
      year: "numeric",
      timeZone: timezone
    }).format(instant);
  } catch {
    return viewMonth.toLocaleDateString(locale, { month: "long", year: "numeric" });
  }
}

/** Long weekday date for selected calendar day labels and aria text. */
export function formatMailboxLongCalendarDay(
  isoYmd: string,
  prefs: Partial<UserDisplayDatetimePrefs> | null | undefined
): string {
  const { locale, timezone } = resolveUserDisplayDatetimePrefs(prefs);
  const instant = new Date(`${isoYmd.trim()}T12:00:00`);
  if (Number.isNaN(instant.getTime())) return isoYmd;
  try {
    return new Intl.DateTimeFormat(locale, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: timezone
    }).format(instant);
  } catch {
    return isoYmd;
  }
}

/** Helper for mailbox client logic. */
export function formatMailboxEventTime(
  event: MailboxCalendarEvent,
  prefs: Partial<UserDisplayDatetimePrefs> | null | undefined
): string {
  if (event.allDay) return "All day";

  const { locale, timezone, timeFormat, dateTimeFormat } = resolveUserDisplayDatetimePrefs(prefs);
  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";

  const formatTime = (instant: Date) => {
    try {
      return new Intl.DateTimeFormat(locale, {
        timeStyle: "short",
        timeZone: timezone,
        hour12: timeFormat === "12h"
      }).format(instant);
    } catch {
      return instant.toISOString();
    }
  };

  const startYmd = calendarYmdInTimezone(start, timezone);
  const endYmd = calendarYmdInTimezone(end, timezone);

  if (startYmd === endYmd) {
    return `${formatTime(start)} – ${formatTime(end)}`;
  }

  const formatDateTime = (instant: Date, ymd: string) => {
    const datePart = formatRegionalCalendarDate(ymd, dateTimeFormat, locale, timezone);
    return `${datePart} ${formatTime(instant)}`;
  };

  return `${formatDateTime(start, startYmd)} – ${formatDateTime(end, endYmd)}`;
}
