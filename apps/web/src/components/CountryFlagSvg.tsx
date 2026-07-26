/**
 * CountryFlagSvg
 *
 * Renders ISO country flags in searchable selects and list rows.
 *
 * Responsibilities:
 * - Map preset ISO codes to tree-shaken SVG components from `country-flag-icons`
 * - Fall back to regional-indicator emoji for unknown codes
 *
 * Depends on:
 * - `COUNTRY_PRESETS` keys kept in sync with `FLAG_REGISTRY`
 *
 * Related:
 * - `SearchableCountrySelect`
 */
import {
  AT,
  AU,
  AE,
  BE,
  BR,
  CA,
  CH,
  DE,
  DK,
  ES,
  FI,
  FR,
  GB,
  IE,
  IN,
  IT,
  JP,
  KR,
  MX,
  NL,
  NO,
  NZ,
  PL,
  PT,
  SE,
  SG,
  US,
  ZA
} from "country-flag-icons/react/3x2";

import { toFlagEmoji } from "../lib/flag-emoji.js";

type RegistryFlag = typeof US;

/** Explicit imports so Vite tree-shakes unused flags. Keep in sync with `COUNTRY_PRESETS` keys. */
const FLAG_REGISTRY: Record<string, RegistryFlag> = {
  AT,
  AU,
  AE,
  BE,
  BR,
  CA,
  CH,
  DE,
  DK,
  ES,
  FI,
  FR,
  GB,
  IE,
  IN,
  IT,
  JP,
  KR,
  MX,
  NL,
  NO,
  NZ,
  PL,
  PT,
  SE,
  SG,
  US,
  ZA
};

/** Props for {@link CountryFlagSvg}. */
export type CountryFlagSvgProps = {
  code: string;
  className?: string;
  /** Slightly smaller emoji when SVG is unavailable (e.g. future preset codes). */
  variant?: "field" | "list";
};

/**
 * Renders a 3×2 SVG flag from `country-flag-icons` for known preset ISO codes;
 * falls back to regional-indicator emoji for unknown codes.
 */
export function CountryFlagSvg({ code, className, variant = "field" }: CountryFlagSvgProps) {
  const c = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return null;

  const Flag = FLAG_REGISTRY[c];
  if (Flag) {
    return (
      <span className="inline-flex items-center justify-center" title={c} aria-hidden>
        <Flag className={className} aria-hidden />
      </span>
    );
  }

  const emojiClass =
    variant === "list"
      ? "select-none text-base leading-none"
      : "select-none text-[1.25rem] leading-none";
  return (
    <span className={emojiClass} title={c} aria-hidden>
      {toFlagEmoji(c)}
    </span>
  );
}
