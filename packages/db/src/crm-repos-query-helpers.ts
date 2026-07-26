/**
 * Shared CRM query helpers (LIKE escaping, UTC day boundaries). Extracted from `crm-repos.ts` for
 * smaller compilation units and clearer reuse as the CRM module grows.
 */

export const escapeLike = (raw: string): string =>
  raw.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");

/** UTC midnight for `YYYY-MM-DD`. */
export const utcDayStart = (ymd: string): Date => new Date(`${ymd}T00:00:00.000Z`);

/** First instant after the inclusive end day (for `YYYY-MM-DD`). */
export const utcDayAfterInclusiveEnd = (ymd: string): Date => {
  const d = utcDayStart(ymd);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
};
