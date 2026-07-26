/**
 * Invoicing Tax Rate Options Editor.
 *
 * Reusable invoicing and quoting UI building block: Invoicing Tax Rate Options Editor.
 *
 * Responsibilities:
 * - Encapsulate a focused interaction or form segment
 * - Keep parent pages thin by isolating validation and presentation
 *
 * Related:
 * - Route: /admin/invoicing
 */
import type { InvoicingTaxRateOption } from "@starter/shared";
import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  AUTOSAVE_UI_RESET_MS,
  AutosaveStatusLiveRegion,
  type AutosaveUiStatus
} from "../../components/autosave-status-ui.js";
import {
  invDataTableClass,
  invDataTableShellClass,
  invFieldClass,
  invActionBtnDeleteClass,
  invActionRailClass,
  invActionsTdClass,
  invActionsThClass,
  invTableBodyClass,
  invTableHeadClass,
  invTableStripedRowClass,
  invTableInputClass,
  invTableTdClass,
  invTableThClass,
  readInvoicingApiError
} from "./invoicingUi.js";
import { useInvoicingApi } from "./useInvoicingApi.js";

type DraftRow = { key: string; label: string; ratePercent: string };

const AUTOSAVE_DEBOUNCE_MS = 600;

const toDraft = (options: InvoicingTaxRateOption[]): DraftRow[] =>
  options.map((o) => ({
    key: crypto.randomUUID(),
    label: o.label,
    ratePercent: o.rateBps > 0 ? String(o.rateBps / 100) : "0"
  }));

const draftToOptions = (rows: DraftRow[]): InvoicingTaxRateOption[] | null => {
  const out: InvoicingTaxRateOption[] = [];
  for (const row of rows) {
    const label = row.label.trim();
    if (!label) return null;
    const n = Number.parseFloat(row.ratePercent.replace(",", "."));
    if (!Number.isFinite(n) || n < 0) return null;
    out.push({ label, rateBps: Math.round(n * 100) });
  }
  return out.length > 0 ? out : null;
};

const serializeOptions = (options: InvoicingTaxRateOption[]) =>
  JSON.stringify(options.map((o) => ({ label: o.label, rateBps: o.rateBps })));

type Props = {
  options: InvoicingTaxRateOption[];
  canEdit: boolean;
  onSaved: (options: InvoicingTaxRateOption[]) => void;
};

const TaxOptionsAutosaveStatus = ({ status }: { status: AutosaveUiStatus }) => {
  if (status === "idle") return null;
  const text =
    status === "saving"
      ? "Saving…"
      : status === "saved"
        ? "Saved"
        : status === "error"
          ? "Could not save"
          : "";
  const tone =
    status === "saved"
      ? "text-emerald-700"
      : status === "error"
        ? "text-rose-600"
        : "text-stone-500";
  return (
    <span className={`shrink-0 text-xs font-medium ${tone}`} aria-hidden>
      {text}
    </span>
  );
};

