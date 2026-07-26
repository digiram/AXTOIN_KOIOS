/**
 * CurrencyFormat.
 *
 * Finance amount parsing and formatting for invoicing and related modules, honoring account currency
 * separator preferences and delegating calendar formatting to `userDisplayDatetime`.
 *
 * Responsibilities:
 * - Map `CurrencyFormatId` to `Intl` locales for grouping/decimals
 * - Format and parse major/minor unit amounts for input fields
 * - Expose narrow currency symbols for inline editors
 */
import type { CurrencyFormatId } from "./country-presets.js";
import { formatUserDate, formatUserDateTime } from "./userDisplayDatetime.js";

/** Locale stub so ISO amount grouping matches account “currency formatting” preference. */
export const localeForAmountSeparators = (
  locale: string,
  currencyFormat?: CurrencyFormatId | null
): string => (currencyFormat ? localeForCurrencyFormat(currencyFormat) : locale);

const localeForCurrencyFormat = (currencyFormat: CurrencyFormatId): string => {
  switch (currencyFormat) {
    case "comma_dot":
      return "en-US";
    case "dot_comma":
      return "de-DE";
    case "space_comma":
      return "fr-FR";
    default:
      return "en-US";
  }
};

/**
 * Format minor-unit amounts. When `currencyFormat` is set (user localization), separators follow that
 * convention; otherwise `locale` drives grouping (tenant Finance locale).
 */
export const formatFinanceAmount = (
  amountMinor: number,
  currency: string,
  locale: string,
  currencyFormat?: CurrencyFormatId | null
): string => {
  const major = amountMinor / 100;
  const loc = currencyFormat ? localeForCurrencyFormat(currencyFormat) : locale;
  try {
    return new Intl.NumberFormat(loc, { style: "currency", currency }).format(major);
  } catch {
    return `${major.toFixed(2)} ${currency}`;
  }
};

/** Narrow symbol or currency code for inline amount fields (e.g. $, €). */
export const getCurrencyNarrowSymbol = (locale: string, currency: string): string => {
  const ccy = currency.trim().toUpperCase();
  if (!ccy) return "";
  try {
    const parts = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: ccy,
      currencyDisplay: "narrowSymbol"
    }).formatToParts(1);
    return parts.find((p) => p.type === "currency")?.value?.trim() || ccy;
  } catch {
    return ccy;
  }
};

/** Format a major-unit amount for display/editing (2 decimals) using user or locale conventions. */
export const formatAmountMajorForInput = (
  major: number,
  locale: string,
  currencyFormat: CurrencyFormatId | null
): string => {
  const loc = currencyFormat ? localeForCurrencyFormat(currencyFormat) : locale;
  try {
    return new Intl.NumberFormat(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(major);
  } catch {
    return major.toFixed(2);
  }
};

const stripAmountDecorations = (raw: string): string =>
  raw
    .trim()
    .replace(/[\s\u00a0\u202f]/g, " ")
    .replace(/[^\d.,\s+\-]/g, "")
    .trim();

/** Last-resort parse when format-specific rules leave a non-numeric token string. */
const parseMajorHeuristic = (raw: string): number | null => {
  let s = stripAmountDecorations(raw).replace(/[\s\u00a0\u202f]/g, "");
  if (!s) return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      const intPart = s.slice(0, lastComma).replace(/[.,]/g, "");
      const fracPart = s.slice(lastComma + 1).replace(/\D/g, "");
      s = fracPart.length ? `${intPart}.${fracPart}` : intPart;
    } else {
      const intPart = s.slice(0, lastDot).replace(/[.,]/g, "");
      const fracPart = s.slice(lastDot + 1).replace(/\D/g, "");
      s = fracPart.length ? `${intPart}.${fracPart}` : intPart;
    }
  } else if (lastComma >= 0) {
    const after = s.slice(lastComma + 1);
    if (after.length > 0 && after.length <= 2 && /^\d+$/.test(after)) {
      const intPart = s.slice(0, lastComma).replace(/[.,\s]/g, "");
      s = `${intPart}.${after}`;
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (lastDot >= 0) {
    const after = s.slice(lastDot + 1);
    if (after.length > 0 && after.length <= 2 && /^\d+$/.test(after)) {
      const intPart = s.slice(0, lastDot).replace(/[.,\s]/g, "");
      s = `${intPart}.${after}`;
    } else if (after.length === 3 && /^\d{3}$/.test(after)) {
      s = s.replace(/\./g, "");
    } else {
      s = s.replace(/\./g, "");
    }
  }

  const n = Number(s);
  if (!Number.isFinite(n) || n === 0) return null;
  return Math.round(n * 100);
};

const majorToMinor = (n: number): number | null => {
  if (!Number.isFinite(n) || n === 0) return null;
  return Math.round(n * 100);
};

/**
 * Parse typed major-unit amount to minor units using account currency formatting (thousands/decimal).
 * When `currencyFormat` is null, uses comma thousands + dot decimal (en-US style).
 */
export const parseLocalizedMajorToMinor = (major: string, currencyFormat: CurrencyFormatId | null): number | null => {
  let t = stripAmountDecorations(major);
  if (!t) return null;
  const fmt = currencyFormat ?? "comma_dot";

  if (fmt === "comma_dot") {
    t = t.replace(/[\s\u00a0\u202f]/g, "").replace(/,/g, "");
  } else if (fmt === "dot_comma") {
    const lastComma = t.lastIndexOf(",");
    if (lastComma >= 0) {
      const intPart = t.slice(0, lastComma).replace(/\./g, "").replace(/[\s\u00a0\u202f]/g, "");
      const fracPart = t.slice(lastComma + 1).replace(/[^\d]/g, "");
      t = fracPart.length ? `${intPart}.${fracPart}` : intPart;
    } else {
      t = t.replace(/\./g, "").replace(/[\s\u00a0\u202f]/g, "");
    }
  } else if (fmt === "space_comma") {
    const lastComma = t.lastIndexOf(",");
    if (lastComma >= 0) {
      const intPart = t.slice(0, lastComma).replace(/\s/g, "").replace(/\u00a0/g, "").replace(/\u202f/g, "");
      const fracPart = t.slice(lastComma + 1).replace(/[^\d]/g, "");
      t = fracPart.length ? `${intPart}.${fracPart}` : intPart;
    } else {
      t = t.replace(/[\s\u00a0\u202f]/g, "");
    }
  }

  const n = Number(t);
  if (Number.isFinite(n)) return majorToMinor(n);
  return parseMajorHeuristic(major);
};

export const formatFinanceDate = (isoDate: string, locale: string, timezone: string): string =>
  formatUserDate(isoDate, { locale, timezone });

/** Date + time in user/tenant locale, timezone, and 12h/24h preference. */
export const formatTenantDateTime = (
  isoUtc: string,
  locale: string,
  timezone: string,
  timeFormat: "12h" | "24h"
): string => formatUserDateTime(isoUtc, { locale, timezone, timeFormat });
