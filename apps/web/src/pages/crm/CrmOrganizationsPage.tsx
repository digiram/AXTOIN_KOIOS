/**
 * CrmOrganizationsPage.
 *
 * Paginated, filterable tenant CRM organizations list with add-organization flow.
 *
 * Responsibilities:
 * - Load organizations from `/v1/tenant/crm/organizations` with search, segment, and tag filters
 * - Sync filter state to URL search params
 * - Gate create actions with {@link useCrmPermissions}
 *
 * Depends on:
 * - {@link useCrmApi}, {@link useCrmBasePath}, {@link useCrmPermissions}
 *
 * Security:
 * - Tenant scope enforced server-side; UI hides write actions when `canWrite` is false
 */

import type { CrmChannelEntry } from "@starter/shared";
import { ChevronLeft, ChevronRight, Filter, Plus, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { AddOrganizationModal } from "../../components/crm/AddOrganizationModal.js";
import { CrmModal } from "../../components/crm/CrmModal.js";
import { CrmOverviewEntityCard, crmListPrimaryChannelValue } from "../../components/crm/CrmOverviewEntityCard.js";
import { CrmMarketSegmentFilterField } from "../../components/crm/CrmMarketSegmentFilterField.js";
import {
  buildCrmMarketSegmentFilterOptions,
  formatCrmOrganizationSegmentSummary,
  type CrmMarketSegmentOption
} from "../../components/crm/CrmOrganizationSegmentFields.js";
import { CrmMarketingTagFilterField } from "../../components/crm/CrmMarketingTagFilterField.js";
import type { CrmMarketingTagOption } from "../../components/crm/CrmOrganizationMarketingTagPicker.js";
import { API_BASE_URL } from "../../lib/api.js";
import { useCrmBasePath } from "./crmPaths.js";
import { useCrmApi } from "./useCrmApi.js";
import { useCrmPermissions } from "./useCrmPermissions.js";

type OrgRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  emails?: CrmChannelEntry[];
  phones?: CrmChannelEntry[];
  primaryAddressLine?: string | null;
  marketSegmentLayer1?: { id: string; name: string } | null;
  marketSegmentLayer2?: { id: string; name: string } | null;
  marketSegmentLayer3?: { id: string; name: string } | null;
  marketingTags?: { id: string; name: string }[];
};

type ListResponse = {
  organizations: OrgRow[];
  total: number;
  page: number;
  pageSize: number;
};

/**
 * CRM organizations overview: search, market-segment filters, pagination, and add-organization entry.
 *
 * @returns Organizations list UI; requires parent {@link CrmModuleGate} and CRM read access
 */
