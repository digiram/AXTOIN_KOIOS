/**
 * ContactEmployerOrganizationField
 *
 * Searchable combobox for linking a contact to an employer organization.
 *
 * Responsibilities:
 * - Debounced organization search against tenant CRM API
 * - Portaled listbox with primary address preview on selection
 * - Optional exclusion of self when picking holding companies
 *
 * Related:
 * - Contact create/edit modals; `CrmAssociatedCard`
 *
 * Security:
 * - Tenant-scoped search; organization ids validated on save server-side.
 */
import { formatCrmPrimaryAddressLine, type CrmAddressEntry } from "@starter/shared";
import { Building2 } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { API_BASE_URL } from "../../lib/api.js";
import { crmModalOutlineInputClass } from "./crmModalOutlineInputClass.js";

/** Marks portaled listbox so outside-click logic does not close before option select. */
const LISTBOX_SELECTOR = "[data-crm-employer-org-listbox]";

type OrgRow = { id: string; name: string; primaryAddressLine?: string | null };

type OrgDetailJson = {
  addresses?: CrmAddressEntry[];
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
};

type Props = {
  inputId: string;
  authHeaders: () => Record<string, string>;
  refreshSession: () => Promise<boolean>;
  logout: () => void;
  /** Selected organization id, or empty string when none. */
  organizationId: string;
  organizationName: string | null;
  /** Primary address line for the selected org (from API or loaded contact). */
  organizationPrimaryAddress?: string | null;
  onChange: (nextId: string, nextName: string | null, nextPrimaryAddress: string | null) => void;
  /** Visible label for the combobox (default: employer wording). */
  label?: string;
  /** Root wrapper classes (CRM modals use top margin by default). */
  className?: string;
  labelClassName?: string;
  inputClassName?: string;
  /** Exclude this organization id from search results (e.g. prevent choosing self as holding). */
  excludeOrganizationId?: string;
};

/**
 * Employer organization picker for contact forms.
 *
 * @param onChange - Receives id, display name, and primary address line when selection changes.
 */
