/**
 * SearchableCurrencySelect
 *
 * Filterable combobox for ISO 4217 currency codes.
 *
 * Responsibilities:
 * - Search by code, name, or symbol via `iso4217-currencies`
 * - Optional upward list placement for tight layouts
 * - Leading coin adornment matching auth searchable field shell
 *
 * Related:
 * - Invoicing and tenant billing settings
 */
import { Coins } from "lucide-react";
import { type KeyboardEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import {
  authSearchableInputClass,
  authSearchableLeadingClass,
  authSearchableShellClass
} from "./auth/fieldStyles.js";
import {
  getCurrencySymbol,
  getIso4217CurrencyOptions,
  type CurrencyOption
} from "../lib/iso4217-currencies.js";

/** Props for {@link SearchableCurrencySelect}. */
export type SearchableCurrencySelectProps = {
  inputId: string;
  /** ISO 4217 alphabetic code, or empty. */
  value: string;
  onChange: (code: string) => void;
  /**
   * Where the listbox opens relative to the field. Use `"above"` at the bottom of a scroll area or tight card so
   * options are not clipped by `overflow-hidden` parents below the control.
   */
  listPlacement?: "below" | "above";
};

type Row = { opt?: CurrencyOption; isClear?: boolean };

const formatClosed = (code: string, options: CurrencyOption[]) => {
  const c = code.trim().toUpperCase();
  if (!c) return "";
  const hit = options.find((o) => o.code === c);
  return hit ? `${hit.code} — ${hit.name}` : c;
};

/**
 * Searchable **ISO 4217** currency combobox (code + English name). Search matches code or name.
 */
export const SearchableCurrencySelect = ({
  inputId,
  value,
  onChange,
  listPlacement = "below"
}: SearchableCurrencySelectProps) => {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const options = useMemo(() => getIso4217CurrencyOptions(), []);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);

  const optionsWithCustom = useMemo(() => {
    const c = value.trim().toUpperCase();
    if (!c || !/^[A-Z]{3}$/.test(c)) return options;
    if (options.some((o) => o.code === c)) return options;
    return [...options, { code: c, name: c }].sort((a, b) => a.name.localeCompare(b.name));
  }, [options, value]);

  const filtered = useMemo(() => {
    const q = (open ? query : "").trim().toLowerCase();
    if (!q) return optionsWithCustom;
    return optionsWithCustom.filter(
      (o) => o.code.toLowerCase().includes(q) || o.name.toLowerCase().includes(q)
    );
  }, [open, query, optionsWithCustom]);

  const rows: Row[] = useMemo(() => {
    if (open && value.trim()) {
      return [{ isClear: true }, ...filtered.map((opt) => ({ opt }))];
    }
    return filtered.map((opt) => ({ opt }));
  }, [open, value, filtered]);

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
      else if (row.opt) onChange(row.opt.code);
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

  const inputDisplay = open ? query : formatClosed(value, optionsWithCustom);

  const activeId =
    open && rows[highlight]
      ? `${inputId}-opt-${rows[highlight]!.isClear ? "clear" : rows[highlight]!.opt!.code}`
      : undefined;

  const selected = value.trim().toUpperCase();
  const prefixSymbol =
    selected && /^[A-Z]{3}$/.test(selected) ? getCurrencySymbol(selected) : null;

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
    <div ref={rootRef} className="relative w-full min-w-0">
      <div className={authSearchableShellClass}>
        <div className={`${authSearchableLeadingClass} min-w-12 w-12 px-0.5`} aria-hidden>
          {prefixSymbol ? (
            <span className="max-w-full truncate text-center text-lg font-semibold leading-none text-slate-700" title={selected}>
              {prefixSymbol}
            </span>
          ) : (
            <Coins className="h-5 w-5 text-slate-400" aria-hidden strokeWidth={1.5} />
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
          placeholder="Search currency code or name…"
        />
      </div>
      {open ? (
        <ul
          id={listboxId}
          role="listbox"
          className={[
            "absolute z-50 max-h-60 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-black/5",
            listPlacement === "above"
              ? "bottom-full left-0 right-0 mb-1 origin-bottom"
              : "left-0 right-0 top-full mt-1 origin-top"
          ].join(" ")}
        >
          {rows.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-500" role="presentation">
              No matches
            </li>
          ) : (
            rows.map((row, idx) => {
              const active = idx === highlight;
              const opt = row.opt;
              const optionId = row.isClear ? `${inputId}-opt-clear` : `${inputId}-opt-${opt!.code}`;
              return (
                <li
                  key={row.isClear ? "clear" : opt!.code}
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
                    "Clear currency"
                  ) : (
                    <>
                      <span className="w-10 shrink-0 font-mono text-xs font-semibold text-slate-700">{opt!.code}</span>
                      <span className="min-w-0 flex-1 truncate text-slate-700">{opt!.name}</span>
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
