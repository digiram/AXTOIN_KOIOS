/**
 * Invoicing UI helpers.
 *
 * Shared Tailwind class names, labels, and table chrome for invoicing and quoting list and form screens.
 *
 * Responsibilities:
 * - Export consistent data-table and field styling tokens
 * - Host small presentation helpers reused across invoicing and quoting pages
 *
 * Related:
 * - Sibling page and modal components in invoicing
 */
import {
  computeInvoicingLineTotals,
  formatInvoicingStatus,
  type InvoicingDocumentKind,
  type InvoicingDocumentThemeColor,
  type InvoicingLineItemInput
} from "@starter/shared";

import { readApiErrorMessage } from "../../lib/api-error.js";
import type { InvoicingAmountFormatters } from "./useInvoicingDisplayFormatters.js";

/** Data-table chrome aligned with company-subscriptions / CRM list tables. */
export const invDataTableShellClass =
  "w-full min-w-0 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm";
/** Shared constant or class token for invoicing & quoting presentation. */
export const invDataTableClass =
  "w-full min-w-[640px] table-auto border-collapse text-left divide-y divide-slate-200";
/** Line items — fixed columns so uppercase headers stay on one line. */
export const invLineItemsTableClass =
  "w-full min-w-[52rem] table-fixed border-collapse text-left divide-y divide-slate-200";
/** Shared constant or class token for invoicing & quoting presentation. */
export const invLineItemsColDescClass = "min-w-0";
/** Shared constant or class token for invoicing & quoting presentation. */
export const invLineItemsColQtyClass = "w-[4.5rem]";
/** Shared constant or class token for invoicing & quoting presentation. */
export const invLineItemsColUnitClass = "w-[5.5rem]";
/** Shared constant or class token for invoicing & quoting presentation. */
export const invLineItemsColPriceClass = "w-[8rem]";
/** Shared constant or class token for invoicing & quoting presentation. */
export const invLineItemsColTaxClass = "w-[8rem]";
/** Shared constant or class token for invoicing & quoting presentation. */
export const invLineItemsColTotalClass = "w-[7.5rem]";
/** Shared constant or class token for invoicing & quoting presentation. */
export const invLineItemsColActionsClass = "w-[3.25rem]";
/** Stacked quotes / offers / invoices on the overview — identical column widths across tables. */
export const invOverviewDocumentsDataTableClass =
  "w-full min-w-[800px] table-fixed border-collapse text-left divide-y divide-slate-200";
/** Shared constant or class token for invoicing & quoting presentation. */
export const invOverviewDocumentsColgroupClassNames = [
  "w-[13%]",
  "w-[9%]",
  "w-[7%]",
  "w-[18%]",
  "w-[14%]",
  "w-[14%]",
  "w-[13%]",
  "w-[12%]"
] as const;
/** Shared constant or class token for invoicing & quoting presentation. */
export const invOverviewDocumentsNumberTdClass = "px-3 py-2 align-middle";
/** Shared constant or class token for invoicing & quoting presentation. */
export const invOverviewDocumentsCustomerTdClass = "px-3 py-2 align-middle text-slate-700";
/** Shared constant or class token for invoicing & quoting presentation. */
export const invOverviewDocumentsCompactTdClass = "whitespace-nowrap px-3 py-2 align-middle text-slate-700";
/** Shared constant or class token for invoicing & quoting presentation. */
export const invOverviewDocumentsCompactThClass =
  "whitespace-nowrap px-3 py-2 align-bottom text-xs font-medium uppercase tracking-wider text-slate-500";
/** Shared constant or class token for invoicing & quoting presentation. */
export const invOverviewDocumentsActionsThClass =
  "border-l border-slate-200 px-0 py-2 align-bottom text-left text-xs font-medium uppercase tracking-wider text-slate-500";
/** Shared constant or class token for invoicing & quoting presentation. */
export const invOverviewDocumentsActionsTdClass = "h-px border-l border-slate-200 p-0 align-top text-sm";
/** Shared constant or class token for invoicing & quoting presentation. */
export const invOverviewDocumentsActionRailClass = "flex h-full min-h-[2.75rem] w-full";

