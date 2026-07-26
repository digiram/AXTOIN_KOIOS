/**
 * FunnelCrmContactSearchField
 *
 * CRM contact search combobox for linking contacts to funnel records.
 *
 * Responsibilities:
 * - Debounced tenant CRM contact search with exclude list
 * - Portaled listbox; fires `onSelect` with contact row payload
 *
 * Related:
 * - Sales funnel lead/deal detail editors
 *
 * Security:
 * - Tenant-scoped CRM search API.
 */
import { User } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { API_BASE_URL } from "../../lib/api.js";
import { crmModalOutlineInputClass } from "../crm/crmModalOutlineInputClass.js";

const LISTBOX_SELECTOR = "[data-funnel-crm-contact-listbox]";

/** CRM contact row returned from funnel contact search. */
export type FunnelCrmContactRow = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  displayName?: string;
  employerOrganizationName?: string | null;
};

type Props = {
  inputId: string;
  /** Optional; omit when a parent heading already describes the field (e.g. “Contacts on this deal”). */
  label?: string;
  placeholder?: string;
  authHeaders: () => Record<string, string>;
  refreshSession: () => Promise<boolean>;
  logout: () => void;
  disabled?: boolean;
  excludeContactIds?: string[];
  onSelect: (row: FunnelCrmContactRow) => void;
};

const contactDisplayName = (row: FunnelCrmContactRow) => {
  const fromParts = [row.firstName?.trim(), row.lastName?.trim()].filter(Boolean).join(" ");
  return row.displayName?.trim() || fromParts || row.email?.trim() || row.id;
};

/** CRM contact search for adding contacts to funnel records. */
export const FunnelCrmContactSearchField = ({
  inputId,
  label,
  placeholder = "Search contact and add...",
  authHeaders,
  refreshSession,
  logout,
  disabled = false,
  excludeContactIds = [],
  onSelect
}: Props) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [results, setResults] = useState<FunnelCrmContactRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [listBoxStyle, setListBoxStyle] = useState<{ top: number; left: number; width: number } | null>(
    null
  );

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(query.trim()), 320);
    return () => window.clearTimeout(t);
  }, [query]);

  const loadContacts = useCallback(async () => {
    if (debouncedQ.length === 0) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const p = new URLSearchParams({ page: "1", pageSize: "15", q: debouncedQ });
      let res = await fetch(`${API_BASE_URL}/tenant/crm/contacts?${p}`, { headers: authHeaders() });
      if (res.status === 401) {
        if (!(await refreshSession())) {
          logout();
          return;
        }
        res = await fetch(`${API_BASE_URL}/tenant/crm/contacts?${p}`, { headers: authHeaders() });
      }
      if (!res.ok) {
        setResults([]);
        return;
      }
      const j = (await res.json()) as { contacts: FunnelCrmContactRow[] };
      setResults((j.contacts ?? []).filter((c) => !excludeContactIds.includes(c.id)));
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, debouncedQ, excludeContactIds, logout, refreshSession]);

  useEffect(() => {
    void loadContacts();
  }, [loadContacts]);

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
      if (rootRef.current?.contains(t)) return;
      if ((e.target as Element | null)?.closest?.(LISTBOX_SELECTOR)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const pickFirst = () => {
    const first = results[0];
    if (!first) return;
    onSelect(first);
    setQuery("");
    setOpen(false);
    setResults([]);
  };

  return (
    <div ref={rootRef} className="relative">
      {label ? (
        <label htmlFor={inputId} className="mb-1.5 block text-xs font-medium text-stone-600">
          {label}
        </label>
      ) : null}
      <div ref={anchorRef} className="relative min-w-0">
        <span className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-stone-400">
          <User className="h-4 w-4" aria-hidden strokeWidth={2} />
        </span>
        <input
          id={inputId}
          type="search"
          autoComplete="off"
          role="combobox"
          aria-expanded={open && debouncedQ.length > 0}
          aria-controls={`${inputId}-listbox`}
          disabled={disabled}
          value={query}
          placeholder={placeholder}
          aria-label={label ? undefined : "Search contact and add"}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              pickFirst();
            }
          }}
          className={`${crmModalOutlineInputClass(false)} w-full pl-10 pr-3 disabled:opacity-50`}
        />
      </div>
      {open && debouncedQ.length > 0 && listBoxStyle && typeof document !== "undefined"
        ? createPortal(
            <ul
              id={`${inputId}-listbox`}
              role="listbox"
              data-funnel-crm-contact-listbox=""
              className="fixed z-[3000] max-h-52 overflow-auto rounded-lg border border-stone-200 bg-white py-1 shadow-lg"
              style={{
                top: listBoxStyle.top,
                left: listBoxStyle.left,
                width: Math.max(listBoxStyle.width, 280)
              }}
            >
              {loading ? (
                <li className="px-3 py-2 text-xs text-stone-500">Searching…</li>
              ) : results.length === 0 ? (
                <li className="px-3 py-2 text-xs text-stone-500">No contacts found.</li>
              ) : (
                results.map((row) => {
                  const name = contactDisplayName(row);
                  const employer = row.employerOrganizationName?.trim();
                  return (
                    <li key={row.id} role="presentation">
                      <button
                        type="button"
                        role="option"
                        className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-stone-50"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          onSelect(row);
                          setQuery("");
                          setOpen(false);
                          setResults([]);
                        }}
                      >
                        <User className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden strokeWidth={2} />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium text-stone-800">{name}</span>
                          {(row.firstName?.trim() || row.lastName?.trim()) && row.email?.trim() ? (
                            <span className="block text-xs text-stone-500">{row.email}</span>
                          ) : null}
                          {employer ? (
                            <span className="mt-0.5 block text-xs text-stone-600">
                              Employed by <span className="font-medium">{employer}</span>
                            </span>
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
    </div>
  );
};
