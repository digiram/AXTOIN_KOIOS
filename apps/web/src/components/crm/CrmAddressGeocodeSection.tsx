/**
 * CrmAddressGeocodeSection
 *
 * Map-backed address search for CRM modal address editors.
 *
 * Responsibilities:
 * - Probe geocode provider status before rendering search UI
 * - Debounced Nominatim suggestions via tenant CRM geocode API
 * - Merge selected hit as a new or replacement address row
 *
 * Related:
 * - `CrmAddressesEditor`; `crmNominatimAddress` helpers
 *
 * Security:
 * - Authenticated tenant proxy only — browser never calls Nominatim directly.
 */
import { crmAddressRowHasContent, type CrmAddressFormRowInput } from "@starter/shared";
import { Loader2, MapPin } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { API_BASE_URL } from "../../lib/api.js";
import {
  nominatimHitCoordsLine,
  nominatimHitPrimaryLabel,
  nominatimHitsFromResults,
  nominatimHitSig,
  nominatimHitToAddressFormRow,
  type NominatimGeocodeHit
} from "../../lib/crmNominatimAddress.js";
import { crmModalOutlineInputClass } from "./crmModalOutlineInputClass.js";

const DEBOUNCE_MS = 320;
const MIN_QUERY_CHARS = 2;
const SUGGESTION_LIMIT = 8;

/** Session helpers for geocode API calls from CRM modals. */
export type CrmGeocodeApiDeps = {
  authHeaders: () => Record<string, string>;
  refreshSession: () => Promise<boolean>;
  logout: () => void;
};

type Props = {
  addresses: CrmAddressFormRowInput[];
  onAddressesChange: (next: CrmAddressFormRowInput[]) => void;
  geocodeApi: CrmGeocodeApiDeps;
};

const mergeGeocodedRow = (addresses: CrmAddressFormRowInput[], row: CrmAddressFormRowInput): CrmAddressFormRowInput[] => {
  if (addresses.length === 0) return [{ ...row, isPrimary: true }];
  if (addresses.length === 1 && !crmAddressRowHasContent(addresses[0]!)) {
    return [{ ...row, isPrimary: true }];
  }
  return [...addresses.map((a) => ({ ...a })), { ...row, isPrimary: false }];
};

