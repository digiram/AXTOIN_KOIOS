/**
 * SearchableCountrySelect
 *
 * Filterable combobox for choosing a country from preset ISO options.
 *
 * Responsibilities:
 * - Typeahead filter by country name or code
 * - In-field flag adornment via `CountryFlagSvg`
 * - Keyboard navigation and clear selection
 *
 * Related:
 * - Account settings, CRM address editors; `country-presets`
 */
import { Globe } from "lucide-react";
import { type KeyboardEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { authSearchableInputClass, authSearchableLeadingClass, authSearchableShellClass } from "./auth/fieldStyles.js";
import { COUNTRY_ISO_OPTIONS } from "../lib/country-presets.js";
import { CountryFlagSvg } from "./CountryFlagSvg.js";

/** Props for {@link SearchableCountrySelect}. */
export type SearchableCountrySelectProps = {
  /** Stable id for the combobox input (label `htmlFor` in the parent). */
  inputId: string;
  /** Two-letter country code, or empty string for none. */
  value: string;
  onChange: (code: string) => void;
};

type Row = { code: string; label: string; isClear?: boolean };

const formatDisplay = (code: string): string => {
  if (!code.trim()) return "";
  const upper = code.trim().toUpperCase();
  const opt = COUNTRY_ISO_OPTIONS.find((o) => o.code === upper);
  return opt ? `${opt.label} (${opt.code})` : upper;
};

const filterOptions = (query: string) => {
  const q = query.trim().toLowerCase();
  if (!q) return COUNTRY_ISO_OPTIONS;
  return COUNTRY_ISO_OPTIONS.filter(
    (o) => o.label.toLowerCase().includes(q) || o.code.toLowerCase().includes(q)
  );
};

/**
 * Searchable country combobox (filters preset list by name or code).
 * Left **in-field** adornment shows a flag (SVG from `country-flag-icons`, or a globe when empty).
 */
export const SearchableCountrySelect = ({ inputId, value, onChange }: SearchableCountrySelectProps) => {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);

  const rows: Row[] = useMemo(() => {
    const q = open ? query : "";
    const filtered = filterOptions(q);
    if (open && value.trim()) {
      return [{ code: "", label: "Clear country", isClear: true }, ...filtered];
    }
    return filtered.map((o) => ({ code: o.code, label: o.label }));
  }, [open, query, value]);

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
      if (row.isClear) {
        onChange("");
      } else {
        onChange(row.code);
      }
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

  const inputDisplay = open ? query : formatDisplay(value);

  const activeId =
    open && rows[highlight] ? `${inputId}-opt-${rows[highlight]!.isClear ? "clear" : rows[highlight]!.code}` : undefined;

  const selectedCode = value.trim().toUpperCase();
  const showFlag = /^[A-Z]{2}$/.test(selectedCode);

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
      return;
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <div className={authSearchableShellClass}>
        <div className={`${authSearchableLeadingClass} w-11 shrink-0`} aria-hidden>
          {showFlag ? (
            <CountryFlagSvg
              code={selectedCode}
              variant="field"
              className="h-5 w-auto max-w-[1.65rem] shrink-0 rounded-sm shadow-sm ring-1 ring-black/10"
            />
          ) : (
            <Globe className="h-5 w-5 text-slate-400" aria-hidden strokeWidth={1.5} />
          )}
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
          placeholder="Search by country or code…"
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
              const optionId = row.isClear ? `${inputId}-opt-clear` : `${inputId}-opt-${row.code}`;
              return (
                <li
                  key={row.isClear ? "clear" : row.code}
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
                  <span className="flex w-7 shrink-0 items-center justify-center" aria-hidden>
                    {row.isClear ? null : (
                      <CountryFlagSvg
                        code={row.code}
                        variant="list"
                        className="h-4 w-auto max-w-[1.25rem] shrink-0 rounded-sm ring-1 ring-black/10"
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    {row.isClear ? (
                      row.label
                    ) : (
                      <>
                        {row.label} <span className="text-slate-500">({row.code})</span>
                      </>
                    )}
                  </span>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
};
