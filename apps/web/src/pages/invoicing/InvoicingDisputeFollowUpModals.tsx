/**
 * Invoicing Dispute Follow Up Modals.
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
import { invFieldClass, invFocusRingClass, invLabelClass } from "./invoicingUi.js";
import { useInvoicingDisplayFormatters } from "./useInvoicingDisplayFormatters.js";

const todayIsoDate = () => new Date().toISOString().slice(0, 10);

type ModalBaseProps = {
  open: boolean;
  busy?: boolean;
  error?: string;
  onClose: () => void;
};

/** Modal UI for a focused invoicing & quoting workflow. */
export const InvoicingDisputeDiscountModal = ({
  open,
  currencyCode,
  outstandingMinor,
  busy = false,
  error = "",
  onClose,
  onConfirm
}: ModalBaseProps & {
  currencyCode: string;
  outstandingMinor: number;
  onConfirm: (input: { adjustmentDate: string; amountMinor: number; description: string }) => void | Promise<void>;
}) => {
  const { formatMoney, amountFormatters } = useInvoicingDisplayFormatters();
  const [adjustmentDate, setAdjustmentDate] = useState(todayIsoDate());
  const [amountMajor, setAmountMajor] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!open) {
      setAdjustmentDate(todayIsoDate());
      setAmountMajor("");
      setDescription("");
    }
  }, [open]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const amountMinor = amountFormatters.parseMajorToMinor(amountMajor);
    if (amountMinor == null || amountMinor <= 0) return;
    void onConfirm({ adjustmentDate, amountMinor, description: description.trim() });
  };

  return (
    <CrmModal open={open} title="Add dispute discount" onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <p className="text-sm text-stone-600">
          Creates a new invoice revision with a discount credit line and emails it to the customer automatically.
          Outstanding balance: {formatMoney(outstandingMinor, currencyCode)}.
        </p>
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        <label className="block">
          <span className={invLabelClass}>Adjustment date</span>
          <input
            type="date"
            className={`${invFieldClass} ${invFocusRingClass}`}
            value={adjustmentDate}
            onChange={(event) => setAdjustmentDate(event.target.value)}
            required
          />
        </label>
        <label className="block">
          <span className={invLabelClass}>Discount amount</span>
          <input
            type="text"
            inputMode="decimal"
            className={`${invFieldClass} ${invFocusRingClass}`}
            value={amountMajor}
            onChange={(event) => setAmountMajor(event.target.value)}
            required
          />
        </label>
        <label className="block">
          <span className={invLabelClass}>Description</span>
          <textarea
            className={`${invFieldClass} ${invFocusRingClass} min-h-[5rem]`}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            required
          />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" className="rounded-lg px-4 py-2 text-sm text-stone-700 hover:bg-stone-100" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {busy ? "…" : "Create and send revised invoice"}
          </button>
        </div>
      </form>
    </CrmModal>
  );
};

/** Modal UI for a focused invoicing & quoting workflow. */
export const InvoicingDisputeFullCreditModal = ({
  open,
  currencyCode,
  outstandingMinor,
  busy = false,
  error = "",
  onClose,
  onConfirm
}: ModalBaseProps & {
  currencyCode: string;
  outstandingMinor: number;
  onConfirm: (input: { creditDate: string; note: string }) => void | Promise<void>;
}) => {
  const { formatMoney } = useInvoicingDisplayFormatters();
  const [creditDate, setCreditDate] = useState(todayIsoDate());
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) {
      setCreditDate(todayIsoDate());
      setNote("");
    }
  }, [open]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void onConfirm({ creditDate, note: note.trim() });
  };

  return (
    <CrmModal open={open} title="Credit remaining balance" onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <p className="text-sm text-stone-600">
          Credits the full balance of {formatMoney(outstandingMinor, currencyCode)}, emails a credit confirmation, and
          sends a revised invoice at zero balance to the customer automatically.
        </p>
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        <label className="block">
          <span className={invLabelClass}>Credit date</span>
          <input
            type="date"
            className={`${invFieldClass} ${invFocusRingClass}`}
            value={creditDate}
            onChange={(event) => setCreditDate(event.target.value)}
            required
          />
        </label>
        <label className="block">
          <span className={invLabelClass}>Note (optional)</span>
          <textarea
            className={`${invFieldClass} ${invFocusRingClass} min-h-[5rem]`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" className="rounded-lg px-4 py-2 text-sm text-stone-700 hover:bg-stone-100" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {busy ? "…" : "Apply credit and send"}
          </button>
        </div>
      </form>
    </CrmModal>
  );
};