/** Address lookup block — returns null when geocode is disabled for the tenant. */
export const CrmAddressGeocodeSection = ({ addresses, onAddressesChange, geocodeApi }: Props) => {
  const { authHeaders, refreshSession, logout } = geocodeApi;
  const [providerEnabled, setProviderEnabled] = useState<boolean | null>(null);

  const comboId = useId();
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchErr, setSearchErr] = useState("");
  const [results, setResults] = useState<NominatimGeocodeHit[]>([]);
  const [selectedHit, setSelectedHit] = useState<NominatimGeocodeHit | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        let res = await fetch(`${API_BASE_URL}/tenant/crm/geocode/status`, { headers: authHeaders() });
        if (res.status === 401) {
          if (!(await refreshSession())) {
            logout();
            return;
          }
          res = await fetch(`${API_BASE_URL}/tenant/crm/geocode/status`, { headers: authHeaders() });
        }
        if (!res.ok) {
          if (!cancelled) setProviderEnabled(false);
          return;
        }
        const j = (await res.json().catch(() => null)) as { enabled?: unknown } | null;
        if (!cancelled) setProviderEnabled(Boolean(j?.enabled));
      } catch {
        if (!cancelled) setProviderEnabled(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [authHeaders, refreshSession, logout]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(query.trim()), DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [query]);

  const fetchSuggestions = useCallback(async () => {
    const q = debouncedQuery;
    if (q.length < MIN_QUERY_CHARS || !providerEnabled) {
      setResults([]);
      setLoading(false);
      setSearchErr("");
      return;
    }
    setLoading(true);
    setSearchErr("");
    try {
      const p = new URLSearchParams({ q, limit: String(SUGGESTION_LIMIT) });
      let res = await fetch(`${API_BASE_URL}/tenant/crm/geocode/search?${p.toString()}`, {
        headers: authHeaders()
      });
      if (res.status === 401) {
        const ok = await refreshSession();
        if (!ok) {
          logout();
          return;
        }
        res = await fetch(`${API_BASE_URL}/tenant/crm/geocode/search?${p.toString()}`, {
          headers: authHeaders()
        });
      }
      const body = (await res.json().catch(() => null)) as { message?: string; results?: unknown } | null;
      if (!res.ok) {
        setSearchErr(body?.message ?? "Search failed.");
        setResults([]);
        return;
      }
      setResults(nominatimHitsFromResults(body?.results));
    } catch {
      setSearchErr("Search failed.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, providerEnabled, authHeaders, refreshSession, logout]);

  useEffect(() => {
    void fetchSuggestions();
  }, [fetchSuggestions]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (providerEnabled !== true) return null;

  const inputClass = crmModalOutlineInputClass(false);

  const addDisabled = selectedHit === null;

  return (
    <div className="relative z-30 mt-4 rounded-lg border border-indigo-100 bg-indigo-50/40 p-4 ring-1 ring-indigo-900/5">
      <p className="text-xs font-medium text-indigo-900">Look up address</p>
      <p className="mt-0.5 text-xs text-stone-600">
        Search the map provider, pick a result, then add it as a typed address row (you can edit fields below).
      </p>
      <div ref={rootRef} className="relative mt-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
          <div className="min-w-0 flex-1">
            <label htmlFor={comboId} className="mb-1.5 block text-xs font-medium text-stone-600">
              Search
            </label>
            <div className="relative">
              <input
                id={comboId}
                role="combobox"
                aria-expanded={open}
                aria-controls={listboxId}
                aria-autocomplete="list"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setOpen(true);
                  setSelectedHit(null);
                }}
                onFocus={() => setOpen(true)}
                className={`${inputClass} pr-10`}
                placeholder="e.g. 10 Downing Street, London"
                autoComplete="off"
              />
              {loading ? (
                <Loader2
                  className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-stone-400"
                  aria-hidden
                />
              ) : null}
            </div>
          </div>
          <button
            type="button"
            disabled={addDisabled}
            onClick={() => {
              if (!selectedHit) return;
              const mapped = nominatimHitToAddressFormRow(selectedHit);
              onAddressesChange(mergeGeocodedRow(addresses, mapped));
              setQuery("");
              setDebouncedQuery("");
              setSelectedHit(null);
              setResults([]);
              setSearchErr("");
              setOpen(false);
            }}
            className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add address
          </button>
        </div>
        {searchErr && !open ? (
          <p className="mt-2 text-sm text-rose-600" role="alert">
            {searchErr}
          </p>
        ) : null}
        {open ? (
          <ul
            id={listboxId}
            role="listbox"
            aria-label="Address suggestions"
            className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto overflow-x-hidden rounded-lg border border-stone-200 bg-white py-1 shadow-lg ring-1 ring-slate-900/10"
          >
            {debouncedQuery.length < MIN_QUERY_CHARS ? (
              <li className="px-3 py-2.5 text-sm text-stone-500">
                Keep typing — at least {MIN_QUERY_CHARS} characters to search.
              </li>
            ) : loading ? (
              <li className="px-3 py-2.5 text-sm text-stone-500">Searching…</li>
            ) : searchErr ? (
              <li className="px-3 py-2.5 text-sm text-rose-600" role="alert">
                {searchErr}
              </li>
            ) : results.length === 0 ? (
              <li className="px-3 py-2.5 text-sm text-stone-500">No matching places.</li>
            ) : (
              results.map((hit, idx) => {
                const title = nominatimHitPrimaryLabel(hit);
                const coords = nominatimHitCoordsLine(hit);
                return (
                  <li key={`${idx}-${title.slice(0, 48)}`} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={Boolean(selectedHit && nominatimHitSig(selectedHit) === nominatimHitSig(hit))}
                      className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-stone-50"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setSelectedHit(hit);
                        setQuery(title);
                        setOpen(false);
                      }}
                    >
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden strokeWidth={2} />
                      <span className="min-w-0 flex-1">
                        <span className="block break-words text-stone-900">{title}</span>
                        {coords ? <span className="mt-0.5 block text-xs text-stone-500">{coords}</span> : null}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        ) : null}
      </div>
    </div>
  );
};
