/**
 * SearchableTimezoneSelect
 *
 * Filterable combobox for IANA time zone identifiers.
 *
 * Responsibilities:
 * - Search zones by id with UTC offset label in closed state
 * - Keyboard navigation and clear selection
 * - Shared searchable field styling from `fieldStyles`
 *
 * Related:
 * - User display datetime preferences in account settings
 */
import { Clock } from "lucide-react";
import { type KeyboardEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { authSearchableInputClass, authSearchableLeadingClass, authSearchableShellClass } from "./auth/fieldStyles.js";
import { getIanaTimeZoneIds, utcOffsetLabelFromIana } from "../lib/timezones.js";

/** Props for {@link SearchableTimezoneSelect}. */
export type SearchableTimezoneSelectProps = {
  inputId: string;
  /** IANA time zone id, or empty. */
  value: string;
  onChange: (iana: string) => void;
};

type Row = { id: string; isClear?: boolean };

const formatClosed = (iana: string) => {
  const t = iana.trim();
  if (!t) return "";
  const off = utcOffsetLabelFromIana(t);
  return off ? `${t} (${off})` : t;
};

const safeOptionSuffix = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, "_");

/**
 * Searchable IANA time zone combobox. Search matches **zone id path only** (e.g. `Europe`).
 * Closed value shows **IANA + GMT offset** in parentheses when available.
 */
/** Filterable IANA timezone combobox with UTC offset in the closed label. */
export const SearchableTimezoneSelect = ({ inputId, value, onChange }: SearchableTimezoneSelectProps) => {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);

  const allIds = useMemo(() => {
    const set = new Set(getIanaTimeZoneIds());
    const v = value.trim();
    if (v) set.add(v);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [value]);

  const filteredIds = useMemo(() => {
    const q = (open ? query : "").trim().toLowerCase();
    if (!q) return allIds;
    return allIds.filter((id) => id.toLowerCase().includes(q));
  }, [open, query, allIds]);

  const rows: Row[] = useMemo(() => {
    if (open && value.trim()) {
      return [{ id: "", isClear: true }, ...filteredIds.map((id) => ({ id }))];
    }
    return filteredIds.map((id) => ({ id }));
  }, [open, value, filteredIds]);

  useEffect(() => {
    setHighlight((h) => (rows.length === 0 ? 0 : Math.min(h, rows.length - 1)));
  }, [rows.length]);

  const clearBlurTimer = useCallback(() => {
    if (blurTimerRef.current) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setHighlight(0);
  }, []);

  const selectRow = useCallback(
    (row: Row) => {
      clearBlurTimer();
      if (row.isClear) onChange("");
      else onChange(row.id);
      close();
    },
    [onChange, close, clearBlurTimer]
  );

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      const el = rootRef.current;
      if (!el || !(e.target instanceof Node) || el.contains(e.target)) return;
      close();
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [close]);

  useEffect(() => {
    return () => clearBlurTimer();
  }, [clearBlurTimer]);

  const inputDisplay = open ? query : formatClosed(value);

  const activeId =
    open && rows[highlight]
      ? `${inputId}-opt-${rows[highlight]!.isClear ? "clear" : safeOptionSuffix(rows[highlight]!.id)}`
      : undefined;

  const onInputChange = (next: string) => {
    setQuery(next);
    setOpen(true);
    setHighlight(0);
  };

  const onInputFocus = () => {
    clearBlurTimer();
    setOpen(true);
    setQuery("");
    setHighlight(0);
  };

  const onInputBlur = () => {
    blurTimerRef.current = setTimeout(() => {
      setOpen(false);
      setQuery("");
      blurTimerRef.current = null;
    }, 120);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      setQuery("");
      setHighlight(0);
      e.preventDefault();
      return;
    }
    if (!open) return;

    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (rows.length === 0) return;
      setHighlight((h) => Math.min(h + 1, rows.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[highlight];
      if (row) selectRow(row);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <div className={authSearchableShellClass}>
        <div className={`${authSearchableLeadingClass} w-11 shrink-0`} aria-hidden>
          <Clock className="h-5 w-5 text-slate-500" aria-hidden strokeWidth={1.5} />
        </div>
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          autoComplete="off"
          spellCheck={false}
          className={authSearchableInputClass}
          value={inputDisplay}
          onChange={(e) => onInputChange(e.target.value)}
          onFocus={onInputFocus}
          onBlur={onInputBlur}
          onKeyDown={onKeyDown}
          placeholder="Search IANA time zone (e.g. Europe/Amsterdam)…"
        />
      </div>
      {open ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-black/5"
        >
          {rows.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-500" role="presentation">
              No matches
            </li>
          ) : (
            rows.map((row, idx) => {
              const active = idx === highlight;
              const optionId = row.isClear ? `${inputId}-opt-clear` : `${inputId}-opt-${safeOptionSuffix(row.id)}`;
              const off = !row.isClear && row.id ? utcOffsetLabelFromIana(row.id) : "";
              return (
                <li
                  key={row.isClear ? "clear" : row.id}
                  id={optionId}
                  role="option"
                  aria-selected={active}
                  className={[
                    "flex cursor-pointer items-center gap-2 px-3 py-2 text-sm",
                    active ? "bg-indigo-50 text-indigo-900" : "text-slate-800 hover:bg-slate-50",
                    row.isClear ? "text-slate-600" : ""
                  ].join(" ")}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectRow(row);
                  }}
                  onMouseEnter={() => setHighlight(idx)}
                >
                  {row.isClear ? (
                    "Clear time zone"
                  ) : (
                    <>
                      <span className="min-w-0 flex-1 truncate font-mono text-xs sm:text-sm">{row.id}</span>
                      {off ? (
                        <span className="shrink-0 whitespace-nowrap text-xs text-slate-500">{off}</span>
                      ) : null}
                    </>
                  )}
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
};
