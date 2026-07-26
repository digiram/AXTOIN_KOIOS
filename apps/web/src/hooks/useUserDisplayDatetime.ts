/**
 * useUserDisplayDatetime.
 *
 * React hook wrapping `userDisplayDatetime` formatters with preferences from `useTenantDisplayPreferences`.
 *
 * Responsibilities:
 * - Expose `formatDateTime`, `formatDate`, and `formatDateTimeUtc` bound to current prefs
 * - Surface loading state while account settings are fetched
 */
import { useMemo } from "react";

import {
  formatUserDate,
  formatUserDateTime,
  type FormatUserDateTimeOptions,
  type UserDisplayDatetimePrefs
} from "../lib/userDisplayDatetime.js";
import { useTenantDisplayPreferences } from "./useTenantDisplayPreferences.js";

/**
 * Date/time formatters using merged tenant + account localization (`timeFormat`, `locale`, `timezone`).
 */
export const useUserDisplayDatetime = () => {
  const { preferences, loading } = useTenantDisplayPreferences();

  const slice: Partial<UserDisplayDatetimePrefs> | undefined = preferences ?? undefined;

  const api = useMemo(
    () => ({
      formatDateTime: (iso: string, options?: FormatUserDateTimeOptions) =>
        formatUserDateTime(iso, slice, options),
      formatDate: (isoYmd: string) => formatUserDate(isoYmd, slice),
      /** Same clock style and locale, fixed zone UTC (billing windows). */
      formatDateTimeUtc: (iso: string) => formatUserDateTime(iso, slice, { timeZone: "UTC" })
    }),
    [slice]
  );

  return { ...api, preferences, loading };
};