/** Compact list filter bar — catalog, overview, picker modal. */
export const invFilterControlHeightClass = "h-9";
/** Shared constant or class token for invoicing & quoting presentation. */
export const invFilterBarClass = "flex min-w-0 flex-nowrap items-center gap-2 overflow-x-auto";
/** Shared constant or class token for invoicing & quoting presentation. */
export const invFocusRingClass = "focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
/** Shared constant or class token for invoicing & quoting presentation. */
export const invFocusVisibleRingClass = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/45";
/** Shared constant or class token for invoicing & quoting presentation. */
export const invFilterInputClass = [
  "min-w-0 rounded-lg border border-stone-200 bg-white px-2.5 text-sm text-stone-900 shadow-sm",
  invFocusRingClass,
  invFilterControlHeightClass
].join(" ");
/** Shared constant or class token for invoicing & quoting presentation. */
export const invFilterSelectClass = [
  "shrink-0 rounded-lg border border-stone-200 bg-white px-2 text-sm text-stone-900 shadow-sm",
  invFocusRingClass,
  invFilterControlHeightClass
].join(" ");
/** Shared constant or class token for invoicing & quoting presentation. */
export const invFilterPillGroupClass = [
  "inline-flex shrink-0 items-stretch gap-0.5 rounded-full border border-stone-200 bg-stone-100 p-0.5",
  invFilterControlHeightClass
].join(" ");
/** Shared constant or class token for invoicing & quoting presentation. */
export const invFilterPillClass = (active: boolean) =>
  [
    "inline-flex h-full items-center rounded-full px-3 text-xs font-semibold transition-colors",
    invFocusVisibleRingClass,
    active
      ? "bg-white text-slate-900 shadow-sm ring-1 ring-stone-200/80"
      : "text-stone-600 hover:text-slate-900"
  ].join(" ");
/** Filter card chrome — aligned with CRM, sales, company-subscriptions list pages. */
export const invFilterSectionHeadingClass = "mb-3 mt-6 flex items-center gap-2 text-stone-800";
/** Shared constant or class token for invoicing & quoting presentation. */
export const invFilterSectionClass =
  "rounded-2xl border border-stone-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,15,15,0.06)] sm:p-6";

/** Fixed-width type badges on the documents overview table. */
export const invDocumentKindBadgeBaseClass =
  "inline-flex w-[5.25rem] shrink-0 items-center justify-center rounded-full border px-2.5 py-0.5 text-xs font-medium leading-none shadow-sm";

/** Shared constant or class token for invoicing & quoting presentation. */
export const invDocumentKindBadgeClass = (kind: InvoicingDocumentKind): string => {
  switch (kind) {
    case "quote":
      return "border-stone-300/80 bg-stone-100 text-stone-700";
    case "offer":
      return "border-amber-200/80 bg-amber-50 text-amber-950";
    case "invoice":
      return "border-emerald-200/80 bg-emerald-50 text-emerald-900";
    default:
      return "border-stone-200/80 bg-stone-50 text-stone-800";
  }
};

/** Status badges in lists and the properties sidebar — distinct from printable document chrome. */
export const invDocumentStatusBadgeBaseClass =
  "inline-flex max-w-full items-center justify-center rounded-full border px-2.5 py-0.5 text-xs font-medium leading-none shadow-sm";

export { formatInvoicingStatus };

/** Shared constant or class token for invoicing & quoting presentation. */
export const invDocumentStatusBadgeClass = (status: string): string => {
  switch (status) {
    case "quote_draft":
    case "offer_draft":
    case "invoice_draft":
      return "border-slate-300/80 bg-slate-100 text-slate-800";
    case "quote_converted_to_offer":
    case "quote_converted_to_invoice":
    case "offer_converted_to_invoice":
      return "border-violet-200/80 bg-violet-50 text-violet-950";
    case "offer_sent":
    case "invoice_sent":
    case "invoice_finalized":
      return "border-sky-200/80 bg-sky-50 text-sky-950";
    case "offer_accepted":
    case "invoice_paid":
    case "invoice_accredited":
      return "border-emerald-200/80 bg-emerald-50 text-emerald-900";
    case "offer_rejected":
    case "invoice_disputed":
      return "border-rose-200/80 bg-rose-50 text-rose-900";
    case "invoice_dispute_acknowledged":
      return "border-violet-200/80 bg-violet-50 text-violet-950";
    case "offer_demoted":
      return "border-amber-200/80 bg-amber-50 text-amber-950";
    case "invoice_demoted":
      return "border-amber-200/80 bg-amber-50 text-amber-950";
    case "invoice_partially_paid":
      return "border-amber-200/80 bg-amber-50 text-amber-900";
    case "invoice_overdue":
      return "border-rose-200/80 bg-rose-50 text-rose-950";
    case "offer_expired":
      return "border-orange-200/80 bg-orange-50 text-orange-950";
    case "quote_archived":
    case "offer_archived":
    case "invoice_archived":
      return "border-stone-300/80 bg-stone-100 text-stone-600";
    default:
      return "border-stone-200/80 bg-stone-50 text-stone-800";
  }
};

