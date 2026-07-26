/**
 * Invoicing Catalog page.
 *
 * Tenant invoicing and quoting screen mounted under AppShell at /admin/invoicing.
 *
 * Responsibilities:
 * - Load and render primary invoicing and quoting data for the route
 * - Wire user actions to tenant API endpoints
 * - Compose shared module components and modals
 *
 * Related:
 * - Route: /admin/invoicing
 *
 * Security:
 * - Tenant-scoped API calls via authenticated session
 */
import {
  DEFAULT_INVOICING_TAX_RATE_OPTIONS,
  defaultInvoicingTaxRateBps,
  invoicingTaxRateOptionLabel,
  type InvoicingTaxRateOption
} from "@starter/shared";
import { useCallback, useEffect, useMemo, useState } from "react";

import { SearchableCurrencySelect } from "../../components/SearchableCurrencySelect.js";
import { useTenantDisplayPreferences } from "../../hooks/useTenantDisplayPreferences.js";
import { useModulePermissions } from "../../hooks/useModulePermissions.js";
import {
  invDataTableClass,
  invDataTableShellClass,
  invFieldClass,
  invLabelClass,
  invPrimaryColTdClass,
  invTableBodyClass,
  invTableEmptyCellClass,
  invTableHeadClass,
  invTableStripedRowClass,
  invTableTdClass,
  invTableThClass,
  readInvoicingApiError
} from "./invoicingUi.js";
import { useInvoicingApi } from "./useInvoicingApi.js";
import { useInvoicingDisplayFormatters } from "./useInvoicingDisplayFormatters.js";

type CatalogItem = {
  id: string;
  name: string;
  sku: string | null;
  description: string;
  unitLabel: string;
  unitPriceMinor: number;
  currencyCode: string;
  taxRateBps: number | null;
  isActive: boolean;
};

const filterControlHeightClass = "h-9";

const filterInputClass = [
  "min-w-0 rounded-lg border border-stone-200 bg-white px-2.5 text-sm text-stone-900 shadow-sm",
  "focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500",
  filterControlHeightClass
].join(" ");

const activePillClass = (active: boolean) =>
  [
    "inline-flex h-full items-center rounded-full px-3 text-xs font-semibold transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40",
    active
      ? "bg-white text-slate-900 shadow-sm ring-1 ring-stone-200/80"
      : "text-stone-600 hover:text-slate-900"
  ].join(" ");

const matchesFilter = (value: string | null | undefined, filter: string) => {
  const f = filter.trim().toLowerCase();
  if (!f) return true;
  return (value ?? "").toLowerCase().includes(f);
};

