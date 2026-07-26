/**
 * CrmNominatimAddress.
 *
 * Maps OpenStreetMap Nominatim geocode hits into CRM address form rows and `AddressValue` objects used
 * by CRM address editors and geocode pickers.
 *
 * Responsibilities:
 * - Normalize heterogeneous Nominatim `address` keys into structured lines
 * - Build display labels and coordinate summaries for picker UI
 * - Convert hits to shared `CrmAddressFormRowInput` for API persistence
 */
import type { CrmAddressFormRowInput } from "@starter/shared";

import type { AddressValue } from "../components/crm/AddressFields.js";

/** Raw Nominatim search result object with optional `display_name`, coords, and nested `address`. */
export type NominatimGeocodeHit = Record<string, unknown> & {
  display_name?: string;
  name?: string;
  lat?: string;
  lon?: string;
  address?: Record<string, unknown>;
};

/** Read string or numeric OSM address values from Nominatim `address`. */
const addrStr = (addr: Record<string, unknown>, key: string): string => {
  const v = addr[key];
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
};

const firstNonEmpty = (addr: Record<string, unknown>, keys: readonly string[]): string => {
  for (const k of keys) {
    const s = addrStr(addr, k);
    if (s) return s;
  }
  return "";
};

/** Street / venue line only (house number goes in `houseNumber`, not repeated here). */
const ROAD_LIKE_KEYS = [
  "road",
  "pedestrian",
  "footway",
  "path",
  "residential",
  "cycleway",
  "bridleway",
  "track",
  "steps",
  "square",
  "construction",
  "street",
  "highway",
  "corridor",
  "alley",
  "piazza",
  "avenue",
  "wharf",
  "quay",
  "pier"
] as const;

const VENUE_LIKE_KEYS = [
  "office",
  "building",
  "amenity",
  "shop",
  "leisure",
  "tourism",
  "man_made",
  "aeroway",
  "railway",
  "historic",
  "landuse",
  "waterway",
  "natural",
  "craft",
  "club",
  "emergency"
] as const;

/** Locality / postal town (Nominatim admin order: municipality → city → town → village, then districts). */
const CITY_LIKE_KEYS = [
  "municipality",
  "city",
  "town",
  "city_district",
  "village",
  "hamlet",
  "locality",
  "borough",
  "district",
  "suburb",
  "subdivision",
  "neighbourhood",
  "quarter",
  "allotments",
  "city_block",
  "croft",
  "farm",
  "isolated_dwelling",
  "place"
] as const;

const STATE_LIKE_KEYS = [
  "state",
  "province",
  "region",
  "state_district",
  "county",
  "archipelago"
] as const;

/** OSM keys that name a street or campus block when `road` is absent (Nominatim addressdetails list). */
const ROAD_FALLBACK_KEYS = ["commercial", "retail", "industrial", "farmyard"] as const;

const POSTCODE_KEYS = ["postcode", "postal_code", "partial_postcode"] as const;

const UK_POSTCODE_RE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;

const US_ZIP_RE = /\b\d{5}(?:-\d{4})?\b/;

const DE_POSTCODE_RE = /\b\d{5}\b/;

const NL_POSTCODE_RE = /\b\d{4}\s*[A-Za-z]{2}\b|\b\d{4}[A-Za-z]{2}\b/i;

const normalizeUkPostcode = (m: RegExpMatchArray): string => `${m[1]!.toUpperCase()} ${m[2]!.toUpperCase()}`;

const normalizeNlPostcode = (raw: string): string => {
  const compact = raw.replace(/\s+/g, "").toUpperCase();
  if (compact.length === 6 && /^\d{4}[A-Z]{2}$/.test(compact)) {
    return `${compact.slice(0, 4)} ${compact.slice(4)}`;
  }
  return raw.trim();
};

const looksLikePostcodeSegment = (s: string): boolean => {
  const t = s.trim();
  if (!t) return false;
  if (UK_POSTCODE_RE.test(t)) return true;
  if (US_ZIP_RE.test(t)) return true;
  if (NL_POSTCODE_RE.test(t)) return true;
  if (/^\d{5}$/.test(t)) return true;
  return false;
};

