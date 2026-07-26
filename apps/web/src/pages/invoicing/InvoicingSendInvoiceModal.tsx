/**
 * Invoicing Send Invoice modal.
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
  defaultInvoiceDueDateForSend,
  quoteExpiryDateFromValidityDays,
  quoteValidityDaysFromDates,
  todayIsoDateUtc
} from "@starter/shared";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { CrmModal } from "../../components/crm/CrmModal.js";
import { invFieldClass, invFocusRingClass, invLabelClass } from "./invoicingUi.js";

type Props = {
  open: boolean;
  defaultPaymentTermDays: number | null;
  sourceQuotePaymentTermDays: number | null;
  partialPaymentAnchorDate?: string | null;
  defaultTo: string;
  defaultSubject: string;
  busy?: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: (input: { dueDate: string; to: string; subject?: string }) => void | Promise<void>;
};

/** Modal UI for a focused invoicing & quoting workflow. */
export const InvoicingSendInvoiceModal = ({
  open,
  defaultPaymentTermDays,
  sourceQuotePaymentTermDays,
  partialPaymentAnchorDate = null,
  defaultTo,
  defaultSubject,
  busy = false,
  error = "",
  onClose,
  onConfirm
}: Props) => {
  const sendDate = partialPaymentAnchorDate?.trim() || todayIsoDateUtc();
  const resolvedInitial = defaultInvoiceDueDateForSend(
    sendDate,
    sourceQuotePaymentTermDays,
    defaultPaymentTermDays
  );
  const [dueDate, setDueDate] = useState(resolvedInitial);
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState(defaultSubject);

  useEffect(() => {
    if (!open) return;
    setDueDate(defaultInvoiceDueDateForSend(sendDate, sourceQuotePaymentTermDays, defaultPaymentTermDays));
    setTo(defaultTo);
    setSubject(defaultSubject);
  }, [open, sendDate, sourceQuotePaymentTermDays, defaultPaymentTermDays, defaultTo, defaultSubject]);

  const paymentTermDays = useMemo(
    () => quoteValidityDaysFromDates(sendDate, dueDate),
    [sendDate, dueDate]
  );

  const handleClose = () => {
    if (busy) return;
    onClose();
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmedDueDate = dueDate.trim();
    const trimmedTo = to.trim();
    if (!trimmedDueDate || !trimmedTo || busy) return;
    const trimmedSubject = subject.trim();
    void onConfirm({
      dueDate: trimmedDueDate,
      to: trimmedTo,
      ...(trimmedSubject ? { subject: trimmedSubject } : {})
    });
  };

  return (
    <CrmModal title="Send invoice" open={open} onClose={handleClose}>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <p className="text-sm text-stone-600">
          Set the net payment term from {partialPaymentAnchorDate ? "the partial payment date" : "today"}. The
          customer receives an HTML email with the invoice and the due date you choose.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="invoicing-send-invoice-payment-term-days" className={invLabelClass}>
              Payment term (days)
            </label>
            <input
              id="invoicing-send-invoice-payment-term-days"
              type="number"
              min={0}
              inputMode="numeric"
              className={`${invFieldClass} tabular-nums`}
              value={paymentTermDays}
              disabled={busy}
              onChange={(event) => {
                const n = Number.parseInt(event.target.value, 10);
                if (Number.isFinite(n) && n >= 0) {
                  setDueDate(quoteExpiryDateFromValidityDays(sendDate, n));
                }
              }}
            />
          </div>
          <div>
            <label htmlFor="invoicing-send-invoice-due-date" className={invLabelClass}>
              Due date
            </label>
            <input
              id="invoicing-send-invoice-due-date"
              type="date"
              required
              className={invFieldClass}
              value={dueDate}
              disabled={busy}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </div>
        </div>
        <div>
          <label htmlFor="invoicing-send-invoice-email-to" className={invLabelClass}>
            To
          </label>
          <input
            id="invoicing-send-invoice-email-to"
            type="email"
            required
            className={invFieldClass}
            value={to}
            disabled={busy}
            onChange={(event) => setTo(event.target.value)}
            placeholder="customer@example.com"
            autoComplete="email"
          />
        </div>
        <div>
          <label htmlFor="invoicing-send-invoice-email-subject" className={invLabelClass}>
            Subject <span className="font-normal text-stone-500">(optional)</span>
          </label>
          <input
            id="invoicing-send-invoice-email-subject"
            type="text"
            maxLength={255}
            className={invFieldClass}
            value={subject}
            disabled={busy}
            onChange={(event) => setSubject(event.target.value)}
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
            disabled={busy || to.trim() === ""}
            className={[
              "rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60",
              invFocusRingClass
            ].join(" ")}
          >
            {busy ? "Sending…" : "Send invoice"}
          </button>
        </div>
      </form>
    </CrmModal>
  );
};
