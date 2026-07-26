/**
 * Invoicing Send Offer modal.
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
  defaultOfferExpiryDateForSend,
  quoteExpiryDateFromValidityDays,
  quoteValidityDaysFromDates,
  todayIsoDateUtc
} from "@starter/shared";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { CrmModal } from "../../components/crm/CrmModal.js";
import { invFieldClass, invFocusRingClass, invLabelClass } from "./invoicingUi.js";

type Props = {
  open: boolean;
  defaultValidityDays: number | null;
  defaultTo: string;
  defaultSubject: string;
  busy?: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: (input: { offerExpiryDate: string; to: string; subject?: string }) => void | Promise<void>;
};

/** Modal UI for a focused invoicing & quoting workflow. */
export const InvoicingSendOfferModal = ({
  open,
  defaultValidityDays,
  defaultTo,
  defaultSubject,
  busy = false,
  error = "",
  onClose,
  onConfirm
}: Props) => {
  const sendDate = todayIsoDateUtc();
  const resolvedInitial = defaultOfferExpiryDateForSend(sendDate, defaultValidityDays);
  const [expiryDate, setExpiryDate] = useState(resolvedInitial);
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState(defaultSubject);

  useEffect(() => {
    if (!open) return;
    setExpiryDate(defaultOfferExpiryDateForSend(sendDate, defaultValidityDays));
    setTo(defaultTo);
    setSubject(defaultSubject);
  }, [open, sendDate, defaultValidityDays, defaultTo, defaultSubject]);

  const validityDays = useMemo(
    () => quoteValidityDaysFromDates(sendDate, expiryDate),
    [sendDate, expiryDate]
  );

  const handleClose = () => {
    if (busy) return;
    onClose();
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmedExpiry = expiryDate.trim();
    const trimmedTo = to.trim();
    if (!trimmedExpiry || !trimmedTo || busy) return;
    const trimmedSubject = subject.trim();
    void onConfirm({
      offerExpiryDate: trimmedExpiry,
      to: trimmedTo,
      ...(trimmedSubject ? { subject: trimmedSubject } : {})
    });
  };

  return (
    <CrmModal title="Send offer" open={open} onClose={handleClose}>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <p className="text-sm text-stone-600">
          Set how long this offer stays valid for the customer from today, then send an HTML email with the offer
          details and accept/reject links when configured.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="invoicing-send-offer-expiry-days" className={invLabelClass}>
              Validity (days)
            </label>
            <input
              id="invoicing-send-offer-expiry-days"
              type="number"
              min={0}
              inputMode="numeric"
              className={`${invFieldClass} tabular-nums`}
              value={validityDays}
              disabled={busy}
              onChange={(event) => {
                const n = Number.parseInt(event.target.value, 10);
                if (Number.isFinite(n) && n >= 0) {
                  setExpiryDate(quoteExpiryDateFromValidityDays(sendDate, n));
                }
              }}
            />
          </div>
          <div>
            <label htmlFor="invoicing-send-offer-expiry" className={invLabelClass}>
              Valid until
            </label>
            <input
              id="invoicing-send-offer-expiry"
              type="date"
              required
              className={invFieldClass}
              value={expiryDate}
              disabled={busy}
              onChange={(event) => setExpiryDate(event.target.value)}
            />
          </div>
        </div>
        <div>
          <label htmlFor="invoicing-send-offer-email-to" className={invLabelClass}>
            To
          </label>
          <input
            id="invoicing-send-offer-email-to"
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
          <label htmlFor="invoicing-send-offer-email-subject" className={invLabelClass}>
            Subject <span className="font-normal text-stone-500">(optional)</span>
          </label>
          <input
            id="invoicing-send-offer-email-subject"
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
            {busy ? "Sending…" : "Send offer"}
          </button>
        </div>
      </form>
    </CrmModal>
  );
};
