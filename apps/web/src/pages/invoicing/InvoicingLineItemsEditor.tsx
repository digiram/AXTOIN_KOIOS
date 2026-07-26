/**
 * Invoicing Line Items Editor.
 *
 * Reusable invoicing and quoting UI building block: Invoicing Line Items Editor.
 *
 * Responsibilities:
 * - Encapsulate a focused interaction or form segment
 * - Keep parent pages thin by isolating validation and presentation
 *
 * Related:
 * - Route: /admin/invoicing
 */
import type { InvoicingTaxRateOption } from "@starter/shared";
import { invoicingTaxRateOptionLabel } from "@starter/shared";
import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useModulePermissions } from "../../hooks/useModulePermissions.js";
import {
  draftLineDisplayTotals,
  emptyLineDraft,
  invActionBtnDeleteClass,
  invActionRailClass,
  invDataTableShellClass,
  invLineItemsColActionsClass,
  invLineItemsColDescClass,
  invLineItemsColPriceClass,
  invLineItemsColQtyClass,
  invLineItemsColTaxClass,
  invLineItemsColTotalClass,
  invLineItemsColUnitClass,
  invLineItemsTableClass,
  invLineColActionsTdClass,
  invLineColActionsThClass,
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
  invTableBodyClass,
  invTableHeadClass,
  invTableInputClass,
  invTableStripedRowClass,
  lineDraftFromApi,
  type InvoicingLineDraft
} from "./invoicingUi.js";
import {
  InvoicingCatalogPickerModal,
  type InvoicingCatalogPickerItem
} from "./InvoicingCatalogPickerModal.js";
import { useInvoicingApi } from "./useInvoicingApi.js";
import { useInvoicingDisplayFormatters } from "./useInvoicingDisplayFormatters.js";

type Props = {
  currencyCode: string;
  taxRateOptions: InvoicingTaxRateOption[];
  lines: InvoicingLineDraft[];
  onChange: (lines: InvoicingLineDraft[]) => void;
  disabled?: boolean;
};

