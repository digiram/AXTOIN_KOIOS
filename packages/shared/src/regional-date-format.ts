/**
 * Regional date and time display formatting.
 *
 * User-facing date format presets (US, European, ISO variants) while storage
 * remains ISO `YYYY-MM-DD`. Used by account settings and tenant finance defaults.
 *
 * Responsibilities:
 * - Export format enum/schema and country preset mapping
 * - Parse ISO dates and format for display per selected preset
 *
 * Related:
 * - `account-settings.ts`, `tenant-realm-settings.ts`
 */
import { z } from "zod";

/** Regional calendar date display styles (storage stays ISO `YYYY-MM-DD`). */
export const DATE_TIME_FORMAT_IDS = [
  "us",
  "us_dash",
  "us_named",
  "europe",
  "europe_dash",
  "europe_named",
  "iso",
  "iso_named"
] as const;

export const dateTimeFormatSchema = z.enum(DATE_TIME_FORMAT_IDS);

export type DateTimeFormatId = z.infer<typeof dateTimeFormatSchema>;

/** Base regional ordering used for country presets (`us` | `europe` | `iso`). */
export type RegionalDateFormatFamily = "us" | "europe" | "iso";

export const DATE_TIME_FORMAT_LABELS: Record<DateTimeFormatId, string> = {
  us: "United States (MM/DD/YYYY)",
  us_dash: "United States with dashes (MM-DD-YYYY)",
  us_named: "United States with month name (Jan 14, 2026)",
  europe: "Day first (DD/MM/YYYY)",
  europe_dash: "Day first with dashes (DD-MM-YYYY)",
  europe_named: "Day first with month name (14 Jan 2026)",
  iso: "Year first (YYYY-MM-DD)",
  iso_named: "Year first with month name (2026 Jan 14)"
};

const ISO_YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad2 = (n: number) => String(n).padStart(2, "0");

const FALLBACK_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const regionalDateFormatFamily = (
  dateTimeFormat: string | null | undefined
): RegionalDateFormatFamily => {
  const d = dateTimeFormat?.trim();
  if (d?.startsWith("europe")) return "europe";
  if (d?.startsWith("iso")) return "iso";
  return "us";
};

export const displayLocaleFromRegionalDateFormat = (
  dateTimeFormat: string | null | undefined,
  fallbackLocale: string
): string => {
  const base = fallbackLocale.trim() || "en-US";
  switch (regionalDateFormatFamily(dateTimeFormat)) {
    case "europe":
      return "en-GB";
    case "iso":
      return "sv-SE";
    default:
      return "en-US";
  }
};

const parseIsoYmd = (isoYmd: string): { y: number; m: number; d: number } | null => {
  const match = ISO_YMD.exec(isoYmd.trim());
  if (!match) return null;
  const y = Number.parseInt(match[1]!, 10);
  const m = Number.parseInt(match[2]!, 10);
  const d = Number.parseInt(match[3]!, 10);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
};

const abbrevMonth = (y: number, m: number, locale: string, timezone: string): string => {
  try {
    return new Intl.DateTimeFormat(locale, { month: "short", timeZone: timezone }).format(
      new Date(Date.UTC(y, m - 1, 15, 12, 0, 0))
    );
  } catch {
    return FALLBACK_MONTHS[m - 1] ?? "";
  }
};

const resolveFormatId = (dateTimeFormat: string | null | undefined): DateTimeFormatId => {
  const raw = dateTimeFormat?.trim();
  if (raw && dateTimeFormatSchema.safeParse(raw).success) return raw as DateTimeFormatId;
  return "us";
};

/** Render a calendar `YYYY-MM-DD` value using the user's regional date format preference. */
export const formatRegionalCalendarDate = (
  isoYmd: string,
  dateTimeFormat: string | null | undefined,
  locale: string,
  timezone: string
): string => {
  const parts = parseIsoYmd(isoYmd);
  if (!parts) return isoYmd.trim();

  const { y, m, d } = parts;
  const mm = pad2(m);
  const dd = pad2(d);
  const yyyy = String(y);
  const fmt = resolveFormatId(dateTimeFormat);
  const month = abbrevMonth(y, m, locale, timezone);

  switch (fmt) {
    case "us":
      return `${mm}/${dd}/${yyyy}`;
    case "us_dash":
      return `${mm}-${dd}-${yyyy}`;
    case "us_named":
      return `${month} ${d}, ${yyyy}`;
    case "europe":
      return `${dd}/${mm}/${yyyy}`;
    case "europe_dash":
      return `${dd}-${mm}-${yyyy}`;
    case "europe_named":
      return `${d} ${month} ${yyyy}`;
    case "iso":
      return `${yyyy}-${mm}-${dd}`;
    case "iso_named":
      return `${yyyy} ${month} ${d}`;
  }
};

/** Calendar date (`YYYY-MM-DD`) for an instant in a given IANA time zone. */
export const calendarYmdInTimezone = (instant: Date, timezone: string): string => {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(instant);
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    /* fall through */
  }
  return instant.toISOString().slice(0, 10);
};
