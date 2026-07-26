/**
 * Invoicing Apply Payment modal.
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
  canRegisterInvoicePayment,
  type InvoicingInvoiceStatus
} from "@starter/shared";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { CrmModal } from "../../components/crm/CrmModal.js";
import { invFieldClass, invFocusRingClass, invLabelClass } from "./invoicingUi.js";
import { useInvoicingDisplayFormatters } from "./useInvoicingDisplayFormatters.js";

/** React component for invoicing & quoting UI. */
export type PayableInvoiceOption = {
  id: string;
  status: InvoicingInvoiceStatus;
  documentNumber: string | null;
  temporaryReference: string | null;
  customerName: string | null;
  currencyCode: string;
  totalIncludingTaxMinor: number;
};

type Props = {
  open: boolean;
  invoices: PayableInvoiceOption[];
  loadingInvoices?: boolean;
  busy?: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: (input: {
    invoiceId: string;
    amountMinor: number;
    paymentDate: string;
    reference: string;
    note: string;
  }) => void | Promise<void>;
};

const todayIsoDate = () => new Date().toISOString().slice(0, 10);

const invoiceLabel = (invoice: PayableInvoiceOption) => {
  const number = invoice.documentNumber ?? invoice.temporaryReference ?? "Draft";
  const customer = invoice.customerName?.trim();
  return customer ? `${number} — ${customer}` : number;
};

/** Modal UI for a focused invoicing & quoting workflow. */
export const InvoicingApplyPaymentModal = ({
  open,
  invoices,
  loadingInvoices = false,
  busy = false,
  error = "",
  onClose,
  onConfirm
}: Props) => {
  const { formatMoney, amountFormatters } = useInvoicingDisplayFormatters();
  const [invoiceId, setInvoiceId] = useState("");
  const [amountMajor, setAmountMajor] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayIsoDate());
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");

  const selectedInvoice = useMemo(
    () => invoices.find((invoice) => invoice.id === invoiceId) ?? null,
    [invoiceId, invoices]
  );

  useEffect(() => {
    if (!open) {
      setInvoiceId("");
      setAmountMajor("");
      setPaymentDate(todayIsoDate());
      setReference("");
      setNote("");
    }
  }, [open]);

  useEffect(() => {
    if (!open || invoiceId || invoices.length !== 1) return;
    setInvoiceId(invoices[0]!.id);
  }, [open, invoiceId, invoices]);

  const parsedAmountMinor = useMemo(
    () => amountFormatters.parseMajorToMinor(amountMajor),
    [amountFormatters, amountMajor]
  );

  const outstandingMinor = selectedInvoice?.totalIncludingTaxMinor ?? 0;
  const canRegister =
    selectedInvoice != null && canRegisterInvoicePayment(selectedInvoice.status);

  const handleClose = () => {
    if (busy) return;
    onClose();
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (
      !selectedInvoice ||
      !canRegister ||
      parsedAmountMinor == null ||
      parsedAmountMinor <= 0 ||
      busy
    ) {
      return;
    }
    if (parsedAmountMinor > outstandingMinor) return;
    void onConfirm({
      invoiceId: selectedInvoice.id,
      amountMinor: parsedAmountMinor,
      paymentDate,
      reference: reference.trim(),
      note: note.trim()
    });
  };

  const payInFull = () => {
    if (outstandingMinor <= 0) return;
    setAmountMajor(amountFormatters.formatMinorToMajor(outstandingMinor));
  };

  return (
    <CrmModal title="Register payment" open={open} onClose={handleClose}>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="invoicing-apply-payment-invoice" className={invLabelClass}>
            Invoice <span className="text-rose-600">*</span>
          </label>
          {loadingInvoices ? (
            <p className="mt-1 text-sm text-stone-500">Loading payable invoices…</p>
          ) : invoices.length === 0 ? (
            <p className="mt-1 text-sm text-amber-800">
              No sent invoices are available for payment. Send an invoice first, or open an invoice
              directly to register a payment there.
            </p>
          ) : (
            <select
              id="invoicing-apply-payment-invoice"
              required
              value={invoiceId}
              disabled={busy}
              className={invFieldClass}
              onChange={(event) => setInvoiceId(event.target.value)}
            >
              <option value="">Select an invoice…</option>
              {invoices.map((invoice) => (
                <option key={invoice.id} value={invoice.id}>
                  {invoiceLabel(invoice)} (
                  {formatMoney(invoice.totalIncludingTaxMinor, invoice.currencyCode)} outstanding)
                </option>
              ))}
            </select>
          )}
        </div>

        {selectedInvoice && canRegister ? (
          <>
            <p className="text-sm text-stone-600">
              Outstanding balance:{" "}
              <span className="font-medium text-slate-900">
                {formatMoney(outstandingMinor, selectedInvoice.currencyCode)}
              </span>
            </p>
            <div>
              <label htmlFor="invoicing-apply-payment-amount" className={invLabelClass}>
                Amount <span className="text-rose-600">*</span>
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  id="invoicing-apply-payment-amount"
                  type="text"
                  inputMode="decimal"
                  required
                  value={amountMajor}
                  disabled={busy}
                  placeholder="0.00"
                  className={invFieldClass.replace("mt-1 ", "")}
                  onChange={(event) => setAmountMajor(event.target.value)}
                />
                <button
                  type="button"
                  disabled={busy || outstandingMinor <= 0}
                  className="shrink-0 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-60"
                  onClick={payInFull}
                >
                  Pay in full
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="invoicing-apply-payment-date" className={invLabelClass}>
                Payment date <span className="text-rose-600">*</span>
              </label>
              <input
                id="invoicing-apply-payment-date"
                type="date"
                required
                value={paymentDate}
                disabled={busy}
                className={invFieldClass}
                onChange={(event) => setPaymentDate(event.target.value)}
              />
            </div>
            <div>
              <label htmlFor="invoicing-apply-payment-reference" className={invLabelClass}>
                Reference
              </label>
              <input
                id="invoicing-apply-payment-reference"
                type="text"
                maxLength={128}
                value={reference}
                disabled={busy}
                placeholder="Bank transfer reference, cheque number, …"
                className={invFieldClass}
                onChange={(event) => setReference(event.target.value)}
              />
            </div>
            <div>
              <label htmlFor="invoicing-apply-payment-note" className={invLabelClass}>
                Note
              </label>
              <textarea
                id="invoicing-apply-payment-note"
                rows={3}
                maxLength={2000}
                value={note}
                disabled={busy}
                className={[invFieldClass.replace("mt-1 ", ""), invFocusRingClass].join(" ")}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
            {parsedAmountMinor != null &&
            parsedAmountMinor > 0 &&
            parsedAmountMinor < outstandingMinor ? (
              <p className="text-sm text-amber-800">
                A partial payment creates a new invoice revision with the paid amount deducted. The revised invoice is
                sent to the customer automatically by email.
              </p>
            ) : null}
          </>
        ) : null}

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
            disabled={
              busy ||
              loadingInvoices ||
              invoices.length === 0 ||
              !selectedInvoice ||
              !canRegister ||
              parsedAmountMinor == null ||
              parsedAmountMinor <= 0 ||
              parsedAmountMinor > outstandingMinor
            }
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {busy ? "Saving…" : "Register payment"}
          </button>
        </div>
      </form>
    </CrmModal>
  );
};
