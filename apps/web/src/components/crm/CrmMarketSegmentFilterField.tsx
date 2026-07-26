/**
 * CrmMarketSegmentFilterField
 *
 * Hierarchical market segment combobox for CRM organization list filters.
 *
 * Responsibilities:
 * - Flatten segment tree into searchable options with breadcrumb labels
 * - Portaled listbox with layer badges and clear control
 *
 * Related:
 * - `CrmOrganizationSegmentFields`; organizations list page
 */
import { Layers, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  buildCrmMarketSegmentFilterOptions,
  type CrmMarketSegmentFilterOption,
  type CrmMarketSegmentOption
} from "./CrmOrganizationSegmentFields.js";

const LISTBOX_SELECTOR = "[data-crm-market-segment-filter-listbox]";

const layerBadgeClass =
  "shrink-0 rounded-full border border-stone-200 bg-stone-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-500";

type Props = {
  inputId: string;
  segments: CrmMarketSegmentOption[];
  segmentId: string;
  onChange: (nextId: string) => void;
  disabled?: boolean;
  label?: string;
  labelClassName?: string;
  className?: string;
  inputClassName?: string;
  clearButtonClassName?: string;
};

const SegmentPathLabel = ({ option }: { option: CrmMarketSegmentFilterOption }) => {
  if (option.ancestorLabels.length === 0) {
    return <span className="min-w-0 flex-1 font-medium text-stone-900">{option.name}</span>;
  }
  return (
    <span className="min-w-0 flex-1 text-sm leading-snug">
      <span className="text-stone-500">{option.ancestorLabels.join(" › ")} › </span>
      <span className="font-medium text-stone-900">{option.name}</span>
    </span>
  );
};

/** Single-select market segment filter with hierarchical labels. */
export const CrmMarketSegmentFilterField = ({
  inputId,
  segments,
  segmentId,
  onChange,
  disabled = false,
  label = "Market segment",
  labelClassName = "mb-1.5 block text-xs font-medium text-stone-600",
  className = "relative",
  inputClassName,
  clearButtonClassName = "inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg border border-stone-200/90 bg-white text-stone-600 shadow-sm hover:bg-stone-50 disabled:opacity-40"
}: Props) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [listBoxStyle, setListBoxStyle] = useState<{ top: number; left: number; width: number } | null>(null);

  const options = useMemo(() => buildCrmMarketSegmentFilterOptions(segments), [segments]);
  const selected = useMemo(() => options.find((o) => o.id === segmentId), [options, segmentId]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(query.trim().toLowerCase()), 200);
    return () => window.clearTimeout(t);
  }, [query]);

  const filteredOptions = useMemo(() => {
    if (!debouncedQ) return options;
    return options.filter((o) => o.pathLabel.toLowerCase().includes(debouncedQ));
  }, [options, debouncedQ]);

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
  }, [syncListBoxPosition, filteredOptions.length, query]);

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

  const hasSelection = Boolean(segmentId);
  const displayValue = open ? query : selected?.pathLabel ?? "";
  const resolvedInputClass =
    inputClassName ??
    "w-full rounded-lg border border-stone-200/90 bg-white py-2.5 pl-10 pr-3 text-sm text-stone-900 shadow-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/25";
  const showListbox = open && !disabled && listBoxStyle && typeof document !== "undefined";

  if (segments.length === 0) {
    return (
      <div className={className}>
        <label htmlFor={inputId} className={labelClassName}>
          {label}
        </label>
        <input
          id={inputId}
          disabled
          value=""
          placeholder="No segments configured"
          className={resolvedInputClass}
        />
      </div>
    );
  }

  return (
    <div ref={rootRef} className={className}>
      <label htmlFor={inputId} className={labelClassName}>
        {label}
      </label>
      <div className="flex gap-2">
        <div ref={anchorRef} className="relative min-w-0 flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-stone-400">
            <Layers className="h-4 w-4" aria-hidden strokeWidth={2} />
          </span>
          <input
            id={inputId}
            type="search"
            autoComplete="off"
            role="combobox"
            aria-expanded={open}
            aria-controls={`${inputId}-listbox`}
            aria-autocomplete="list"
            disabled={disabled}
            value={displayValue}
            placeholder="Search all segment layers…"
            onChange={(e) => {
              const v = e.target.value;
              setQuery(v);
              setOpen(true);
              if (hasSelection && v !== (selected?.pathLabel ?? "")) {
                onChange("");
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
            title="Clear segment filter"
            aria-label="Clear segment filter"
            disabled={disabled}
            onClick={() => {
              onChange("");
              setQuery("");
              setOpen(false);
            }}
            className={clearButtonClassName}
          >
            <X className="h-4 w-4" aria-hidden strokeWidth={2} />
          </button>
        ) : null}
      </div>

      {showListbox
        ? createPortal(
            <ul
              id={`${inputId}-listbox`}
              role="listbox"
              data-crm-market-segment-filter-listbox=""
              aria-label="Market segments"
              className="fixed z-[3000] max-h-60 overflow-auto rounded-lg border border-stone-200 bg-white py-1 shadow-lg"
              style={{
                top: listBoxStyle.top,
                left: listBoxStyle.left,
                width: Math.max(listBoxStyle.width, 280)
              }}
            >
              {filteredOptions.length === 0 ? (
                <li className="px-3 py-2 text-xs text-stone-500">No matching segments.</li>
              ) : (
                filteredOptions.map((option) => (
                  <li key={option.id} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={option.id === segmentId}
                      className="flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-stone-50"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        onChange(option.id);
                        setQuery("");
                        setOpen(false);
                      }}
                    >
                      <Layers className="mt-0.5 h-4 w-4 shrink-0 text-amber-800/80" aria-hidden strokeWidth={2} />
                      <SegmentPathLabel option={option} />
                      <span className={layerBadgeClass}>L{option.layer}</span>
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
