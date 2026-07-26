/**
 * WorkforceEmployeesListPage.
 *
 * Paginated, searchable tenant employee directory with quick-add modal entry.
 *
 * Responsibilities:
 * - Load employees from `/v1/tenant/workforce/employees` with URL-synced search
 * - Open {@link WorkforceQuickAddEmployeeModal} from route state or toolbar
 * - Navigate to employee detail on card selection
 *
 * Depends on:
 * - {@link useWorkforceApi}, {@link WorkforceEmployeeModalLocationState}
 *
 * Security:
 * - Lists tenant-scoped employee records behind {@link HrmModuleGate}
 */

import { workforceEmployeeDisplayName } from "@starter/shared";
import { ChevronLeft, ChevronRight, Filter, Plus, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { CrmOverviewEntityCard } from "../../components/crm/CrmOverviewEntityCard.js";
import { API_BASE_URL } from "../../lib/api.js";
import type { WorkforceEmployeeModalLocationState } from "./WorkforceEmployeeModalRouteRedirects.js";
import { EmployeeKindIcon } from "./EmployeeKindIcon.js";
import { WorkforceQuickAddEmployeeModal } from "./WorkforceQuickAddModals.js";
import { useWorkforceApi } from "./useWorkforceApi.js";
type EmployeeRow = {
  id: string;
  firstName: string;
  lastName: string;
  workEmail: string | null;
  personalEmail: string | null;
  workPhone: string | null;
  personalPhone: string | null;
  employmentOrgUnitId: string | null;
  employmentOrgUnitName: string | null;
  jobTitle: string | null;
  employeeKind: string;
  hasPhoto?: boolean;
  updatedAt?: string;
};

type ListResponse = {
  employees: EmployeeRow[];
  total: number;
  page: number;
  pageSize: number;
};

const initials = (e: EmployeeRow): string => {
  const a = e.firstName.trim().slice(0, 1);
  const b = e.lastName.trim().slice(0, 1);
  return (a + b).toUpperCase() || "?";
};

const primaryEmail = (e: EmployeeRow) => e.workEmail?.trim() || e.personalEmail?.trim() || null;

const primaryPhone = (e: EmployeeRow) => e.workPhone?.trim() || e.personalPhone?.trim() || null;

const departmentLine = (e: EmployeeRow) => e.employmentOrgUnitName?.trim() || null;

const sublabel = (e: EmployeeRow) => e.jobTitle?.trim() || (e.employeeKind === "agent" ? "Agent" : "Person");

/**
 * Workforce employees list with search, pagination, and quick-add modal.
 *
 * @returns Employee directory at `/admin/workforce/employees`
 */
export const WorkforceEmployeesListPage = () => {
  const { authedFetch } = useWorkforceApi();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [employeeModalOpen, setEmployeeModalOpen] = useState(false);

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

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    p.set("page", String(page));
    p.set("pageSize", String(pageSize));
    if (urlQ.trim()) p.set("q", urlQ.trim());
    return p.toString();
  }, [page, pageSize, urlQ]);

  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setError("");
      setLoading(true);
      try {
        const res = await authedFetch(`${API_BASE_URL}/tenant/workforce/employees?${queryString}`);
        if (!res?.ok) {
          if (!cancelled) setError("Could not load employees.");
          return;
        }
        const json = (await res.json()) as ListResponse;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError("Could not load employees.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [queryString, authedFetch, refreshToken]);

  useEffect(() => {
    const mod = (location.state as WorkforceEmployeeModalLocationState | null)?.workforceEmployeeModal;
    if (mod === "new") {
      setEmployeeModalOpen(true);
      navigate(".", { replace: true, state: {} });
    }
  }, [location.state, navigate]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const setPage = useCallback(
    (next: number) => {
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams(prev);
          n.set("page", String(Math.max(1, next)));
          return n;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const bumpRefresh = useCallback(() => setRefreshToken((t) => t + 1), []);

  const inputClass =
    "w-full rounded-lg border border-stone-200/90 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/25";

  return (
    <div className="w-full min-w-0">
      <div className="flex flex-wrap justify-end gap-4">
        <button
          type="button"
          onClick={() => setEmployeeModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" aria-hidden strokeWidth={2} />
          New employee
        </button>
      </div>

      <WorkforceQuickAddEmployeeModal
        open={employeeModalOpen}
        onClose={() => setEmployeeModalOpen(false)}
        onCreated={bumpRefresh}
      />

      <div className="mb-3 mt-6 flex items-center gap-2 text-stone-800">
        <Filter className="h-5 w-5 text-amber-800/90" aria-hidden strokeWidth={2} />
        <h2 id="wf-emp-filters-heading" className="text-base font-semibold tracking-tight">
          Filters
        </h2>
      </div>
      <section
        className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,15,15,0.06)] sm:p-6"
        aria-labelledby="wf-emp-filters-heading"
      >
        <label htmlFor="wf-emp-q" className="mb-1.5 block text-xs font-medium text-stone-600">
          Search employees
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden />
          <input
            id="wf-emp-q"
            value={qDraft}
            onChange={(e) => setQDraft(e.target.value)}
            placeholder="Name, email, phone, title, location, notes…"
            className={`${inputClass} pl-10`}
          />
        </div>
        <p className="mt-2 text-xs text-stone-500">
          Server-side search with paging. HRM records only — they do not grant sign-in or module access. Matches name,
          contact channels, job title, work location, notes, and kind.
        </p>
      </section>

      {error ? (
        <p className="mt-4 text-sm text-rose-600" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-stone-600">
        <span>
          {loading ? "Loading…" : data ? `${data.total} employee${data.total === 1 ? "" : "s"} found` : null}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={loading || page <= 1}
            onClick={() => setPage(page - 1)}
            className="inline-flex items-center gap-1 rounded-lg border border-stone-200 px-3 py-1.5 font-medium hover:bg-stone-50 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            Prev
          </button>
          <span className="tabular-nums text-stone-500">
            Page {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={loading || page >= totalPages}
            onClick={() => setPage(page + 1)}
            className="inline-flex items-center gap-1 rounded-lg border border-stone-200 px-3 py-1.5 font-medium hover:bg-stone-50 disabled:opacity-40"
          >
            Next
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      <ul className="mt-4 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {loading && !data ? (
          <li className="col-span-full py-12 text-center text-sm text-stone-500">Loading…</li>
        ) : null}
        {!loading && data?.employees.length === 0 ? (
          <li className="col-span-full py-12 text-center text-sm text-stone-500">
            No employees match your filters. Try another search or create a new record.
          </li>
        ) : null}
        {data?.employees.map((e) => (
          <li key={e.id} className="min-w-0">
            <CrmOverviewEntityCard
              to={`/admin/workforce/employees/${e.id}`}
              name={workforceEmployeeDisplayName(e.firstName, e.lastName)}
              nameLeading={<EmployeeKindIcon kind={e.employeeKind} className="h-5 w-5 text-stone-700" />}
              sublabel={sublabel(e)}
              avatarText={initials(e)}
              avatarPhoto={{
                hasPhoto: Boolean(e.hasPhoto),
                cacheKey: e.updatedAt ?? e.id,
                photoGetUrl: `${API_BASE_URL}/tenant/workforce/employees/${encodeURIComponent(e.id)}/photo`,
                authedFetch
              }}
              phone={primaryPhone(e)}
              email={primaryEmail(e)}
              addressLine={departmentLine(e)}
              addressEmptyLabel="No department assigned"
              addressIcon="building"
            />
          </li>
        ))}
      </ul>
    </div>
  );
};