/** Printable document shell for quote / offer / invoice detail views. */
export const invDocumentPaperClass =
  "w-full rounded-lg border border-stone-200 bg-white p-6 shadow-sm sm:p-10 print:border-stone-300 print:shadow-none";

/** Detail page: document ~80% and properties sidebar ~20%, single shared page scroll. */
export const invDocumentDetailFrameGridClass =
  "grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,1fr)] lg:items-start";

/** Stacked action buttons in the document detail sidebar. */
export const invDocumentSidebarActionsClass = "flex w-full flex-col gap-2";
/** Shared constant or class token for invoicing & quoting presentation. */
export const invDocumentSidebarActionClass =
  "inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium shadow-sm disabled:opacity-60";
/** Shared constant or class token for invoicing & quoting presentation. */
export const invDocumentSidebarActionSecondaryClass = [
  invDocumentSidebarActionClass,
  "border border-stone-200 bg-white text-stone-800 hover:bg-stone-50"
].join(" ");
/** Shared constant or class token for invoicing & quoting presentation. */
export const invDocumentSidebarActionPrimaryClass = [
  invDocumentSidebarActionClass,
  "bg-indigo-600 text-white hover:bg-indigo-700"
].join(" ");
/** Shared constant or class token for invoicing & quoting presentation. */
export const invDocumentSidebarActionSuccessClass = [
  invDocumentSidebarActionClass,
  "bg-emerald-600 text-white hover:bg-emerald-700"
].join(" ");
/** Shared constant or class token for invoicing & quoting presentation. */
export const invDocumentSidebarActionDangerClass = [
  invDocumentSidebarActionClass,
  "bg-rose-600 text-white hover:bg-rose-700"
].join(" ");

/** Invoicing module navigation and inline links — aligned with app indigo chrome. */
export const invBackLinkClass = "text-sm font-medium text-indigo-700 hover:text-indigo-600";
/** Shared constant or class token for invoicing & quoting presentation. */
export const invPrimaryButtonClass =
  "rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60";

/** Shared constant or class token for invoicing & quoting presentation. */
export const invDocumentKindAccentClass = (_kind: InvoicingDocumentKind): string => "text-indigo-700";

/** Printable document accent — tenant-configurable base color. */
export type InvoicingDocumentPrintTheme = {
  tableHeader: string;
  grandTotal: string;
  grandTotalHighlight: string;
  logoBlock: string;
  iconTile: string;
  accentLabel: string;
};

const invDocumentPrintThemes: Record<InvoicingDocumentThemeColor, InvoicingDocumentPrintTheme> = {
  purple: {
    tableHeader: "bg-indigo-600",
    grandTotal: "bg-indigo-600",
    grandTotalHighlight: "bg-black/15",
    logoBlock: "bg-indigo-950",
    iconTile: "bg-indigo-600 text-white",
    accentLabel: "text-indigo-700"
  },
  red: {
    tableHeader: "bg-red-600",
    grandTotal: "bg-red-600",
    grandTotalHighlight: "bg-black/15",
    logoBlock: "bg-red-950",
    iconTile: "bg-red-600 text-white",
    accentLabel: "text-red-700"
  },
  green: {
    tableHeader: "bg-emerald-600",
    grandTotal: "bg-emerald-600",
    grandTotalHighlight: "bg-black/15",
    logoBlock: "bg-emerald-950",
    iconTile: "bg-emerald-600 text-white",
    accentLabel: "text-emerald-700"
  },
  blue: {
    tableHeader: "bg-blue-600",
    grandTotal: "bg-blue-600",
    grandTotalHighlight: "bg-black/15",
    logoBlock: "bg-blue-950",
    iconTile: "bg-blue-600 text-white",
    accentLabel: "text-blue-700"
  },
  gray: {
    tableHeader: "bg-slate-600",
    grandTotal: "bg-slate-600",
    grandTotalHighlight: "bg-black/15",
    logoBlock: "bg-slate-800",
    iconTile: "bg-slate-600 text-white",
    accentLabel: "text-slate-700"
  },
  black_yellow: {
    tableHeader: "bg-black text-yellow-400",
    grandTotal: "bg-black text-yellow-400",
    grandTotalHighlight: "bg-yellow-500/25",
    logoBlock: "bg-black",
    iconTile: "bg-yellow-400 text-black",
    accentLabel: "text-yellow-600"
  }
};