function extractPostcodeFromDisplayName(displayName: string, countryCode: string): string {
  const d = displayName.trim();
  if (!d) return "";
  const cc = countryCode.toLowerCase();

  if (cc === "gb" || cc === "uk") {
    const m = d.match(UK_POSTCODE_RE);
    return m ? normalizeUkPostcode(m) : "";
  }
  if (cc === "us" || cc === "pr" || cc === "gu" || cc === "vi") {
    const m = d.match(US_ZIP_RE);
    return m ? m[0]! : "";
  }
  if (cc === "nl") {
    const m = d.match(NL_POSTCODE_RE);
    return m ? normalizeNlPostcode(m[0]!) : "";
  }
  if (cc === "de" || cc === "at" || cc === "ch" || cc === "fr" || cc === "it" || cc === "es" || cc === "be") {
    const m = d.match(DE_POSTCODE_RE);
    if (m) return m[0]!;
  }

  const nl = d.match(NL_POSTCODE_RE);
  if (nl) return normalizeNlPostcode(nl[0]!);
  const uk = d.match(UK_POSTCODE_RE);
  if (uk) return normalizeUkPostcode(uk);
  const us = d.match(US_ZIP_RE);
  if (us) return us[0]!;
  return "";
}

const HOUSE_STREET_IN_ONE_SEGMENT = /^(\d+[A-Za-z]?(?:\s*[-/]\s*\d+[A-Za-z]?)?)\s+(.+)$/;
const HOUSE_RANGE_STREET = /^(\d+\s*-\s*\d+)\s+(.+)$/;

/**
 * When `address` is missing or incomplete, infer house + street from `display_name`.
 * Handles: "10 Downing Street, …", "POI Name, 1600, Amphitheatre Parkway, …", and plain street lines.
 */
function inferStreetAndHouseFromDisplayName(displayName: string): { house: string; street: string } {
  const parts = displayName.split(",").map((x) => x.trim()).filter(Boolean);
  if (parts.length === 0) return { house: "", street: "" };

  const trySegment = (seg: string): { house: string; street: string } | null => {
    const m = seg.match(HOUSE_STREET_IN_ONE_SEGMENT);
    if (m && m[2]!.trim().length >= 2) {
      return { house: m[1]!.trim(), street: m[2]!.trim() };
    }
    const mr = seg.match(HOUSE_RANGE_STREET);
    if (mr && mr[2]!.trim().length >= 2) {
      return { house: mr[1]!.trim(), street: mr[2]!.trim() };
    }
    return null;
  };

  for (const seg of parts.slice(0, 4)) {
    const hit = trySegment(seg);
    if (hit) return hit;
  }

  for (let i = 0; i < parts.length - 1; i += 1) {
    const a = parts[i]!;
    const b = parts[i + 1]!;
    if (/^\d+[A-Za-z]?$/.test(a) && b.length >= 2 && !looksLikePostcodeSegment(b) && !HOUSE_STREET_IN_ONE_SEGMENT.test(b)) {
      return { house: a, street: b };
    }
    if (/^\d+\s*-\s*\d+$/.test(a) && b.length >= 2 && !looksLikePostcodeSegment(b)) {
      return { house: a.replace(/\s+/g, " ").trim(), street: b };
    }
  }

  const first = parts[0] ?? "";
  return { house: "", street: first };
}

function inferLine2FromAddress(
  addr: Record<string, unknown>,
  city: string,
  addressLine1: string,
  state: string
): string {
  const quarter = addrStr(addr, "quarter");
  const ward = addrStr(addr, "ward");
  const suburb = addrStr(addr, "suburb");
  const neighbourhood = addrStr(addr, "neighbourhood");
  const houseName = addrStr(addr, "house_name");
  const unit = addrStr(addr, "unit") || addrStr(addr, "level");
  const stateDistrict = addrStr(addr, "state_district");

  const parts: string[] = [];
  const push = (s: string) => {
    if (!s) return;
    if (s === city) return;
    if (s === state) return;
    if (s === addressLine1) return;
    if (parts.includes(s)) return;
    parts.push(s);
  };

  push(unit);
  push(ward);
  push(quarter);
  if (stateDistrict && stateDistrict !== city && stateDistrict !== state) push(stateDistrict);
  if (suburb && suburb !== city) push(suburb);
  if (neighbourhood && neighbourhood !== city && neighbourhood !== suburb) push(neighbourhood);
  if (
    houseName &&
    houseName !== addrStr(addr, "house_number") &&
    !addressLine1.includes(houseName) &&
    !parts.some((p) => p.includes(houseName) || houseName.includes(p))
  ) {
    push(houseName);
  }

  return parts.join(", ");
}

/** Coerces unknown API JSON into a typed array of geocode hits. */
export const nominatimHitsFromResults = (raw: unknown): NominatimGeocodeHit[] => {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is NominatimGeocodeHit => x !== null && typeof x === "object");
};

