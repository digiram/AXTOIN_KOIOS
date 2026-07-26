/**
 * Super Integrations page.
 *
 * Tenant super-admin screen mounted under AppShell at /super-admin.
 *
 * Responsibilities:
 * - Load and render primary super-admin data for the route
 * - Wire user actions to tenant API endpoints
 * - Compose shared module components and modals
 *
 * Related:
 * - Route: /super-admin
 *
 * Security:
 * - Tenant-scoped API calls via authenticated session
 */
import { Loader2, MapPin } from "lucide-react";

import { SuperIntegrationsPaymentsPanel } from "./SuperIntegrationsPaymentsPanel.js";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { useAuth } from "../../auth/AuthContext.js";
import { Switch } from "../../components/Switch.js";
import { useUserDisplayDatetime } from "../../hooks/useUserDisplayDatetime.js";
import { API_BASE_URL } from "../../lib/api.js";
import {
  nominatimHitCoordsLine,
  nominatimHitPrimaryLabel,
  nominatimHitsFromResults,
  type NominatimGeocodeHit
} from "../../lib/crmNominatimAddress.js";

const GEO_TEST_DEBOUNCE_MS = 320;
const GEO_TEST_MIN_CHARS = 2;
/** Match typical address-dropdown suggestion count (API max 10). */
const GEO_TEST_SUGGESTION_LIMIT = 8;

type GeolocationResponse = {
  nominatimBaseUrl: string;
  nominatimContactEmail: string | null;
  nominatimEnabled: boolean;
  updatedAt: string;
};

const INTEGRATION_TABS = [
  { id: "geolocations" as const, label: "Geolocations" },
  { id: "payments" as const, label: "Payments" }
];

type TabId = (typeof INTEGRATION_TABS)[number]["id"];

/**
 * Super-admin integrations hub — tab per integration family; each tab uses enable, configuration, and test cards.
 */
