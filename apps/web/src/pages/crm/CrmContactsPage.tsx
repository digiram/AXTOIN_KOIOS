/**
 * CrmContactsPage.
 *
 * Paginated, searchable tenant CRM contacts list with add-contact flow.
 *
 * Responsibilities:
 * - Load contacts from `/v1/tenant/crm/contacts` with URL-synced search and pagination
 * - Gate create actions with {@link useCrmPermissions}
 * - Navigate to contact detail on card selection
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

import { AddContactModal } from "../../components/crm/AddContactModal.js";
import { CrmOverviewEntityCard, crmListPrimaryChannelValue } from "../../components/crm/CrmOverviewEntityCard.js";
import { API_BASE_URL } from "../../lib/api.js";
import { useCrmBasePath } from "./crmPaths.js";
import { useCrmApi } from "./useCrmApi.js";
import { useCrmPermissions } from "./useCrmPermissions.js";

type ContactRow = {
  id: string;
  firstName: string;
  lastName: string;
  salutation: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  emails?: CrmChannelEntry[];
  phones?: CrmChannelEntry[];
  primaryAddressLine?: string | null;
  hasPhoto?: boolean;
  updatedAt?: string;
};

type ListResponse = {
  contacts: ContactRow[];
  total: number;
  page: number;
  pageSize: number;
};

const initials = (c: ContactRow): string => {
  const a = c.firstName.trim().slice(0, 1);
  const b = c.lastName.trim().slice(0, 1);
  return (a + b).toUpperCase() || "?";
};

const displayName = (c: ContactRow): string => {
  const n = `${c.firstName} ${c.lastName}`.trim();
  const sal = c.salutation?.trim();
  const withSalutation = sal && n ? `${sal} ${n}`.trim() : n;
  return withSalutation || c.email || c.phone || "Unnamed contact";
};

/**
 * CRM contacts overview: search, pagination, and add-contact entry point.
 *
 * @returns Contacts list UI; requires parent {@link CrmModuleGate} and CRM read access
 */
export const CrmContactsPage = () => {
  const navigate = useNavigate();
  const crmBase = useCrmBasePath();
  const { authHeaders, authedFetch, refreshSession, logout } = useCrmApi();
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

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setError("");
      setLoading(true);
      try {
        let res = await fetch(`${API_BASE_URL}/tenant/crm/contacts?${queryString}`, {
          headers: authHeaders()
        });
        if (res.status === 401) {
          if (!(await refreshSession())) {
            logout();
            return;
          }
          res = await fetch(`${API_BASE_URL}/tenant/crm/contacts?${queryString}`, {
            headers: authHeaders()
          });
        }
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { message?: string } | null;
          if (!cancelled) setError(body?.message ?? "Could not load contacts.");
          return;
        }
        const json = (await res.json()) as ListResponse;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError("Could not load contacts.");
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
          Read-only CRM access — you can browse contacts but cannot add or edit them.
        </p>
      ) : crmRole === "user" ? (
        <p className="mb-4 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-600">
          You can add and edit contacts; deleting records requires a Manager role.
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
            Add contact
          </button>
        </div>
      ) : null}

      <div className="mb-3 mt-6 flex items-center gap-2 text-stone-800">
        <Filter className="h-5 w-5 text-amber-800/90" aria-hidden strokeWidth={2} />
        <h2 id="crm-contact-filters-heading" className="text-base font-semibold tracking-tight">
          Filters
        </h2>
      </div>
      <section
        className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,15,15,0.06)] sm:p-6"
        aria-labelledby="crm-contact-filters-heading"
      >
        <label htmlFor="crm-contact-q" className="mb-1.5 block text-xs font-medium text-stone-600">
          Search contacts
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden />
          <input
            id="crm-contact-q"
            value={qDraft}
            onChange={(e) => setQDraft(e.target.value)}
            placeholder="Name, email, phone, address…"
            className={`${inputClass} pl-10`}
          />
        </div>
        <p className="mt-2 text-xs text-stone-500">
          Server-side search with paging. Matches first name, last name, email, phone, and address fields.
        </p>
      </section>

      {error ? (
        <p className="mt-4 text-sm text-rose-600" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-stone-600">
        <span>
          {loading ? "Loading…" : data ? `${data.total} contact${data.total === 1 ? "" : "s"} found` : null}
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

      {addOpen ? (
        <AddContactModal onClose={() => setAddOpen(false)} onCreated={(id) => navigate(`${crmBase}/contacts/${id}`)} />
      ) : null}

      <ul className="mt-4 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {loading && !data ? (
          <li className="col-span-full py-12 text-center text-sm text-stone-500">Loading…</li>
        ) : null}
        {!loading && data?.contacts.length === 0 ? (
          <li className="col-span-full py-12 text-center text-sm text-stone-500">No contacts yet. Add one to get started.</li>
        ) : null}
        {data?.contacts.map((c) => {
          const addr =
            c.primaryAddressLine?.trim() ||
            [c.city, c.country].filter((x) => x && String(x).trim()).join(", ").trim() ||
            null;
          return (
            <li key={c.id} className="min-w-0">
              <CrmOverviewEntityCard
                to={`${crmBase}/contacts/${c.id}`}
                name={displayName(c)}
                sublabel={c.title?.trim() || "Other"}
                avatarText={initials(c)}
                avatarPhoto={{
                  hasPhoto: Boolean(c.hasPhoto),
                  cacheKey: c.updatedAt ?? c.id,
                  photoGetUrl: `${API_BASE_URL}/tenant/crm/contacts/${encodeURIComponent(c.id)}/photo`,
                  authedFetch
                }}
                phone={crmListPrimaryChannelValue(c.phones, c.phone)}
                email={crmListPrimaryChannelValue(c.emails, c.email)}
                addressLine={addr}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
};
