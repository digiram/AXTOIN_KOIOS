/**
 * Invoicing Display Formatters hook.
 *
 * Locale-aware amount and date formatters for invoicing and quoting screens based on the signed-in user settings.
 *
 * Responsibilities:
 * - Map user currency and date-time preferences to display helpers
 * - Reuse shared formatting utilities across list and detail views
 *
 * Related:
 * - useUserDisplayDatetime
 * - country-presets
 */
import { useCallback, useMemo } from "react";

import { calendarYmdInTimezone, formatRegionalCalendarDate } from "@starter/shared";

import { formatInvoicingMoneyMinor } from "@starter/shared";

import { useUserDisplayDatetime } from "../../hooks/useUserDisplayDatetime.js";
import { useTenantDisplayPreferences } from "../../hooks/useTenantDisplayPreferences.js";
import {
  formatAmountMajorForInput,
  formatFinanceAmount,
  localeForAmountSeparators,
  parseLocalizedMajorToMinor
} from "../../lib/currencyFormat.js";
import { resolveUserDisplayDatetimePrefs } from "../../lib/userDisplayDatetime.js";

/** React component for invoicing & quoting UI. */
export type InvoicingAmountFormatters = {
  parseMajorToMinor: (raw: string) => number | null;
  formatMinorToMajor: (minor: number) => string;
};

/** User profile–aware date, time, and currency formatters for invoicing screens. */
export const useInvoicingDisplayFormatters = () => {
  const { preferences, loading: prefsLoading } = useTenantDisplayPreferences();
  const { formatDateTime, formatDate, loading: datetimeLoading } = useUserDisplayDatetime();

  const locale = preferences?.locale ?? "en-US";
  const currencyFormat = preferences?.currencyFormat ?? null;

  const formatMoney = useCallback(
    (minor: number, currencyCode: string) =>
      formatFinanceAmount(minor, currencyCode.trim() || "USD", locale, currencyFormat),
    [locale, currencyFormat]
  );

  const formatDocumentMoney = useCallback(
    (minor: number, currencyCode: string) =>
      formatInvoicingMoneyMinor(
        minor,
        currencyCode.trim() || "USD",
        localeForAmountSeparators(locale, currencyFormat)
      ),
    [locale, currencyFormat]
  );

  const amountFormatters = useMemo<InvoicingAmountFormatters>(
    () => ({
      parseMajorToMinor: (raw: string) => parseLocalizedMajorToMinor(raw, currencyFormat),
      formatMinorToMajor: (minor: number) =>
        formatAmountMajorForInput(minor / 100, locale, currencyFormat)
    }),
    [locale, currencyFormat]
  );

  const formatInstantParts = useCallback(
    (iso: string): { date: string; time: string } => {
      const { locale: loc, timezone, timeFormat, dateTimeFormat } = resolveUserDisplayDatetimePrefs(
        preferences ?? undefined
      );
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return { date: iso, time: "" };
      try {
        const ymd = calendarYmdInTimezone(d, timezone);
        return {
          date: formatRegionalCalendarDate(ymd, dateTimeFormat, loc, timezone),
          time: new Intl.DateTimeFormat(loc, {
            timeStyle: "short",
            timeZone: timezone,
            hour12: timeFormat === "12h"
          }).format(d)
        };
      } catch {
        return { date: formatDateTime(iso), time: "" };
      }
    },
    [formatDateTime, preferences]
  );

  return {
    formatMoney,
    formatDocumentMoney,
    formatDate,
    formatDateTime,
    formatInstantParts,
    amountFormatters,
    locale,
    currencyFormat,
    loading: prefsLoading || datetimeLoading
  };
};