/** Route page component for tenant invoicing & quoting under AppShell. */
export const InvoicingCatalogPage = () => {
  const { authedFetch } = useInvoicingApi();
  const { canWrite } = useModulePermissions("invoicing");
  const { preferences: tenantPrefs } = useTenantDisplayPreferences();
  const { formatMoney, amountFormatters } = useInvoicingDisplayFormatters();
  const preferredCurrency = tenantPrefs?.preferredCurrency ?? "USD";
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [skuFilter, setSkuFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState<"" | "active" | "inactive">("");
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [unitPriceMajor, setUnitPriceMajor] = useState("");
  const [currencyCode, setCurrencyCode] = useState(preferredCurrency);
  const [taxRateBps, setTaxRateBps] = useState<number | "">("");
  const [taxRateOptions, setTaxRateOptions] = useState<InvoicingTaxRateOption[]>(
    DEFAULT_INVOICING_TAX_RATE_OPTIONS
  );

  const resetForm = useCallback(() => {
    setShowForm(false);
    setName("");
    setSku("");
    setUnitPriceMajor("");
    setTaxRateBps(defaultInvoicingTaxRateBps(taxRateOptions) ?? "");
    setCurrencyCode(preferredCurrency);
    setError("");
  }, [preferredCurrency, taxRateOptions]);

  const openForm = useCallback(() => {
    setName("");
    setSku("");
    setUnitPriceMajor("");
    setCurrencyCode(preferredCurrency);
    setTaxRateBps(defaultInvoicingTaxRateBps(taxRateOptions) ?? "");
    setError("");
    setShowForm(true);
  }, [preferredCurrency, taxRateOptions]);

  useEffect(() => {
    let cancelled = false;
    const loadConfig = async () => {
      const res = await authedFetch("/tenant/invoicing/configuration");
      if (!res.ok || cancelled) return;
      const json = (await res.json()) as { taxRateOptions?: InvoicingTaxRateOption[] };
      if (!cancelled && json.taxRateOptions?.length) setTaxRateOptions(json.taxRateOptions);
    };
    void loadConfig();
    return () => {
      cancelled = true;
    };
  }, [authedFetch]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch("/tenant/invoicing/catalog/items?limit=200");
      if (res.ok) {
        const json = (await res.json()) as { items: CatalogItem[] };
        setItems(json.items ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [authedFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (activeFilter === "active" && !item.isActive) return false;
      if (activeFilter === "inactive" && item.isActive) return false;
      if (!matchesFilter(item.sku, skuFilter)) return false;
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        (item.sku ?? "").toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
      );
    });
  }, [items, activeFilter, search, skuFilter]);

  const addItem = async () => {
    if (!canWrite) return;
    const unitPriceMinor = amountFormatters.parseMajorToMinor(unitPriceMajor);
    if (!name.trim() || unitPriceMinor == null) {
      setError("Name and unit price are required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const taxBps = taxRateBps === "" ? null : taxRateBps;
      const res = await authedFetch("/tenant/invoicing/catalog/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          sku: sku.trim() || null,
          unitPriceMinor,
          currencyCode,
          taxRateBps: taxBps
        })
      });
      if (!res.ok) {
        setError(await readInvoicingApiError(res, "Could not add catalog item."));
        return;
      }
      resetForm();
      await load();
    } catch {
      setError("Could not add catalog item.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full min-w-0 space-y-6">
      {showForm && canWrite ? (
        <div className="w-full space-y-4 rounded-xl border border-stone-200 bg-white p-6 shadow-sm ring-1 ring-slate-900/5">
          <div className="flex items-start justify-between gap-4">
            <h3 className="text-sm font-semibold text-slate-900">Add catalog item</h3>
            <button
              type="button"
              className="shrink-0 text-sm font-medium text-stone-600 hover:text-stone-900"
              onClick={resetForm}
            >
              Cancel
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="sm:col-span-2 lg:col-span-1">
              <label className={invLabelClass}>Name</label>
              <input className={invFieldClass} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className={invLabelClass}>SKU (optional)</label>
              <input className={invFieldClass} value={sku} onChange={(e) => setSku(e.target.value)} />
            </div>
            <div>
              <label className={invLabelClass}>Unit price</label>
              <input
                className={invFieldClass}
                value={unitPriceMajor}
                onChange={(e) => setUnitPriceMajor(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="invoicing-catalog-currency" className={invLabelClass}>
                Currency
              </label>
              <SearchableCurrencySelect
                inputId="invoicing-catalog-currency"
                value={currencyCode}
                onChange={setCurrencyCode}
                listPlacement="below"
              />
            </div>
            <div>
              <label htmlFor="invoicing-catalog-tax" className={invLabelClass}>
                Tax
              </label>
              <select
                id="invoicing-catalog-tax"
                className={invFieldClass}
                value={taxRateBps}
                onChange={(e) => {
                  const raw = e.target.value;
                  setTaxRateBps(raw === "" ? "" : Number.parseInt(raw, 10));
                }}
              >
                <option value="">—</option>
                {taxRateOptions.map((o) => (
                  <option key={`${o.rateBps}-${o.label}`} value={o.rateBps}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}

          <div className="flex flex-wrap gap-2 border-t border-stone-100 pt-4">
            <button
              type="button"
              disabled={busy}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
              onClick={() => void addItem()}
            >
              {busy ? "Saving…" : "Save item"}
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded-lg border border-stone-200 px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-60"
              onClick={resetForm}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="w-full space-y-3 rounded-xl border border-stone-200 bg-white p-6 shadow-sm ring-1 ring-slate-900/5">
        <h3 className="text-sm font-semibold text-slate-900">Catalog items</h3>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-2 overflow-x-auto">
            <input
              className={`${filterInputClass} min-w-[8rem] flex-1`}
              placeholder="Search name, SKU, description…"
              aria-label="Search catalog items"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <input
              className={`${filterInputClass} w-[7.5rem] shrink-0`}
              placeholder="SKU"
              aria-label="Filter by SKU"
              value={skuFilter}
              onChange={(e) => setSkuFilter(e.target.value)}
            />
            <div
              role="group"
              aria-label="Active status"
              className={`inline-flex shrink-0 items-stretch gap-0.5 rounded-full border border-stone-200 bg-stone-100 p-0.5 ${filterControlHeightClass}`}
            >
              <button
                type="button"
                aria-pressed={activeFilter === ""}
                className={activePillClass(activeFilter === "")}
                onClick={() => setActiveFilter("")}
              >
                All
              </button>
              <button
                type="button"
                aria-pressed={activeFilter === "active"}
                className={activePillClass(activeFilter === "active")}
                onClick={() => setActiveFilter((f) => (f === "active" ? "" : "active"))}
              >
                Active
              </button>
              <button
                type="button"
                aria-pressed={activeFilter === "inactive"}
                className={activePillClass(activeFilter === "inactive")}
                onClick={() => setActiveFilter((f) => (f === "inactive" ? "" : "inactive"))}
              >
                Inactive
              </button>
            </div>
          </div>

          {canWrite && !showForm ? (
            <button
              type="button"
              className="shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-500"
              onClick={openForm}
            >
              Add catalog item
            </button>
          ) : null}
        </div>

        {!showForm && error ? (
          <p className="text-sm text-rose-600" role="alert">
            {error}
          </p>
        ) : null}

        {!loading && filteredItems.length > 0 ? (
          <p className="text-sm font-medium text-stone-600">
            {filteredItems.length} {filteredItems.length === 1 ? "item" : "items"}
          </p>
        ) : null}

        <div className={invDataTableShellClass}>
          <table className={invDataTableClass} aria-label="Catalog items">
            <caption className="sr-only">Product and service catalog items.</caption>
            <thead className={invTableHeadClass}>
              <tr>
                <th scope="col" className="min-w-[12rem] px-3 py-2 align-bottom text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                  Name
                </th>
                <th scope="col" className={`${invTableThClass} text-left`}>
                  SKU
                </th>
                <th scope="col" className={`${invTableThClass} text-right`}>
                  Unit price
                </th>
                <th scope="col" className={`${invTableThClass} text-left`}>
                  Tax rate
                </th>
                <th scope="col" className={`${invTableThClass} text-left`}>
                  Active
                </th>
              </tr>
            </thead>
            <tbody className={invTableBodyClass}>
              {loading ? (
                <tr className="bg-white">
                  <td colSpan={5} className={invTableEmptyCellClass}>
                    Loading…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr className="bg-white">
                  <td colSpan={5} className={invTableEmptyCellClass}>
                    No catalog items yet.
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr className="bg-white">
                  <td colSpan={5} className={invTableEmptyCellClass}>
                    No catalog items match your filters.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item, idx) => (
                  <tr key={item.id} className={invTableStripedRowClass(idx)}>
                    <td className={invPrimaryColTdClass}>
                      <div className="font-medium text-slate-900">{item.name}</div>
                      {item.description ? (
                        <div className="mt-0.5 line-clamp-2 text-xs text-slate-500">{item.description}</div>
                      ) : null}
                    </td>
                    <td className={`${invTableTdClass} text-slate-600`}>{item.sku ?? "—"}</td>
                    <td className={`${invTableTdClass} text-right tabular-nums`}>
                      {formatMoney(item.unitPriceMinor, item.currencyCode)}
                    </td>
                    <td className={`${invTableTdClass} text-slate-600`}>
                      {invoicingTaxRateOptionLabel(taxRateOptions, item.taxRateBps)}
                    </td>
                    <td className={invTableTdClass}>{item.isActive ? "Yes" : "No"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
