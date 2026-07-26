/**
 * Invoicing Add Catalog Item modal.
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
import {
  defaultInvoicingTaxRateBps,
  type InvoicingTaxRateOption
} from "@starter/shared";
import { useCallback, useEffect, useState } from "react";

import { CrmModal } from "../../components/crm/CrmModal.js";
import { SearchableCurrencySelect } from "../../components/SearchableCurrencySelect.js";
import { invFieldClass, invLabelClass, readInvoicingApiError } from "./invoicingUi.js";
import { useInvoicingApi } from "./useInvoicingApi.js";
import { useInvoicingDisplayFormatters } from "./useInvoicingDisplayFormatters.js";

type Props = {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
  taxRateOptions: InvoicingTaxRateOption[];
  preferredCurrency: string;
};

/** Modal UI for a focused invoicing & quoting workflow. */
export const InvoicingAddCatalogItemModal = ({
  open,
  onClose,
  onAdded,
  taxRateOptions,
  preferredCurrency
}: Props) => {
  const { authedFetch } = useInvoicingApi();
  const { amountFormatters } = useInvoicingDisplayFormatters();
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [unitPriceMajor, setUnitPriceMajor] = useState("");
  const [currencyCode, setCurrencyCode] = useState(preferredCurrency);
  const [taxRateBps, setTaxRateBps] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const resetForm = useCallback(() => {
    setName("");
    setSku("");
    setUnitPriceMajor("");
    setCurrencyCode(preferredCurrency);
    setTaxRateBps(defaultInvoicingTaxRateBps(taxRateOptions) ?? "");
    setError("");
  }, [preferredCurrency, taxRateOptions]);

  useEffect(() => {
    if (!open) return;
    resetForm();
  }, [open, resetForm]);

  const handleClose = () => {
    if (busy) return;
    resetForm();
    onClose();
  };

  const save = async () => {
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
      onClose();
      onAdded();
    } catch {
      setError("Could not add catalog item.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <CrmModal title="Add catalog item" open={open} onClose={handleClose}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="invoicing-add-catalog-name" className={invLabelClass}>
              Name
            </label>
            <input
              id="invoicing-add-catalog-name"
              className={invFieldClass}
              value={name}
              disabled={busy}
              autoFocus
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="invoicing-add-catalog-sku" className={invLabelClass}>
              SKU (optional)
            </label>
            <input
              id="invoicing-add-catalog-sku"
              className={invFieldClass}
              value={sku}
              disabled={busy}
              onChange={(e) => setSku(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="invoicing-add-catalog-unit-price" className={invLabelClass}>
              Unit price
            </label>
            <input
              id="invoicing-add-catalog-unit-price"
              className={invFieldClass}
              value={unitPriceMajor}
              disabled={busy}
              inputMode="decimal"
              onChange={(e) => setUnitPriceMajor(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="invoicing-add-catalog-currency" className={invLabelClass}>
              Currency
            </label>
            <SearchableCurrencySelect
              inputId="invoicing-add-catalog-currency"
              value={currencyCode}
              onChange={setCurrencyCode}
              listPlacement="below"
            />
          </div>
          <div>
            <label htmlFor="invoicing-add-catalog-tax" className={invLabelClass}>
              Tax
            </label>
            <select
              id="invoicing-add-catalog-tax"
              className={invFieldClass}
              value={taxRateBps}
              disabled={busy}
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

        {error ? (
          <p className="text-sm text-rose-600" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2 border-t border-stone-100 pt-4">
          <button
            type="button"
            disabled={busy}
            className="rounded-lg border border-stone-200 px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-60"
            onClick={handleClose}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
            onClick={() => void save()}
          >
            {busy ? "Saving…" : "Save item"}
          </button>
        </div>
      </div>
    </CrmModal>
  );
};