/** React component for invoicing & quoting UI. */
export const InvoicingLineItemsEditor = ({
  currencyCode,
  taxRateOptions,
  lines,
  onChange,
  disabled = false
}: Props) => {
  const { authedFetch } = useInvoicingApi();
  const { canWrite } = useModulePermissions("invoicing");
  const { formatMoney, amountFormatters } = useInvoicingDisplayFormatters();
  const [catalog, setCatalog] = useState<InvoicingCatalogPickerItem[]>([]);
  const [catalogPickerOpen, setCatalogPickerOpen] = useState(false);

  useEffect(() => {
    if (!canWrite) return;
    let cancelled = false;
    const load = async () => {
      const res = await authedFetch("/tenant/invoicing/catalog/items?limit=200&activeOnly=true");
      if (!res.ok || cancelled) return;
      const json = (await res.json()) as { items: InvoicingCatalogPickerItem[] };
      if (!cancelled) setCatalog(json.items ?? []);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [authedFetch, canWrite]);

  const patchLine = (key: string, patch: Partial<InvoicingLineDraft>) => {
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const defaultTaxBps = taxRateOptions[0]?.rateBps ?? null;

  const addLine = () => onChange([...lines, emptyLineDraft(defaultTaxBps)]);

  const removeLine = (key: string) => {
    if (lines.length <= 1) return;
    onChange(lines.filter((l) => l.key !== key));
  };

  const addFromCatalog = useCallback(
    (itemId: string) => {
      const item = catalog.find((c) => c.id === itemId);
      if (!item) return;
      onChange([
        ...lines,
        lineDraftFromApi({
          description: item.name,
          quantity: 1,
          unitLabel: item.unitLabel,
          unitPriceMinor: item.unitPriceMinor,
          discountMinor: 0,
          taxRateBps: item.taxRateBps,
          catalogItemId: item.id
        }, amountFormatters)
      ]);
    },
    [amountFormatters, catalog, lines, onChange]
  );

  const catalogForCurrency = catalog.filter((c) => c.currencyCode === currencyCode);

  return (
    <section className="w-full min-w-0 space-y-3" aria-labelledby="invoicing-line-items-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="invoicing-line-items-heading" className="text-sm font-semibold text-slate-900">
          Line items
        </h3>
        {!disabled ? (
          <div className="flex flex-wrap items-center gap-2">
            {catalogForCurrency.length > 0 ? (
              <button
                type="button"
                className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 shadow-sm hover:bg-stone-50"
                onClick={() => setCatalogPickerOpen(true)}
              >
                Add from catalog
              </button>
            ) : null}
            <button
              type="button"
              className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-500"
              onClick={addLine}
            >
              Add line
            </button>
          </div>
        ) : null}
      </div>

      <div className={invDataTableShellClass}>
        <table className={invLineItemsTableClass} aria-label="Quote line items">
          <caption className="sr-only">Editable line items</caption>
          <colgroup>
            <col className={invLineItemsColDescClass} />
            <col className={invLineItemsColQtyClass} />
            <col className={invLineItemsColUnitClass} />
            <col className={invLineItemsColPriceClass} />
            <col className={invLineItemsColTaxClass} />
            <col className={invLineItemsColTotalClass} />
            {!disabled ? <col className={invLineItemsColActionsClass} /> : null}
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
              {!disabled ? (
                <th scope="col" className={invLineColActionsThClass}>
                  <span className="sr-only">Actions</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className={invTableBodyClass}>
            {lines.map((line, idx) => {
              const totals = draftLineDisplayTotals(line, amountFormatters);
              return (
                <tr key={line.key} className={invTableStripedRowClass(idx)}>
                  <td className={invLineColDescTdClass}>
                    <input
                      className={invTableInputClass}
                      disabled={disabled}
                      placeholder="Description"
                      aria-label="Line description"
                      value={line.description}
                      onChange={(e) => patchLine(line.key, { description: e.target.value })}
                    />
                  </td>
                  <td className={invLineColQtyTdClass}>
                    <input
                      className={`${invTableInputClass} text-right`}
                      disabled={disabled}
                      inputMode="decimal"
                      aria-label="Quantity"
                      value={line.quantity}
                      onChange={(e) => patchLine(line.key, { quantity: e.target.value })}
                    />
                  </td>
                  <td className={invLineColUnitTdClass}>
                    <input
                      className={invTableInputClass}
                      disabled={disabled}
                      aria-label="Unit label"
                      value={line.unitLabel}
                      onChange={(e) => patchLine(line.key, { unitLabel: e.target.value })}
                    />
                  </td>
                  <td className={invLineColPriceTdClass}>
                    <input
                      className={`${invTableInputClass} text-right`}
                      disabled={disabled}
                      inputMode="decimal"
                      aria-label="Unit price"
                      value={line.unitPriceMajor}
                      onChange={(e) => patchLine(line.key, { unitPriceMajor: e.target.value })}
                    />
                  </td>
                  <td className={invLineColTaxTdClass}>
                    <select
                      className={invTableInputClass}
                      disabled={disabled || taxRateOptions.length === 0}
                      aria-label="Tax"
                      value={line.taxRateBps ?? ""}
                      onChange={(e) => {
                        const raw = e.target.value;
                        patchLine(line.key, {
                          taxRateBps: raw === "" ? null : Number.parseInt(raw, 10)
                        });
                      }}
                    >
                      <option value="">—</option>
                      {taxRateOptions.map((o) => (
                        <option key={`${o.rateBps}-${o.label}`} value={o.rateBps}>
                          {o.label}
                        </option>
                      ))}
                      {line.taxRateBps != null &&
                      !taxRateOptions.some((o) => o.rateBps === line.taxRateBps) ? (
                        <option value={line.taxRateBps}>
                          {invoicingTaxRateOptionLabel([], line.taxRateBps)}
                        </option>
                      ) : null}
                    </select>
                  </td>
                  <td className={`${invLineColTotalTdClass} font-medium text-slate-900`}>
                    {totals ? formatMoney(totals.lineTotalMinor, currencyCode) : "—"}
                  </td>
                  {!disabled ? (
                    <td className={invLineColActionsTdClass}>
                      <div className={invActionRailClass}>
                        <button
                          type="button"
                          className={invActionBtnDeleteClass}
                          disabled={lines.length <= 1}
                          title="Remove line"
                          aria-label="Remove line"
                          onClick={() => removeLine(line.key)}
                        >
                          <Trash2 className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2} />
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <InvoicingCatalogPickerModal
        open={catalogPickerOpen}
        onClose={() => setCatalogPickerOpen(false)}
        items={catalog}
        currencyCode={currencyCode}
        taxRateOptions={taxRateOptions}
        onSelect={addFromCatalog}
      />
    </section>
  );
};
