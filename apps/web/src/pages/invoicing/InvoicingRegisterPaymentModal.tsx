/**
 * Invoicing Register Payment modal.
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
import { canRegisterInvoicePayment, type InvoicingInvoiceStatus } from "@starter/shared";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { CrmModal } from "../../components/crm/CrmModal.js";
import {
  invFieldClass,
  invFilterPillClass,
  invFilterPillGroupClass,
  invFocusRingClass,
  invLabelClass
} from "./invoicingUi.js";
import { useInvoicingDisplayFormatters } from "./useInvoicingDisplayFormatters.js";

type PaymentMode = "full" | "partial";

type Props = {
  open: boolean;
  status: InvoicingInvoiceStatus;
  currencyCode: string;
  outstandingMinor: number;
  busy?: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: (input: {
    amountMinor: number;
    paymentDate: string;
    reference: string;
    note: string;
  }) => void | Promise<void>;
};

const todayIsoDate = () => new Date().toISOString().slice(0, 10);

/** Modal UI for a focused invoicing & quoting workflow. */
export const InvoicingRegisterPaymentModal = ({
  open,
  status,
  currencyCode,
  outstandingMinor,
  busy = false,
  error = "",
  onClose,
  onConfirm
}: Props) => {
  const { formatMoney, amountFormatters } = useInvoicingDisplayFormatters();
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("full");
  const [amountMajor, setAmountMajor] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayIsoDate());
  const [reference, setReference] = useState("");
  const [remark, setRemark] = useState("");

  useEffect(() => {
    if (!open) {
      setPaymentMode("full");
      setAmountMajor("");
      setPaymentDate(todayIsoDate());
      setReference("");
      setRemark("");
    }
  }, [open]);

  useEffect(() => {
    if (!open || paymentMode !== "full" || outstandingMinor <= 0) return;
    setAmountMajor(amountFormatters.formatMinorToMajor(outstandingMinor));
  }, [open, paymentMode, outstandingMinor, amountFormatters]);

  const parsedAmountMinor = useMemo(() => {
    if (paymentMode === "full") {
      return outstandingMinor > 0 ? outstandingMinor : null;
    }
    return amountFormatters.parseMajorToMinor(amountMajor);
  }, [amountFormatters, amountMajor, outstandingMinor, paymentMode]);

  const handleClose = () => {
    if (busy) return;
    onClose();
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!canRegisterInvoicePayment(status) || parsedAmountMinor == null || parsedAmountMinor <= 0 || busy) {
      return;
    }
    if (parsedAmountMinor > outstandingMinor) return;
    void onConfirm({
      amountMinor: parsedAmountMinor,
      paymentDate,
      reference: reference.trim(),
      note: remark.trim()
    });
  };

  const selectPaymentMode = (mode: PaymentMode) => {
    setPaymentMode(mode);
    if (mode === "full" && outstandingMinor > 0) {
      setAmountMajor(amountFormatters.formatMinorToMajor(outstandingMinor));
    } else if (mode === "partial") {
      setAmountMajor("");
    }
  };

  return (
    <CrmModal title="Register payment" open={open} onClose={handleClose}>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <p className="text-sm text-stone-600">
          Outstanding balance:{" "}
          <span className="font-medium text-slate-900">{formatMoney(outstandingMinor, currencyCode)}</span>
        </p>
        <div>
          <span className={invLabelClass}>Payment type</span>
          <div className={[invFilterPillGroupClass, "mt-1 w-full"].join(" ")} role="group" aria-label="Payment type">
            <button
              type="button"
              disabled={busy || outstandingMinor <= 0}
              className={[invFilterPillClass(paymentMode === "full"), "flex-1 justify-center"].join(" ")}
              onClick={() => selectPaymentMode("full")}
            >
              Full payment
            </button>
            <button
              type="button"
              disabled={busy || outstandingMinor <= 0}
              className={[invFilterPillClass(paymentMode === "partial"), "flex-1 justify-center"].join(" ")}
              onClick={() => selectPaymentMode("partial")}
            >
              Partial payment
            </button>
          </div>
        </div>
        {paymentMode === "partial" ? (
          <div>
            <label htmlFor="invoicing-payment-amount" className={invLabelClass}>
              Amount <span className="text-rose-600">*</span>
            </label>
            <input
              id="invoicing-payment-amount"
              type="text"
              inputMode="decimal"
              required
              value={amountMajor}
              disabled={busy}
              placeholder="0.00"
              className={invFieldClass}
              onChange={(event) => setAmountMajor(event.target.value)}
            />
          </div>
        ) : (
          <div>
            <span className={invLabelClass}>Amount</span>
            <p className="mt-1 text-sm font-medium tabular-nums text-slate-900">
              {formatMoney(outstandingMinor, currencyCode)}
            </p>
          </div>
        )}
        <div>
          <label htmlFor="invoicing-payment-date" className={invLabelClass}>
            Payment date <span className="text-rose-600">*</span>
          </label>
          <input
            id="invoicing-payment-date"
            type="date"
            required
            value={paymentDate}
            disabled={busy}
            className={invFieldClass}
            onChange={(event) => setPaymentDate(event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="invoicing-payment-reference" className={invLabelClass}>
            Reference
          </label>
          <input
            id="invoicing-payment-reference"
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
          <label htmlFor="invoicing-payment-remark" className={invLabelClass}>
            Remark
          </label>
          <textarea
            id="invoicing-payment-remark"
            rows={3}
            maxLength={2000}
            value={remark}
            disabled={busy}
            placeholder="Optional note for this payment"
            className={[invFieldClass.replace("mt-1 ", ""), invFocusRingClass].join(" ")}
            onChange={(event) => setRemark(event.target.value)}
          />
        </div>
        {paymentMode === "partial" &&
        parsedAmountMinor != null &&
        parsedAmountMinor > 0 &&
        parsedAmountMinor < outstandingMinor ? (
          <p className="text-sm text-amber-800">
            A partial payment creates a new invoice revision with the paid amount deducted. The revised invoice is
            sent to the customer automatically by email.
          </p>
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
              outstandingMinor <= 0 ||
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
