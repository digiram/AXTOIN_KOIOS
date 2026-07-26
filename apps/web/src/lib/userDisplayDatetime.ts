/**
 * UserDisplayDatetime.
 *
 * Locale-aware date and datetime formatting for the signed-in user, combining regional date style,
 * timezone, and 12h/24h clock preference.
 *
 * Responsibilities:
 * - Resolve partial preference slices to defaults
 * - Format ISO instants and calendar `YYYY-MM-DD` strings for display
 *
 * Depends on:
 * - `@starter/shared` regional calendar helpers
 */
import { calendarYmdInTimezone, formatRegionalCalendarDate } from "@starter/shared";

/** Slice needed to format instants for the signed-in user (from `useTenantDisplayPreferences`). */
export type UserDisplayDatetimePrefs = {
  locale: string;
  timezone: string;
  timeFormat: "12h" | "24h";
  dateTimeFormat?: string | null;
};

const DEFAULT_PREFS: UserDisplayDatetimePrefs = {
  locale: "en-US",
  timezone: "UTC",
  timeFormat: "12h",
  dateTimeFormat: null
};

/** Fills missing preference fields with safe defaults for formatting. */
export function resolveUserDisplayDatetimePrefs(
  prefs: Partial<UserDisplayDatetimePrefs> | null | undefined
): UserDisplayDatetimePrefs {
  return {
    locale: prefs?.locale?.trim() || DEFAULT_PREFS.locale,
    timezone: prefs?.timezone?.trim() || DEFAULT_PREFS.timezone,
    timeFormat: prefs?.timeFormat === "24h" ? "24h" : "12h",
    dateTimeFormat: prefs?.dateTimeFormat?.trim() || null
  };
}

export type FormatUserDateTimeOptions = {
  /** e.g. `"UTC"` for subscription boundaries while keeping the user’s 12h/24h choice */
  timeZone?: string;
  /** When true, omit seconds (date + hours + minutes only). */
  omitSeconds?: boolean;
};

/**
 * Format an ISO instant (UTC Z or offset) for display: user locale, timezone, and 12h/24h preference.
 */
export function formatUserDateTime(
  isoUtc: string,
  prefs: Partial<UserDisplayDatetimePrefs> | null | undefined,
  options?: FormatUserDateTimeOptions
): string {
  const { locale, timezone, timeFormat, dateTimeFormat } = resolveUserDisplayDatetimePrefs(prefs);
  const tz = options?.timeZone?.trim() || timezone;
  const d = new Date(isoUtc);
  if (Number.isNaN(d.getTime())) return isoUtc;
  const timeStyle = options?.omitSeconds ? "short" : "medium";
  try {
    const ymd = calendarYmdInTimezone(d, tz);
    const datePart = formatRegionalCalendarDate(ymd, dateTimeFormat, locale, tz);
    const timePart = new Intl.DateTimeFormat(locale, {
      timeStyle,
      timeZone: tz,
      hour12: timeFormat === "12h"
    }).format(d);
    return `${datePart}, ${timePart}`;
  } catch {
    try {
      return d.toLocaleString(locale, { hour12: timeFormat === "12h", timeZone: tz });
    } catch {
      return d.toISOString();
    }
  }
}

/**
 * Calendar date `YYYY-MM-DD` rendered in the user’s regional date style (locale + time zone).
 */
export function formatUserDate(
  isoYmd: string,
  prefs: Partial<UserDisplayDatetimePrefs> | null | undefined
): string {
  const { locale, timezone, dateTimeFormat } = resolveUserDisplayDatetimePrefs(prefs);
  const s = isoYmd.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    try {
      const d = new Date(s);
      if (Number.isNaN(d.getTime())) return s;
      const ymd = calendarYmdInTimezone(d, timezone);
      return formatRegionalCalendarDate(ymd, dateTimeFormat, locale, timezone);
    } catch {
      return s;
    }
  }
  return formatRegionalCalendarDate(s, dateTimeFormat, locale, timezone);
}
