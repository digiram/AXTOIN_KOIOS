/**
 * Calendar Event Location Field.
 *
 * Reusable mailbox UI building block: Calendar Event Location Field.
 *
 * Responsibilities:
 * - Encapsulate a focused interaction or form segment
 * - Keep parent pages thin by isolating validation and presentation
 *
 * Related:
 * - Route: /admin/mailbox
 */
import type { CalendarLocationType } from "@starter/shared";
import { MapPin, Video } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { API_BASE_URL } from "../../lib/api.js";
import { nominatimHitPrimaryLabel, type NominatimGeocodeHit } from "../../lib/crmNominatimAddress.js";
import { useCrmApi } from "../crm/useCrmApi.js";
import {
  calendarEventInputClass,
  calendarEventLabelClass
} from "./calendarEventFormUtils.js";

type Props = {
  locationType: CalendarLocationType;
  onLocationTypeChange: (value: CalendarLocationType) => void;
  location: string;
  onLocationChange: (value: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
};

/** React component for mailbox UI. */
export const CalendarEventLocationField = ({
  locationType,
  onLocationTypeChange,
  location,
  onLocationChange,
  disabled = false,
  readOnly = false
}: Props) => {
  const inputId = useId();
  const { authHeaders, refreshSession, logout } = useCrmApi();
  const [query, setQuery] = useState(location);
  const [debouncedQ, setDebouncedQ] = useState("");
  const [results, setResults] = useState<NominatimGeocodeHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const [listBoxStyle, setListBoxStyle] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    setQuery(location);
  }, [location]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const fetchSuggestions = useCallback(async () => {
    if (locationType !== "in_person" || debouncedQ.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ q: debouncedQ, limit: "8" });
      let res = await fetch(`${API_BASE_URL}/tenant/crm/geocode/search?${params}`, {
        headers: authHeaders()
      });
      if (res.status === 401) {
        if (!(await refreshSession())) {
          logout();
          return;
        }
        res = await fetch(`${API_BASE_URL}/tenant/crm/geocode/search?${params}`, { headers: authHeaders() });
      }
      const raw = res.ok ? await res.json() : [];
      setResults(Array.isArray(raw) ? (raw as NominatimGeocodeHit[]) : []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, debouncedQ, locationType, logout, refreshSession]);

  useEffect(() => {
    void fetchSuggestions();
  }, [fetchSuggestions]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  useEffect(() => {
    const node = rootRef.current?.querySelector("input");
    if (!node || !open) {
      setListBoxStyle(null);
      return;
    }
    const rect = node.getBoundingClientRect();
    setListBoxStyle({ top: rect.bottom + 4, left: rect.left, width: rect.width });
  }, [open, results.length, query]);

  if (readOnly) {
    return (
      <div>
        <span className={calendarEventLabelClass}>Location</span>
        <p className="mt-1 text-sm text-slate-700">{location.trim() || "—"}</p>
      </div>
    );
  }

  return (
    <div ref={rootRef}>
      <span className={calendarEventLabelClass}>Location</span>
      <div className={`flex overflow-hidden rounded-md border border-slate-300 shadow-sm focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-500/25`}>
        <div className="flex shrink-0 items-center border-r border-indigo-100 bg-indigo-50 px-2.5 text-indigo-600">
          {locationType === "in_person" ? (
            <MapPin className="h-4 w-4" aria-hidden />
          ) : (
            <Video className="h-4 w-4" aria-hidden />
          )}
        </div>
        <select
          aria-label="Location type"
          className="shrink-0 border-0 bg-white px-2 py-2 text-sm text-slate-700 focus:outline-none focus:ring-0"
          value={locationType}
          disabled={disabled}
          onChange={(event) => onLocationTypeChange(event.target.value as CalendarLocationType)}
        >
          <option value="in_person">In person</option>
          <option value="by_call">By call</option>
        </select>
        <input
          id={inputId}
          type="text"
          disabled={disabled}
          className="min-w-0 flex-1 border-0 px-3 py-2 text-sm focus:outline-none focus:ring-0"
          placeholder={locationType === "in_person" ? "Search address or venue, or type freely" : "Link or dial-in info"}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            onLocationChange(event.target.value);
            setOpen(locationType === "in_person");
          }}
          onFocus={() => setOpen(locationType === "in_person")}
        />
      </div>
      {open && locationType === "in_person" && debouncedQ.length >= 2 && listBoxStyle && typeof document !== "undefined"
        ? createPortal(
            <ul
              className="fixed z-[3000] max-h-48 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg"
              style={{ top: listBoxStyle.top, left: listBoxStyle.left, width: listBoxStyle.width }}
            >
              {loading ? (
                <li className="px-3 py-2 text-xs text-slate-500">Searching places…</li>
              ) : results.length === 0 ? (
                <li className="px-3 py-2 text-xs text-slate-500">No matches — keep typing a custom location.</li>
              ) : (
                results.map((hit) => (
                  <li key={`${hit.place_id ?? hit.lat}-${hit.lon}`}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        const label = nominatimHitPrimaryLabel(hit);
                        setQuery(label);
                        onLocationChange(label);
                        setOpen(false);
                      }}
                    >
                      {nominatimHitPrimaryLabel(hit)}
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