/** Shared constant or class token for invoicing & quoting presentation. */
export const invDocumentPrintTheme = (
  themeColor: InvoicingDocumentThemeColor = "purple"
): InvoicingDocumentPrintTheme => invDocumentPrintThemes[themeColor] ?? invDocumentPrintThemes.purple;

/** Shared constant or class token for invoicing & quoting presentation. */
export const invDocumentKindTheme = (
  _kind: InvoicingDocumentKind,
  themeColor: InvoicingDocumentThemeColor = "purple"
) => invDocumentPrintTheme(themeColor);

/** Shared constant or class token for invoicing & quoting presentation. */
export const invDocumentNumberLabel = (kind: InvoicingDocumentKind): string => {
  switch (kind) {
    case "quote":
      return "Quote number";
    case "offer":
      return "Offer number";
    case "invoice":
      return "Invoice number";
    default:
      return "Document number";
  }
};

/** Shared constant or class token for invoicing & quoting presentation. */
export const invDocumentCreatedOnLabel = (kind: InvoicingDocumentKind): string =>
  kind === "invoice" ? "Sent on" : "Created on";

/** Shared constant or class token for invoicing & quoting presentation. */
export const invDocumentSectionLabelClass =
  "text-xs font-semibold uppercase tracking-wider text-slate-500";

/** Shared constant or class token for invoicing & quoting presentation. */
export const invTableHeadClass = "bg-slate-50";
/** Shared constant or class token for invoicing & quoting presentation. */
export const invCompactThClass =
  "w-[1%] whitespace-nowrap px-3 py-2 align-bottom text-xs font-medium uppercase tracking-wider text-slate-500";
/** Shared constant or class token for invoicing & quoting presentation. */
export const invCompactTdClass = "w-[1%] whitespace-nowrap px-3 py-2 align-middle";
/** Shared constant or class token for invoicing & quoting presentation. */
export const invPrimaryColThClass =
  "min-w-[12rem] px-3 py-2 align-bottom text-left text-xs font-medium uppercase tracking-wider text-slate-500";
/** Shared constant or class token for invoicing & quoting presentation. */
export const invPrimaryColTdClass = "max-w-0 px-3 py-2 align-middle";
/** Shared constant or class token for invoicing & quoting presentation. */
export const invActionsThClass =
  "w-[4.5rem] min-w-[4.5rem] max-w-[4.5rem] border-l border-slate-200 px-0 py-2 align-bottom text-left text-xs font-medium uppercase tracking-wider text-slate-500";
/** h-px lets the inner rail stretch to the full row height in editable tables. */
export const invActionsTdClass = "h-px border-l border-slate-200 p-0 align-top text-sm";
/** Shared constant or class token for invoicing & quoting presentation. */
export const invActionRailClass = "flex h-full min-h-[2.75rem] w-full";
const invActionBtnBase =
  "flex flex-1 items-center justify-center transition focus:outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-40";
/** Shared constant or class token for invoicing & quoting presentation. */
export const invActionBtnViewClass = `${invActionBtnBase} bg-indigo-100 text-indigo-950 hover:bg-indigo-200 focus-visible:ring-indigo-400/80`;
/** Shared constant or class token for invoicing & quoting presentation. */
export const invActionBtnDeleteClass = `${invActionBtnBase} bg-rose-100 text-rose-950 hover:bg-rose-200 focus-visible:ring-rose-400/80`;
/** Shared constant or class token for invoicing & quoting presentation. */
export const invTableBodyClass = "divide-y divide-slate-100 text-sm text-slate-700";
/** Shared constant or class token for invoicing & quoting presentation. */
export const invTableEmptyCellClass = "px-3 py-16 text-center text-sm text-slate-500";

