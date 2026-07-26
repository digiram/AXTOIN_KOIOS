/**
 * Invoicing Catalog Picker modal.
 *
 * Modal dialog for a focused invoicing and quoting create, edit, or confirmation flow.
 *
 * Responsibilities:
 * - Collect and validate user input for a single action
 * - Submit changes to tenant APIs and surface errors inline
 *
 * Related:
 * - Route: /admin/invoicing
 *
 * Security:
 * - Submissions use authenticated tenant API helpers
 */
import { invoicingTaxRateOptionLabel, type InvoicingTaxRateOption } from "@starter/shared";
import { useMemo, useState } from "react";

import { CrmModal } from "../../components/crm/CrmModal.js";
import { bindTableRowPrimaryAction, tableRowClickableClass } from "../../lib/tableRowAction.js";
import {
  invDataTableClass,
  invDataTableShellClass,
  invFilterBarClass,
  invFilterInputClass,
  invFilterPillClass,
  invFilterPillGroupClass,
  invPrimaryColTdClass,
  invTableBodyClass,
  invTableHeadClass,
  invTableStripedRowClass,
  invTableTdClass,
  invTableThClass
} from "./invoicingUi.js";
import { useInvoicingDisplayFormatters } from "./useInvoicingDisplayFormatters.js";

/** React component for invoicing & quoting UI. */
export type InvoicingCatalogPickerItem = {
  id: string;
  itemKind: "service" | "product";
  name: string;
  sku: string | null;
  description: string;
  unitLabel: string;
  unitPriceMinor: number;
  currencyCode: string;
  taxRateBps: number | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  items: InvoicingCatalogPickerItem[];
  currencyCode: string;
  taxRateOptions: InvoicingTaxRateOption[];
  onSelect: (itemId: string) => void;
};

const itemKindLabel = (kind: InvoicingCatalogPickerItem["itemKind"]) =>
  kind === "product" ? "Product" : "Service";

const matchesFilter = (value: string | null | undefined, filter: string) => {
  const f = filter.trim().toLowerCase();
  if (!f) return true;
  return (value ?? "").toLowerCase().includes(f);
};

/** Modal UI for a focused invoicing & quoting workflow. */
export const InvoicingCatalogPickerModal = ({
  open,
  onClose,
  items,
  currencyCode,
  taxRateOptions,
  onSelect
}: Props) => {
  const { formatMoney } = useInvoicingDisplayFormatters();
  const [search, setSearch] = useState("");
  const [skuFilter, setSkuFilter] = useState("");
  const [kindFilter, setKindFilter] = useState<"" | InvoicingCatalogPickerItem["itemKind"]>("");
  const [unitFilter, setUnitFilter] = useState("");

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (item.currencyCode !== currencyCode) return false;
      if (kindFilter && item.itemKind !== kindFilter) return false;
      if (!matchesFilter(item.sku, skuFilter)) return false;
      if (!matchesFilter(item.unitLabel, unitFilter)) return false;
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        (item.sku ?? "").toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
      );
    });
  }, [items, currencyCode, kindFilter, search, skuFilter, unitFilter]);

  const handleClose = () => {
    setSearch("");
    setSkuFilter("");
    setKindFilter("");
    setUnitFilter("");
    onClose();
  };

  const handleSelect = (itemId: string) => {
    onSelect(itemId);
    handleClose();
  };

  return (
    <CrmModal title="Add from catalog" open={open} onClose={handleClose} wide>
      <div className="space-y-4">
        <div className={invFilterBarClass}>
          <input
            id="invoicing-catalog-picker-search"
            className={`${invFilterInputClass} min-w-[8rem] flex-1`}
            placeholder="Search name, SKU, description…"
            aria-label="Search catalog"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          <input
            id="invoicing-catalog-picker-sku"
            className={`${invFilterInputClass} w-[7.5rem] shrink-0`}
            placeholder="SKU"
            aria-label="Filter by SKU"
            value={skuFilter}
            onChange={(e) => setSkuFilter(e.target.value)}
          />
          <input
            id="invoicing-catalog-picker-unit"
            className={`${invFilterInputClass} w-[6.5rem] shrink-0`}
            placeholder="Unit"
            aria-label="Filter by unit"
            value={unitFilter}
            onChange={(e) => setUnitFilter(e.target.value)}
          />
          <div role="group" aria-label="Kind" className={invFilterPillGroupClass}>
            <button
              type="button"
              aria-pressed={kindFilter === "service"}
              className={invFilterPillClass(kindFilter === "service")}
              onClick={() => setKindFilter((k) => (k === "service" ? "" : "service"))}
            >
              Service
            </button>
            <button
              type="button"
              aria-pressed={kindFilter === "product"}
              className={invFilterPillClass(kindFilter === "product")}
              onClick={() => setKindFilter((k) => (k === "product" ? "" : "product"))}
            >
              Product
            </button>
          </div>
        </div>

        {items.filter((i) => i.currencyCode === currencyCode).length === 0 ? (
          <p className="text-sm text-stone-600">
            No active catalog items match this document&apos;s currency ({currencyCode}).
          </p>
        ) : filteredItems.length === 0 ? (
          <p className="text-sm text-stone-600">No catalog items match your filters.</p>
        ) : (
          <div className={invDataTableShellClass}>
            <table className={invDataTableClass} aria-label="Catalog products">
              <caption className="sr-only">Catalog items — select a row to add as a line item</caption>
              <thead className={invTableHeadClass}>
                <tr>
                  <th
                    scope="col"
                    className="min-w-[12rem] px-3 py-2 align-bottom text-left text-xs font-medium uppercase tracking-wider text-slate-500"
                  >
                    Name
                  </th>
                  <th scope="col" className={`${invTableThClass} text-left`}>
                    SKU
                  </th>
                  <th scope="col" className={`${invTableThClass} text-left`}>
                    Kind
                  </th>
                  <th scope="col" className={`${invTableThClass} text-left`}>
                    Unit
                  </th>
                  <th scope="col" className={`${invTableThClass} text-right`}>
                    Unit price
                  </th>
                  <th scope="col" className={`${invTableThClass} text-left`}>
                    Tax
                  </th>
                </tr>
              </thead>
              <tbody className={invTableBodyClass}>
                {filteredItems.map((item, idx) => (
                  <tr
                    key={item.id}
                    className={invTableStripedRowClass(idx, tableRowClickableClass)}
                    {...bindTableRowPrimaryAction({
                      onAction: () => handleSelect(item.id),
                      ariaLabel: `Add ${item.name} to line items`,
                      role: "button"
                    })}
                  >
                    <td className={invPrimaryColTdClass}>
                      <div className="font-medium text-slate-900">{item.name}</div>
                      {item.description ? (
                        <div className="mt-0.5 line-clamp-2 text-xs text-slate-500">{item.description}</div>
                      ) : null}
                    </td>
                    <td className={`${invTableTdClass} text-slate-600`}>{item.sku ?? "—"}</td>
                    <td className={`${invTableTdClass} text-slate-600`}>{itemKindLabel(item.itemKind)}</td>
                    <td className={`${invTableTdClass} text-slate-600`}>{item.unitLabel}</td>
                    <td className={`${invTableTdClass} text-right tabular-nums`}>
                      {formatMoney(item.unitPriceMinor, item.currencyCode)}
                    </td>
                    <td className={`${invTableTdClass} text-slate-600`}>
                      {invoicingTaxRateOptionLabel(taxRateOptions, item.taxRateBps)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </CrmModal>
  );
};
