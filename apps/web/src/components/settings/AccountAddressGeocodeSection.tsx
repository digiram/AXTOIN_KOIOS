/**
 * AccountAddressGeocodeSection
 *
 * Map-backed address lookup for the signed-in user's account profile.
 *
 * Responsibilities:
 * - Probe tenant geocode provider status before showing search UI
 * - Debounced Nominatim suggestions via tenant CRM geocode API
 * - Map selected hit into `AddressValue` for the parent form
 *
 * Related:
 * - Account settings address fields; `crmNominatimAddress` helpers
 *
 * Security:
 * - Authenticated tenant API only; no direct third-party geocoder calls from the browser.
 */
import { Loader2, MapPin } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { type AddressValue } from "../crm/AddressFields.js";
import { API_BASE_URL } from "../../lib/api.js";
import {
  nominatimHitCoordsLine,
  nominatimHitPrimaryLabel,
  nominatimHitsFromResults,
  nominatimHitSig,
  nominatimHitToAddressValue,
  type NominatimGeocodeHit
} from "../../lib/crmNominatimAddress.js";

const DEBOUNCE_MS = 320;
const MIN_QUERY_CHARS = 2;
const SUGGESTION_LIMIT = 8;

/** Session helpers passed from account settings for geocode API calls. */
export type AccountGeocodeApiDeps = {
  authHeaders: () => Record<string, string>;
  refreshSession: () => Promise<boolean>;
  logout: () => void;
};

type Props = {
  geocodeApi: AccountGeocodeApiDeps;
  inputClass: string;
  onPick: (next: AddressValue) => void;
};

/**
 * Address search combobox for account settings — hidden when geocode is disabled.
 *
 * @param onPick - Called with normalized address fields when the user selects a hit.
 */
export const AccountAddressGeocodeSection = ({ geocodeApi, inputClass, onPick }: Props) => {
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

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        let res = await fetch(`${API_BASE_URL}/account/geocode/status`, { headers: authHeaders() });
        if (res.status === 401) {
          if (!(await refreshSession())) {
            logout();
            return;
          }
          res = await fetch(`${API_BASE_URL}/account/geocode/status`, { headers: authHeaders() });
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
      let res = await fetch(`${API_BASE_URL}/account/geocode/search?${p.toString()}`, {
        headers: authHeaders()
      });
      if (res.status === 401) {
        const ok = await refreshSession();
        if (!ok) {
          logout();
          return;
        }
        res = await fetch(`${API_BASE_URL}/account/geocode/search?${p.toString()}`, {
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

  const applyHit = (hit: NominatimGeocodeHit) => {
    onPick(nominatimHitToAddressValue(hit));
    setQuery("");
    setDebouncedQuery("");
    setResults([]);
    setSearchErr("");
    setOpen(false);
  };

  return (
    <div className="relative z-30 mt-4 rounded-lg border border-indigo-100 bg-indigo-50/40 p-4 ring-1 ring-indigo-900/5">
      <p className="text-xs font-medium text-indigo-900">Look up address</p>
      <p className="mt-0.5 text-xs text-stone-600">
        Search the map provider and pick a result to fill the fields below (replaces anything already entered).
      </p>
      <div ref={rootRef} className="relative mt-3">
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
                      <li key={`${nominatimHitSig(hit)}-${idx}`} role="presentation">
                        <button
                          type="button"
                          role="option"
                          className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-stone-50"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => applyHit(hit)}
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
        {searchErr && !open ? (
          <p className="mt-2 text-sm text-rose-600" role="alert">
            {searchErr}
          </p>
        ) : null}
      </div>
    </div>
  );
};
