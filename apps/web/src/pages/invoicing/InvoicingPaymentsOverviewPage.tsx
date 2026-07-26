/**
 * Invoicing Payments Overview page.
 *
 * Tenant invoicing and quoting screen mounted under AppShell at /admin/invoicing.
 *
 * Responsibilities:
 * - Load and render primary invoicing and quoting data for the route
 * - Wire user actions to tenant API endpoints
 * - Compose shared module components and modals
 *
 * Related:
 * - Route: /admin/invoicing
 *
 * Security:
 * - Tenant-scoped API calls via authenticated session
 */
import { canRegisterInvoicePayment, type InvoicingInvoiceStatus } from "@starter/shared";
import { Filter, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useModulePermissions } from "../../hooks/useModulePermissions.js";
import { bindTableRowPrimaryAction, tableRowClickableClass } from "../../lib/tableRowAction.js";
import {
  InvoicingApplyPaymentModal,
  type PayableInvoiceOption
} from "./InvoicingApplyPaymentModal.js";
import {
  invDataTableShellClass,
  invFilterBarClass,
  invFilterInputClass,
  invFilterSectionClass,
  invFilterSectionHeadingClass,
  invPrimaryButtonClass,
  invTableBodyClass,
  invTableEmptyCellClass,
  invTableHeadClass,
  invTableStripedRowClass,
  readInvoicingApiError
} from "./invoicingUi.js";
import { useInvoicingApi } from "./useInvoicingApi.js";
import { useInvoicingDisplayFormatters } from "./useInvoicingDisplayFormatters.js";

type PaymentRow = {
  id: string;
  invoiceId: string;
  amountMinor: number;
  paymentDate: string;
  reference: string | null;
  note: string;
  revisedInvoiceId: string | null;
  createdAt: string;
  invoiceDocumentNumber: string;
  invoiceDisplayDocumentNumber: string;
  invoiceCustomerName: string | null;
  invoiceCurrencyCode: string;
  invoiceStatus: InvoicingInvoiceStatus;
};

type DocumentRow = {
  kind: "invoice";
  id: string;
  status: InvoicingInvoiceStatus;
  documentNumber: string | null;
  temporaryReference: string | null;
  customerName: string | null;
  currencyCode: string;
  totalIncludingTaxMinor: number;
};

const useDebouncedValue = <T,>(value: T, delayMs: number): T => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
};

