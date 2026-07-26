/** Regional-indicator pair → flag emoji (e.g. `NL` → 🇳🇱). Empty string if invalid. */
export const toFlagEmoji = (iso2: string): string => {
  const c = iso2.trim().toUpperCase();
  if (c.length !== 2 || !/^[A-Z]{2}$/.test(c)) return "";
  const base = 0x1f1e6; // Regional Indicator Symbol Letter A
  return String.fromCodePoint(base + (c.charCodeAt(0) - 65), base + (c.charCodeAt(1) - 65));
};
