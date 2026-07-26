/**
 * Invoicing Overview page.
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
import {
  formatInvoicingStatus,
  INVOICING_INVOICE_STATUSES,
  INVOICING_OFFER_STATUSES,
  INVOICING_QUOTE_STATUSES,
  invoicingDocumentKindLabel,
  type InvoicingDocumentKind
} from "@starter/shared";
import { Filter, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useModulePermissions } from "../../hooks/useModulePermissions.js";
import { bindTableRowPrimaryAction, tableRowClickableClass } from "../../lib/tableRowAction.js";
import {
  invDataTableShellClass,
  invDocumentKindBadgeBaseClass,
  invDocumentKindBadgeClass,
  invDocumentStatusBadgeBaseClass,
  invDocumentStatusBadgeClass,
  invFilterBarClass,
  invFilterInputClass,
  invFilterPillClass,
  invFilterPillGroupClass,
  invFilterSectionClass,
  invFilterSectionHeadingClass,
  invFilterSelectClass,
  invPrimaryButtonClass,
  invOverviewDocumentsColgroupClassNames,
  invOverviewDocumentsCompactTdClass,
  invOverviewDocumentsCompactThClass,
  invOverviewDocumentsCustomerTdClass,
  invOverviewDocumentsDataTableClass,
  invOverviewDocumentsNumberTdClass,
  invTableBodyClass,
  invTableEmptyCellClass,
  invTableHeadClass,
  invTableStripedRowClass
} from "./invoicingUi.js";
import { useInvoicingApi } from "./useInvoicingApi.js";
import { useInvoicingDisplayFormatters } from "./useInvoicingDisplayFormatters.js";

type DocumentRow = {
  kind: InvoicingDocumentKind;
  id: string;
  status: string;
  documentNumber: string | null;
  temporaryReference: string | null;
  customerName: string | null;
  contactName: string | null;
  currencyCode: string;
  documentDate: string;
  totalIncludingTaxMinor: number;
  updatedAt: string;
  isQuoteExpired?: boolean;
};

type KindFilter = "" | InvoicingDocumentKind;
type DateFilterMode = "any" | "before" | "after" | "between";
type AmountFilterMode = "any" | "gt" | "lt" | "between";
type SortCol = "updated";

const SortIndicator = ({ active, ascending }: { active: boolean; ascending: boolean }) => {
  if (!active) return <span className="inline-block w-3.5 opacity-0" aria-hidden />;
  return ascending ? (
    <span className="text-[10px] leading-none text-slate-500" aria-hidden>
      ▲
    </span>
  ) : (
    <span className="text-[10px] leading-none text-slate-500" aria-hidden>
      ▼
    </span>
  );
};

const KIND_FILTERS: { value: KindFilter; label: string }[] = [
  { value: "", label: "All" },
  { value: "quote", label: "Quotes" },
  { value: "offer", label: "Offers" },
  { value: "invoice", label: "Invoices" }
];

const INVOICE_STATUS_FILTER_OPTIONS = INVOICING_INVOICE_STATUSES.filter(
  (status) => status !== "invoice_finalized"
);

const statusOptionsForKind = (kind: KindFilter): { value: string; label: string }[] => {
  const labelFor = (documentKind: InvoicingDocumentKind, status: string) =>
    kind === ""
      ? `${invoicingDocumentKindLabel(documentKind)} — ${formatInvoicingStatus(status)}`
      : formatInvoicingStatus(status);

  if (kind === "quote") {
    return INVOICING_QUOTE_STATUSES.map((value) => ({
      value,
      label: labelFor("quote", value)
    }));
  }
  if (kind === "offer") {
    return INVOICING_OFFER_STATUSES.map((value) => ({
      value,
      label: labelFor("offer", value)
    }));
  }
  if (kind === "invoice") {
    return INVOICE_STATUS_FILTER_OPTIONS.map((value) => ({
      value,
      label: labelFor("invoice", value)
    }));
  }

  return [
    ...INVOICING_QUOTE_STATUSES.map((value) => ({ value, label: labelFor("quote", value) })),
    ...INVOICING_OFFER_STATUSES.map((value) => ({ value, label: labelFor("offer", value) })),
    ...INVOICE_STATUS_FILTER_OPTIONS.map((value) => ({ value, label: labelFor("invoice", value) }))
  ];
};

const documentPath = (row: DocumentRow) => {
  switch (row.kind) {
    case "quote":
      return `/admin/invoicing/quotes/${row.id}`;
    case "offer":
      return `/admin/invoicing/offers/${row.id}`;
    case "invoice":
      return `/admin/invoicing/invoices/${row.id}`;
  }
};

const displayNumber = (row: DocumentRow) => row.documentNumber ?? row.temporaryReference ?? "—";

const useDebouncedValue = <T,>(value: T, delayMs: number): T => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
};

const buildDocumentsQuery = (filters: {
  kind: KindFilter;
  status: string;
  q: string;
  expiredOnly: boolean;
  dateMode: DateFilterMode;
  dateStart: string;
  dateEnd: string;
  amountMode: AmountFilterMode;
  amountMin: string;
  amountMax: string;
  parseMajorToMinor: (raw: string) => number | null;
}): string => {
  const params = new URLSearchParams();
  params.set("limit", "100");
  if (filters.kind) params.set("kind", filters.kind);
  if (filters.status) params.set("status", filters.status);
  if (filters.expiredOnly) params.set("expiredOnly", "true");
  if (filters.q.trim()) params.set("q", filters.q.trim());

  if (filters.dateMode === "before" && filters.dateEnd) {
    params.set("documentDateTo", filters.dateEnd);
  } else if (filters.dateMode === "after" && filters.dateStart) {
    params.set("documentDateFrom", filters.dateStart);
  } else if (filters.dateMode === "between") {
    if (filters.dateStart) params.set("documentDateFrom", filters.dateStart);
    if (filters.dateEnd) params.set("documentDateTo", filters.dateEnd);
  }

  if (filters.amountMode === "gt") {
    const min = filters.parseMajorToMinor(filters.amountMin);
    if (min != null) params.set("totalMinorMin", String(min));
  } else if (filters.amountMode === "lt") {
    const max = filters.parseMajorToMinor(filters.amountMax);
    if (max != null) params.set("totalMinorMax", String(max));
  } else if (filters.amountMode === "between") {
    const min = filters.parseMajorToMinor(filters.amountMin);
    const max = filters.parseMajorToMinor(filters.amountMax);
    if (min != null) params.set("totalMinorMin", String(min));
    if (max != null) params.set("totalMinorMax", String(max));
  }

  return `/tenant/invoicing/documents?${params.toString()}`;
};

/** Route page component for tenant invoicing & quoting under AppShell. */
export const InvoicingOverviewPage = () => {
  const { authedFetch } = useInvoicingApi();
  const { canWrite } = useModulePermissions("invoicing");
  const { formatMoney, formatDate, formatDateTime, amountFormatters, locale } =
    useInvoicingDisplayFormatters();
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sort, setSort] = useState<{ col: SortCol; order: "asc" | "desc" }>({
    col: "updated",
    order: "desc"
  });

  const [kindFilter, setKindFilter] = useState<KindFilter>("");
  const [statusFilter, setStatusFilter] = useState("");
  const [expiredOnly, setExpiredOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [dateMode, setDateMode] = useState<DateFilterMode>("any");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [amountMode, setAmountMode] = useState<AmountFilterMode>("any");
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");

  const handleDateModeChange = (mode: DateFilterMode) => {
    setDateMode(mode);
    if (mode === "any") {
      setDateStart("");
      setDateEnd("");
    } else if (mode === "before") {
      setDateStart("");
    } else if (mode === "after") {
      setDateEnd("");
    }
  };

  const handleAmountModeChange = (mode: AmountFilterMode) => {
    setAmountMode(mode);
    if (mode === "any") {
      setAmountMin("");
      setAmountMax("");
    } else if (mode === "gt") {
      setAmountMax("");
    } else if (mode === "lt") {
      setAmountMin("");
    }
  };

  const debouncedSearch = useDebouncedValue(search, 300);

  const statusOptions = useMemo(() => statusOptionsForKind(kindFilter), [kindFilter]);

  const handleKindFilterChange = (value: KindFilter) => {
    setKindFilter(value);
    setStatusFilter((current) => {
      if (!current) return "";
      return statusOptionsForKind(value).some((option) => option.value === current) ? current : "";
    });
  };

  const queryPath = useMemo(
    () =>
      buildDocumentsQuery({
        kind: kindFilter,
        status: statusFilter,
        q: debouncedSearch,
        expiredOnly,
        dateMode,
        dateStart,
        dateEnd,
        amountMode,
        amountMin,
        amountMax,
        parseMajorToMinor: amountFormatters.parseMajorToMinor
      }),
    [
      kindFilter,
      statusFilter,
      debouncedSearch,
      expiredOnly,
      dateMode,
      dateStart,
      dateEnd,
      amountMode,
      amountMin,
      amountMax,
      amountFormatters.parseMajorToMinor
    ]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await authedFetch(queryPath);
      if (!res.ok) {
        setError("Could not load documents.");
        setDocuments([]);
        return;
      }
      const json = (await res.json()) as { documents: DocumentRow[] };
      setDocuments(json.documents ?? []);
    } catch {
      setError("Could not load documents.");
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, [authedFetch, queryPath]);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedDocuments = useMemo(() => {
    const list = [...documents];
    const dir = sort.order === "asc" ? 1 : -1;
    list.sort((a, b) => dir * (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()));
    return list;
  }, [documents, sort.order]);

  const toggleSort = useCallback((col: SortCol) => {
    setSort((prev) =>
      prev.col === col
        ? { col, order: prev.order === "asc" ? "desc" : "asc" }
        : { col, order: "desc" }
    );
  }, []);

  const openRow = (row: DocumentRow) => {
    navigate(documentPath(row));
  };

  const colSpan = 8;

  return (
    <div className="w-full min-w-0 space-y-6">
      {canWrite ? (
        <div className="flex flex-wrap gap-2">
          <Link
            to="/admin/invoicing/quotes/new"
            className={`inline-flex items-center gap-1.5 ${invPrimaryButtonClass}`}
          >
            <Plus className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2} />
            New quote
          </Link>
        </div>
      ) : null}

      <div>
        <div className={invFilterSectionHeadingClass}>
          <Filter className="h-5 w-5 text-indigo-700/90" aria-hidden strokeWidth={2} />
          <h2 id="invoicing-documents-filters-heading" className="text-base font-semibold tracking-tight">
            Filters
          </h2>
        </div>
        <section className={invFilterSectionClass} aria-labelledby="invoicing-documents-filters-heading">
          <div className={invFilterBarClass}>
          <input
            className={`${invFilterInputClass} min-w-[8rem] flex-1`}
            placeholder="Search number, customer, contact…"
            aria-label="Search documents"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <select
            className={`${invFilterSelectClass} min-w-[9rem] max-w-[14rem]`}
            aria-label="Status filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">Any status</option>
            {statusOptions.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          {kindFilter === "" || kindFilter === "quote" ? (
            <button
              type="button"
              aria-pressed={expiredOnly}
              className={invFilterPillClass(expiredOnly)}
              onClick={() => setExpiredOnly((value) => !value)}
            >
              Expired quotes
            </button>
          ) : null}

          <select
            className={`${invFilterSelectClass} w-[6.75rem]`}
            aria-label="Date filter"
            value={dateMode}
            onChange={(e) => handleDateModeChange(e.target.value as DateFilterMode)}
          >
            <option value="any">Any date</option>
            <option value="before">Before</option>
            <option value="after">After</option>
            <option value="between">Between</option>
          </select>
          {(dateMode === "after" || dateMode === "between") && (
            <input
              type="date"
              className={`${invFilterInputClass} w-[9.25rem] shrink-0`}
              aria-label={dateMode === "between" ? "Date from" : "Date on or after"}
              value={dateStart}
              onChange={(e) => setDateStart(e.target.value)}
            />
          )}
          {dateMode === "between" ? (
            <span className="shrink-0 text-xs text-stone-400" aria-hidden>
              –
            </span>
          ) : null}
          {(dateMode === "before" || dateMode === "between") && (
            <input
              type="date"
              className={`${invFilterInputClass} w-[9.25rem] shrink-0`}
              aria-label={dateMode === "between" ? "Date to" : "Date on or before"}
              value={dateEnd}
              onChange={(e) => setDateEnd(e.target.value)}
            />
          )}

          <select
            className={`${invFilterSelectClass} w-[7rem]`}
            aria-label="Amount filter"
            value={amountMode}
            onChange={(e) => handleAmountModeChange(e.target.value as AmountFilterMode)}
          >
            <option value="any">Any amount</option>
            <option value="gt">At least</option>
            <option value="lt">At most</option>
            <option value="between">Between</option>
          </select>
          {(amountMode === "gt" || amountMode === "between") && (
            <input
              type="text"
              inputMode="decimal"
              className={`${invFilterInputClass} w-[5.5rem] shrink-0`}
              placeholder="Min"
              aria-label={amountMode === "between" ? "Minimum amount" : "Minimum amount (at least)"}
              value={amountMin}
              onChange={(e) => setAmountMin(e.target.value)}
            />
          )}
          {amountMode === "between" ? (
            <span className="shrink-0 text-xs text-stone-400" aria-hidden>
              –
            </span>
          ) : null}
          {(amountMode === "lt" || amountMode === "between") && (
            <input
              type="text"
              inputMode="decimal"
              className={`${invFilterInputClass} w-[5.5rem] shrink-0`}
              placeholder="Max"
              aria-label={amountMode === "between" ? "Maximum amount" : "Maximum amount (at most)"}
              value={amountMax}
              onChange={(e) => setAmountMax(e.target.value)}
            />
          )}

          <div
            role="group"
            aria-label="Document type"
            className={`${invFilterPillGroupClass} ml-auto shrink-0`}
          >
            {KIND_FILTERS.map(({ value, label }) => (
              <button
                key={value || "all"}
                type="button"
                aria-pressed={kindFilter === value}
                className={invFilterPillClass(kindFilter === value)}
                onClick={() => handleKindFilterChange(value)}
              >
                {label}
              </button>
            ))}
          </div>
          </div>
        </section>
      </div>

      {error ? (
        <p className="text-sm text-rose-600" role="alert">
          {error}
        </p>
      ) : null}

      <div className="space-y-3">
        {!loading && sortedDocuments.length > 0 ? (
          <p className="text-sm font-medium text-stone-600">
            {sortedDocuments.length.toLocaleString(locale)}{" "}
            {sortedDocuments.length === 1 ? "document" : "documents"}
          </p>
        ) : null}

        <div className={invDataTableShellClass}>
          <table className={invOverviewDocumentsDataTableClass} aria-label="Quotes, offers, and invoices">
            <caption className="sr-only">
              Quotes, offers, and invoices for your organization; updated column is sortable.
            </caption>
            <colgroup>
              {invOverviewDocumentsColgroupClassNames.map((className, columnIndex) => (
                <col key={columnIndex} className={className} />
              ))}
            </colgroup>
            <thead className={invTableHeadClass}>
              <tr>
                <th scope="col" className={`${invOverviewDocumentsCompactThClass} text-left`}>
                  Number
                </th>
                <th scope="col" className={`${invOverviewDocumentsCompactThClass} text-left`}>
                  Date
                </th>
                <th scope="col" className={`${invOverviewDocumentsCompactThClass} text-left`}>
                  Type
                </th>
                <th scope="col" className={`${invOverviewDocumentsCompactThClass} text-left`}>
                  Customer
                </th>
                <th scope="col" className={`${invOverviewDocumentsCompactThClass} text-left`}>
                  Contact
                </th>
                <th scope="col" className={`${invOverviewDocumentsCompactThClass} text-left`}>
                  Status
                </th>
                <th
                  scope="col"
                  className={`${invOverviewDocumentsCompactThClass} text-left`}
                  aria-sort={sort.col === "updated" ? (sort.order === "asc" ? "ascending" : "descending") : "none"}
                >
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-slate-700"
                    onClick={() => toggleSort("updated")}
                  >
                    Updated
                    <SortIndicator active={sort.col === "updated"} ascending={sort.order === "asc"} />
                  </button>
                </th>
                <th scope="col" className={`${invOverviewDocumentsCompactThClass} text-right`}>
                  Total
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
              ) : sortedDocuments.length === 0 ? (
                <tr className="bg-white">
                  <td colSpan={colSpan} className={invTableEmptyCellClass}>
                    No documents match your filters.
                  </td>
                </tr>
              ) : (
                sortedDocuments.map((row, idx) => {
                  const number = displayNumber(row);
                  const kindLabel = invoicingDocumentKindLabel(row.kind);
                  return (
                    <tr
                      key={`${row.kind}-${row.id}`}
                      className={invTableStripedRowClass(idx, tableRowClickableClass)}
                      {...bindTableRowPrimaryAction({
                        onAction: () => openRow(row),
                        ariaLabel: `Open ${kindLabel} ${number}`
                      })}
                    >
                      <td className={invOverviewDocumentsNumberTdClass}>
                        <span className="block truncate font-medium text-slate-900" title={number}>
                          {number}
                        </span>
                      </td>
                      <td className={`${invOverviewDocumentsCompactTdClass} tabular-nums`}>
                        {formatDate(row.documentDate)}
                      </td>
                      <td className={invOverviewDocumentsCompactTdClass}>
                        <span className={`${invDocumentKindBadgeBaseClass} ${invDocumentKindBadgeClass(row.kind)}`}>
                          {kindLabel}
                        </span>
                      </td>
                      <td className={invOverviewDocumentsCustomerTdClass}>
                        <span className="block truncate" title={row.customerName ?? undefined}>
                          {row.customerName ?? "—"}
                        </span>
                      </td>
                      <td className={invOverviewDocumentsCustomerTdClass}>
                        <span className="block truncate" title={row.contactName ?? undefined}>
                          {row.contactName ?? "—"}
                        </span>
                      </td>
                      <td className={invOverviewDocumentsCompactTdClass}>
                        <span
                          className={`${invDocumentStatusBadgeBaseClass} ${invDocumentStatusBadgeClass(row.status)}`}
                          title={formatInvoicingStatus(row.status)}
                        >
                          <span className="block truncate">{formatInvoicingStatus(row.status)}</span>
                        </span>
                      </td>
                      <td
                        className={`${invOverviewDocumentsCompactTdClass} tabular-nums`}
                        title={formatDateTime(row.updatedAt, { omitSeconds: true })}
                      >
                        {formatDateTime(row.updatedAt, { omitSeconds: true })}
                      </td>
                      <td className={`${invOverviewDocumentsCompactTdClass} text-right tabular-nums`}>
                        {formatMoney(row.totalIncludingTaxMinor, row.currencyCode)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
