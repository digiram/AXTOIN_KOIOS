/**
 * CSV serialization helpers.
 *
 * Escapes cell values and builds RFC-style comma-separated text for export endpoints.
 *
 * Responsibilities:
 * - Escape fields containing commas, quotes, or newlines
 * - Join header and data rows with CRLF line endings
 */

export const escapeCsvCell = (v: string | number | null | undefined): string => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

/** Builds a CSV document from a header row and data rows. */
export const buildCsv = (header: string[], rows: Array<Array<string | number | null | undefined>>): string => {
  const lines = [header.map(escapeCsvCell).join(",")];
  for (const row of rows) {
    lines.push(row.map(escapeCsvCell).join(","));
  }
  return lines.join("\r\n") + (lines.length > 1 ? "\r\n" : "");
};
