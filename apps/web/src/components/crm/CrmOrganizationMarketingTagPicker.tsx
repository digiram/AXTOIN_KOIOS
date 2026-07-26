/**
 * CrmOrganizationMarketingTagPicker
 *
 * Multi-select combobox for organization marketing tags in forms and filters.
 *
 * Responsibilities:
 * - Search and toggle tags with chip display and max-tag guard
 * - Portaled listbox; configurable empty and helper copy
 *
 * Related:
 * - Organization modals; `CrmMarketingTagFilterField`
 */
import { Tag, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { crmModalOutlineInputClass } from "./crmModalOutlineInputClass.js";

const LISTBOX_SELECTOR = "[data-crm-marketing-tag-listbox]";
const MAX_TAGS = 30;

/** Tenant marketing tag option (id + display name). */
export type CrmMarketingTagOption = {
  id: string;
  name: string;
};

type Props = {
  tags: CrmMarketingTagOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  inputId?: string;
  label?: string;
  labelClassName?: string;
  rootClassName?: string;
  inputClassName?: string;
  /** `null` hides helper copy; omit for default form helper text. */
  helperText?: string | null;
  emptyPresentation?: "message" | "input";
  emptyInputPlaceholder?: string;
};

/** Multi-select marketing tag picker for organization forms and filters. */
export const CrmOrganizationMarketingTagPicker = ({
  tags,
  selectedIds,
  onChange,
  disabled = false,
  inputId = "crm-org-marketing-tags",
  label,
  labelClassName = "mb-1.5 block text-xs font-medium text-stone-600",
  rootClassName = "space-y-2",
  inputClassName,
  helperText,
  emptyPresentation = "message",
  emptyInputPlaceholder = "No marketing tags configured"
}: Props) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [listBoxStyle, setListBoxStyle] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(query.trim().toLowerCase()), 200);
    return () => window.clearTimeout(t);
  }, [query]);

  const selectedTags = useMemo(
    () =>
      selectedIds
        .map((id) => tags.find((t) => t.id === id))
        .filter((t): t is CrmMarketingTagOption => t != null),
    [selectedIds, tags]
  );

  const availableTags = useMemo(() => {
    const selected = new Set(selectedIds);
    return tags
      .filter((t) => !selected.has(t.id))
      .filter((t) => debouncedQ.length === 0 || t.name.toLowerCase().includes(debouncedQ))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tags, selectedIds, debouncedQ]);

  const atMax = selectedIds.length >= MAX_TAGS;

  const addTag = (id: string) => {
    if (disabled || atMax || selectedIds.includes(id)) return;
    onChange([...selectedIds, id]);
    setQuery("");
    setOpen(true);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const removeTag = (id: string) => {
    if (disabled) return;
    onChange(selectedIds.filter((x) => x !== id));
  };

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
  }, [syncListBoxPosition, availableTags.length, query]);

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

  const resolvedInputClass =
    inputClassName ?? `${crmModalOutlineInputClass(disabled || atMax)} w-full pl-10 pr-3`;
  const resolvedHelperText =
    helperText === undefined
      ? atMax
        ? `You can assign up to ${MAX_TAGS} marketing tags per organization.`
        : "Search and select a tag to add it. Repeat to add more."
      : helperText;

  if (tags.length === 0) {
    if (emptyPresentation === "input") {
      return (
        <div className={rootClassName}>
          {label ? (
            <label htmlFor={inputId} className={labelClassName}>
              {label}
            </label>
          ) : null}
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-stone-400">
              <Tag className="h-4 w-4" aria-hidden strokeWidth={2} />
            </span>
            <input id={inputId} disabled value="" placeholder={emptyInputPlaceholder} className={resolvedInputClass} />
          </div>
        </div>
      );
    }
    return (
      <p className="text-xs text-stone-500">
        No marketing tags yet. Tenant admins can add tags under CRM → Segmentation settings.
      </p>
    );
  }

  const showListbox = open && !disabled && !atMax && listBoxStyle && typeof document !== "undefined";

  return (
    <div ref={rootRef} className={rootClassName}>
      {label ? (
        <label htmlFor={inputId} className={labelClassName}>
          {label}
        </label>
      ) : null}

      {selectedTags.length > 0 ? (
        <ul className={`flex flex-wrap gap-2${label ? " mt-2" : ""}`} aria-label="Selected marketing tags">
          {selectedTags.map((tag) => (
            <li key={tag.id}>
              <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 py-0.5 pl-2.5 pr-1 text-xs font-medium text-indigo-950">
                <span className="truncate">{tag.name}</span>
                {!disabled ? (
                  <button
                    type="button"
                    className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-indigo-700 transition-colors hover:bg-indigo-100 hover:text-indigo-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/80"
                    title={`Remove ${tag.name}`}
                    aria-label={`Remove ${tag.name}`}
                    onClick={() => removeTag(tag.id)}
                  >
                    <X className="h-3 w-3" aria-hidden strokeWidth={2} />
                  </button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className={`relative${label || selectedTags.length > 0 ? " mt-2" : ""}`} ref={anchorRef}>
        {!label ? (
          <label htmlFor={inputId} className="sr-only">
            Search marketing tags
          </label>
        ) : null}
        <span className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-stone-400">
          <Tag className="h-4 w-4" aria-hidden strokeWidth={2} />
        </span>
        <input
          ref={inputRef}
          id={inputId}
          type="search"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${inputId}-listbox`}
          aria-autocomplete="list"
          disabled={disabled || atMax}
          value={query}
          placeholder={
            atMax
              ? `Maximum ${MAX_TAGS} tags`
              : selectedTags.length > 0
                ? "Search to add another tag…"
                : "Search marketing tags…"
          }
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          className={resolvedInputClass}
        />
      </div>

      {resolvedHelperText ? <p className="text-xs text-stone-500">{resolvedHelperText}</p> : null}

      {showListbox
        ? createPortal(
            <ul
              id={`${inputId}-listbox`}
              role="listbox"
              data-crm-marketing-tag-listbox=""
              aria-label="Available marketing tags"
              className="fixed z-[3000] max-h-52 overflow-auto rounded-lg border border-stone-200 bg-white py-1 shadow-lg"
              style={{
                top: listBoxStyle.top,
                left: listBoxStyle.left,
                width: Math.max(listBoxStyle.width, 220)
              }}
            >
              {availableTags.length === 0 ? (
                <li className="px-3 py-2 text-xs text-stone-500">
                  {debouncedQ.length > 0 ? "No matching tags." : "All tags are already assigned."}
                </li>
              ) : (
                availableTags.map((tag) => (
                  <li key={tag.id} role="presentation">
                    <button
                      type="button"
                      role="option"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-stone-50"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => addTag(tag.id)}
                    >
                      <Tag className="h-4 w-4 shrink-0 text-indigo-600" aria-hidden strokeWidth={2} />
                      <span className="min-w-0 flex-1 truncate text-stone-800" title={tag.name}>
                        {tag.name}
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
