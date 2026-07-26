/**
 * Mailbox Display Formatters hook.
 *
 * Locale-aware amount and date formatters for mailbox screens based on the signed-in user settings.
 *
 * Responsibilities:
 * - Map user currency and date-time preferences to display helpers
 * - Reuse shared formatting utilities across list and detail views
 *
 * Related:
 * - useUserDisplayDatetime
 * - country-presets
 */
import { useMemo } from "react";

import { useUserDisplayDatetime } from "../../hooks/useUserDisplayDatetime.js";
import type { MailboxCalendarEvent } from "./mailboxCalendarUtils.js";
import {
  formatMailboxClockTime,
  formatMailboxEventTime,
  formatMailboxListTime,
  formatMailboxLongCalendarDay,
  formatMailboxMonthYear,
  formatMailboxRelativeTime
} from "./mailboxDisplayDatetime.js";

/** User-localized date/time formatters for mailbox screens. */
export const useMailboxDisplayFormatters = () => {
  const { preferences, loading, formatDateTime, formatDate } = useUserDisplayDatetime();
  const prefs = preferences ?? undefined;

  return useMemo(
    () => ({
      formatListTime: (iso: string) => formatMailboxListTime(iso, prefs),
      formatRelativeTime: (iso: string) => formatMailboxRelativeTime(iso, prefs),
      formatClockTime: (iso: string) => formatMailboxClockTime(iso, prefs),
      formatDateTime: (iso: string) => formatDateTime(iso, { omitSeconds: true }),
      formatDate: (isoYmd: string) => formatDate(isoYmd),
      formatMonthYear: (viewMonth: Date) => formatMailboxMonthYear(viewMonth, prefs),
      formatLongCalendarDay: (isoYmd: string) => formatMailboxLongCalendarDay(isoYmd, prefs),
      formatEventTime: (event: MailboxCalendarEvent) => formatMailboxEventTime(event, prefs),
      timezone: preferences?.timezone ?? "UTC",
      loading
    }),
    [formatDate, formatDateTime, loading, preferences?.timezone, prefs]
  );
};