/** Route page component for tenant invoicing & quoting under AppShell. */
export const InvoicingPaymentsOverviewPage = () => {
  const { authedFetch } = useInvoicingApi();
  const { canWrite } = useModulePermissions("invoicing");
  const { formatMoney, formatDate, formatDateTime, locale } = useInvoicingDisplayFormatters();
  const navigate = useNavigate();

  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);

  const [applyOpen, setApplyOpen] = useState(false);
  const [payableInvoices, setPayableInvoices] = useState<PayableInvoiceOption[]>([]);
  const [loadingPayable, setLoadingPayable] = useState(false);
  const [applyBusy, setApplyBusy] = useState(false);
  const [applyError, setApplyError] = useState("");

  const queryPath = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", "100");
    if (debouncedSearch.trim()) params.set("q", debouncedSearch.trim());
    return `/tenant/invoicing/payments?${params.toString()}`;
  }, [debouncedSearch]);

  const loadPayments = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await authedFetch(queryPath);
      if (!res.ok) {
        setError("Could not load payments.");
        setPayments([]);
        return;
      }
      const json = (await res.json()) as { payments: PaymentRow[] };
      setPayments(json.payments ?? []);
    } catch {
      setError("Could not load payments.");
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }, [authedFetch, queryPath]);

  useEffect(() => {
    void loadPayments();
  }, [loadPayments]);

  const loadPayableInvoices = useCallback(async () => {
    setLoadingPayable(true);
    try {
      const res = await authedFetch("/tenant/invoicing/documents?kind=invoice&limit=100");
      if (!res.ok) {
        setPayableInvoices([]);
        return;
      }
      const json = (await res.json()) as { documents: DocumentRow[] };
      setPayableInvoices(
        (json.documents ?? [])
          .filter((row) => canRegisterInvoicePayment(row.status))
          .map((row) => ({
            id: row.id,
            status: row.status,
            documentNumber: row.documentNumber,
            temporaryReference: row.temporaryReference,
            customerName: row.customerName,
            currencyCode: row.currencyCode,
            totalIncludingTaxMinor: row.totalIncludingTaxMinor
          }))
      );
    } catch {
      setPayableInvoices([]);
    } finally {
      setLoadingPayable(false);
    }
  }, [authedFetch]);

  const openApplyModal = () => {
    setApplyError("");
    setApplyOpen(true);
    void loadPayableInvoices();
  };

  const registerPayment = async (input: {
    invoiceId: string;
    amountMinor: number;
    paymentDate: string;
    reference: string;
    note: string;
  }) => {
    if (!canWrite) return;
    setApplyBusy(true);
    setApplyError("");
    try {
      const res = await authedFetch(`/tenant/invoicing/invoices/${input.invoiceId}/payments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          amountMinor: input.amountMinor,
          paymentDate: input.paymentDate,
          reference: input.reference || null,
          note: input.note
        })
      });
      if (!res.ok) {
        setApplyError(await readInvoicingApiError(res, "Could not register payment."));
        return;
      }
      const json = (await res.json()) as {
        outcome: "full" | "partial";
        revisedInvoiceId?: string;
      };
      setApplyOpen(false);
      if (json.outcome === "partial" && json.revisedInvoiceId) {
        navigate(`/admin/invoicing/invoices/${json.revisedInvoiceId}`);
        return;
      }
      await loadPayments();
    } catch {
      setApplyError("Could not register payment.");
    } finally {
      setApplyBusy(false);
    }
  };

  const colSpan = 6;

  return (
    <div className="w-full min-w-0 space-y-6">
      {canWrite ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={`inline-flex items-center gap-1.5 ${invPrimaryButtonClass}`} onClick={openApplyModal}>
            <Plus className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2} />
            Register payment
          </button>
        </div>
      ) : null}

      <div>
        <div className={invFilterSectionHeadingClass}>
          <Filter className="h-5 w-5 text-indigo-700/90" aria-hidden strokeWidth={2} />
          <h2 id="invoicing-payments-filters-heading" className="text-base font-semibold tracking-tight">
            Filters
          </h2>
        </div>
        <section className={invFilterSectionClass} aria-labelledby="invoicing-payments-filters-heading">
          <div className={invFilterBarClass}>
            <input
              className={`${invFilterInputClass} min-w-[8rem] flex-1`}
              placeholder="Search reference, invoice, customer…"
              aria-label="Search payments"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </section>
      </div>

      {error ? (
        <p className="text-sm text-rose-600" role="alert">
          {error}
        </p>
      ) : null}

      <div className="space-y-3">
        {!loading && payments.length > 0 ? (
          <p className="text-sm font-medium text-stone-600">
            {payments.length.toLocaleString(locale)} {payments.length === 1 ? "payment" : "payments"}
          </p>
        ) : null}

        <div className={invDataTableShellClass}>
          <table className="min-w-[720px] w-full table-auto border-collapse text-left divide-y divide-slate-200">
            <caption className="sr-only">Registered invoice payments for your organization.</caption>
            <thead className={invTableHeadClass}>
              <tr>
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                  Date
                </th>
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                  Invoice
                </th>
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                  Customer
                </th>
                <th scope="col" className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-slate-500">
                  Amount
                </th>
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                  Reference
                </th>
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                  Follow-up
                </th>
              </tr>
            </thead>
            <tbody className={invTableBodyClass}>
              {loading ? (
                <tr className="bg-white">
                  <td colSpan={colSpan} className={invTableEmptyCellClass}>
                    Loading…
                  </td>
                </tr>
              ) : payments.length === 0 ? (
                <tr className="bg-white">
                  <td colSpan={colSpan} className={invTableEmptyCellClass}>
                    No payments match your filters.
                  </td>
                </tr>
              ) : (
                payments.map((row, idx) => {
                  const invoiceNumber = row.invoiceDisplayDocumentNumber || row.invoiceDocumentNumber;
                  return (
                    <tr
                      key={row.id}
                      className={invTableStripedRowClass(idx, tableRowClickableClass)}
                      {...bindTableRowPrimaryAction({
                        onAction: () => navigate(`/admin/invoicing/invoices/${row.invoiceId}`),
                        ariaLabel: `Open invoice ${invoiceNumber}`
                      })}
                    >
                      <td className="whitespace-nowrap px-3 py-2 text-slate-700 tabular-nums">
                        {formatDate(row.paymentDate)}
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-900">{invoiceNumber}</td>
                      <td className="px-3 py-2 text-slate-700">{row.invoiceCustomerName ?? "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-700">
                        {formatMoney(row.amountMinor, row.invoiceCurrencyCode)}
                      </td>
                      <td className="px-3 py-2 text-slate-700">{row.reference?.trim() || "—"}</td>
                      <td className="px-3 py-2 text-slate-700">
                        {row.revisedInvoiceId ? (
                          <Link
                            to={`/admin/invoicing/invoices/${row.revisedInvoiceId}`}
                            className="font-medium text-indigo-700 hover:text-indigo-600"
                            onClick={(event) => event.stopPropagation()}
                          >
                            Open revised invoice
                          </Link>
                        ) : (
                          "Paid in full"
                        )}
                        <span className="mt-0.5 block text-xs text-stone-500" title={formatDateTime(row.createdAt)}>
                          Recorded {formatDateTime(row.createdAt, { omitSeconds: true })}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <InvoicingApplyPaymentModal
        open={applyOpen}
        invoices={payableInvoices}
        loadingInvoices={loadingPayable}
        busy={applyBusy}
        error={applyError}
        onClose={() => setApplyOpen(false)}
        onConfirm={registerPayment}
      />
    </div>
  );
};
