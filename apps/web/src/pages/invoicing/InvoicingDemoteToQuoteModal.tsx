/**
 * Invoicing Demote To Quote modal.
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
import { useEffect, useState, type FormEvent } from "react";

import { CrmModal } from "../../components/crm/CrmModal.js";
import { invFocusRingClass } from "./invoicingUi.js";

type Props = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  fieldLabel?: string;
  fieldPlaceholder?: string;
  confirmButtonClass?: string;
  busy?: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: (reason: string) => void | Promise<void>;
};

/** Modal UI for a focused invoicing & quoting workflow. */
export const InvoicingDemoteToQuoteModal = ({
  open,
  title,
  description,
  confirmLabel = "Demote to quote",
  fieldLabel = "Reason",
  fieldPlaceholder = "Explain why this document is being demoted to a quote.",
  confirmButtonClass = "rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60",
  busy = false,
  error = "",
  onClose,
  onConfirm
}: Props) => {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) setReason("");
  }, [open]);

  const handleClose = () => {
    if (busy) return;
    setReason("");
    onClose();
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = reason.trim();
    if (!trimmed || busy) return;
    void onConfirm(trimmed);
  };

  return (
    <CrmModal title={title} open={open} onClose={handleClose}>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <p className="text-sm text-stone-600">{description}</p>
        <div>
          <label htmlFor="invoicing-demote-reason" className="mb-1 block text-sm font-medium text-slate-800">
            {fieldLabel} <span className="text-rose-600">*</span>
          </label>
          <textarea
            id="invoicing-demote-reason"
            rows={4}
            required
            maxLength={2000}
            value={reason}
            disabled={busy}
            placeholder={fieldPlaceholder}
            className={[
              "w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm",
              invFocusRingClass
            ].join(" ")}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button
            type="button"
            disabled={busy}
            className="rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-60"
            onClick={handleClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || reason.trim().length === 0}
            className={confirmButtonClass}
          >
            {busy ? "Saving…" : confirmLabel}
          </button>
        </div>
      </form>
    </CrmModal>
  );
};