export const SuperIntegrationsPage = () => {
  const { getAccessToken, refreshSession, logout } = useAuth();
  const { formatDateTime } = useUserDisplayDatetime();
  const authHeaders = useCallback(() => {
    const token = getAccessToken();
    const h: Record<string, string> = {};
    if (token) h.authorization = `Bearer ${token}`;
    return h;
  }, [getAccessToken]);

  const tabListId = useId();
  const [activeTab, setActiveTab] = useState<TabId>("geolocations");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://nominatim.openstreetmap.org");
  const [contactEmail, setContactEmail] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [toggleBusy, setToggleBusy] = useState(false);

  const geoTestInputId = useId();
  const geoTestListboxId = useId();
  const geoTestRootRef = useRef<HTMLDivElement>(null);
  const [geoTestQuery, setGeoTestQuery] = useState("");
  const [geoDebouncedQuery, setGeoDebouncedQuery] = useState("");
  const [geoTestResults, setGeoTestResults] = useState<NominatimGeocodeHit[]>([]);
  const [geoTestLoading, setGeoTestLoading] = useState(false);
  const [geoTestOpen, setGeoTestOpen] = useState(false);
  const [geoTestError, setGeoTestError] = useState("");
  const [geoTestSelected, setGeoTestSelected] = useState<NominatimGeocodeHit | null>(null);

  const inputClass =
    "w-full rounded-lg border border-stone-200/90 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/25";

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      let res = await fetch(`${API_BASE_URL}/platform/integrations/geolocation`, { headers: authHeaders() });
      if (res.status === 401) {
        const ok = await refreshSession();
        if (!ok) {
          logout();
          return;
        }
        res = await fetch(`${API_BASE_URL}/platform/integrations/geolocation`, { headers: authHeaders() });
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message ?? "Could not load geolocation settings.");
        return;
      }
      const json = (await res.json()) as GeolocationResponse;
      setBaseUrl(json.nominatimBaseUrl);
      setContactEmail(json.nominatimContactEmail?.trim() ?? "");
      setEnabled(json.nominatimEnabled);
      setUpdatedAt(json.updatedAt);
    } catch {
      setError("Could not load geolocation settings.");
    } finally {
      setLoading(false);
    }
  }, [authHeaders, refreshSession, logout]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = window.setTimeout(() => setGeoDebouncedQuery(geoTestQuery.trim()), GEO_TEST_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [geoTestQuery]);

  useEffect(() => {
    if (!enabled) {
      setGeoTestOpen(false);
      setGeoTestResults([]);
      setGeoTestLoading(false);
      setGeoTestError("");
      setGeoTestSelected(null);
    }
  }, [enabled]);

  const fetchGeoSuggestions = useCallback(async () => {
    const q = geoDebouncedQuery;
    if (q.length < GEO_TEST_MIN_CHARS || !enabled) {
      setGeoTestResults([]);
      setGeoTestLoading(false);
      setGeoTestError("");
      return;
    }
    setGeoTestLoading(true);
    setGeoTestError("");
    try {
      const p = new URLSearchParams({ q, limit: String(GEO_TEST_SUGGESTION_LIMIT) });
      let res = await fetch(`${API_BASE_URL}/platform/integrations/geolocation/test?${p.toString()}`, {
        headers: authHeaders()
      });
      if (res.status === 401) {
        const ok = await refreshSession();
        if (!ok) {
          logout();
          return;
        }
        res = await fetch(`${API_BASE_URL}/platform/integrations/geolocation/test?${p.toString()}`, {
          headers: authHeaders()
        });
      }
      const body = (await res.json().catch(() => null)) as { message?: string; results?: unknown } | null;
      if (!res.ok) {
        setGeoTestError(body?.message ?? "Search failed.");
        setGeoTestResults([]);
        return;
      }
      setGeoTestResults(nominatimHitsFromResults(body?.results));
    } catch {
      setGeoTestError("Search failed.");
      setGeoTestResults([]);
    } finally {
      setGeoTestLoading(false);
    }
  }, [geoDebouncedQuery, enabled, authHeaders, refreshSession, logout]);

  useEffect(() => {
    void fetchGeoSuggestions();
  }, [fetchGeoSuggestions]);

  useEffect(() => {
    if (!geoTestOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (geoTestRootRef.current?.contains(t)) return;
      setGeoTestOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [geoTestOpen]);

  const putGeolocation = useCallback(
    async (body: {
      nominatimBaseUrl: string;
      nominatimContactEmail: string | null;
      nominatimEnabled: boolean;
    }): Promise<boolean> => {
      let res = await fetch(`${API_BASE_URL}/platform/integrations/geolocation`, {
        method: "PUT",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      if (res.status === 401) {
        const ok = await refreshSession();
        if (!ok) {
          logout();
          return false;
        }
        res = await fetch(`${API_BASE_URL}/platform/integrations/geolocation`, {
          method: "PUT",
          headers: { ...authHeaders(), "content-type": "application/json" },
          body: JSON.stringify(body)
        });
      }
      const j = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) {
        setSaveError(j?.message ?? "Could not save settings.");
        return false;
      }
      const json = j as GeolocationResponse | null;
      if (json?.updatedAt) setUpdatedAt(json.updatedAt);
      return true;
    },
    [authHeaders, refreshSession, logout]
  );

  const saveConfiguration = useCallback(async () => {
    setSaveError("");
    setSaving(true);
    try {
      const ok = await putGeolocation({
        nominatimBaseUrl: baseUrl.trim(),
        nominatimContactEmail: contactEmail.trim() === "" ? null : contactEmail.trim(),
        nominatimEnabled: enabled
      });
      if (!ok) return;
      await load();
    } catch {
      setSaveError("Could not save settings.");
    } finally {
      setSaving(false);
    }
  }, [baseUrl, contactEmail, enabled, load, putGeolocation]);

  const toggleGeolocationEnabled = useCallback(
    async (next: boolean) => {
      const prev = enabled;
      setEnabled(next);
      setSaveError("");
      setToggleBusy(true);
      try {
        const ok = await putGeolocation({
          nominatimBaseUrl: baseUrl.trim(),
          nominatimContactEmail: contactEmail.trim() === "" ? null : contactEmail.trim(),
          nominatimEnabled: next
        });
        if (!ok) {
          setEnabled(prev);
          return;
        }
        await load();
      } catch {
        setEnabled(prev);
        setSaveError("Could not save enable state.");
      } finally {
        setToggleBusy(false);
      }
    },
    [baseUrl, contactEmail, enabled, load, putGeolocation]
  );

  if (loading) {
    return <p className="text-sm text-stone-500">Loading…</p>;
  }

  return (
    <div className="w-full space-y-8">
      <p className="leading-relaxed text-slate-600">
        Configure platform-wide integrations. Each tab groups one integration area; enable the feature, adjust
        configuration, then validate with the test tools.
      </p>

      {error ? (
        <p className="text-sm text-rose-600" role="alert">
          {error}
        </p>
      ) : null}

      <div className="border-b border-stone-200">
        <div
          id={tabListId}
          role="tablist"
          aria-label="Integration categories"
          className="flex flex-wrap gap-1"
        >
          {INTEGRATION_TABS.map((tab) => {
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`super-integ-tab-${tab.id}`}
                aria-selected={selected}
                aria-controls={`super-integ-panel-${tab.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                className={[
                  "rounded-t-lg border border-b-0 px-4 py-2.5 text-sm font-semibold transition-colors",
                  selected
                    ? "relative z-[1] border-stone-200 bg-white text-indigo-900 shadow-[0_1px_0_0_white]"
                    : "border-transparent bg-transparent text-stone-600 hover:bg-stone-50 hover:text-stone-900"
                ].join(" ")}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === "geolocations" ? (
        <div
          id="super-integ-panel-geolocations"
          role="tabpanel"
          aria-labelledby="super-integ-tab-geolocations"
          className="space-y-8"
        >
          {saveError ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
              {saveError}
            </p>
          ) : null}
          <section
            className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm ring-1 ring-slate-900/5"
            aria-labelledby="super-integ-geo-enable-heading"
          >
            <div className="flex flex-col sm:flex-row sm:items-stretch">
              <div className="min-w-0 flex-1 p-5 sm:p-6">
                <h2 id="super-integ-geo-enable-heading" className="text-sm font-semibold text-slate-900">
                  Geolocation services
                </h2>
                <p className="mt-1 text-sm text-stone-600">
                  When enabled, tenant APIs can call Nominatim-backed geocode search (same behavior as{" "}
                  <code className="rounded bg-stone-100 px-1 py-0.5 text-xs">GET /tenant/crm/geocode/search</code>
                  ). When disabled, those requests return a service-unavailable response. Use the{" "}
                  <strong className="font-semibold text-slate-800">toggle</strong> in the gray strip; changes apply
                  immediately when you flip it.
                </p>
              </div>
              <div className="mx-auto flex w-[8%] min-w-16 max-w-full shrink-0 items-center justify-center border-t border-stone-200/90 bg-stone-100 px-1 py-3 sm:mx-0 sm:flex-none sm:border-l sm:border-t-0 sm:px-1.5 sm:py-4">
                <Switch
                  checked={enabled}
                  disabled={toggleBusy || saving}
                  aria-busy={toggleBusy}
                  aria-label={enabled ? "Geolocation services, on" : "Geolocation services, off"}
                  onCheckedChange={(next) => void toggleGeolocationEnabled(next)}
                />
              </div>
            </div>
          </section>

          <section
            className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm ring-1 ring-slate-900/5"
            aria-labelledby="super-integ-geo-config-heading"
          >
            <h2 id="super-integ-geo-config-heading" className="text-sm font-semibold text-slate-900">
              Nominatim configuration
            </h2>
            <p className="mt-1 text-sm text-stone-600">
              OpenStreetMap&apos;s search API. Respect{" "}
              <a
                href="https://operations.osmfoundation.org/policies/nominatim/"
                className="font-medium text-indigo-700 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-900"
                target="_blank"
                rel="noreferrer"
              >
                usage policy
              </a>{" "}
              and provide a contact email for the HTTP User-Agent when calling the public instance.
            </p>

            <div className="mt-5 grid gap-4">
              <div>
                <label htmlFor="super-integ-nominatim-base" className="mb-1.5 block text-xs font-medium text-stone-600">
                  Base URL
                </label>
                <input
                  id="super-integ-nominatim-base"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  className={inputClass}
                  placeholder="https://nominatim.openstreetmap.org"
                  autoComplete="off"
                />
              </div>
              <div>
                <label htmlFor="super-integ-nominatim-email" className="mb-1.5 block text-xs font-medium text-stone-600">
                  Application contact email
                </label>
                <input
                  id="super-integ-nominatim-email"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className={inputClass}
                  placeholder="ops@yourcompany.com"
                  autoComplete="email"
                />
                <p className="mt-1.5 text-xs text-stone-500">
                  Used in API User-Agent metadata when calling Nominatim (recommended by OSM).
                </p>
              </div>
            </div>

            <p className="mt-4 rounded-lg border border-dashed border-stone-200 bg-stone-50/80 px-3 py-2 text-xs text-stone-600">
              <strong className="font-semibold text-slate-800">Caching:</strong> responses are stored in the
              configured cache backend (Redis or database via <code className="text-[11px]">QUEUE_STRATEGY</code>;
              default <code className="text-[11px]">external</code> / Redis). TTL:{" "}
              <code className="text-[11px]">NOMINATIM_CACHE_TTL_SECONDS</code> (default 180 days / 15,552,000s). If the
              cache backend is unavailable, calls still reach Nominatim but are not cached.
            </p>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              {updatedAt ? (
                <p className="text-xs text-stone-500">Last updated {formatDateTime(updatedAt)}</p>
              ) : (
                <span />
              )}
              <button
                type="button"
                disabled={saving || toggleBusy}
                onClick={() => void saveConfiguration()}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                Save configuration
              </button>
            </div>
          </section>

          <section
            className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm ring-1 ring-slate-900/5"
            aria-labelledby="super-integ-geo-test-heading"
          >
            <h2 id="super-integ-geo-test-heading" className="text-sm font-semibold text-slate-900">
              Test address search
            </h2>
            <p className="mt-1 text-sm text-stone-600">
              Same Nominatim forward search and server-side caching as production. Type a full or partial address; matching
              places appear in a dropdown ({GEO_TEST_SUGGESTION_LIMIT} results). Requires geolocation services to be
              enabled above.
            </p>
            <div ref={geoTestRootRef} className="relative mt-6">
              <label htmlFor={geoTestInputId} className="mb-1.5 block text-xs font-medium text-stone-600">
                Search address
              </label>
              <div className="relative">
                <input
                  id={geoTestInputId}
                  role="combobox"
                  aria-expanded={geoTestOpen}
                  aria-controls={geoTestListboxId}
                  aria-autocomplete="list"
                  value={geoTestQuery}
                  disabled={!enabled}
                  onChange={(e) => {
                    setGeoTestQuery(e.target.value);
                    setGeoTestOpen(true);
                    setGeoTestSelected(null);
                  }}
                  onFocus={() => {
                    if (enabled) setGeoTestOpen(true);
                  }}
                  className={[inputClass, "pr-10"].join(" ")}
                  placeholder="e.g. 1600 Amphitheatre Parkway, Mountain View, CA 94043, United States"
                  autoComplete="off"
                />
                {geoTestLoading ? (
                  <Loader2
                    className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-stone-400"
                    aria-hidden
                  />
                ) : null}
              </div>
              {geoTestError && !geoTestOpen && enabled ? (
                <p className="mt-2 text-sm text-rose-600" role="alert">
                  {geoTestError}
                </p>
              ) : null}
              {geoTestOpen && enabled ? (
                <ul
                  id={geoTestListboxId}
                  role="listbox"
                  aria-label="Address suggestions"
                  className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-stone-200 bg-white py-1 shadow-lg ring-1 ring-slate-900/5"
                >
                  {geoDebouncedQuery.length < GEO_TEST_MIN_CHARS ? (
                    <li className="px-3 py-2.5 text-sm text-stone-500">
                      Keep typing — at least {GEO_TEST_MIN_CHARS} characters to search.
                    </li>
                  ) : geoTestLoading ? (
                    <li className="px-3 py-2.5 text-sm text-stone-500">Searching…</li>
                  ) : geoTestError ? (
                    <li className="px-3 py-2.5 text-sm text-rose-600" role="alert">
                      {geoTestError}
                    </li>
                  ) : geoTestResults.length === 0 ? (
                    <li className="px-3 py-2.5 text-sm text-stone-500">No matching places.</li>
                  ) : (
                    geoTestResults.map((hit, idx) => {
                      const title = nominatimHitPrimaryLabel(hit);
                      const coords = nominatimHitCoordsLine(hit);
                      return (
                        <li key={`${idx}-${title.slice(0, 48)}`} role="presentation">
                          <button
                            type="button"
                            role="option"
                            className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-stone-50"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setGeoTestSelected(hit);
                              setGeoTestQuery(title);
                              setGeoTestOpen(false);
                            }}
                          >
                            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden strokeWidth={2} />
                            <span className="min-w-0 flex-1">
                              <span className="block break-words text-stone-900">{title}</span>
                              {coords ? (
                                <span className="mt-0.5 block text-xs text-stone-500">{coords}</span>
                              ) : null}
                            </span>
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              ) : null}
              {!enabled ? (
                <p className="mt-2 text-xs text-stone-500">Turn on geolocation services to use address search.</p>
              ) : null}
              {geoTestSelected ? (
                <div className="mt-4 rounded-lg border border-stone-200 bg-stone-50/80 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-600">Selected result</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">{nominatimHitPrimaryLabel(geoTestSelected)}</p>
                  {nominatimHitCoordsLine(geoTestSelected) ? (
                    <p className="mt-1 font-mono text-xs text-stone-600">{nominatimHitCoordsLine(geoTestSelected)}</p>
                  ) : null}
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-medium text-indigo-700 hover:text-indigo-900">
                      Raw JSON (one hit)
                    </summary>
                    <pre className="mt-2 max-h-48 overflow-auto rounded-md border border-stone-200 bg-stone-950/95 p-3 text-xs leading-relaxed text-emerald-100">
                      {JSON.stringify(geoTestSelected, null, 2)}
                    </pre>
                  </details>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      {activeTab === "payments" ? <SuperIntegrationsPaymentsPanel /> : null}
    </div>
  );
};
