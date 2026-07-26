/**
 * CrmContactSearchField
 *
 * Searchable combobox for picking a CRM contact by name or channel.
 *
 * Responsibilities:
 * - Debounced contact search with optional employer-organization filter
 * - Portaled listbox; clear and exclude-self support
 * - 401 refresh via caller-supplied session helpers
 *
 * Related:
 * - Relationship modals, sales funnel contact linking
 *
 * Security:
 * - Tenant-scoped CRM search API.
 */
import type { CrmChannelEntry } from "@starter/shared";
import { User, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { API_BASE_URL } from "../../lib/api.js";
import { crmModalOutlineInputClass } from "./crmModalOutlineInputClass.js";

const LISTBOX_SELECTOR = "[data-crm-assoc-contact-listbox]";

type ContactRow = {
  id: string;
  firstName: string;
  lastName: string;
  salutation: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  employerOrganizationId?: string | null;
  emails?: CrmChannelEntry[];
  phones?: CrmChannelEntry[];
};

const displayName = (c: ContactRow): string => {
  const n = `${c.firstName} ${c.lastName}`.trim();
  const sal = c.salutation?.trim();
  const withSalutation = sal && n ? `${sal} ${n}`.trim() : n;
  return withSalutation || c.email || c.phone || "Unnamed contact";
};

type Props = {
  inputId: string;
  authHeaders: () => Record<string, string>;
  refreshSession: () => Promise<boolean>;
  logout: () => void;
  contactId: string;
  contactName: string | null;
  onChange: (nextId: string, nextName: string | null) => void;
  label?: string;
  /** When set, only contacts employed by this organization appear in search results. */
  employerOrganizationId?: string;
  disabled?: boolean;
  className?: string;
  labelClassName?: string;
  inputClassName?: string;
  inputRowClassName?: string;
  clearButtonClassName?: string;
  excludeContactId?: string;
};

/** Contact picker combobox for CRM and funnel forms. */
export const CrmContactSearchField = ({
  inputId,
  authHeaders,
  refreshSession,
  logout,
  contactId,
  contactName,
  onChange,
  label = "Contact",
  employerOrganizationId,
  disabled = false,
  className = "relative mt-1",
  labelClassName = "mb-1.5 block text-xs font-medium text-stone-600",
  inputClassName,
  inputRowClassName = "flex gap-2",
  clearButtonClassName = "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50",
  excludeContactId
}: Props) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [results, setResults] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [listBoxStyle, setListBoxStyle] = useState<{ top: number; left: number; width: number } | null>(null);

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
      const p = new URLSearchParams({ page: "1", pageSize: "20", q: debouncedQ });
      let res = await fetch(`${API_BASE_URL}/tenant/crm/contacts?${p.toString()}`, { headers: authHeaders() });
      if (res.status === 401) {
        if (!(await refreshSession())) {
          logout();
          return;
        }
        res = await fetch(`${API_BASE_URL}/tenant/crm/contacts?${p.toString()}`, { headers: authHeaders() });
      }
      if (!res.ok) {
        setResults([]);
        return;
      }
      const j = (await res.json()) as { contacts: ContactRow[] };
      let contacts = j.contacts ?? [];
      if (employerOrganizationId) {
        contacts = contacts.filter((c) => c.employerOrganizationId === employerOrganizationId);
      }
      setResults(contacts);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, debouncedQ, employerOrganizationId, logout, refreshSession]);

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
      const el = rootRef.current;
      if (el?.contains(t)) return;
      if ((e.target as Element | null)?.closest?.(LISTBOX_SELECTOR)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const displayValue = open ? query : contactId ? (contactName ?? "") : "";
  const hasSelection = Boolean(contactId);
  const excludeId = excludeContactId?.trim() ?? "";
  const resolvedInputClass = inputClassName ?? `${crmModalOutlineInputClass(false)} w-full pl-10 pr-3`;

  return (
    <div ref={rootRef} className={className}>
      <label htmlFor={inputId} className={labelClassName}>
        {label}
      </label>
      <div className={inputRowClassName}>
        <div ref={anchorRef} className="relative min-w-0 flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-stone-400">
            <User className="h-4 w-4" aria-hidden strokeWidth={2} />
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
            placeholder="Search by name or email…"
            disabled={disabled}
            onChange={(e) => {
              const v = e.target.value;
              setQuery(v);
              setOpen(true);
              if (hasSelection && v !== (contactName ?? "")) {
                onChange("", null);
              }
            }}
            onFocus={() => {
              setOpen(true);
              setQuery(hasSelection ? "" : query);
            }}
            className={resolvedInputClass}
          />
        </div>
        {hasSelection ? (
          <button
            type="button"
            title="Clear contact"
            disabled={disabled}
            onClick={() => {
              onChange("", null);
              setQuery("");
              setOpen(false);
            }}
            className={clearButtonClassName}
          >
            <X className="h-4 w-4" aria-hidden strokeWidth={2} />
          </button>
        ) : null}
      </div>
      {open && debouncedQ.length > 0 && listBoxStyle && typeof document !== "undefined"
        ? createPortal(
            <ul
              id={`${inputId}-listbox`}
              role="listbox"
              data-crm-assoc-contact-listbox=""
              className="fixed z-[3000] max-h-52 overflow-auto rounded-lg border border-stone-200 bg-white py-1 shadow-lg"
              style={{
                top: listBoxStyle.top,
                left: listBoxStyle.left,
                width: Math.max(listBoxStyle.width, 200)
              }}
            >
              {loading ? (
                <li className="px-3 py-2 text-xs text-stone-500">Searching…</li>
              ) : results.filter((c) => !excludeId || c.id !== excludeId).length === 0 ? (
                <li className="px-3 py-2 text-xs text-stone-500">No matches.</li>
              ) : (
                results
                  .filter((c) => !excludeId || c.id !== excludeId)
                  .map((c) => {
                    const line = displayName(c);
                    return (
                      <li key={c.id} role="presentation">
                        <button
                          type="button"
                          role="option"
                          className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-stone-50"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            onChange(c.id, line);
                            setQuery("");
                            setOpen(false);
                          }}
                        >
                          <User className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden strokeWidth={2} />
                          <span className="min-w-0 flex-1 break-words text-stone-800" title={line}>
                            {line}
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
