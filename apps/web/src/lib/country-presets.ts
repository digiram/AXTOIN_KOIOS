/**
 * Two-letter country code → defaults for time zone, currency code, and common display conventions.
 * Presets are regional approximations for the starter UI (not legal tender rules).
 */

export type CurrencyFormatId = "comma_dot" | "dot_comma" | "space_comma";
/** Base regional styles applied by country presets (extended variants are account-only). */
export type CountryPresetDateFormatId = "us" | "europe" | "iso";
export type MeasurementSystemId = "si" | "imperial";

export type CountryPreset = {
  label: string;
  timezone: string;
  currencyCode: string;
  currencyFormat: CurrencyFormatId;
  dateTimeFormat: CountryPresetDateFormatId;
  measurementSystem: MeasurementSystemId;
};

export const COUNTRY_PRESETS: Record<string, CountryPreset> = {
  US: {
    label: "United States",
    timezone: "America/New_York",
    currencyCode: "USD",
    currencyFormat: "comma_dot",
    dateTimeFormat: "us",
    measurementSystem: "imperial"
  },
  CA: {
    label: "Canada",
    timezone: "America/Toronto",
    currencyCode: "CAD",
    currencyFormat: "comma_dot",
    dateTimeFormat: "us",
    measurementSystem: "si"
  },
  GB: {
    label: "United Kingdom",
    timezone: "Europe/London",
    currencyCode: "GBP",
    currencyFormat: "comma_dot",
    dateTimeFormat: "europe",
    measurementSystem: "imperial"
  },
  IE: {
    label: "Ireland",
    timezone: "Europe/Dublin",
    currencyCode: "EUR",
    currencyFormat: "comma_dot",
    dateTimeFormat: "europe",
    measurementSystem: "si"
  },
  DE: {
    label: "Germany",
    timezone: "Europe/Berlin",
    currencyCode: "EUR",
    currencyFormat: "dot_comma",
    dateTimeFormat: "europe",
    measurementSystem: "si"
  },
  FR: {
    label: "France",
    timezone: "Europe/Paris",
    currencyCode: "EUR",
    currencyFormat: "space_comma",
    dateTimeFormat: "europe",
    measurementSystem: "si"
  },
  NL: {
    label: "Netherlands",
    timezone: "Europe/Amsterdam",
    currencyCode: "EUR",
    currencyFormat: "dot_comma",
    dateTimeFormat: "europe",
    measurementSystem: "si"
  },
  BE: {
    label: "Belgium",
    timezone: "Europe/Brussels",
    currencyCode: "EUR",
    currencyFormat: "comma_dot",
    dateTimeFormat: "europe",
    measurementSystem: "si"
  },
  ES: {
    label: "Spain",
    timezone: "Europe/Madrid",
    currencyCode: "EUR",
    currencyFormat: "dot_comma",
    dateTimeFormat: "europe",
    measurementSystem: "si"
  },
  IT: {
    label: "Italy",
    timezone: "Europe/Rome",
    currencyCode: "EUR",
    currencyFormat: "dot_comma",
    dateTimeFormat: "europe",
    measurementSystem: "si"
  },
  PT: {
    label: "Portugal",
    timezone: "Europe/Lisbon",
    currencyCode: "EUR",
    currencyFormat: "dot_comma",
    dateTimeFormat: "europe",
    measurementSystem: "si"
  },
  CH: {
    label: "Switzerland",
    timezone: "Europe/Zurich",
    currencyCode: "CHF",
    currencyFormat: "dot_comma",
    dateTimeFormat: "europe",
    measurementSystem: "si"
  },
  SE: {
    label: "Sweden",
    timezone: "Europe/Stockholm",
    currencyCode: "SEK",
    currencyFormat: "space_comma",
    dateTimeFormat: "iso",
    measurementSystem: "si"
  },
  NO: {
    label: "Norway",
    timezone: "Europe/Oslo",
    currencyCode: "NOK",
    currencyFormat: "space_comma",
    dateTimeFormat: "iso",
    measurementSystem: "si"
  },
  DK: {
    label: "Denmark",
    timezone: "Europe/Copenhagen",
    currencyCode: "DKK",
    currencyFormat: "dot_comma",
    dateTimeFormat: "europe",
    measurementSystem: "si"
  },
  FI: {
    label: "Finland",
    timezone: "Europe/Helsinki",
    currencyCode: "EUR",
    currencyFormat: "space_comma",
    dateTimeFormat: "iso",
    measurementSystem: "si"
  },
  PL: {
    label: "Poland",
    timezone: "Europe/Warsaw",
    currencyCode: "PLN",
    currencyFormat: "space_comma",
    dateTimeFormat: "europe",
    measurementSystem: "si"
  },
  AU: {
    label: "Australia",
    timezone: "Australia/Sydney",
    currencyCode: "AUD",
    currencyFormat: "comma_dot",
    dateTimeFormat: "europe",
    measurementSystem: "si"
  },
  NZ: {
    label: "New Zealand",
    timezone: "Pacific/Auckland",
    currencyCode: "NZD",
    currencyFormat: "comma_dot",
    dateTimeFormat: "europe",
    measurementSystem: "si"
  },
  JP: {
    label: "Japan",
    timezone: "Asia/Tokyo",
    currencyCode: "JPY",
    currencyFormat: "comma_dot",
    dateTimeFormat: "iso",
    measurementSystem: "si"
  },
  KR: {
    label: "Korea, Republic of",
    timezone: "Asia/Seoul",
    currencyCode: "KRW",
    currencyFormat: "comma_dot",
    dateTimeFormat: "iso",
    measurementSystem: "si"
  },
  SG: {
    label: "Singapore",
    timezone: "Asia/Singapore",
    currencyCode: "SGD",
    currencyFormat: "comma_dot",
    dateTimeFormat: "europe",
    measurementSystem: "si"
  },
  IN: {
    label: "India",
    timezone: "Asia/Kolkata",
    currencyCode: "INR",
    currencyFormat: "comma_dot",
    dateTimeFormat: "europe",
    measurementSystem: "si"
  },
  BR: {
    label: "Brazil",
    timezone: "America/Sao_Paulo",
    currencyCode: "BRL",
    currencyFormat: "dot_comma",
    dateTimeFormat: "europe",
    measurementSystem: "si"
  },
  MX: {
    label: "Mexico",
    timezone: "America/Mexico_City",
    currencyCode: "MXN",
    currencyFormat: "comma_dot",
    dateTimeFormat: "europe",
    measurementSystem: "si"
  },
  AE: {
    label: "United Arab Emirates",
    timezone: "Asia/Dubai",
    currencyCode: "AED",
    currencyFormat: "comma_dot",
    dateTimeFormat: "europe",
    measurementSystem: "si"
  },
  ZA: {
    label: "South Africa",
    timezone: "Africa/Johannesburg",
    currencyCode: "ZAR",
    currencyFormat: "comma_dot",
    dateTimeFormat: "europe",
    measurementSystem: "si"
  },
  AT: {
    label: "Austria",
    timezone: "Europe/Vienna",
    currencyCode: "EUR",
    currencyFormat: "dot_comma",
    dateTimeFormat: "europe",
    measurementSystem: "si"
  }
};

export const COUNTRY_ISO_OPTIONS = Object.entries(COUNTRY_PRESETS)
  .map(([code, v]) => ({ code, label: v.label }))
  .sort((a, b) => a.label.localeCompare(b.label));

export const getPresetForCountry = (code: string): CountryPreset | undefined =>
  COUNTRY_PRESETS[code.trim().toUpperCase()];
