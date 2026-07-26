/**
 * Invoicing line and document total calculations.
 *
 * Pure math for subtotals, per-line tax (basis points), document aggregates,
 * and tax breakdown grouping — shared by API persistence and web preview.
 *
 * Responsibilities:
 * - Compute line subtotal/tax/total in minor currency units
 * - Aggregate document totals and tax breakdown entries
 *
 * Related:
 * - `invoicing.ts` line input types
 */
import type { InvoicingLineTotalsInput, InvoicingTaxBreakdownEntry } from "./invoicing.js";

const roundMinor = (n: number) => Math.round(n);

export type ComputedInvoicingLine = {
  lineSubtotalMinor: number;
  lineTaxMinor: number;
  lineTotalMinor: number;
};

/** Per-line subtotal, tax (from `taxRateBps`), and total in minor currency units. */
export const computeInvoicingLineTotals = (line: InvoicingLineTotalsInput): ComputedInvoicingLine => {
  const qty = Number(line.quantity);
  const unit = line.unitPriceMinor;
  const discount = line.discountMinor ?? 0;
  const raw = qty * unit - discount;
  const lineSubtotalMinor = roundMinor(Math.max(0, raw));
  const bps = line.taxRateBps ?? 0;
  const lineTaxMinor = bps > 0 ? roundMinor((lineSubtotalMinor * bps) / 10_000) : 0;
  return {
    lineSubtotalMinor,
    lineTaxMinor,
    lineTotalMinor: lineSubtotalMinor + lineTaxMinor
  };
};

/** Sums computed lines into document-level subtotal, tax, total, and rate breakdown. */
export const aggregateInvoicingDocumentTotals = (
  lines: ComputedInvoicingLine[]
): {
  subtotalExcludingTaxMinor: number;
  discountTotalMinor: number;
  taxTotalMinor: number;
  totalIncludingTaxMinor: number;
  taxBreakdown: InvoicingTaxBreakdownEntry[];
} => {
  let subtotalExcludingTaxMinor = 0;
  let taxTotalMinor = 0;
  const byRate = new Map<number, number>();

  for (const line of lines) {
    subtotalExcludingTaxMinor += line.lineSubtotalMinor;
    taxTotalMinor += line.lineTaxMinor;
  }

  const taxBreakdown: InvoicingTaxBreakdownEntry[] = [...byRate.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([taxRateBps, taxMinor]) => ({ taxRateBps, taxMinor }));

  return {
    subtotalExcludingTaxMinor,
    discountTotalMinor: 0,
    taxTotalMinor,
    totalIncludingTaxMinor: subtotalExcludingTaxMinor + taxTotalMinor,
    taxBreakdown
  };
};

/** Rebuild tax breakdown from line inputs (uses rate on each line). */
export const aggregateInvoicingLinesWithTaxBreakdown = (
  lineInputs: InvoicingLineTotalsInput[]
): ReturnType<typeof aggregateInvoicingDocumentTotals> & { lines: ComputedInvoicingLine[] } => {
  const lines = lineInputs.map(computeInvoicingLineTotals);
  let subtotalExcludingTaxMinor = 0;
  let discountTotalMinor = 0;
  let taxTotalMinor = 0;
  const byRate = new Map<number, number>();

  lineInputs.forEach((input, i) => {
    const computed = lines[i]!;
    subtotalExcludingTaxMinor += computed.lineSubtotalMinor;
    taxTotalMinor += computed.lineTaxMinor;
    discountTotalMinor += input.discountMinor ?? 0;
    const bps = input.taxRateBps ?? 0;
    if (bps > 0 && computed.lineTaxMinor > 0) {
      byRate.set(bps, (byRate.get(bps) ?? 0) + computed.lineTaxMinor);
    }
  });

  const taxBreakdown: InvoicingTaxBreakdownEntry[] = [...byRate.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([taxRateBps, taxMinor]) => ({ taxRateBps, taxMinor }));

  return {
    lines,
    subtotalExcludingTaxMinor,
    discountTotalMinor,
    taxTotalMinor,
    totalIncludingTaxMinor: subtotalExcludingTaxMinor + taxTotalMinor,
    taxBreakdown
  };
};

export type InvoicingStoredLineTotals = {
  lineSubtotalMinor: number;
  lineTaxMinor: number;
  lineTotalMinor: number;
  discountMinor?: number;
  taxRateBps?: number | null;
};

/** Sum persisted line totals (supports payment credit lines with negative amounts). */
export const sumInvoicingDocumentTotalsFromStoredLines = (
  lines: ReadonlyArray<InvoicingStoredLineTotals>
): {
  subtotalExcludingTaxMinor: number;
  discountTotalMinor: number;
  taxTotalMinor: number;
  totalIncludingTaxMinor: number;
  taxBreakdown: InvoicingTaxBreakdownEntry[];
} => {
  let subtotalExcludingTaxMinor = 0;
  let discountTotalMinor = 0;
  let taxTotalMinor = 0;
  const byRate = new Map<number, number>();

  for (const line of lines) {
    subtotalExcludingTaxMinor += line.lineSubtotalMinor;
    taxTotalMinor += line.lineTaxMinor;
    discountTotalMinor += line.discountMinor ?? 0;
    const bps = line.taxRateBps ?? 0;
    if (bps > 0 && line.lineTaxMinor !== 0) {
      byRate.set(bps, (byRate.get(bps) ?? 0) + line.lineTaxMinor);
    }
  }

  const taxBreakdown: InvoicingTaxBreakdownEntry[] = [...byRate.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([taxRateBps, taxMinor]) => ({ taxRateBps, taxMinor }));

  return {
    subtotalExcludingTaxMinor,
    discountTotalMinor,
    taxTotalMinor,
    totalIncludingTaxMinor: subtotalExcludingTaxMinor + taxTotalMinor,
    taxBreakdown
  };
};
