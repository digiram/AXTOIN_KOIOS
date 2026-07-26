/**
 * Invoicing Dispute Acknowledge modal.
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
  busy?: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: (input: { companyResponse: string; outstandingPaymentPlan: string }) => void | Promise<void>;
};

/** Modal UI for a focused invoicing & quoting workflow. */
export const InvoicingDisputeAcknowledgeModal = ({
  open,
  busy = false,
  error = "",
  onClose,
  onConfirm
}: Props) => {
  const [companyResponse, setCompanyResponse] = useState("");
  const [outstandingPaymentPlan, setOutstandingPaymentPlan] = useState("");

  useEffect(() => {
    if (!open) {
      setCompanyResponse("");
      setOutstandingPaymentPlan("");
    }
  }, [open]);

  const handleClose = () => {
    if (busy) return;
    onClose();
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const response = companyResponse.trim();
    const plan = outstandingPaymentPlan.trim();
    if (!response || !plan || busy) return;
    void onConfirm({ companyResponse: response, outstandingPaymentPlan: plan });
  };

  return (
    <CrmModal title="Acknowledge dispute" open={open} onClose={handleClose}>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <p className="text-sm text-stone-600">
          Confirm that you agree with the customer&apos;s dispute. Your response and the plan for the outstanding
          payment will be emailed to the customer.
        </p>
        <div>
          <label htmlFor="invoicing-dispute-company-response" className="mb-1 block text-sm font-medium text-slate-800">
            Why you agree with the dispute <span className="text-rose-600">*</span>
          </label>
          <textarea
            id="invoicing-dispute-company-response"
            rows={4}
            required
            maxLength={2000}
            value={companyResponse}
            disabled={busy}
            placeholder="Explain why you accept the customer's dispute."
            className={[
              "w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm",
              invFocusRingClass
            ].join(" ")}
            onChange={(event) => setCompanyResponse(event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="invoicing-dispute-payment-plan" className="mb-1 block text-sm font-medium text-slate-800">
            Outstanding payment plan <span className="text-rose-600">*</span>
          </label>
          <textarea
            id="invoicing-dispute-payment-plan"
            rows={4}
            required
            maxLength={2000}
            value={outstandingPaymentPlan}
            disabled={busy}
            placeholder="Describe what will happen with the remaining outstanding payment."
            className={[
              "w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm",
              invFocusRingClass
            ].join(" ")}
            onChange={(event) => setOutstandingPaymentPlan(event.target.value)}
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
            disabled={busy || companyResponse.trim().length === 0 || outstandingPaymentPlan.trim().length === 0}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {busy ? "Sending…" : "Acknowledge and email customer"}
          </button>
        </div>
      </form>
    </CrmModal>
  );
};