/** Shared constant or class token for invoicing & quoting presentation. */
export const invTableStripedRowClass = (idx: number, extra?: string) =>
  [idx % 2 === 0 ? "bg-white" : "bg-slate-50/40", "transition-colors hover:bg-slate-100/80", extra]
    .filter(Boolean)
    .join(" ");

/** Shared constant or class token for invoicing & quoting presentation. */
export const invTableThClass = invCompactThClass;
/** Shared constant or class token for invoicing & quoting presentation. */
export const invTableTdClass = `${invCompactTdClass} text-slate-700`;

/** Line-item column widths — description grows; numeric columns stay readable. */
export const invLineColDescThClass =
  "min-w-0 whitespace-nowrap px-3 py-2 align-bottom text-left text-xs font-medium uppercase tracking-wider text-slate-500";
/** Shared constant or class token for invoicing & quoting presentation. */
export const invLineColDescTdClass = "min-w-0 px-3 py-2 align-middle";
/** Shared constant or class token for invoicing & quoting presentation. */
export const invLineColQtyThClass = `${invCompactThClass} ${invLineItemsColQtyClass} min-w-[4.5rem] text-right`;
/** Shared constant or class token for invoicing & quoting presentation. */
export const invLineColQtyTdClass = `${invCompactTdClass} ${invLineItemsColQtyClass} min-w-[4.5rem] text-right`;
/** Shared constant or class token for invoicing & quoting presentation. */
export const invLineColUnitThClass = `${invCompactThClass} ${invLineItemsColUnitClass} min-w-[5.5rem]`;
/** Shared constant or class token for invoicing & quoting presentation. */
export const invLineColUnitTdClass = `${invCompactTdClass} ${invLineItemsColUnitClass} min-w-[5.5rem]`;
/** Shared constant or class token for invoicing & quoting presentation. */
export const invLineColPriceThClass = `${invCompactThClass} ${invLineItemsColPriceClass} min-w-[8rem] text-right`;
/** Shared constant or class token for invoicing & quoting presentation. */
export const invLineColPriceTdClass = `${invCompactTdClass} ${invLineItemsColPriceClass} min-w-[8rem] text-right`;
/** Shared constant or class token for invoicing & quoting presentation. */
export const invLineColTaxThClass = `${invCompactThClass} ${invLineItemsColTaxClass} min-w-[8rem] text-right`;
/** Shared constant or class token for invoicing & quoting presentation. */
export const invLineColTaxTdClass = `${invCompactTdClass} ${invLineItemsColTaxClass} min-w-[8rem] text-right`;
/** Shared constant or class token for invoicing & quoting presentation. */
export const invLineColTotalThClass = `${invCompactThClass} ${invLineItemsColTotalClass} min-w-[7.5rem] text-right`;
/** Shared constant or class token for invoicing & quoting presentation. */
export const invLineColTotalTdClass = `${invCompactTdClass} ${invLineItemsColTotalClass} min-w-[7.5rem] text-right tabular-nums`;
/** Shared constant or class token for invoicing & quoting presentation. */
export const invLineColActionsThClass = invActionsThClass;
/** Shared constant or class token for invoicing & quoting presentation. */
export const invLineColActionsTdClass = invActionsTdClass;

/** Compact control for cells inside the line-items table. */
export const invTableInputClass =
  ["w-full min-w-0 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-sm text-stone-900 shadow-sm", invFocusRingClass, "disabled:bg-stone-50 disabled:text-stone-500"].join(" ");

/** Shared constant or class token for invoicing & quoting presentation. */
export const invFieldClass =
  ["mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm", invFocusRingClass].join(" ");

/** Shared constant or class token for invoicing & quoting presentation. */
export const invLabelClass = "block text-xs font-semibold uppercase tracking-wide text-stone-600";