export const CrmOrganizationsPage = () => {
  const navigate = useNavigate();
  const crmBase = useCrmBasePath();
  const { authHeaders, refreshSession, logout } = useCrmApi();
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
  const filterSeg = searchParams.get("seg") ?? "";
  const filterTags = useMemo(() => searchParams.getAll("tag").filter((id) => id.trim().length > 0), [searchParams]);

  const [segmentOptions, setSegmentOptions] = useState<CrmMarketSegmentOption[]>([]);
  const [tagOptions, setTagOptions] = useState<CrmMarketingTagOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    const loadVocab = async () => {
      try {
        let segRes = await fetch(`${API_BASE_URL}/tenant/crm/organization-market-segments`, { headers: authHeaders() });
        let tagRes = await fetch(`${API_BASE_URL}/tenant/crm/organization-marketing-tags`, { headers: authHeaders() });
        if (segRes.status === 401 || tagRes.status === 401) {
          if (!(await refreshSession())) {
            logout();
            return;
          }
          segRes = await fetch(`${API_BASE_URL}/tenant/crm/organization-market-segments`, { headers: authHeaders() });
          tagRes = await fetch(`${API_BASE_URL}/tenant/crm/organization-marketing-tags`, { headers: authHeaders() });
        }
        if (!cancelled && segRes.ok) {
          const j = (await segRes.json()) as { segments: CrmMarketSegmentOption[] };
          setSegmentOptions(j.segments ?? []);
        }
        if (!cancelled && tagRes.ok) {
          const j = (await tagRes.json()) as { tags: CrmMarketingTagOption[] };
          setTagOptions(j.tags ?? []);
        }
      } catch {
        /* non-fatal */
      }
    };
    void loadVocab();
    return () => {
      cancelled = true;
    };
  }, [authHeaders, refreshSession, logout]);

  const segmentFilterOptions = useMemo(
    () => buildCrmMarketSegmentFilterOptions(segmentOptions),
    [segmentOptions]
  );
  const selectedSegmentFilter = useMemo(
    () => segmentFilterOptions.find((o) => o.id === filterSeg),
    [segmentFilterOptions, filterSeg]
  );

  const setFilterParam = useCallback(
    (key: string, value: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const trimmed = value.trim();
          if (trimmed) next.set(key, trimmed);
          else next.delete(key);
          next.set("page", "1");
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const setFilterTags = useCallback(
    (ids: string[]) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("tag");
          for (const id of ids) next.append("tag", id);
          next.set("page", "1");
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    p.set("page", String(page));
    p.set("pageSize", String(pageSize));
    if (urlQ.trim()) p.set("q", urlQ.trim());
    if (selectedSegmentFilter) {
      if (selectedSegmentFilter.layer === 1) p.set("marketSegmentLayer1Id", selectedSegmentFilter.id);
      else if (selectedSegmentFilter.layer === 2) p.set("marketSegmentLayer2Id", selectedSegmentFilter.id);
      else p.set("marketSegmentLayer3Id", selectedSegmentFilter.id);
    }
    for (const id of filterTags) p.append("marketingTagIds", id);
    return p.toString();
  }, [page, pageSize, urlQ, selectedSegmentFilter, filterTags]);

  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setError("");
      setLoading(true);
      try {
        let res = await fetch(`${API_BASE_URL}/tenant/crm/organizations?${queryString}`, {
          headers: authHeaders()
        });
        if (res.status === 401) {
          if (!(await refreshSession())) {
            logout();
            return;
          }
          res = await fetch(`${API_BASE_URL}/tenant/crm/organizations?${queryString}`, {
            headers: authHeaders()
          });
        }
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { message?: string } | null;
          if (!cancelled) setError(body?.message ?? "Could not load organizations.");
          return;
        }
        const json = (await res.json()) as ListResponse;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError("Could not load organizations.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [queryString, authHeaders, refreshSession, logout]);

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

  const { canWrite, crmRole } = useCrmPermissions();

  const inputClass =
    "w-full rounded-lg border border-stone-200/90 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/25";

  return (
    <div className="w-full min-w-0">
      {crmRole === "viewer" ? (
        <p className="mb-4 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-600">
          Read-only CRM access — you can browse organizations but cannot add or edit them.
        </p>
      ) : crmRole === "user" ? (
        <p className="mb-4 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-600">
          You can add and edit organizations; deleting records requires a Manager role.
        </p>
      ) : null}
      {canWrite ? (
        <div className="flex flex-wrap justify-end gap-4">
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" aria-hidden strokeWidth={2} />
            Add organization
          </button>
        </div>
      ) : null}

      <div className="mb-3 mt-6 flex items-center gap-2 text-stone-800">
        <Filter className="h-5 w-5 text-amber-800/90" aria-hidden strokeWidth={2} />
        <h2 id="crm-org-filters-heading" className="text-base font-semibold tracking-tight">
          Filters
        </h2>
      </div>
      <section
        className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,15,15,0.06)] sm:p-6"
        aria-labelledby="crm-org-filters-heading"
      >
        <label htmlFor="crm-org-q" className="mb-1.5 block text-xs font-medium text-stone-600">
          Search organizations
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden />
          <input
            id="crm-org-q"
            value={qDraft}
            onChange={(e) => setQDraft(e.target.value)}
            placeholder="Name, email, phone, address…"
            className={`${inputClass} pl-10`}
          />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <CrmMarketSegmentFilterField
            inputId="crm-org-filter-segment"
            segments={segmentOptions}
            segmentId={filterSeg}
            onChange={(id) => setFilterParam("seg", id)}
            inputClassName={`${inputClass} pl-10`}
          />
          <CrmMarketingTagFilterField
            inputId="crm-org-filter-tags"
            tags={tagOptions}
            selectedIds={filterTags}
            onChange={setFilterTags}
            inputClassName={`${inputClass} pl-10`}
          />
        </div>
      </section>

      {error ? (
        <p className="mt-4 text-sm text-rose-600" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-stone-600">
        <span>
          {loading ? "Loading…" : data ? `${data.total} organization${data.total === 1 ? "" : "s"} found` : null}
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

      <CrmModal title="Add organization" open={addOpen} onClose={() => setAddOpen(false)}>
        <AddOrganizationModal
          onClose={() => setAddOpen(false)}
          onCreated={(id) => navigate(`${crmBase}/organizations/${id}`)}
        />
      </CrmModal>

      <ul className="mt-4 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {loading && !data ? (
          <li className="col-span-full py-12 text-center text-sm text-stone-500">Loading…</li>
        ) : null}
        {!loading && data?.organizations.length === 0 ? (
          <li className="col-span-full py-12 text-center text-sm text-stone-500">
            No organizations yet. Create one to get started.
          </li>
        ) : null}
        {data?.organizations.map((o) => {
          const addr =
            o.primaryAddressLine?.trim() ||
            [o.city, o.country].filter((x) => x && String(x).trim()).join(", ").trim() ||
            null;
          const letter = o.name.trim().slice(0, 1);
          const segmentSummary = formatCrmOrganizationSegmentSummary(
            o.marketSegmentLayer1,
            o.marketSegmentLayer2,
            o.marketSegmentLayer3
          );
          const chips = [
            ...(segmentSummary ? [segmentSummary] : []),
            ...(o.marketingTags ?? []).map((t) => t.name)
          ];
          return (
            <li key={o.id} className="min-w-0">
              <CrmOverviewEntityCard
                to={`${crmBase}/organizations/${o.id}`}
                name={o.name}
                sublabel="Organization"
                avatarText={letter.length > 0 ? letter.toUpperCase() : "?"}
                phone={crmListPrimaryChannelValue(o.phones, o.phone)}
                email={crmListPrimaryChannelValue(o.emails, o.email)}
                addressLine={addr}
                chips={chips}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
};
