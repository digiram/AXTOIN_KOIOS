/**
 * FunnelOwnerSearchField
 *
 * Searchable assignee picker for funnel record ownership.
 *
 * Responsibilities:
 * - Filter preloaded tenant users client-side by name or email
 * - Portaled listbox with clear selection
 *
 * Related:
 * - Sales funnel record detail editor
 */
import { User } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { crmModalOutlineInputClass } from "../crm/crmModalOutlineInputClass.js";

const LISTBOX_SELECTOR = "[data-funnel-owner-listbox]";

/** Tenant user eligible for funnel record assignment. */
export type FunnelAssignee = {
  id: string;
  displayName: string | null;
  email: string;
};

type Props = {
  inputId: string;
  label: string;
  assignees: FunnelAssignee[];
  ownerUserId: string;
  disabled?: boolean;
  onChange: (userId: string) => void;
};

/** Owner assignee combobox backed by a static assignee list. */
export const FunnelOwnerSearchField = ({
  inputId,
  label,
  assignees,
  ownerUserId,
  disabled = false,
  onChange
}: Props) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [listBoxStyle, setListBoxStyle] = useState<{ top: number; left: number; width: number } | null>(
    null
  );

  const selected = assignees.find((u) => u.id === ownerUserId);
  const selectedLabel = selected
    ? selected.displayName?.trim() || selected.email
    : ownerUserId
      ? "Unknown user"
      : "";

  const filtered = assignees.filter((u) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const name = (u.displayName ?? "").toLowerCase();
    const email = u.email.toLowerCase();
    return name.includes(q) || email.includes(q);
  });

  const syncListBoxPosition = useCallback(() => {
    const wrap = anchorRef.current;
    if (!wrap || !open) {
      setListBoxStyle(null);
      return;
    }
    const r = wrap.getBoundingClientRect();
    setListBoxStyle({ top: r.bottom + 4, left: r.left, width: r.width });
  }, [open]);

  useLayoutEffect(() => {
    syncListBoxPosition();
  }, [syncListBoxPosition, filtered.length, query]);

  useEffect(() => {
    if (!open) return;
    syncListBoxPosition();
    window.addEventListener("resize", syncListBoxPosition);
    window.addEventListener("scroll", syncListBoxPosition, true);
    return () => {
      window.removeEventListener("resize", syncListBoxPosition);
      window.removeEventListener("scroll", syncListBoxPosition, true);
    };
  }, [open, syncListBoxPosition]);

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

  const displayValue = open ? query : ownerUserId ? selectedLabel : "";

  return (
    <div ref={rootRef} className="relative">
      <label htmlFor={inputId} className="mb-1.5 block text-xs font-medium text-stone-600">
        {label}
      </label>
        <div ref={anchorRef} className="relative min-w-0">
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
            disabled={disabled}
            value={displayValue}
            placeholder="Search by name or email…"
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              if (ownerUserId && e.target.value !== selectedLabel) {
                onChange("");
              }
            }}
            onFocus={() => {
              setOpen(true);
              setQuery(ownerUserId ? "" : query);
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || filtered.length === 0) return;
              e.preventDefault();
              const first = filtered[0]!;
              onChange(first.id);
              setQuery("");
              setOpen(false);
            }}
            className={`${crmModalOutlineInputClass(false)} w-full pl-10 pr-3 disabled:opacity-50`}
          />
        </div>
      {open && listBoxStyle && typeof document !== "undefined"
        ? createPortal(
            <ul
              id={`${inputId}-listbox`}
              role="listbox"
              data-funnel-owner-listbox=""
              className="fixed z-[3000] max-h-52 overflow-auto rounded-lg border border-stone-200 bg-white py-1 shadow-lg"
              style={{
                top: listBoxStyle.top,
                left: listBoxStyle.left,
                width: Math.max(listBoxStyle.width, 200)
              }}
            >
              <li role="presentation">
                <button
                  type="button"
                  role="option"
                  className="flex w-full px-3 py-2 text-left text-sm text-stone-600 hover:bg-stone-50"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange("");
                    setQuery("");
                    setOpen(false);
                  }}
                >
                  Unassigned
                </button>
              </li>
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-xs text-stone-500">No matches.</li>
              ) : (
                filtered.map((u) => {
                  const name = u.displayName?.trim() || u.email;
                  return (
                    <li key={u.id} role="presentation">
                      <button
                        type="button"
                        role="option"
                        className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-stone-50"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          onChange(u.id);
                          setQuery("");
                          setOpen(false);
                        }}
                      >
                        <User className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden strokeWidth={2} />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium text-stone-800">{name}</span>
                          {u.displayName?.trim() ? (
                            <span className="block text-xs text-stone-500">{u.email}</span>
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
