/**
 * FunnelRecordContactSearchField
 *
 * Client-side search over contacts already linked to a funnel record.
 *
 * Responsibilities:
 * - Filter record contacts by display name, role, or id
 * - Portaled listbox for picking linked contacts in activity forms
 * - `FunnelActivityContactBadge` for read-only contact chips
 *
 * Related:
 * - `SalesFunnelActivitySection`; `SalesFunnelRecordProfileCard`
 */
import { User, X } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { crmModalOutlineInputClass } from "../crm/crmModalOutlineInputClass.js";
import type { SalesFunnelContactRow } from "./SalesFunnelRecordProfileCard.js";

const LISTBOX_SELECTOR = "[data-funnel-record-contact-listbox]";

const contactLabel = (c: SalesFunnelContactRow) => {
  const name = c.displayName?.trim();
  if (name) return c.role.trim() ? `${name} (${c.role})` : name;
  return c.role.trim() || c.contactId;
};

const matchesQuery = (c: SalesFunnelContactRow, q: string) => {
  if (!q) return true;
  const hay = [c.displayName, c.role, c.contactId].filter(Boolean).join(" ").toLowerCase();
  return hay.includes(q);
};

type Props = {
  inputId: string;
  recordContacts: SalesFunnelContactRow[];
  excludeContactIds?: string[];
  disabled?: boolean;
  placeholder?: string;
  onSelect: (contact: SalesFunnelContactRow) => void;
};

/** Search contacts already linked on the funnel record. */
export const FunnelRecordContactSearchField = ({
  inputId,
  recordContacts,
  excludeContactIds = [],
  disabled = false,
  placeholder = "Search contacts on this record…",
  onSelect
}: Props) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [listBoxStyle, setListBoxStyle] = useState<{ top: number; left: number; width: number } | null>(
    null
  );

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(query.trim().toLowerCase()), 200);
    return () => window.clearTimeout(t);
  }, [query]);

  const results = useMemo(() => {
    const excluded = new Set(excludeContactIds);
    return recordContacts.filter(
      (c) => !excluded.has(c.contactId) && matchesQuery(c, debouncedQ)
    );
  }, [debouncedQ, excludeContactIds, recordContacts]);

  const showList = open && (debouncedQ.length > 0 || recordContacts.length <= 12);

  const syncListBoxPosition = () => {
    const wrap = anchorRef.current;
    if (!wrap || !showList) {
      setListBoxStyle(null);
      return;
    }
    const r = wrap.getBoundingClientRect();
    setListBoxStyle({ top: r.bottom + 4, left: r.left, width: r.width });
  };

  useLayoutEffect(() => {
    syncListBoxPosition();
  }, [showList, results.length]);

  useEffect(() => {
    if (!showList) return;
    syncListBoxPosition();
    window.addEventListener("resize", syncListBoxPosition);
    window.addEventListener("scroll", syncListBoxPosition, true);
    return () => {
      window.removeEventListener("resize", syncListBoxPosition);
      window.removeEventListener("scroll", syncListBoxPosition, true);
    };
  }, [showList]);

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
  };

  const noContactsOnRecord = recordContacts.length === 0;

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1 sm:min-w-[12rem] sm:max-w-[16rem]">
      <div ref={anchorRef} className="relative min-w-0">
        <span className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-stone-400">
          <User className="h-4 w-4" aria-hidden strokeWidth={2} />
        </span>
        <input
          id={inputId}
          type="search"
          autoComplete="off"
          role="combobox"
          aria-expanded={showList}
          aria-controls={`${inputId}-listbox`}
          disabled={disabled || noContactsOnRecord}
          value={query}
          placeholder={noContactsOnRecord ? "No contacts on record" : placeholder}
          aria-label="Search contacts on this record"
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
          className={`${crmModalOutlineInputClass(false)} w-full py-1.5 pl-10 pr-3 text-sm disabled:opacity-50`}
        />
      </div>
      {showList && listBoxStyle && typeof document !== "undefined"
        ? createPortal(
            <ul
              id={`${inputId}-listbox`}
              role="listbox"
              data-funnel-record-contact-listbox=""
              className="fixed z-[3000] max-h-52 overflow-auto rounded-lg border border-stone-200 bg-white py-1 shadow-lg"
              style={{
                top: listBoxStyle.top,
                left: listBoxStyle.left,
                width: Math.max(listBoxStyle.width, 280)
              }}
            >
              {results.length === 0 ? (
                <li className="px-3 py-2 text-xs text-stone-500">
                  {noContactsOnRecord
                    ? "Add contacts to this record first."
                    : debouncedQ
                      ? "No matching contacts on this record."
                      : "All record contacts are already selected."}
                </li>
              ) : (
                results.map((row) => (
                  <li key={row.contactId} role="presentation">
                    <button
                      type="button"
                      role="option"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-stone-50"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        onSelect(row);
                        setQuery("");
                        setOpen(false);
                      }}
                    >
                      <User className="h-4 w-4 shrink-0 text-indigo-600" aria-hidden strokeWidth={2} />
                      <span className="min-w-0 truncate font-medium text-stone-800">
                        {contactLabel(row)}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>,
            document.body
          )
        : null}
    </div>
  );
};

/** Removable chip showing a linked contact on a funnel activity form. */
export const FunnelActivityContactBadge = ({
  label,
  onRemove,
  disabled
}: {
  label: string;
  onRemove: () => void;
  disabled?: boolean;
}) => (
  <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 py-0.5 pl-2.5 pr-1 text-xs font-medium text-indigo-950">
    <span className="min-w-0 truncate">{label}</span>
    <button
      type="button"
      disabled={disabled}
      className="shrink-0 rounded-full p-0.5 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
      aria-label={`Remove ${label}`}
      onClick={onRemove}
    >
      <X className="h-3.5 w-3.5" aria-hidden strokeWidth={2} />
    </button>
  </span>
);
