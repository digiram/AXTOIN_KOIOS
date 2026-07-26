/**
 * SalesAddLaneModal.
 *
 * Modal dialog to name and create a new kanban lane on BDR or pipeline boards.
 *
 * Responsibilities:
 * - Validate non-empty lane name before calling parent `onSubmit`
 * - Reset form state when opened
 */

import { X } from "lucide-react";
import { useEffect, useState } from "react";

const inputClass =
  "w-full rounded-lg border border-stone-200 bg-white px-2.5 py-2 text-sm text-stone-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/30";

type Props = {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
};

/**
 * Add-lane modal for Sales kanban boards.
 *
 * @param props.open - Whether the dialog is visible
 * @param props.busy - Disables submit while parent mutation runs
 * @param props.onClose - Dismiss without creating
 * @param props.onSubmit - Persists the trimmed lane name
 */
export const SalesAddLaneModal = ({ open, busy, onClose, onSubmit }: Props) => {
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setName("");
    setError("");
  }, [open]);

  if (!open) return null;

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a lane name.");
      return;
    }
    setError("");
    await onSubmit(trimmed);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div role="presentation" className="absolute inset-0 bg-slate-950/50" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-lane-title"
        className="relative z-10 w-full max-w-md rounded-2xl border border-stone-200 bg-white p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="add-lane-title" className="text-lg font-semibold text-stone-900">
            Add lane
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <label className="mt-4 block text-xs font-medium text-stone-600">
          Lane name
          <input
            className={`${inputClass} mt-1`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Qualification"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
          />
        </label>
        {error ? (
          <p className="mt-2 text-xs text-rose-600" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-6 flex justify-end gap-2">
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
            onClick={() => void submit()}
          >
            {busy ? "Adding…" : "Add lane"}
          </button>
        </div>
      </div>
    </div>
  );
};
