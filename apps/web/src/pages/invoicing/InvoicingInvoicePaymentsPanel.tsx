/**
 * Invoicing Invoice Payments panel.
 *
 * Settings or detail panel segment within invoicing and quoting admin screens.
 *
 * Responsibilities:
 * - Render a subsection of configuration or read-only detail
 * - Persist changes through tenant API where editable
 *
 * Related:
 * - Route: /admin/invoicing
 *
 * Security:
 * - Editable fields require appropriate tenant admin or module role
 */
import { Link } from "react-router-dom";

import { useInvoicingDisplayFormatters } from "./useInvoicingDisplayFormatters.js";

/** React component for invoicing & quoting UI. */
export type InvoicingInvoicePaymentView = {
  id: string;
  invoiceId: string;
  amountMinor: number;
  paymentDate: string;
  reference: string | null;
  note: string;
  revisedInvoiceId: string | null;
  createdAt: string;
};

type Props = {
  currencyCode: string;
  payments: InvoicingInvoicePaymentView[];
};

/** React component for invoicing & quoting UI. */
export const InvoicingInvoicePaymentCards = ({ currencyCode, payments }: Props) => {
  const { formatMoney, formatDate } = useInvoicingDisplayFormatters();

  if (payments.length === 0) {
    return null;
  }

  return (
    <div className="flex w-full flex-col gap-3">
      {payments.map((payment) => {
        const remark = payment.note?.trim();
        const reference = payment.reference?.trim();

        return (
          <section
            key={payment.id}
            className="w-full rounded-xl border border-emerald-200/80 bg-emerald-50/30 p-4 shadow-sm ring-1 ring-slate-900/5"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900">Payment</p>
              <p className="text-sm font-semibold tabular-nums text-slate-900">
                {formatMoney(payment.amountMinor, currencyCode)}
              </p>
            </div>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-slate-500">Date</dt>
                <dd className="mt-0.5 font-medium text-slate-900">{formatDate(payment.paymentDate)}</dd>
              </div>
              {reference ? (
                <div>
                  <dt className="text-slate-500">Reference</dt>
                  <dd className="mt-0.5 text-slate-800">{reference}</dd>
                </div>
              ) : null}
              {remark ? (
                <div>
                  <dt className="text-slate-500">Remark</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-slate-800">{remark}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-slate-500">Outcome</dt>
                <dd className="mt-0.5">
                  {payment.revisedInvoiceId ? (
                    <Link
                      to={`/admin/invoicing/invoices/${payment.revisedInvoiceId}`}
                      className="font-medium text-indigo-700 hover:text-indigo-600"
                    >
                      Open revised invoice
                    </Link>
                  ) : (
                    <span className="text-emerald-800">Paid in full</span>
                  )}
                </dd>
              </div>
            </dl>
          </section>
        );
      })}
    </div>
  );
};
