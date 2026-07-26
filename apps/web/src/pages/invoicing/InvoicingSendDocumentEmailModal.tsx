/**
 * Invoicing Send Document Email modal.
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
import type { InvoicingDocumentKind } from "@starter/shared";
import { invoicingDocumentKindLabel } from "@starter/shared";
import { useEffect, useState, type FormEvent } from "react";

import { CrmModal } from "../../components/crm/CrmModal.js";
import { invFieldClass, invFocusRingClass, invLabelClass } from "./invoicingUi.js";

type Props = {
  kind: InvoicingDocumentKind;
  /** When true, labels describe re-sending a document that was already sent. */
  resend?: boolean;
  open: boolean;
  defaultTo: string;
  defaultSubject: string;
  busy?: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: (input: { to: string; subject?: string }) => void | Promise<void>;
};

/** Modal UI for a focused invoicing & quoting workflow. */
export const InvoicingSendDocumentEmailModal = ({
  kind,
  resend = false,
  open,
  defaultTo,
  defaultSubject,
  busy = false,
  error = "",
  onClose,
  onConfirm
}: Props) => {
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState(defaultSubject);
  const kindLabel = invoicingDocumentKindLabel(kind).toLowerCase();
  const title = resend ? `Resend ${kindLabel}` : `Email ${kindLabel}`;

  useEffect(() => {
    if (!open) return;
    setTo(defaultTo);
    setSubject(defaultSubject);
  }, [open, defaultTo, defaultSubject]);

  const handleClose = () => {
    if (busy) return;
    onClose();
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmedTo = to.trim();
    if (!trimmedTo || busy) return;
    const trimmedSubject = subject.trim();
    void onConfirm({
      to: trimmedTo,
      ...(trimmedSubject ? { subject: trimmedSubject } : {})
    });
  };

  return (
    <CrmModal title={title} open={open} onClose={handleClose}>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <p className="text-sm text-stone-600">
          {resend
            ? `Sends another HTML email that mirrors the ${kindLabel} layout on this page — including line items, totals, and terms. Uses your organization's SMTP (or the platform default).`
            : `Sends an HTML email that mirrors the ${kindLabel} layout on this page — including line items, totals, and terms. Uses your organization's SMTP (or the platform default).`}
        </p>
        <div>
          <label htmlFor={`invoicing-send-${kind}-email-to`} className={invLabelClass}>
            To
          </label>
          <input
            id={`invoicing-send-${kind}-email-to`}
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
          <label htmlFor={`invoicing-send-${kind}-email-subject`} className={invLabelClass}>
            Subject <span className="font-normal text-stone-500">(optional)</span>
          </label>
          <input
            id={`invoicing-send-${kind}-email-subject`}
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
            {busy ? "Sending…" : resend ? "Resend" : "Send email"}
          </button>
        </div>
      </form>
    </CrmModal>
  );
};
