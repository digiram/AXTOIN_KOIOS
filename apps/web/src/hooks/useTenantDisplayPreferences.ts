/**
 * useTenantDisplayPreferences.
 *
 * Loads signed-in account localization from `/account/settings` and merges it with app defaults
 * for date, time, timezone, and currency display across tenant screens.
 *
 * Responsibilities:
 * - Authenticated fetch with 401 refresh retry
 * - Refetch when route pathname changes (settings saves)
 * - Expose merged `TenantDisplayPreferences` slice for formatters
 *
 * Security:
 * - Uses bearer token from `AuthContext`; no client-supplied tenant id
 */
import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import type { DateTimeFormatId } from "@starter/shared";
import { useAuth } from "../auth/AuthContext.js";
import { API_BASE_URL } from "../lib/api.js";
import {
  displayLocaleFromRegionalDateFormat,
  mergeClockTimeFormat,
  mergeTimezone,
  preferredCurrencyFromAccount,
  currencyFormatFromAccount
} from "../lib/account-display.js";
import type { CurrencyFormatId } from "../lib/country-presets.js";

const DEFAULT_LOCALE = "en-US";
const DEFAULT_TIMEZONE = "UTC";
const DEFAULT_CURRENCY = "USD";
const DEFAULT_CLOCK: "12h" | "24h" = "12h";

/** Merged account + default localization fields used by display formatters. */
export type TenantDisplayPreferences = {
  locale: string;
  timeFormat: "12h" | "24h";
  timezone: string;
  defaultCurrency: string;
  accountCurrencyCode: string | null;
  preferredCurrency: string;
  currencyFormat: CurrencyFormatId | null;
  dateTimeFormat: DateTimeFormatId | null;
};

/**
 * Merges account localization from `/account/settings` with app-wide defaults.
 */
export const useTenantDisplayPreferences = () => {
  const { getAccessToken, refreshSession, logout } = useAuth();
  const location = useLocation();
  const [preferences, setPreferences] = useState<TenantDisplayPreferences | null>(null);
  const [loading, setLoading] = useState(true);

  const authHeaders = useCallback(() => {
    const token = getAccessToken();
    const h: Record<string, string> = {};
    if (token) h.authorization = `Bearer ${token}`;
    return h;
  }, [getAccessToken]);

  const authedFetch = useCallback(
    async (url: string, init?: RequestInit) => {
      let res = await fetch(url, { ...init, headers: { ...authHeaders(), ...init?.headers } });
      if (res.status === 401) {
        const ok = await refreshSession();
        if (!ok) {
          logout();
          return null;
        }
        res = await fetch(url, { ...init, headers: { ...authHeaders(), ...init?.headers } });
      }
      return res;
    },
    [authHeaders, logout, refreshSession]
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const acctRes = await authedFetch(`${API_BASE_URL}/account/settings`);
        if (cancelled) return;
        let userClock: "12h" | "24h" | null = null;
        let accountCurrencyCode: string | null = null;
        let accountCurrencyFormat: CurrencyFormatId | null = null;
        let accountDateTimeFormat: string | null = null;
        let accountTimezone: string | null = null;
        if (acctRes?.ok) {
          try {
            const acct = (await acctRes.json()) as {
              timeFormat?: string | null;
              currencyCode?: string | null;
              currencyFormat?: string | null;
              dateTimeFormat?: string | null;
              timezone?: string | null;
            };
            if (acct.timeFormat === "12h" || acct.timeFormat === "24h") userClock = acct.timeFormat;
            const cc = acct.currencyCode?.trim().toUpperCase() ?? "";
            if (cc.length === 3) accountCurrencyCode = cc;
            accountCurrencyFormat = currencyFormatFromAccount(acct.currencyFormat);
            const df = acct.dateTimeFormat?.trim();
            accountDateTimeFormat = df && df.length ? df : null;
            const tz = acct.timezone?.trim();
            accountTimezone = tz && tz.length ? tz : null;
          } catch {
            /* ignore */
          }
        }
        setPreferences({
          locale: displayLocaleFromRegionalDateFormat(accountDateTimeFormat, DEFAULT_LOCALE),
          timeFormat: mergeClockTimeFormat(userClock, DEFAULT_CLOCK),
          timezone: mergeTimezone(accountTimezone, DEFAULT_TIMEZONE),
          defaultCurrency: DEFAULT_CURRENCY,
          accountCurrencyCode,
          preferredCurrency: preferredCurrencyFromAccount(accountCurrencyCode, DEFAULT_CURRENCY),
          currencyFormat: accountCurrencyFormat,
          dateTimeFormat: accountDateTimeFormat as DateTimeFormatId | null
        });
      } catch {
        if (!cancelled) setPreferences(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authedFetch, location.pathname]);

  return { preferences, loading };
};
