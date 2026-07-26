/**
 * SalesLaneConfigModal.
 *
 * Modal to rename, tune, or delete a Sales kanban lane (stage).
 *
 * Responsibilities:
 * - Edit lane name, close-chance percent (pipeline), and "Ready for Sales" flag (BDR)
 * - Delete empty lanes when permitted
 * - Persist via authenticated Sales funnel stage APIs
 *
 * Security:
 * - Delete disabled unless lane is empty and `canDelete` is true
 */

import type { SalesFunnelPipeline } from "@starter/shared";
import { ArrowRightCircle, Settings, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Switch } from "../../components/Switch.js";
import { API_BASE_URL } from "../../lib/api.js";

/** Kanban stage row shape shared by BDR and pipeline boards. */
export type KanbanStageConfig = {
  id: string;
  stageKey: string;
  name: string;
  sortOrder: number;
  outcome: string;
  closeChancePercent: number | null;
  readyForSales: boolean;
};

type Props = {
  stage: KanbanStageConfig | null;
  pipeline: SalesFunnelPipeline;
  open: boolean;
  busy: boolean;
  canDelete: boolean;
  /** Delete is only enabled when the lane has no leads or deals. */
  laneIsEmpty: boolean;
  onClose: () => void;
  onSaved: (stage: KanbanStageConfig) => void;
  onDelete: (stage: KanbanStageConfig) => void;
  authedFetch: (url: string, init?: RequestInit) => Promise<Response | null>;
};

const inputClass =
  "w-full rounded-lg border border-stone-200 bg-white px-2.5 py-2 text-sm text-stone-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/30";

/**
 * Lane configuration modal for Sales kanban stage rename, tuning, and delete.
 *
 * @param props.pipeline - `"bdr"` or `"sales"` determines editable fields
 * @param props.laneIsEmpty - Required for delete button enablement
 */
export const SalesLaneConfigModal = ({
  stage,
  pipeline,
  open,
  busy,
  canDelete,
  laneIsEmpty,
  onClose,
  onSaved,
  onDelete,
  authedFetch
}: Props) => {
  const [name, setName] = useState("");
  const [closeChance, setCloseChance] = useState("");
  const [readyForSales, setReadyForSales] = useState(false);
  const [error, setError] = useState("");
  const [deleteAwaitingConfirm, setDeleteAwaitingConfirm] = useState(false);

  useEffect(() => {
    if (!deleteAwaitingConfirm) return;
    const id = window.setTimeout(() => setDeleteAwaitingConfirm(false), 5000);
    return () => window.clearTimeout(id);
  }, [deleteAwaitingConfirm]);

  useEffect(() => {
    if (!stage) return;
    setName(stage.name);
    setCloseChance(stage.closeChancePercent != null ? String(stage.closeChancePercent) : "");
    setReadyForSales(stage.readyForSales);
    setError("");
    setDeleteAwaitingConfirm(false);
  }, [stage]);

  useEffect(() => {
    if (!open) setDeleteAwaitingConfirm(false);
  }, [open]);

  useEffect(() => {
    if (!laneIsEmpty) setDeleteAwaitingConfirm(false);
  }, [laneIsEmpty]);

  if (!open || !stage) return null;

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required.");
      return;
    }
    setError("");
    const body: Record<string, unknown> = { name: trimmed };
    if (pipeline === "sales") {
      const raw = closeChance.trim();
      body.closeChancePercent = raw === "" ? null : Number(raw);
      if (raw !== "" && (Number.isNaN(body.closeChancePercent) || (body.closeChancePercent as number) < 0 || (body.closeChancePercent as number) > 100)) {
        setError("Close chance must be between 0 and 100.");
        return;
      }
    }
    if (pipeline === "bdr") {
      body.readyForSales = readyForSales;
    }
    const res = await authedFetch(`${API_BASE_URL}/tenant/sales/stages/${stage.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res?.ok) {
      const j = (await res?.json().catch(() => null)) as { message?: string } | null;
      setError(j?.message ?? "Could not save lane.");
      return;
    }
    const json = (await res.json()) as { stage: KanbanStageConfig };
    onSaved(json.stage);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div role="presentation" className="absolute inset-0 bg-slate-950/50" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lane-config-title"
        className="relative z-10 w-full max-w-4xl rounded-2xl border border-stone-200 bg-white p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-stone-500" aria-hidden />
            <h2 id="lane-config-title" className="text-lg font-semibold text-stone-900">
              Lane settings
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <label className="block text-xs font-medium text-stone-600">
            Name
            <input className={`${inputClass} mt-1`} value={name} onChange={(e) => setName(e.target.value)} />
          </label>

          {pipeline === "sales" ? (
            <label className="block text-xs font-medium text-stone-600">
              Close chance (%)
              <input
                type="number"
                min={0}
                max={100}
                className={`${inputClass} mt-1`}
                placeholder="Optional"
                value={closeChance}
                onChange={(e) => setCloseChance(e.target.value)}
              />
              <span className="mt-1 block text-[11px] text-stone-500">
                Used for pipeline forecasting on this lane.
              </span>
            </label>
          ) : null}

          {pipeline === "bdr" ? (
            <div className="overflow-hidden rounded-xl border border-stone-200/90 bg-white shadow-sm ring-1 ring-slate-900/5">
              <div className="flex flex-col sm:flex-row sm:items-stretch">
                <div className="min-w-0 flex-1 p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-800 ring-1 ring-violet-200/80">
                      <ArrowRightCircle className="h-5 w-5" strokeWidth={2} aria-hidden />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-slate-900">Ready for Sales</h3>
                      <p className="mt-1 text-sm text-stone-600">
                        Only one BDR lane can have this at a time. With the toggle{" "}
                        <strong className="font-semibold text-slate-800">on</strong>, leads in this lane can be
                        promoted to the Sales pipeline. Other lanes will not show the promote action.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="mx-auto flex w-[8%] min-w-16 max-w-full shrink-0 items-center justify-center border-t border-stone-200/90 bg-stone-100 px-1 py-3 sm:mx-0 sm:flex-none sm:border-l sm:border-t-0 sm:px-1.5 sm:py-4">
                  <Switch
                    checked={readyForSales}
                    disabled={busy}
                    aria-busy={busy}
                    aria-label={readyForSales ? "Ready for Sales, on" : "Ready for Sales, off"}
                    onCheckedChange={setReadyForSales}
                  />
                </div>
              </div>
            </div>
          ) : null}

          {error ? (
            <p className="text-xs text-rose-600" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          {canDelete ? (
            <button
              type="button"
              disabled={busy || !laneIsEmpty}
              title={
                laneIsEmpty
                  ? undefined
                  : "Remove or move all cards out of this lane before deleting it."
              }
              className={[
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50",
                deleteAwaitingConfirm && laneIsEmpty
                  ? "border border-rose-900 bg-rose-600 text-white hover:bg-rose-700"
                  : "border border-red-200 bg-red-50 text-red-800 hover:bg-red-100"
              ].join(" ")}
              onClick={() => {
                if (!laneIsEmpty) return;
                if (!deleteAwaitingConfirm) {
                  setDeleteAwaitingConfirm(true);
                  return;
                }
                setDeleteAwaitingConfirm(false);
                onDelete(stage);
              }}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              {deleteAwaitingConfirm ? "Click again to delete" : "Delete lane"}
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-lg border border-stone-200 px-3 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              onClick={() => void save()}
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