/** React component for invoicing & quoting UI. */
export const InvoicingTaxRateOptionsEditor = ({ options, canEdit, onSaved }: Props) => {
  const { authedFetch } = useInvoicingApi();
  const [rows, setRows] = useState(() => toDraft(options));
  const [saveStatus, setSaveStatus] = useState<AutosaveUiStatus>("idle");
  const [validationHint, setValidationHint] = useState("");
  const lastSavedSerialized = useRef(serializeOptions(options));
  const saveGeneration = useRef(0);
  const saveStatusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSaveStatusTimer = useCallback(() => {
    if (saveStatusTimer.current) {
      clearTimeout(saveStatusTimer.current);
      saveStatusTimer.current = null;
    }
  }, []);

  const scheduleSaveStatusReset = useCallback(() => {
    clearSaveStatusTimer();
    saveStatusTimer.current = setTimeout(() => {
      setSaveStatus("idle");
      saveStatusTimer.current = null;
    }, AUTOSAVE_UI_RESET_MS);
  }, [clearSaveStatusTimer]);

  useEffect(() => {
    const serialized = serializeOptions(options);
    if (serialized === lastSavedSerialized.current) return;
    setRows(toDraft(options));
    lastSavedSerialized.current = serialized;
  }, [options]);

  useEffect(() => {
    return () => clearSaveStatusTimer();
  }, [clearSaveStatusTimer]);

  const persist = useCallback(
    async (parsed: InvoicingTaxRateOption[]) => {
      const generation = ++saveGeneration.current;
      setSaveStatus("saving");
      setValidationHint("");
      try {
        const res = await authedFetch("/tenant/invoicing/configuration", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ taxRateOptions: parsed })
        });
        if (generation !== saveGeneration.current) return;
        if (!res.ok) {
          setSaveStatus("error");
          scheduleSaveStatusReset();
          setValidationHint(await readInvoicingApiError(res, "Could not save tax options."));
          setRows(toDraft(options));
          lastSavedSerialized.current = serializeOptions(options);
          return;
        }
        const json = (await res.json()) as { taxRateOptions: InvoicingTaxRateOption[] };
        const next = json.taxRateOptions ?? parsed;
        lastSavedSerialized.current = serializeOptions(next);
        setRows(toDraft(next));
        onSaved(next);
        setSaveStatus("saved");
        scheduleSaveStatusReset();
      } catch {
        if (generation !== saveGeneration.current) return;
        setSaveStatus("error");
        scheduleSaveStatusReset();
        setValidationHint("Could not save tax options.");
        setRows(toDraft(options));
        lastSavedSerialized.current = serializeOptions(options);
      }
    },
    [authedFetch, onSaved, options, scheduleSaveStatusReset]
  );

  useEffect(() => {
    if (!canEdit) return;

    const parsed = draftToOptions(rows);
    if (!parsed) {
      const hintTimer = window.setTimeout(() => {
        setValidationHint("Each tax option needs a label and a valid rate (%).");
      }, AUTOSAVE_DEBOUNCE_MS);
      return () => window.clearTimeout(hintTimer);
    }

    setValidationHint("");
    const serialized = serializeOptions(parsed);
    if (serialized === lastSavedSerialized.current) return;

    const saveTimer = window.setTimeout(() => {
      void persist(parsed);
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(saveTimer);
  }, [rows, canEdit, persist]);

  const patchRow = (key: string, patch: Partial<DraftRow>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const addRow = () => {
    setRows((prev) => [...prev, { key: crypto.randomUUID(), label: "", ratePercent: "21" }]);
  };

  const removeRow = (key: string) => {
    if (rows.length <= 1) return;
    setRows((prev) => prev.filter((r) => r.key !== key));
  };

  return (
    <div className="w-full min-w-0 space-y-3" data-tax-options-editor>
      <p className="text-sm text-stone-600">
        Tax options appear as a dropdown on quote line items. Changes save automatically.
      </p>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {canEdit ? (
          <>
            <TaxOptionsAutosaveStatus status={saveStatus} />
            <AutosaveStatusLiveRegion statusId="invoicing-tax-options-autosave" status={saveStatus} />
            <button
              type="button"
              className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-500"
              onClick={addRow}
            >
              Add tax option
            </button>
          </>
        ) : null}
      </div>
      <div className={invDataTableShellClass}>
        <table className={invDataTableClass} aria-label="Tax rate options">
          <thead className={invTableHeadClass}>
            <tr>
              <th scope="col" className="min-w-[12rem] px-3 py-2 align-bottom text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                Label
              </th>
              <th scope="col" className={`${invTableThClass} w-[8rem] text-right`}>
                Rate %
              </th>
              {canEdit ? (
                <th scope="col" className={invActionsThClass}>
                  <span className="sr-only">Actions</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className={invTableBodyClass}>
            {rows.map((row, idx) => (
              <tr key={row.key} className={invTableStripedRowClass(idx)}>
                <td className="px-3 py-2 align-middle">
                  <input
                    className={canEdit ? invTableInputClass : invFieldClass}
                    disabled={!canEdit}
                    value={row.label}
                    onChange={(e) => patchRow(row.key, { label: e.target.value })}
                  />
                </td>
                <td className={`${invTableTdClass} text-right`}>
                  <input
                    className={`${canEdit ? invTableInputClass : invFieldClass} text-right`}
                    disabled={!canEdit}
                    inputMode="decimal"
                    value={row.ratePercent}
                    onChange={(e) => patchRow(row.key, { ratePercent: e.target.value })}
                  />
                </td>
                {canEdit ? (
                  <td className={invActionsTdClass}>
                    <div className={invActionRailClass}>
                      <button
                        type="button"
                        className={invActionBtnDeleteClass}
                        disabled={rows.length <= 1}
                        title="Remove tax option"
                        aria-label="Remove tax option"
                        onClick={() => removeRow(row.key)}
                      >
                        <Trash2 className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2} />
                      </button>
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {validationHint ? <p className="text-sm text-rose-600">{validationHint}</p> : null}
    </div>
  );
};
