/**
 * Company Subscriptions Overview page.
 *
 * Tenant company subscriptions screen mounted under AppShell at /admin/company-subscriptions.
 *
 * Responsibilities:
 * - Load and render primary company subscriptions data for the route
 * - Wire user actions to tenant API endpoints
 * - Compose shared module components and modals
 *
 * Related:
 * - Route: /admin/company-subscriptions
 *
 * Security:
 * - Tenant-scoped API calls via authenticated session
 */
import {
  COMPANY_SUBSCRIPTION_CADENCE_KINDS,
  COMPANY_SUBSCRIPTION_STATUSES
} from "@starter/shared";
import { Filter, List, Plus, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { CrmModal } from "../../components/crm/CrmModal.js";
import { useModulePermissions } from "../../hooks/useModulePermissions.js";
import { useTenantDisplayPreferences } from "../../hooks/useTenantDisplayPreferences.js";
import { useUserDisplayDatetime } from "../../hooks/useUserDisplayDatetime.js";
import { formatFinanceAmount } from "../../lib/currencyFormat.js";
import { bindTableRowPrimaryAction, tableRowClickableClass } from "../../lib/tableRowAction.js";
import { AddCompanySubscriptionProviderModal } from "./AddCompanySubscriptionProviderModal.js";
import {
  cadenceLabel,
  isSeatedCompanySubscription,
  isSingularCompanySubscription,
  subscriptionKindLabel,
  csCompactTdClass,
  csCompactThClass,
  csDataTableClass,
  csDataTableShellClass,
  providerOverviewLabel,
  statusBadgeClass,
  statusLabel
} from "./companySubscriptionsUi.js";
import {
  COMPANY_SUBSCRIPTIONS_API,
  type DashboardSummaryResponse,
  type ProvidersListResponse,
  useCompanySubscriptionsApi
} from "./useCompanySubscriptionsApi.js";

const filterInputClass =
  "w-full rounded-lg border border-stone-200/90 bg-white py-2.5 pl-10 pr-3 text-sm text-stone-900 shadow-sm placeholder:text-stone-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/25";
const filterSelectClass =
  "w-full rounded-lg border border-stone-200/90 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/25";

/** Route page component for tenant company subscriptions under AppShell. */
export const CompanySubscriptionsOverviewPage = () => {
  const navigate = useNavigate();
  const { authedFetch } = useCompanySubscriptionsApi();
  const { canWrite } = useModulePermissions("company_subscriptions");
  const { preferences: tenantPrefs } = useTenantDisplayPreferences();
  const { formatDate } = useUserDisplayDatetime();
  const listLocale = tenantPrefs?.locale ?? "en-US";
  const currencyFormat = tenantPrefs?.currencyFormat ?? null;
  const [searchParams, setSearchParams] = useSearchParams();
  const [addOpen, setAddOpen] = useState(false);

  const urlQ = searchParams.get("q") ?? "";
  const [qDraft, setQDraft] = useState(urlQ);

  useEffect(() => {
    setQDraft(urlQ);
  }, [urlQ]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setSearchParams(
        (prev) => {
          const nextTrim = qDraft.trim();
          const urlTrim = (prev.get("q") ?? "").trim();
          if (nextTrim === urlTrim) return prev;
          const next = new URLSearchParams(prev);
          if (nextTrim) next.set("q", nextTrim);
          else next.delete("q");
          next.set("page", "1");
          return next;
        },
        { replace: true }
      );
    }, 320);
    return () => window.clearTimeout(id);
  }, [qDraft, setSearchParams]);

  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? "25") || 25));
  const statusFilter = searchParams.get("status") ?? "";
  const cadenceFilter = searchParams.get("cadenceKind") ?? "";

  const setParam = useCallback(
    (updates: Record<string, string | undefined>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(updates)) {
            if (v === undefined || v === "") next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    p.set("limit", String(pageSize));
    p.set("offset", String((page - 1) * pageSize));
    if (urlQ.trim()) p.set("q", urlQ.trim());
    if (statusFilter) p.set("status", statusFilter);
    if (cadenceFilter) p.set("cadenceKind", cadenceFilter);
    p.set("sort", "name");
    p.set("order", "asc");
    return p.toString();
  }, [page, pageSize, urlQ, statusFilter, cadenceFilter]);

  const [summary, setSummary] = useState<DashboardSummaryResponse | null>(null);
  const [list, setList] = useState<ProvidersListResponse | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingList, setLoadingList] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setError("");
      setLoadingSummary(true);
      try {
        const res = await authedFetch(`${COMPANY_SUBSCRIPTIONS_API}/dashboard-summary`);
        if (!res?.ok) {
          if (!cancelled) setError("Could not load dashboard summary.");
          return;
        }
        const json = (await res.json()) as DashboardSummaryResponse;
        if (!cancelled) setSummary(json);
      } catch {
        if (!cancelled) setError("Could not load dashboard summary.");
      } finally {
        if (!cancelled) setLoadingSummary(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [authedFetch]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setError("");
      setLoadingList(true);
      try {
        const res = await authedFetch(`${COMPANY_SUBSCRIPTIONS_API}/providers?${queryString}`);
        if (!res?.ok) {
          if (!cancelled) setError("Could not load providers.");
          return;
        }
        const json = (await res.json()) as ProvidersListResponse;
        if (!cancelled) setList(json);
      } catch {
        if (!cancelled) setError("Could not load providers.");
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [authedFetch, queryString]);

  const totalPages = list ? Math.max(1, Math.ceil(list.total / pageSize)) : 1;
  const total = list?.total ?? 0;
  const summaryCurrency = summary?.currencyCode ?? tenantPrefs?.preferredCurrency ?? "USD";
  const recordsFoundLabel = loadingList
    ? "Loading…"
    : `${total.toLocaleString()} provider${total === 1 ? "" : "s"} found`;

  const formatMoney = (minor: number | null | undefined, currency: string | null | undefined) => {
    if (minor == null) return "—";
    return formatFinanceAmount(minor, currency?.trim() || summaryCurrency, listLocale, currencyFormat);
  };

  const statCards = [
    {
      label: "Active providers",
      value: loadingSummary ? "…" : String(summary?.activeCount ?? 0)
    },
    {
      label: "Total seats",
      value: loadingSummary ? "…" : String(summary?.totalSeats ?? 0)
    },
    {
      label: "Upcoming renewals",
      value: loadingSummary ? "…" : String(summary?.upcomingRenewals ?? 0)
    },
    {
      label: "Expiring soon",
      value: loadingSummary ? "…" : String(summary?.expiringSoon ?? 0)
    },
    {
      label: "Est. monthly cost",
      value: loadingSummary
        ? "…"
        : formatMoney(summary?.estimatedRecurringCostMinor ?? 0, summary?.currencyCode ?? summaryCurrency)
    }
  ];

  return (
    <div className="w-full min-w-0">
      {canWrite ? (
        <div className="flex flex-wrap justify-end gap-4">
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" aria-hidden strokeWidth={2} />
            Add subscription
          </button>
        </div>
      ) : null}

      <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-5${canWrite ? " mt-6" : ""}`}>
        {statCards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-stone-200/80 bg-white p-4 shadow-sm ring-1 ring-slate-900/5"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{card.label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="mb-3 mt-8 flex items-center gap-2 text-stone-800">
        <Filter className="h-5 w-5 text-amber-800/90" aria-hidden strokeWidth={2} />
        <h2 id="cs-providers-filters-heading" className="text-base font-semibold tracking-tight">
          Filters
        </h2>
      </div>
      <section
        className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,15,15,0.06)] sm:p-6"
        aria-labelledby="cs-providers-filters-heading"
      >
        <label htmlFor="cs-providers-q" className="mb-1.5 block text-xs font-medium text-stone-600">
          Search providers
        </label>
        <div className="relative mb-4">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
            aria-hidden
          />
          <input
            id="cs-providers-q"
            type="search"
            autoComplete="off"
            placeholder="Name, vendor, category, notes…"
            value={qDraft}
            onChange={(e) => setQDraft(e.target.value)}
            className={filterInputClass}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="cs-providers-status" className="mb-1.5 block text-xs font-medium text-stone-600">
              Status
            </label>
            <select
              id="cs-providers-status"
              value={statusFilter}
              onChange={(e) => setParam({ status: e.target.value || undefined, page: "1" })}
              className={filterSelectClass}
            >
              <option value="">Any status</option>
              {COMPANY_SUBSCRIPTION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="cs-providers-cadence" className="mb-1.5 block text-xs font-medium text-stone-600">
              Billing cadence
            </label>
            <select
              id="cs-providers-cadence"
              value={cadenceFilter}
              onChange={(e) => setParam({ cadenceKind: e.target.value || undefined, page: "1" })}
              className={filterSelectClass}
            >
              <option value="">Any cadence</option>
              {COMPANY_SUBSCRIPTION_CADENCE_KINDS.map((c) => (
                <option key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {error ? (
        <p className="mt-4 text-sm text-rose-600" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium text-stone-600">{recordsFoundLabel}</p>
        <div className="flex w-full justify-end sm:w-auto">
          <label htmlFor="cs-providers-pagesize" className="sr-only">
            Rows per page
          </label>
          <div
            className="inline-flex min-h-8 shrink-0 items-stretch overflow-hidden rounded-md border border-stone-200 bg-white text-xs shadow-sm"
            title="Rows per page"
          >
            <span
              className="flex items-center gap-1 border-r border-stone-200 bg-stone-50 px-2 py-1 font-medium text-stone-600"
              aria-hidden
            >
              <List className="h-3 w-3 shrink-0 text-stone-400" strokeWidth={2} aria-hidden />
              Rows
            </span>
            <select
              id="cs-providers-pagesize"
              value={String(pageSize)}
              onChange={(e) => setParam({ pageSize: e.target.value, page: "1" })}
              className="min-w-[4.25rem] cursor-pointer border-0 bg-white py-1 pl-2 pr-8 text-xs font-semibold tabular-nums text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400/45"
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className={`mt-3 ${csDataTableShellClass}`}>
        <table
          className={`${csDataTableClass} min-w-[880px]`}
          aria-label="Company subscription providers"
        >
          <caption className="sr-only">Company subscription providers for your organization.</caption>
          <thead className="bg-slate-50">
            <tr>
              <th
                scope="col"
                className="min-w-[12rem] px-3 py-2 align-bottom text-left text-xs font-medium uppercase tracking-wider text-slate-500"
              >
                Provider
              </th>
              <th scope="col" className={`${csCompactThClass} text-left`}>
                Type
              </th>
              <th scope="col" className={`${csCompactThClass} text-left`}>
                Status
              </th>
              <th scope="col" className={`${csCompactThClass} text-left`}>
                Renewal
              </th>
              <th scope="col" className={`${csCompactThClass} text-left`}>
                Cadence
              </th>
              <th
                scope="col"
                className={`${csCompactThClass} text-right`}
                title="Normalized to a monthly equivalent from billing cadence"
              >
                Est. monthly
              </th>
              <th scope="col" className={`${csCompactThClass} text-center`}>
                Plans / seats
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
            {loadingList ? (
              <tr className="bg-white">
                <td colSpan={7} className="px-3 py-16 text-center text-sm text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : !list?.providers.length ? (
              <tr className="bg-white">
                <td colSpan={7} className="px-3 py-16 text-center text-sm text-slate-500">
                  No providers match your filters.
                </td>
              </tr>
            ) : (
              list.providers.map((row, idx) => {
                const label = providerOverviewLabel(row.vendorName, row.name);
                return (
                <tr
                  key={row.id}
                  className={[
                    idx % 2 === 0 ? "bg-white" : "bg-slate-50/40",
                    "transition-colors hover:bg-slate-100/80",
                    tableRowClickableClass
                  ].join(" ")}
                  {...bindTableRowPrimaryAction({
                    onAction: () => navigate(`/admin/company-subscriptions/providers/${row.id}`),
                    ariaLabel: `Open ${label}`
                  })}
                >
                  <td className="max-w-0 whitespace-nowrap px-3 py-2 align-middle">
                    <span
                      className="block truncate font-medium text-slate-900"
                      title={label}
                    >
                      {label}
                    </span>
                  </td>
                  <td className={`${csCompactTdClass} text-slate-700`}>
                    {subscriptionKindLabel(row.subscriptionKind)}
                  </td>
                  <td className={csCompactTdClass}>
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium leading-none shadow-sm ${statusBadgeClass(row.status)}`}
                    >
                      {statusLabel(row.status)}
                    </span>
                  </td>
                  <td className={`${csCompactTdClass} tabular-nums text-slate-700`}>
                    {isSeatedCompanySubscription(row.subscriptionKind)
                      ? "—"
                      : row.renewalDate
                        ? formatDate(row.renewalDate)
                        : "—"}
                  </td>
                  <td className={`${csCompactTdClass} text-slate-700`}>
                    {isSingularCompanySubscription(row.subscriptionKind)
                      ? cadenceLabel(row)
                      : isSeatedCompanySubscription(row.subscriptionKind)
                        ? "Per plan"
                        : cadenceLabel(row)}
                  </td>
                  <td className={`${csCompactTdClass} text-right tabular-nums text-slate-700`}>
                    {formatMoney(row.monthlyCostMinor, row.currencyCode)}
                  </td>
                  <td className={`${csCompactTdClass} text-center tabular-nums text-slate-700`}>
                    {isSingularCompanySubscription(row.subscriptionKind)
                      ? "—"
                      : `${row.planCount ?? 0} / ${row.seatCount ?? 0}`}
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {!loadingList && list ? (
        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-stone-600">
            {total === 0 ? (
              "No results."
            ) : (
              <>
                Page <span className="font-medium text-stone-900">{page}</span> of{" "}
                <span className="font-medium text-stone-900">{totalPages}</span>
              </>
            )}
          </p>
          <nav className="flex flex-wrap items-center gap-2" aria-label="Pagination">
            <button
              type="button"
              disabled={page <= 1 || total === 0}
              onClick={() => setParam({ page: String(Math.max(1, page - 1)) })}
              className="rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-800 shadow-sm transition hover:border-stone-300 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={total === 0 || page >= totalPages}
              onClick={() => setParam({ page: String(page + 1) })}
              className="rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-800 shadow-sm transition hover:border-stone-300 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </nav>
        </div>
      ) : null}

      <CrmModal title="Add subscription" open={addOpen} onClose={() => setAddOpen(false)} wide>
        <AddCompanySubscriptionProviderModal
          defaultCurrency={tenantPrefs?.preferredCurrency ?? "USD"}
          onClose={() => setAddOpen(false)}
          onCreated={(provider) => navigate(`/admin/company-subscriptions/providers/${provider.id}`)}
        />
      </CrmModal>
    </div>
  );
};