/** Stable dedupe key for picker lists (place id, coords, label prefix). */
export const nominatimHitSig = (h: NominatimGeocodeHit): string => {
  const p = (h as { place_id?: unknown }).place_id;
  const pid = typeof p === "number" && Number.isFinite(p) ? String(p) : typeof p === "string" && p.trim() ? p.trim() : "";
  const lat = typeof h.lat === "string" ? h.lat : "";
  const lon = typeof h.lon === "string" ? h.lon : "";
  return `${pid}|${lat}|${lon}|${nominatimHitPrimaryLabel(h).slice(0, 80)}`;
};

/** Primary human label from `display_name` or `name`. */
export const nominatimHitPrimaryLabel = (h: NominatimGeocodeHit): string => {
  const d = h.display_name;
  if (typeof d === "string" && d.trim().length > 0) return d.trim();
  const n = h.name;
  if (typeof n === "string" && n.trim().length > 0) return n.trim();
  return "Unnamed place";
};

/** Lat/lon summary line when both coordinates are present on the hit. */
export const nominatimHitCoordsLine = (h: NominatimGeocodeHit): string | null => {
  const lat = h.lat;
  const lon = h.lon;
  if (typeof lat === "string" && typeof lon === "string" && lat.trim() && lon.trim()) {
    return `${lat.trim()}, ${lon.trim()}`;
  }
  return null;
};

/** Maps a Nominatim `/search` hit into CRM address editor row fields (best-effort from `address`). */
export const nominatimHitToAddressFormRow = (hit: NominatimGeocodeHit): CrmAddressFormRowInput => {
  const rawAddr = hit.address;
  const addr =
    rawAddr !== null && typeof rawAddr === "object" && !Array.isArray(rawAddr)
      ? (rawAddr as Record<string, unknown>)
      : {};

  const countryCode = addrStr(addr, "country_code");
  const displayName = typeof hit.display_name === "string" ? hit.display_name : "";
  const houseName = addrStr(addr, "house_name");

  let houseNumber = firstNonEmpty(addr, ["house_number", "street_number"]);
  if (!houseNumber && houseName && /^[\dA-Za-z./-]+$/.test(houseName) && houseName.length <= 16) {
    houseNumber = houseName;
  }

  let addressLine1 = firstNonEmpty(addr, [...ROAD_LIKE_KEYS]);
  if (!addressLine1) {
    addressLine1 = firstNonEmpty(addr, [...ROAD_FALLBACK_KEYS]);
  }
  if (!addressLine1) {
    addressLine1 = firstNonEmpty(addr, [...VENUE_LIKE_KEYS]);
  }

  const city = firstNonEmpty(addr, [...CITY_LIKE_KEYS]);
  const state = firstNonEmpty(addr, [...STATE_LIKE_KEYS]);
  let postalCode = firstNonEmpty(addr, [...POSTCODE_KEYS]);
  let country = addrStr(addr, "country");

  if (!postalCode && displayName) {
    postalCode = extractPostcodeFromDisplayName(displayName, countryCode);
  }

  if ((!addressLine1 || !houseNumber) && displayName) {
    const inferred = inferStreetAndHouseFromDisplayName(displayName);
    if (!houseNumber && inferred.house) houseNumber = inferred.house;
    if (!addressLine1 && inferred.street) addressLine1 = inferred.street;
  }

  if (houseName && !houseNumber && !addressLine1) {
    addressLine1 = houseName;
  }

  const addressLine2 = inferLine2FromAddress(addr, city, addressLine1, state);

  if (!country && displayName) {
    const parts = displayName.split(",").map((x) => x.trim()).filter(Boolean);
    for (let i = parts.length - 1; i >= 0; i -= 1) {
      const seg = parts[i]!;
      if (looksLikePostcodeSegment(seg)) continue;
      country = seg;
      break;
    }
  }

  return {
    kind: "Home",
    addressLine1,
    addressLine2,
    houseNumber,
    postalCode,
    city,
    state,
    country,
    isPrimary: false
  };
};

/** Same mapping as CRM rows, merged into flat `AddressValue` (house number + street on line 1). */
export const nominatimHitToAddressValue = (hit: NominatimGeocodeHit): AddressValue => {
  const row = nominatimHitToAddressFormRow(hit);
  const hn = (row.houseNumber ?? "").trim();
  const l1 = (row.addressLine1 ?? "").trim();
  const addressLine1 = [hn, l1].filter(Boolean).join(" ").trim();
  return {
    addressLine1,
    addressLine2: (row.addressLine2 ?? "").trim(),
    postalCode: (row.postalCode ?? "").trim(),
    city: (row.city ?? "").trim(),
    state: (row.state ?? "").trim(),
    country: (row.country ?? "").trim()
  };
};
