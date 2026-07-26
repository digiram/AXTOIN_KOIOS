/**
 * AccountDisplayHelpers.
 *
 * Pure helpers that merge account-level localization fields from `/account/settings` with tenant defaults
 * for timezone, clock format, and currency display.
 *
 * Responsibilities:
 * - Re-export shared regional date format helpers from `@starter/shared`
 * - Normalize timezone, 12h/24h clock, currency code, and currency format id
 */
import type { CurrencyFormatId } from "./country-presets.js";

export {
  displayLocaleFromRegionalDateFormat,
  regionalDateFormatFamily
} from "@starter/shared";

/** Account timezone when set; otherwise the supplied fallback (typically tenant default). */
export const mergeTimezone = (accountTz: string | null | undefined, fallbackTz: string): string => {
  const u = accountTz?.trim();
  if (u) return u;
  return fallbackTz.trim() || "UTC";
};

/** Account 12h/24h preference when valid; otherwise the supplied fallback. */
export const mergeClockTimeFormat = (
  accountTf: string | null | undefined,
  fallbackTf: "12h" | "24h"
): "12h" | "24h" => {
  if (accountTf === "12h" || accountTf === "24h") return accountTf;
  return fallbackTf;
};

/** Account ISO 4217 code when three letters; otherwise tenant default currency. */
export const preferredCurrencyFromAccount = (
  accountCode: string | null | undefined,
  defaultCurrency: string
): string => {
  const c = accountCode?.trim().toUpperCase() ?? "";
  if (c.length === 3) return c;
  const t = defaultCurrency.trim().toUpperCase();
  return t || "USD";
};

/** Maps account `currencyFormat` string to a known separator convention id. */
export const currencyFormatFromAccount = (raw: string | null | undefined): CurrencyFormatId | null => {
  const cf = raw?.trim();
  if (cf === "comma_dot" || cf === "dot_comma" || cf === "space_comma") return cf;
  return null;
};