export const ContactEmployerOrganizationField = ({
  inputId,
  authHeaders,
  refreshSession,
  logout,
  organizationId,
  organizationName,
  organizationPrimaryAddress = null,
  onChange,
  label = "Employer organization",
  className = "relative mt-3",
  labelClassName = "mb-1.5 block text-xs font-medium text-stone-600",
  inputClassName,
  excludeOrganizationId
}: Props) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [results, setResults] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [listBoxStyle, setListBoxStyle] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(query.trim()), 320);
    return () => window.clearTimeout(t);
  }, [query]);

  const loadOrgs = useCallback(async () => {
    if (debouncedQ.length === 0) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const p = new URLSearchParams({ page: "1", pageSize: "20", q: debouncedQ });
      let res = await fetch(`${API_BASE_URL}/tenant/crm/organizations?${p.toString()}`, { headers: authHeaders() });
      if (res.status === 401) {
        if (!(await refreshSession())) {
          logout();
          return;
        }
        res = await fetch(`${API_BASE_URL}/tenant/crm/organizations?${p.toString()}`, { headers: authHeaders() });
      }
      if (!res.ok) {
        setResults([]);
        return;
      }
      const j = (await res.json()) as { organizations: OrgRow[] };
      setResults(j.organizations ?? []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, debouncedQ, logout, refreshSession]);

  useEffect(() => {
    void loadOrgs();
  }, [loadOrgs]);

  const syncListBoxPosition = useCallback(() => {
    const wrap = anchorRef.current;
    if (!wrap || !open || debouncedQ.length === 0) {
      setListBoxStyle(null);
      return;
    }
    const r = wrap.getBoundingClientRect();
    setListBoxStyle({ top: r.bottom + 4, left: r.left, width: r.width });
  }, [open, debouncedQ.length]);

  useLayoutEffect(() => {
    syncListBoxPosition();
  }, [syncListBoxPosition, results, loading]);

  useEffect(() => {
    if (!open || debouncedQ.length === 0) return;
    syncListBoxPosition();
    window.addEventListener("resize", syncListBoxPosition);
    window.addEventListener("scroll", syncListBoxPosition, true);
    return () => {
      window.removeEventListener("resize", syncListBoxPosition);
      window.removeEventListener("scroll", syncListBoxPosition, true);
    };
  }, [open, debouncedQ.length, syncListBoxPosition]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      const el = rootRef.current;
      if (el?.contains(t)) return;
      if ((e.target as Element | null)?.closest?.(LISTBOX_SELECTOR)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const displayValue = open ? query : organizationId ? (organizationName ?? "") : "";
  const hasSelection = Boolean(organizationId);
  const primaryTrim = organizationPrimaryAddress?.trim() ?? "";
  const selectionSummary =
    hasSelection && organizationName?.trim() && primaryTrim.length > 0
      ? `${organizationName.trim()} · ${primaryTrim}`
      : null;

  const excludeId = excludeOrganizationId?.trim() ?? "";

  const fetchOrgPrimaryLine = useCallback(
    async (orgId: string): Promise<string | null> => {
      try {
        let res = await fetch(`${API_BASE_URL}/tenant/crm/organizations/${encodeURIComponent(orgId)}`, {
          headers: authHeaders()
        });
        if (res.status === 401) {
          if (!(await refreshSession())) {
            logout();
            return null;
          }
          res = await fetch(`${API_BASE_URL}/tenant/crm/organizations/${encodeURIComponent(orgId)}`, {
            headers: authHeaders()
          });
        }
        if (!res.ok) return null;
        const org = (await res.json()) as OrgDetailJson;
        const line = formatCrmPrimaryAddressLine(org).trim();
        return line.length > 0 ? line : null;
      } catch {
        return null;
      }
    },
    [authHeaders, refreshSession, logout]
  );

  const resolvedInputClass =
    inputClassName ?? `${crmModalOutlineInputClass(false)} w-full pl-10 pr-3`;

  return (
    <div ref={rootRef} className={className}>
      <label htmlFor={inputId} className={labelClassName}>
        {label}
      </label>
      <div ref={anchorRef} className="relative min-w-0">
          <span className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-stone-400">
            <Building2 className="h-4 w-4" aria-hidden strokeWidth={2} />
          </span>
          <input
            id={inputId}
            type="search"
            autoComplete="off"
            role="combobox"
            aria-expanded={open}
            aria-controls={`${inputId}-listbox`}
            aria-autocomplete="list"
            value={displayValue}
            placeholder="Search by organization name…"
            onChange={(e) => {
              const v = e.target.value;
              setQuery(v);
              setOpen(true);
              if (hasSelection && v !== (organizationName ?? "")) {
                onChange("", null, null);
              }
            }}
            onFocus={() => {
              setOpen(true);
              setQuery(hasSelection ? "" : query);
            }}
            className={resolvedInputClass}
          />
        </div>
      {open && debouncedQ.length > 0 && listBoxStyle && typeof document !== "undefined"
        ? createPortal(
            <ul
              id={`${inputId}-listbox`}
              role="listbox"
              data-crm-employer-org-listbox=""
              className="fixed z-[3000] max-h-52 overflow-auto rounded-lg border border-stone-200 bg-white py-1 shadow-lg"
              style={{
                top: listBoxStyle.top,
                left: listBoxStyle.left,
                width: Math.max(listBoxStyle.width, 200)
              }}
            >
              {loading ? (
                <li className="px-3 py-2 text-xs text-stone-500">Searching…</li>
              ) : results.filter((o) => !excludeId || o.id !== excludeId).length === 0 ? (
                <li className="px-3 py-2 text-xs text-stone-500">No matches.</li>
              ) : (
                results
                  .filter((o) => !excludeId || o.id !== excludeId)
                  .map((o) => {
                  const addr = o.primaryAddressLine?.trim() ?? "";
                  const line = addr.length > 0 ? `${o.name} · ${addr}` : o.name;
                  return (
                    <li key={o.id} role="presentation">
                      <button
                        type="button"
                        role="option"
                        className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-stone-50"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          void (async () => {
                            let primary: string | null = addr.length > 0 ? addr : null;
                            if (!primary) primary = await fetchOrgPrimaryLine(o.id);
                            onChange(o.id, o.name, primary);
                            setQuery("");
                            setOpen(false);
                          })();
                        }}
                      >
                        <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden strokeWidth={2} />
                        <span className="min-w-0 flex-1 break-words text-stone-800" title={line}>
                          {o.name}
                          {addr.length > 0 ? (
                            <>
                              <span className="text-stone-400"> · </span>
                              <span className="text-stone-600">{addr}</span>
                            </>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>,
            document.body
          )
        : null}
      {selectionSummary ? (
        <p className="mt-1.5 break-words text-xs leading-relaxed text-stone-600" title={selectionSummary}>
          {selectionSummary}
        </p>
      ) : null}
    </div>
  );
};
