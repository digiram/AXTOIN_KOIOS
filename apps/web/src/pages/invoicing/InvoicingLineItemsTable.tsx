/**
 * Invoicing Line Items Table.
 *
 * Reusable invoicing and quoting UI building block: Invoicing Line Items Table.
 *
 * Responsibilities:
 * - Encapsulate a focused interaction or form segment
 * - Keep parent pages thin by isolating validation and presentation
 *
 * Related:
 * - Route: /admin/invoicing
 */
import type { InvoicingDocumentKind, InvoicingDocumentThemeColor, InvoicingTaxRateOption } from "@starter/shared";
import { invoicingTaxRateOptionLabel } from "@starter/shared";
import {
  invDataTableShellClass,
  invDocumentKindTheme,
  invLineColDescTdClass,
  invLineColDescThClass,
  invLineColPriceTdClass,
  invLineColPriceThClass,
  invLineColQtyTdClass,
  invLineColQtyThClass,
  invLineColTaxTdClass,
  invLineColTaxThClass,
  invLineColTotalTdClass,
  invLineColTotalThClass,
  invLineColUnitTdClass,
  invLineColUnitThClass,
  invLineItemsColDescClass,
  invLineItemsColPriceClass,
  invLineItemsColQtyClass,
  invLineItemsColTaxClass,
  invLineItemsColTotalClass,
  invLineItemsColUnitClass,
  invLineItemsTableClass,
  invTableBodyClass,
  invTableHeadClass,
  invTableStripedRowClass,
  type InvoicingLineItemView
} from "./invoicingUi.js";
import { useInvoicingDisplayFormatters } from "./useInvoicingDisplayFormatters.js";

type Props = {
  currencyCode: string;
  lines: InvoicingLineItemView[];
  taxRateOptions?: InvoicingTaxRateOption[];
  variant?: "admin" | "document";
  kind?: InvoicingDocumentKind;
  documentThemeColor?: InvoicingDocumentThemeColor;
};

/** React component for invoicing & quoting UI. */
export const InvoicingLineItemsTable = ({
  currencyCode,
  lines,
  taxRateOptions = [],
  variant = "admin",
  kind = "quote",
  documentThemeColor = "purple"
}: Props) => {
  const { formatMoney, formatDocumentMoney } = useInvoicingDisplayFormatters();
  const formatLineMoney = variant === "document" ? formatDocumentMoney : formatMoney;

  if (lines.length === 0) {
    return <p className="text-sm text-stone-500">No line items.</p>;
  }

  if (variant === "document") {
    const theme = invDocumentKindTheme(kind, documentThemeColor);
    return (
      <table className="w-full min-w-[52rem] table-fixed border-collapse text-left text-sm text-slate-800" aria-label="Line items">
        <colgroup>
          <col className={invLineItemsColDescClass} />
          <col className={invLineItemsColQtyClass} />
          <col className={invLineItemsColUnitClass} />
          <col className={invLineItemsColPriceClass} />
          <col className={invLineItemsColTaxClass} />
          <col className={invLineItemsColTotalClass} />
        </colgroup>
        <thead>
          <tr className={`text-xs uppercase tracking-wide text-white ${theme.tableHeader}`}>
            <th scope="col" className="whitespace-nowrap px-3 py-2.5 text-left font-semibold">
              Description
            </th>
            <th scope="col" className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">
              Qty
            </th>
            <th scope="col" className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">
              Unit
            </th>
            <th scope="col" className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">
              Unit price
            </th>
            <th scope="col" className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">
              Tax
            </th>
            <th scope="col" className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, i) => (
            <tr key={line.id ?? i} className="border-b border-stone-200 bg-white even:bg-stone-50/50">
              <td className="px-3 py-3 align-top">
                <span className="font-semibold text-slate-900">{line.description}</span>
                {line.sku ? <span className="mt-0.5 block text-xs text-slate-500">{line.sku}</span> : null}
              </td>
              <td className="px-3 py-3 text-right tabular-nums text-slate-700">
                {line.quantity}
              </td>
              <td className="px-3 py-3 text-right text-slate-700">
                {line.unitLabel}
              </td>
              <td className="px-3 py-3 text-right tabular-nums text-slate-700">
                {formatLineMoney(line.unitPriceMinor, currencyCode)}
              </td>
              <td className="px-3 py-3 text-right text-slate-700">
                {invoicingTaxRateOptionLabel(taxRateOptions, line.taxRateBps)}
              </td>
              <td className="px-3 py-3 text-right tabular-nums font-semibold text-slate-900">
                {formatLineMoney(line.lineTotalMinor, currencyCode)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <div className={invDataTableShellClass}>
      <table className={invLineItemsTableClass} aria-label="Document line items">
        <colgroup>
          <col className={invLineItemsColDescClass} />
          <col className={invLineItemsColQtyClass} />
          <col className={invLineItemsColUnitClass} />
          <col className={invLineItemsColPriceClass} />
          <col className={invLineItemsColTaxClass} />
          <col className={invLineItemsColTotalClass} />
        </colgroup>
        <thead className={invTableHeadClass}>
          <tr>
            <th scope="col" className={invLineColDescThClass}>
              Description
            </th>
            <th scope="col" className={invLineColQtyThClass}>
              Qty
            </th>
            <th scope="col" className={invLineColUnitThClass}>
              Unit
            </th>
            <th scope="col" className={invLineColPriceThClass}>
              Unit price
            </th>
            <th scope="col" className={invLineColTaxThClass}>
              Tax
            </th>
            <th scope="col" className={invLineColTotalThClass}>
              Total
            </th>
          </tr>
        </thead>
        <tbody className={invTableBodyClass}>
          {lines.map((line, i) => (
            <tr key={line.id ?? i} className={invTableStripedRowClass(i)}>
              <td className={invLineColDescTdClass}>
                {line.description}
                {line.sku ? <span className="ml-1 text-xs text-slate-500">({line.sku})</span> : null}
              </td>
              <td className={`${invLineColQtyTdClass} text-slate-600`}>
                {line.quantity}
              </td>
              <td className={`${invLineColUnitTdClass} text-slate-600`}>
                {line.unitLabel}
              </td>
              <td className={`${invLineColPriceTdClass} text-slate-600`}>
                {formatLineMoney(line.unitPriceMinor, currencyCode)}
              </td>
              <td className={`${invLineColTaxTdClass} text-slate-600`}>
                {invoicingTaxRateOptionLabel(taxRateOptions, line.taxRateBps)}
              </td>
              <td className={`${invLineColTotalTdClass} font-medium text-slate-900`}>
                {formatLineMoney(line.lineTotalMinor, currencyCode)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
