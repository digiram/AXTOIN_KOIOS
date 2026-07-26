/**
 * IANA time zone identifiers (via `Intl.supportedValuesOf` when available) and GMT/UTC offset labels.
 */

const FALLBACK_IANA_ZONES = [
  "UTC",
  "Africa/Johannesburg",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Mexico_City",
  "America/New_York",
  "America/Sao_Paulo",
  "America/Toronto",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Seoul",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Europe/Amsterdam",
  "Europe/Berlin",
  "Europe/Brussels",
  "Europe/Copenhagen",
  "Europe/Dublin",
  "Europe/Helsinki",
  "Europe/Lisbon",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Oslo",
  "Europe/Paris",
  "Europe/Rome",
  "Europe/Stockholm",
  "Europe/Vienna",
  "Europe/Warsaw",
  "Europe/Zurich",
  "Pacific/Auckland"
] as const;

let zoneCache: readonly string[] | null = null;

/** All IANA zone IDs the runtime exposes (sorted), or a compact fallback list. */
export const getIanaTimeZoneIds = (): readonly string[] => {
  if (zoneCache) return zoneCache;
  try {
    const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
    if (typeof intl.supportedValuesOf === "function") {
      zoneCache = intl.supportedValuesOf("timeZone").slice().sort((a, b) => a.localeCompare(b));
      return zoneCache;
    }
  } catch {
    /* ignore */
  }
  zoneCache = [...FALLBACK_IANA_ZONES].sort((a, b) => a.localeCompare(b));
  return zoneCache;
};

/**
 * Offset label for `timeZone` at instant `at`, e.g. `GMT+01:00` / `GMT-05:00` / `GMT`.
 * Prefers **GMT** wording; uses `longOffset` from Intl when present.
 */
export const utcOffsetLabelFromIana = (timeZone: string, at: Date = new Date()): string => {
  if (!timeZone.trim()) return "";
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      timeZoneName: "longOffset"
    }).formatToParts(at);
    const raw = parts.find((p) => p.type === "timeZoneName")?.value?.trim() ?? "";
    if (!raw) return "";
    return raw.replace(/^UTC/i, "GMT").replace(/\s+/g, "");
  } catch {
    return "";
  }
};
