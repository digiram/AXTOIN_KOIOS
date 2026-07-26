/**
 * SalesFunnelRecordsPage.
 *
 * Tabular cross-board view of BDR leads and pipeline deals with filters and sorting.
 *
 * Responsibilities:
 * - Paginated leads/deals lists with URL-synced search, stage, owner, and archive filters
 * - Navigate to full-page record detail on row action
 * - Format currency and datetimes with tenant display preferences
 *
 * Depends on:
 * - {@link useSalesApi}, {@link salesLeadDetailPath}, {@link salesDealDetailPath}
 *
 * Security:
 * - Lists tenant-scoped funnel records; write actions not exposed on this screen
 */

import { ChevronLeft, ChevronRight, Filter, List, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { API_BASE_URL } from "../../lib/api.js";
import { useTenantDisplayPreferences } from "../../hooks/useTenantDisplayPreferences.js";
import { formatUserDateTime } from "../../lib/userDisplayDatetime.js";
import { formatFinanceAmount } from "../../lib/currencyFormat.js";
import { bindTableRowPrimaryAction, tableRowClickableClass } from "../../lib/tableRowAction.js";
import { salesDealDetailPath, salesLeadDetailPath } from "./salesFunnelPaths.js";
import { useSalesApi } from "./useSalesApi.js";

type Stage = { stageKey: string; name: string; sortOrder: number };

type Assignee = { id: string; displayName: string | null; email: string };

type LeadRow = {
  id: string;
  title: string;
  stageKey: string;
  ownerUserId: string | null;
  updatedAt: string;
  archivedAt: string | null;
  active?: boolean;
  inactiveStageLabel?: string | null;
};

type DealRow = {
  id: string;
  title: string;
  stageKey: string;
  ownerUserId: string | null;
  updatedAt: string;
  archivedAt: string | null;
  active?: boolean;
  inactiveStageLabel?: string | null;
  expectedValueMinor?: number | null;
  expectedValueCurrency?: string | null;
};

type FunnelRecord = {
  kind: "lead" | "deal";
  id: string;
  title: string;
  stageKey: string;
  ownerUserId: string | null;
  updatedAt: string;
  archivedAt: string | null;
  active: boolean;
  inactiveStageLabel?: string | null;
  expectedValueMinor?: number | null;
  expectedValueCurrency?: string | null;
};

type SortCol = "title" | "type" | "stage" | "updated";

const SORT_COLS: { key: SortCol; label: string }[] = [
  { key: "type", label: "Type" },
  { key: "title", label: "Title" },
  { key: "stage", label: "Stage" },
  { key: "updated", label: "Updated" }
];

const kindBadgeClass = (kind: FunnelRecord["kind"]) =>
  kind === "lead"
    ? "border-indigo-200/80 bg-indigo-50 text-indigo-900"
    : "border-emerald-200/80 bg-emerald-50 text-emerald-900";

const kindLabel = (kind: FunnelRecord["kind"]) => (kind === "lead" ? "Lead" : "Deal");

const pipelineStatusBadgeClass = (row: Pick<FunnelRecord, "archivedAt" | "active">) => {
  if (row.archivedAt) return "border-stone-300/80 bg-stone-100 text-stone-800";
  return row.active
    ? "border-emerald-200/80 bg-emerald-50 text-emerald-900"
    : "border-amber-200/80 bg-amber-50 text-amber-950";
};

const pipelineStatusLabel = (row: Pick<FunnelRecord, "archivedAt" | "active">) => {
  if (row.archivedAt) return "Archived";
  return row.active ? "Active" : "Inactive";
};

function displayStageLabel(
  row: FunnelRecord,
  stageLabelByKey: Map<string, string>
): string {
  if (!row.active && row.inactiveStageLabel) return row.inactiveStageLabel;
  const pipeline = row.kind === "lead" ? "bdr" : "sales";
  return stageLabelByKey.get(`${pipeline}:${row.stageKey}`) ?? row.stageKey;
}

function SortIndicator({ active, ascending }: { active: boolean; ascending: boolean }) {
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
}

/**
 * Funnel records list: searchable, filterable leads and deals tables.
 *
 * @returns Records overview at `/admin/sales/records`
 */
export const SalesFunnelRecordsPage = () => {
  const { authedFetch } = useSalesApi();
  const navigate = useNavigate();
  const { preferences: tenantPrefs } = useTenantDisplayPreferences();
  const listLocale = tenantPrefs?.locale ?? "en-US";
  const [searchParams, setSearchParams] = useSearchParams();

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
  const sort = (searchParams.get("sort") as SortCol | null) ?? "updated";
  const order = searchParams.get("order") === "asc" ? "asc" : "desc";
  const pipelineFilter = searchParams.get("pipeline") ?? "";
  const stageKeyFilter = searchParams.get("stageKey") ?? "";
  const ownerFilter = searchParams.get("ownerUserId") ?? "";
  const pipelineActiveFilter = searchParams.get("pipelineActive") ?? "";

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

  const [stages, setStages] = useState<{ bdr: Stage[]; sales: Stage[] }>({ bdr: [], sales: [] });
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const needLeads = pipelineFilter !== "sales";
  const needDeals = pipelineFilter !== "bdr";

  const listQueryString = useMemo(() => {
    const p = new URLSearchParams();
    if (urlQ.trim()) p.set("q", urlQ.trim());
    if (stageKeyFilter) p.set("stageKey", stageKeyFilter);
    if (ownerFilter) p.set("ownerUserId", ownerFilter);
    if (
      pipelineActiveFilter === "active" ||
      pipelineActiveFilter === "inactive" ||
      pipelineActiveFilter === "archived"
    ) {
      p.set("pipelineActive", pipelineActiveFilter);
    }
    return p.toString();
  }, [urlQ, stageKeyFilter, ownerFilter, pipelineActiveFilter]);

  useEffect(() => {
    let cancelled = false;
    const loadMeta = async () => {
      try {
        const [configRes, assigneesRes] = await Promise.all([
          authedFetch(`${API_BASE_URL}/tenant/sales/pipeline-config`),
          authedFetch(`${API_BASE_URL}/tenant/sales/assignees`)
        ]);
        if (cancelled) return;
        if (configRes?.ok) {
          const json = (await configRes.json()) as { bdrStages: Stage[]; salesStages: Stage[] };
          setStages({
            bdr: [...json.bdrStages].sort((a, b) => a.sortOrder - b.sortOrder),
            sales: [...json.salesStages].sort((a, b) => a.sortOrder - b.sortOrder)
          });
        }
        if (assigneesRes?.ok) {
          const json = (await assigneesRes.json()) as { users: Assignee[] };
          setAssignees(json.users);
        }
      } catch {
        /* non-fatal for table */
      }
    };
    void loadMeta();
    return () => {
      cancelled = true;
    };
  }, [authedFetch]);

  useEffect(() => {
    let cancelled = false;
    const loadRecords = async () => {
      setError("");
      setLoading(true);
      try {
        const suffix = listQueryString ? `?${listQueryString}` : "";
        const fetches: Promise<void>[] = [];

        if (needLeads) {
          fetches.push(
            (async () => {
              const res = await authedFetch(`${API_BASE_URL}/tenant/sales/bdr/leads${suffix}`);
              if (!res?.ok) throw new Error("leads");
              const json = (await res.json()) as { leads: LeadRow[] };
              if (!cancelled) setLeads(json.leads);
            })()
          );
        } else if (!cancelled) {
          setLeads([]);
        }

        if (needDeals) {
          fetches.push(
            (async () => {
              const res = await authedFetch(`${API_BASE_URL}/tenant/sales/deals${suffix}`);
              if (!res?.ok) throw new Error("deals");
              const json = (await res.json()) as { deals: DealRow[] };
              if (!cancelled) setDeals(json.deals);
            })()
          );
        } else if (!cancelled) {
          setDeals([]);
        }

        await Promise.all(fetches);
      } catch {
        if (!cancelled) setError("Could not load leads and deals.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void loadRecords();
    return () => {
      cancelled = true;
    };
  }, [authedFetch, listQueryString, needLeads, needDeals]);

  const stageLabelByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of stages.bdr) map.set(`bdr:${s.stageKey}`, s.name);
    for (const s of stages.sales) map.set(`sales:${s.stageKey}`, s.name);
    return map;
  }, [stages]);

  const assigneeById = useMemo(() => new Map(assignees.map((u) => [u.id, u])), [assignees]);

  const stageOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    if (pipelineFilter !== "sales") {
      for (const s of stages.bdr) {
        opts.push({ value: s.stageKey, label: `BDR · ${s.name}` });
      }
    }
    if (pipelineFilter !== "bdr") {
      for (const s of stages.sales) {
        opts.push({ value: s.stageKey, label: `Sales · ${s.name}` });
      }
    }
    return opts;
  }, [stages, pipelineFilter]);

  const merged = useMemo(() => {
    const rows: FunnelRecord[] = [];
    if (needLeads) {
      for (const l of leads) {
        rows.push({
          kind: "lead",
          id: l.id,
          title: l.title,
          stageKey: l.stageKey,
          ownerUserId: l.ownerUserId,
          updatedAt: l.updatedAt,
          archivedAt: l.archivedAt,
          active: l.active !== false,
          inactiveStageLabel: l.inactiveStageLabel ?? null
        });
      }
    }
    if (needDeals) {
      for (const d of deals) {
        rows.push({
          kind: "deal",
          id: d.id,
          title: d.title,
          stageKey: d.stageKey,
          ownerUserId: d.ownerUserId,
          updatedAt: d.updatedAt,
          archivedAt: d.archivedAt,
          active: d.active !== false,
          inactiveStageLabel: d.inactiveStageLabel ?? null,
          expectedValueMinor: d.expectedValueMinor ?? null,
          expectedValueCurrency: d.expectedValueCurrency ?? null
        });
      }
    }
    return rows;
  }, [leads, deals, needLeads, needDeals]);

  const activeSort = SORT_COLS.some((c) => c.key === sort) ? sort : "updated";

  const sorted = useMemo(() => {
    const list = [...merged];
    const dir = order === "asc" ? 1 : -1;
    list.sort((a, b) => {
      switch (activeSort) {
        case "title":
          return dir * a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
        case "type":
          return dir * a.kind.localeCompare(b.kind);
        case "stage": {
          const aLabel = displayStageLabel(a, stageLabelByKey);
          const bLabel = displayStageLabel(b, stageLabelByKey);
          return dir * aLabel.localeCompare(bLabel, undefined, { sensitivity: "base" });
        }
        case "updated":
        default:
          return dir * (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
      }
    });
    return list;
  }, [merged, activeSort, order, stageLabelByKey]);

  const total = sorted.length;
  const totalPages = total === 0 ? 1 : Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  const toggleSort = useCallback(
    (col: SortCol) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const cur = prev.get("sort") ?? "updated";
          const ord = prev.get("order") === "asc" ? "asc" : "desc";
          if (cur === col) {
            next.set("order", ord === "asc" ? "desc" : "asc");
          } else {
            next.set("sort", col);
            next.set("order", col === "updated" ? "desc" : "asc");
          }
          next.set("page", "1");
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const recordsFoundLabel = loading
    ? "Loading…"
    : `${total.toLocaleString()} ${total === 1 ? "record" : "records"} found`;

  const filterInputClass =
    "w-full rounded-lg border border-stone-200/90 bg-white py-2.5 pl-10 pr-3 text-sm text-stone-900 shadow-sm placeholder:text-stone-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/25";

  const filterSelectClass =
    "w-full min-w-0 rounded-lg border border-stone-200/90 bg-white px-3 py-2.5 pr-9 text-sm text-stone-900 shadow-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/25";

  const detailHref = (row: FunnelRecord) =>
    row.kind === "lead" ? salesLeadDetailPath(row.id) : salesDealDetailPath(row.id);

  return (
    <div className="w-full min-w-0 max-w-none">
      <div className="mb-3 flex items-center gap-2 text-stone-800">
        <Filter className="h-5 w-5 text-amber-800/90" aria-hidden strokeWidth={2} />
        <h2 id="sales-records-filters-heading" className="text-base font-semibold tracking-tight">
          Filters
        </h2>
      </div>
      <section
        className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,15,15,0.06)] sm:p-6"
        aria-labelledby="sales-records-filters-heading"
      >
        <label htmlFor="sales-records-search" className="mb-1.5 block text-xs font-medium text-stone-600">
          Search leads and deals
        </label>
        <div className="relative mb-4">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
            aria-hidden
          />
          <input
            id="sales-records-search"
            type="search"
            autoComplete="off"
            placeholder="Title, description, tags…"
            value={qDraft}
            onChange={(e) => setQDraft(e.target.value)}
            className={filterInputClass}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="sales-records-pipeline" className="mb-1.5 block text-xs font-medium text-stone-600">
              Pipeline
            </label>
            <select
              id="sales-records-pipeline"
              value={pipelineFilter}
              onChange={(e) =>
                setParam({
                  pipeline: e.target.value || undefined,
                  stageKey: undefined,
                  page: "1"
                })
              }
              className={filterSelectClass}
            >
              <option value="">All pipelines</option>
              <option value="bdr">BDR</option>
              <option value="sales">Sales</option>
            </select>
          </div>
          <div>
            <label htmlFor="sales-records-stage" className="mb-1.5 block text-xs font-medium text-stone-600">
              Stage
            </label>
            <select
              id="sales-records-stage"
              value={stageKeyFilter}
              onChange={(e) =>
                setParam({
                  stageKey: e.target.value || undefined,
                  page: "1"
                })
              }
              className={filterSelectClass}
            >
              <option value="">Any stage</option>
              {stageOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="sales-records-owner" className="mb-1.5 block text-xs font-medium text-stone-600">
              Owner
            </label>
            <select
              id="sales-records-owner"
              value={ownerFilter}
              onChange={(e) =>
                setParam({
                  ownerUserId: e.target.value || undefined,
                  page: "1"
                })
              }
              className={filterSelectClass}
            >
              <option value="">Any owner</option>
              {assignees.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName?.trim() || u.email}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="sales-records-active" className="mb-1.5 block text-xs font-medium text-stone-600">
              Status
            </label>
            <select
              id="sales-records-active"
              value={pipelineActiveFilter}
              onChange={(e) =>
                setParam({
                  pipelineActive: e.target.value || undefined,
                  page: "1"
                })
              }
              className={filterSelectClass}
            >
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="archived">Archived</option>
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
          <label htmlFor="sales-records-pagesize" className="sr-only">
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
              id="sales-records-pagesize"
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

      <div className="mt-3 w-full min-w-0 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table
          className="w-full min-w-[1000px] table-auto border-collapse text-left divide-y divide-slate-200"
          aria-label="Leads and deals"
        >
          <caption className="sr-only">Directory of sales funnel leads and deals; columns are sortable.</caption>
          <thead className="bg-slate-50">
            <tr>
              {SORT_COLS.filter((c) => c.key !== "updated").map(({ key, label }) => {
                const isSorted = activeSort === key;
                const ariaSort = !isSorted ? "none" : order === "asc" ? "ascending" : "descending";
                return (
                  <th
                    key={key}
                    scope="col"
                    className="px-3 py-2 align-bottom text-xs font-medium uppercase tracking-wider text-slate-500"
                    aria-sort={ariaSort}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(key)}
                      className="inline-flex w-full cursor-pointer items-center gap-1 border-0 bg-transparent text-inherit transition-colors hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50"
                    >
                      <span>{label}</span>
                      <SortIndicator active={isSorted} ascending={order === "asc"} />
                    </button>
                  </th>
                );
              })}
              <th
                scope="col"
                className="px-3 py-2 align-bottom text-xs font-medium uppercase tracking-wider text-slate-500"
              >
                Status
              </th>
              <th
                scope="col"
                className="px-3 py-2 align-bottom text-xs font-medium uppercase tracking-wider text-slate-500"
              >
                Owner
              </th>
              <th
                scope="col"
                className="px-3 py-2 align-bottom text-xs font-medium uppercase tracking-wider text-slate-500"
              >
                Expected
              </th>
              <th
                scope="col"
                className="px-3 py-2 align-bottom text-xs font-medium uppercase tracking-wider text-slate-500"
                aria-sort={activeSort === "updated" ? (order === "asc" ? "ascending" : "descending") : "none"}
              >
                <button
                  type="button"
                  onClick={() => toggleSort("updated")}
                  className="inline-flex w-full cursor-pointer items-center gap-1 border-0 bg-transparent text-inherit transition-colors hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50"
                >
                  <span>Updated</span>
                  <SortIndicator active={activeSort === "updated"} ascending={order === "asc"} />
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
            {loading ? (
              <tr className="bg-white">
                <td colSpan={7} className="px-3 py-16 text-center text-sm text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : !pageRows.length ? (
              <tr className="bg-white">
                <td colSpan={7} className="px-3 py-16 text-center text-sm text-slate-500">
                  No leads or deals match your filters.
                </td>
              </tr>
            ) : (
              pageRows.map((row, idx) => {
                const owner = row.ownerUserId ? assigneeById.get(row.ownerUserId) : null;
                const ownerLabel = owner
                  ? owner.displayName?.trim() || owner.email
                  : "Unassigned";
                const stageLabel = displayStageLabel(row, stageLabelByKey);
                return (
                  <tr
                    key={`${row.kind}-${row.id}`}
                    className={[
                      idx % 2 === 0 ? "bg-white" : "bg-slate-50/40",
                      row.archivedAt ? "opacity-75" : "",
                      "transition-colors hover:bg-slate-100/80",
                      tableRowClickableClass
                    ].join(" ")}
                    {...bindTableRowPrimaryAction({
                      onAction: () => navigate(detailHref(row)),
                      ariaLabel: `View ${row.title}`
                    })}
                  >
                    <td className="whitespace-nowrap px-3 py-2 align-middle">
                      <span
                        className={[
                          "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium",
                          kindBadgeClass(row.kind)
                        ].join(" ")}
                      >
                        {kindLabel(row.kind)}
                      </span>
                    </td>
                    <td className="max-w-0 px-3 py-2 align-middle">
                      <span className="block truncate font-medium text-slate-900" title={row.title}>
                        {row.title}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 align-middle text-slate-700">{stageLabel}</td>
                    <td className="whitespace-nowrap px-3 py-2 align-middle">
                      <span
                        className={[
                          "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium",
                          pipelineStatusBadgeClass(row)
                        ].join(" ")}
                      >
                        {pipelineStatusLabel(row)}
                      </span>
                    </td>
                    <td className="max-w-0 whitespace-nowrap px-3 py-2 align-middle">
                      <span className="block truncate" title={ownerLabel}>
                        {ownerLabel}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 align-middle tabular-nums text-slate-700">
                      {row.kind === "deal" &&
                      row.expectedValueMinor != null &&
                      row.expectedValueCurrency ? (
                        formatFinanceAmount(
                          row.expectedValueMinor,
                          row.expectedValueCurrency,
                          listLocale,
                          tenantPrefs?.currencyFormat ?? null
                        )
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 align-middle tabular-nums text-slate-700">
                      {formatUserDateTime(row.updatedAt, tenantPrefs)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {!loading ? (
        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-stone-600">
            {total === 0 ? (
              "No results."
            ) : (
              <>
                Page <span className="font-medium text-stone-900">{safePage}</span> of{" "}
                <span className="font-medium text-stone-900">{totalPages}</span>
              </>
            )}
          </p>
          <nav className="flex flex-wrap items-center gap-2" aria-label="Pagination">
            <button
              type="button"
              disabled={safePage <= 1 || total === 0}
              onClick={() => setParam({ page: String(Math.max(1, safePage - 1)) })}
              className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
              Previous
            </button>
            <button
              type="button"
              disabled={safePage >= totalPages || total === 0}
              onClick={() => setParam({ page: String(safePage + 1) })}
              className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </nav>
        </div>
      ) : null}
    </div>
  );
};
