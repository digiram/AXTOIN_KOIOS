/**
 * ISO 4217 currency codes with English display names via `Intl.DisplayNames` when
 * `Intl.supportedValuesOf('currency')` exists; otherwise a compact fallback list.
 */

export type CurrencyOption = { code: string; name: string };

const FALLBACK: CurrencyOption[] = [
  { code: "AED", name: "UAE dirham" },
  { code: "AUD", name: "Australian dollar" },
  { code: "BRL", name: "Brazilian real" },
  { code: "CAD", name: "Canadian dollar" },
  { code: "CHF", name: "Swiss franc" },
  { code: "DKK", name: "Danish krone" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "Pound sterling" },
  { code: "INR", name: "Indian rupee" },
  { code: "JPY", name: "Japanese yen" },
  { code: "KRW", name: "South Korean won" },
  { code: "MXN", name: "Mexican peso" },
  { code: "NOK", name: "Norwegian krone" },
  { code: "NZD", name: "New Zealand dollar" },
  { code: "PLN", name: "Polish zloty" },
  { code: "SEK", name: "Swedish krona" },
  { code: "SGD", name: "Singapore dollar" },
  { code: "USD", name: "US dollar" },
  { code: "ZAR", name: "South African rand" }
].sort((a, b) => a.name.localeCompare(b.name));

let cache: CurrencyOption[] | null = null;

/** ISO 4217 options sorted by currency name (code is three letters). */
export const getIso4217CurrencyOptions = (): CurrencyOption[] => {
  if (cache) return cache;
  try {
    const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
    if (typeof intl.supportedValuesOf === "function") {
      const codes = intl.supportedValuesOf("currency");
      const dn = new Intl.DisplayNames(["en"], { type: "currency" });
      const uniq = [...new Set(codes.map((c) => c.toUpperCase()).filter((c) => /^[A-Z]{3}$/.test(c)))];
      cache = uniq.map((code) => ({ code, name: dn.of(code) ?? code })).sort((a, b) => a.name.localeCompare(b.name));
      return cache;
    }
  } catch {
    /* ignore */
  }
  cache = [...FALLBACK];
  return cache;
};

/**
 * Localized currency symbol for compact UI (e.g. field prefix). Falls back to the ISO code when
 * `Intl` cannot resolve the currency.
 */
export function getCurrencySymbol(code: string): string {
  const c = code.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(c)) return c;
  try {
    const parts = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: c,
      currencyDisplay: "narrowSymbol"
    }).formatToParts(0);
    const sym = parts.find((p) => p.type === "currency")?.value?.trim();
    return sym || c;
  } catch {
    return c;
  }
}