/** Shared constant or class token for invoicing & quoting presentation. */
export const majorStringToMinor = (raw: string): number | null => {
  const n = Number.parseFloat(raw.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
};

/** Shared constant or class token for invoicing & quoting presentation. */
export const minorToMajorString = (minor: number) => (minor / 100).toFixed(2);

const defaultAmountFormatters: InvoicingAmountFormatters = {
  parseMajorToMinor: majorStringToMinor,
  formatMinorToMajor: minorToMajorString
};

/** Shared constant or class token for invoicing & quoting presentation. */
export const readInvoicingApiError = (res: Response, fallback: string) => readApiErrorMessage(res, fallback);

/** Shared constant or class token for invoicing & quoting presentation. */
export const bpsToPercentString = (bps: number | null | undefined) =>
  bps != null && bps > 0 ? String(bps / 100) : "";

/** Shared constant or class token for invoicing & quoting presentation. */
export const percentStringToBps = (raw: string): number | null => {
  const t = raw.trim();
  if (!t) return null;
  const n = Number.parseFloat(t.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
};

/** React component for invoicing & quoting UI. */
export type InvoicingLineDraft = {
  key: string;
  description: string;
  quantity: string;
  unitLabel: string;
  unitPriceMajor: string;
  discountMajor: string;
  taxRateBps: number | null;
  catalogItemId?: string | null;
};

/** Shared constant or class token for invoicing & quoting presentation. */
export const emptyLineDraft = (defaultTaxRateBps: number | null = null): InvoicingLineDraft => ({
  key: crypto.randomUUID(),
  description: "",
  quantity: "1",
  unitLabel: "unit",
  unitPriceMajor: "",
  discountMajor: "0",
  taxRateBps: defaultTaxRateBps
});

/** Shared constant or class token for invoicing & quoting presentation. */
export const lineDraftToInput = (
  line: InvoicingLineDraft,
  formatters: InvoicingAmountFormatters = defaultAmountFormatters
): InvoicingLineItemInput | null => {
  const description = line.description.trim();
  if (!description) return null;
  const quantity = Number.parseFloat(line.quantity.replace(",", "."));
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  const unitPriceMinor = formatters.parseMajorToMinor(line.unitPriceMajor);
  if (unitPriceMinor == null) return null;
  const discountMinor = formatters.parseMajorToMinor(line.discountMajor || "0") ?? 0;
  return {
    description,
    quantity,
    unitLabel: line.unitLabel.trim() || "unit",
    unitPriceMinor,
    discountMinor,
    taxRateBps: line.taxRateBps,
    catalogItemId: line.catalogItemId ?? null,
    lineKind: line.catalogItemId ? "catalog" : "manual"
  };
};

/** Shared constant or class token for invoicing & quoting presentation. */
export const draftLineDisplayTotals = (
  line: InvoicingLineDraft,
  formatters: InvoicingAmountFormatters = defaultAmountFormatters
) => {
  const input = lineDraftToInput(line, formatters);
  if (!input) return null;
  return computeInvoicingLineTotals(input);
};

/** Sum of line totals from valid draft rows (updates as the user edits lines). */
export const sumDraftLinesTotalMinor = (
  lines: InvoicingLineDraft[],
  formatters: InvoicingAmountFormatters = defaultAmountFormatters
): number =>
  lines.reduce((sum, line) => sum + (draftLineDisplayTotals(line, formatters)?.lineTotalMinor ?? 0), 0);

/** Shared constant or class token for invoicing & quoting presentation. */
export const invReadOnlyFieldClass =
  "mt-1 flex min-h-[2.625rem] w-full items-center rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-medium tabular-nums text-slate-900";

/** Shared constant or class token for invoicing & quoting presentation. */
export const lineDraftFromApi = (
  line: {
    description: string;
    quantity: number;
    unitLabel: string;
    unitPriceMinor: number;
    discountMinor: number;
    taxRateBps: number | null;
    catalogItemId?: string | null;
  },
  formatters: InvoicingAmountFormatters = defaultAmountFormatters
): InvoicingLineDraft => ({
  key: crypto.randomUUID(),
  description: line.description,
  quantity: String(line.quantity),
  unitLabel: line.unitLabel,
  unitPriceMajor: formatters.formatMinorToMajor(line.unitPriceMinor),
  discountMajor: formatters.formatMinorToMajor(line.discountMinor),
  taxRateBps: line.taxRateBps,
  catalogItemId: line.catalogItemId
});

/** React component for invoicing & quoting UI. */
export type InvoicingLineItemView = {
  id?: string;
  description: string;
  quantity: number;
  unitLabel: string;
  unitPriceMinor: number;
  discountMinor: number;
  taxRateBps: number | null;
  lineSubtotalMinor: number;
  lineTaxMinor: number;
  lineTotalMinor: number;
  sku?: string | null;
};
