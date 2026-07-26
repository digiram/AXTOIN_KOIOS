/**
 * Admin System page.
 *
 * Tenant tenant admin screen mounted under AppShell at /admin.
 *
 * Responsibilities:
 * - Load and render primary tenant admin data for the route
 * - Wire user actions to tenant API endpoints
 * - Compose shared module components and modals
 *
 * Related:
 * - Route: /admin
 *
 * Security:
 * - Tenant-scoped API calls via authenticated session
 */
import type { CrmEntityKind } from "@starter/shared";
import { Check, Shield, Trash2, UserPlus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext.js";
import { Switch } from "../../components/Switch.js";
import { API_BASE_URL } from "../../lib/api.js";
import { CrmOrganizationSegmentationTabPanel } from "../crm/CrmOrganizationSegmentationSettingsPage.js";
import { useCrmModuleAvailability } from "../crm/useCrmModuleAvailability.js";
import { TenantSubscriptionSettingsPanel } from "./TenantSubscriptionSettingsPanel.js";
import { TenantSmtpSettingsPanel } from "./TenantSmtpSettingsPanel.js";

type SystemTabId = "general" | "email" | "relationshipTypes" | "marketSegments" | "subscription";

const systemTabFromParam = (raw: string | null): SystemTabId | null => {
  if (raw === "email" || raw === "relationshipTypes" || raw === "marketSegments" || raw === "subscription") {
    return raw;
  }
  return null;
};

const systemTabAriaLabelledBy = (tab: SystemTabId): string => {
  switch (tab) {
    case "general":
      return "admin-system-tab-general";
    case "email":
      return "admin-system-tab-email";
    case "relationshipTypes":
      return "admin-system-tab-relationship-types";
    case "marketSegments":
      return "admin-system-tab-market-segments";
    case "subscription":
      return "admin-system-tab-subscription";
  }
};

/** Gray rail next to section titles (matches account settings sections). */
const sectionHeadingAccentClass = "border-l-4 border-slate-200 pl-4";

type RelTypeRow = {
  id: string;
  name: string;
  reverseName: string;
  sourceEntityKind: string;
  targetEntityKind: string;
  isSystem: boolean;
  relationshipUsageCount: number;
  createdByUserId: string | null;
  createdAt: string;
};

const kindLabel = (k: string) => (k === "ORGANIZATION" ? "Organization" : k === "CONTACT" ? "Contact" : k);

const inputClass =
  "w-full rounded-lg border border-stone-200/90 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/25";

const tabListClass =
  "mt-6 flex w-full min-w-0 flex-nowrap gap-1 overflow-x-auto overflow-y-hidden rounded-full bg-slate-100 p-1 ring-1 ring-slate-900/5 [scrollbar-width:thin]";
const tabButtonBase =
  "min-h-[2.5rem] min-w-0 shrink-0 flex-1 rounded-full px-3 py-2 text-sm transition-all duration-200 sm:px-4";
const tabButtonActive = "bg-white font-semibold text-indigo-700 shadow-sm ring-1 ring-slate-200/80";
const tabButtonIdle = "font-medium text-slate-600 hover:bg-white/60 hover:text-slate-900";

/**
 * Tenant admin system configuration — tabbed shell (same pattern as account settings); body only (no duplicate page title).
 */
export const AdminSystemPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { getAccessToken, refreshSession, logout } = useAuth();
  const [subscriptionTabProbe, setSubscriptionTabProbe] = useState<"loading" | "ready">("loading");
  const [subscriptionTabVisible, setSubscriptionTabVisible] = useState(false);

  const authHeaders = useCallback(() => {
    const token = getAccessToken();
    const h: Record<string, string> = {};
    if (token) h.authorization = `Bearer ${token}`;
    return h;
  }, [getAccessToken]);

  useEffect(() => {
    let cancelled = false;
    setSubscriptionTabProbe("loading");
    (async () => {
      const doFetch = async (url: string) => {
        let res = await fetch(url, { headers: authHeaders() });
        if (res.status === 401) {
          const ok = await refreshSession();
          if (!ok) {
            logout();
            return null;
          }
          res = await fetch(url, { headers: authHeaders() });
        }
        return res;
      };
      try {
        const [cRes, sRes] = await Promise.all([
          doFetch(`${API_BASE_URL}/tenant/subscription/catalog`),
          doFetch(`${API_BASE_URL}/tenant/subscription`)
        ]);
        if (cancelled) return;
        if (!cRes?.ok || !sRes?.ok) {
          setSubscriptionTabVisible(false);
          setSubscriptionTabProbe("ready");
          return;
        }
        const cj = (await cRes.json()) as { plans?: unknown[] };
        const sj = (await sRes.json()) as { subscription?: unknown | null; subscriptionsEnabled?: boolean };
        const plans = Array.isArray(cj.plans) ? cj.plans : [];
        const hasSub = sj.subscription != null;
        const billingEnabled = sj.subscriptionsEnabled === true;
        setSubscriptionTabVisible(billingEnabled && (hasSub || plans.length > 0));
        setSubscriptionTabProbe("ready");
      } catch {
        if (!cancelled) {
          setSubscriptionTabVisible(false);
          setSubscriptionTabProbe("ready");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authHeaders, refreshSession, logout]);

  const showSubscriptionTab = subscriptionTabProbe === "ready" && subscriptionTabVisible;

  const tabFromUrl = systemTabFromParam(searchParams.get("tab"));
  const tab: SystemTabId =
    tabFromUrl === "subscription" && !showSubscriptionTab
      ? "general"
      : tabFromUrl ?? "general";

  const setTab = (next: SystemTabId) => {
    const params = new URLSearchParams(searchParams);
    if (next === "general") {
      params.delete("tab");
    } else {
      params.set("tab", next);
    }
    setSearchParams(params, { replace: true });
  };

  useEffect(() => {
    if (tabFromUrl !== "subscription") return;
    if (subscriptionTabProbe !== "ready") return;
    if (!subscriptionTabVisible) {
      setSearchParams(new URLSearchParams(), { replace: true });
    }
  }, [tabFromUrl, subscriptionTabProbe, subscriptionTabVisible, setSearchParams]);

  return (
    <div className="w-full">
      <div className={tabListClass} role="tablist" aria-label="System configuration sections">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "general"}
          id="admin-system-tab-general"
          onClick={() => setTab("general")}
          className={[tabButtonBase, tab === "general" ? tabButtonActive : tabButtonIdle].join(" ")}
        >
          General
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "email"}
          id="admin-system-tab-email"
          onClick={() => setTab("email")}
          className={[tabButtonBase, tab === "email" ? tabButtonActive : tabButtonIdle].join(" ")}
        >
          Outbound email
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "relationshipTypes"}
          id="admin-system-tab-relationship-types"
          onClick={() => setTab("relationshipTypes")}
          className={[tabButtonBase, tab === "relationshipTypes" ? tabButtonActive : tabButtonIdle].join(" ")}
        >
          Relationship types
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "marketSegments"}
          id="admin-system-tab-market-segments"
          onClick={() => setTab("marketSegments")}
          className={[tabButtonBase, tab === "marketSegments" ? tabButtonActive : tabButtonIdle].join(" ")}
        >
          Market segments & tags
        </button>
        {showSubscriptionTab ? (
          <button
            type="button"
            role="tab"
            aria-selected={tab === "subscription"}
            id="admin-system-tab-subscription"
            onClick={() => setTab("subscription")}
            className={[tabButtonBase, tab === "subscription" ? tabButtonActive : tabButtonIdle].join(" ")}
          >
            Subscription
          </button>
        ) : null}
      </div>

      <div
        className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
        role="tabpanel"
        aria-labelledby={systemTabAriaLabelledBy(tab)}
      >
        {tab === "general" ? (
          <GeneralTabPanel />
        ) : tab === "email" ? (
          <EmailTabPanel />
        ) : tab === "relationshipTypes" ? (
          <RelationshipTypesTabPanel />
        ) : tab === "marketSegments" ? (
          <MarketSegmentsTabPanel />
        ) : tab === "subscription" ? (
          subscriptionTabProbe === "loading" ? (
            <p className="text-sm text-slate-500">Loading subscription…</p>
          ) : showSubscriptionTab ? (
            <SubscriptionTabPanel />
          ) : null
        ) : null}
      </div>
    </div>
  );
};

const EmailTabPanel = () => (
  <div className="space-y-6 text-sm leading-relaxed text-stone-600">
    <p>
      Configure SMTP for welcome messages, MFA codes, password resets, and invoicing reminders. Leave host and from
      email empty to send through the platform operator&apos;s mail server instead.
    </p>
    <TenantSmtpSettingsPanel />
  </div>
);

const MarketSegmentsTabPanel = () => {
  const { crmEnabled, loading: crmAvailLoading, loadError: crmAvailError, reload: reloadCrmAvail } =
    useCrmModuleAvailability();

  if (crmAvailLoading) {
    return <p className="text-sm text-stone-500">Loading…</p>;
  }

  if (crmAvailError) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-rose-600">{crmAvailError}</p>
        <button
          type="button"
          className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 shadow-sm hover:bg-stone-50"
          onClick={() => void reloadCrmAvail()}
        >
          Retry
        </button>
      </div>
    );
  }

  if (crmEnabled === false) {
    return (
      <div className="space-y-3 text-sm text-stone-600">
        <p className="text-stone-800">
          Market segments and marketing tags cannot be managed while CRM is disabled for this platform. A platform
          operator can enable CRM under super-admin features.
        </p>
      </div>
    );
  }

  return <CrmOrganizationSegmentationTabPanel />;
};

const SubscriptionTabPanel = () => {
  const { getAccessToken, refreshSession, logout } = useAuth();
  const authHeaders = useCallback(() => {
    const token = getAccessToken();
    const h: Record<string, string> = {};
    if (token) h.authorization = `Bearer ${token}`;
    return h;
  }, [getAccessToken]);
  return <TenantSubscriptionSettingsPanel authHeaders={authHeaders} refreshSession={refreshSession} logout={logout} />;
};

const GeneralTabPanel = () => {
  const { getAccessToken, refreshSession, logout } = useAuth();

  const authHeaders = useCallback(() => {
    const token = getAccessToken();
    const h: Record<string, string> = {};
    if (token) h.authorization = `Bearer ${token}`;
    return h;
  }, [getAccessToken]);

  const [realmSelfRegisterEnabled, setRealmSelfRegisterEnabled] = useState(true);
  const [mfaEnforced, setMfaEnforced] = useState(false);
  const [mfaFeatureEnabled, setMfaFeatureEnabled] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsErr, setSettingsErr] = useState("");
  const [toggleBusy, setToggleBusy] = useState(false);
  const [toggleErr, setToggleErr] = useState("");
  const [mfaToggleBusy, setMfaToggleBusy] = useState(false);
  const [mfaToggleErr, setMfaToggleErr] = useState("");

  const loadSettings = useCallback(async () => {
    setSettingsErr("");
    setSettingsLoading(true);
    try {
      let res = await fetch(`${API_BASE_URL}/tenant/settings/general`, { headers: authHeaders() });
      if (res.status === 401) {
        const ok = await refreshSession();
        if (!ok) {
          logout();
          return;
        }
        res = await fetch(`${API_BASE_URL}/tenant/settings/general`, { headers: authHeaders() });
      }
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { message?: string } | null;
        setSettingsErr(j?.message ?? "Could not load realm settings.");
        return;
      }
      const json = (await res.json()) as {
        realmSelfRegisterEnabled?: boolean;
        mfaEnforced?: boolean;
        mfaFeatureEnabled?: boolean;
      };
      setRealmSelfRegisterEnabled(json.realmSelfRegisterEnabled !== false);
      setMfaEnforced(json.mfaEnforced === true);
      setMfaFeatureEnabled(json.mfaFeatureEnabled === true);
    } catch {
      setSettingsErr("Could not load realm settings.");
    } finally {
      setSettingsLoading(false);
    }
  }, [authHeaders, logout, refreshSession]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const toggleRealmSelfRegister = useCallback(
    async (next: boolean) => {
      const prev = realmSelfRegisterEnabled;
      setRealmSelfRegisterEnabled(next);
      setToggleErr("");
      setToggleBusy(true);
      try {
        let res = await fetch(`${API_BASE_URL}/tenant/settings/general`, {
          method: "PUT",
          headers: { ...authHeaders(), "content-type": "application/json" },
          body: JSON.stringify({ realmSelfRegisterEnabled: next })
        });
        if (res.status === 401) {
          const ok = await refreshSession();
          if (!ok) {
            logout();
            return;
          }
          res = await fetch(`${API_BASE_URL}/tenant/settings/general`, {
            method: "PUT",
            headers: { ...authHeaders(), "content-type": "application/json" },
            body: JSON.stringify({ realmSelfRegisterEnabled: next })
          });
        }
        const body = (await res.json().catch(() => null)) as {
          message?: string;
          realmSelfRegisterEnabled?: boolean;
        } | null;
        if (!res.ok) {
          setRealmSelfRegisterEnabled(prev);
          setToggleErr(body?.message ?? "Could not update setting.");
          return;
        }
        if (typeof body?.realmSelfRegisterEnabled === "boolean") {
          setRealmSelfRegisterEnabled(body.realmSelfRegisterEnabled);
        }
      } catch {
        setRealmSelfRegisterEnabled(prev);
        setToggleErr("Could not update setting.");
      } finally {
        setToggleBusy(false);
      }
    },
    [authHeaders, logout, refreshSession, realmSelfRegisterEnabled]
  );

  const toggleMfaEnforced = useCallback(
    async (next: boolean) => {
      const prev = mfaEnforced;
      setMfaEnforced(next);
      setMfaToggleErr("");
      setMfaToggleBusy(true);
      try {
        let res = await fetch(`${API_BASE_URL}/tenant/settings/general`, {
          method: "PUT",
          headers: { ...authHeaders(), "content-type": "application/json" },
          body: JSON.stringify({ mfaEnforced: next })
        });
        if (res.status === 401) {
          const ok = await refreshSession();
          if (!ok) {
            logout();
            return;
          }
          res = await fetch(`${API_BASE_URL}/tenant/settings/general`, {
            method: "PUT",
            headers: { ...authHeaders(), "content-type": "application/json" },
            body: JSON.stringify({ mfaEnforced: next })
          });
        }
        const body = (await res.json().catch(() => null)) as {
          message?: string;
          mfaEnforced?: boolean;
          mfaFeatureEnabled?: boolean;
        } | null;
        if (!res.ok) {
          setMfaEnforced(prev);
          setMfaToggleErr(body?.message ?? "Could not update MFA policy.");
          return;
        }
        if (typeof body?.mfaEnforced === "boolean") {
          setMfaEnforced(body.mfaEnforced);
        }
        if (typeof body?.mfaFeatureEnabled === "boolean") {
          setMfaFeatureEnabled(body.mfaFeatureEnabled);
        }
      } catch {
        setMfaEnforced(prev);
        setMfaToggleErr("Could not update MFA policy.");
      } finally {
        setMfaToggleBusy(false);
      }
    },
    [authHeaders, logout, refreshSession, mfaEnforced]
  );

  return (
    <div className="space-y-6 text-sm leading-relaxed text-stone-600">
      <p>
        Use the <span className="font-medium text-stone-800">Relationship types</span> tab for CRM link labels, the{" "}
        <span className="font-medium text-stone-800">Market segments & tags</span> tab for organization classification,
        and <span className="font-medium text-stone-800">Outbound email</span> for your organization&apos;s SMTP
        settings. Here you control whether people can create their own accounts for this organization from the public
        sign-up page, and whether members must enroll multi-factor authentication.
      </p>

      <div className="overflow-hidden rounded-xl border border-stone-200/90 bg-white shadow-sm ring-1 ring-slate-900/5">
        <div className="flex flex-col sm:flex-row sm:items-stretch">
          <div className="min-w-0 flex-1 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-900 ring-1 ring-amber-200/80">
                <UserPlus className="h-5 w-5" strokeWidth={2} aria-hidden />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-900">Self-service registration</h3>
                <p className="mt-1 text-sm text-stone-600">
                  Decide who may join this realm without an invite. With the toggle{" "}
                  <strong className="font-semibold text-slate-800">on</strong>, anyone who matches your email-domain
                  rules can sign up from the public page. With it{" "}
                  <strong className="font-semibold text-slate-800">off</strong>, the sign-up page rejects new users for
                  this organization and you add accounts yourself as tenant administrator (for example through your
                  usual onboarding process).
                </p>
                {settingsErr ? <p className="mt-2 text-sm text-rose-600">{settingsErr}</p> : null}
                {toggleErr ? <p className="mt-2 text-sm text-rose-600">{toggleErr}</p> : null}
              </div>
            </div>
          </div>
          <div className="mx-auto flex w-[8%] min-w-16 max-w-full shrink-0 items-center justify-center border-t border-stone-200/90 bg-stone-100 px-1 py-3 sm:mx-0 sm:flex-none sm:border-l sm:border-t-0 sm:px-1.5 sm:py-4">
            {settingsLoading || settingsErr ? null : (
              <Switch
                checked={realmSelfRegisterEnabled}
                disabled={toggleBusy}
                aria-busy={toggleBusy}
                aria-label={
                  realmSelfRegisterEnabled
                    ? "Realm self-service registration, on"
                    : "Realm self-service registration, off"
                }
                onCheckedChange={(next) => void toggleRealmSelfRegister(next)}
              />
            )}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-stone-200/90 bg-white shadow-sm ring-1 ring-slate-900/5">
        <div className="flex flex-col sm:flex-row sm:items-stretch">
          <div className="min-w-0 flex-1 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-800 ring-1 ring-slate-200/80">
                <Shield className="h-5 w-5" strokeWidth={2} aria-hidden />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-900">Require MFA for all members</h3>
                <p className="mt-1 text-sm text-stone-600">
                  When <strong className="font-semibold text-slate-800">on</strong>, everyone who signs in with a
                  password must add an authenticator or email MFA within seven days of their first password sign-in.
                  After that window, accounts that have not finished setup are blocked until you issue a new temporary
                  password from <span className="font-medium text-slate-800">Admin → Users</span> (which also clears
                  their MFA so they can enroll again). This only applies when the platform has turned on MFA under
                  super-admin features.
                </p>
                {!mfaFeatureEnabled ? (
                  <p className="mt-2 text-sm text-amber-900/90">
                    MFA is currently <span className="font-semibold">disabled at the platform</span>. A super admin must
                    enable it before you can enforce it for this realm.
                  </p>
                ) : null}
                {mfaToggleErr ? <p className="mt-2 text-sm text-rose-600">{mfaToggleErr}</p> : null}
              </div>
            </div>
          </div>
          <div className="mx-auto flex w-[8%] min-w-16 max-w-full shrink-0 items-center justify-center border-t border-stone-200/90 bg-stone-100 px-1 py-3 sm:mx-0 sm:flex-none sm:border-l sm:border-t-0 sm:px-1.5 sm:py-4">
            {settingsLoading || settingsErr ? null : (
              <Switch
                checked={mfaEnforced}
                disabled={mfaToggleBusy || !mfaFeatureEnabled}
                aria-busy={mfaToggleBusy}
                aria-label={mfaEnforced ? "Require MFA for realm members, on" : "Require MFA for realm members, off"}
                onCheckedChange={(next) => void toggleMfaEnforced(next)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const RelationshipTypesTabPanel = () => {
  const { getAccessToken, refreshSession, logout } = useAuth();
  const { crmEnabled, loading: crmAvailLoading, loadError: crmAvailError, reload: reloadCrmAvail } =
    useCrmModuleAvailability();

  const authHeaders = useCallback(() => {
    const token = getAccessToken();
    const h: Record<string, string> = {};
    if (token) h.authorization = `Bearer ${token}`;
    return h;
  }, [getAccessToken]);

  const [rows, setRows] = useState<RelTypeRow[]>([]);
  const [loadErr, setLoadErr] = useState("");
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [reverseName, setReverseName] = useState("");
  const [srcKind, setSrcKind] = useState<CrmEntityKind>("ORGANIZATION");
  const [tgtKind, setTgtKind] = useState<CrmEntityKind>("CONTACT");
  const [formErr, setFormErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteErr, setDeleteErr] = useState("");

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1;
      const sk = a.sourceEntityKind.localeCompare(b.sourceEntityKind);
      if (sk !== 0) return sk;
      const tk = a.targetEntityKind.localeCompare(b.targetEntityKind);
      if (tk !== 0) return tk;
      return a.name.localeCompare(b.name);
    });
  }, [rows]);

  const loadTypes = useCallback(async () => {
    setLoadErr("");
    setLoading(true);
    try {
      let res = await fetch(`${API_BASE_URL}/tenant/crm/relationship-types`, { headers: authHeaders() });
      if (res.status === 401) {
        const ok = await refreshSession();
        if (!ok) {
          logout();
          return;
        }
        res = await fetch(`${API_BASE_URL}/tenant/crm/relationship-types`, { headers: authHeaders() });
      }
      if (res.status === 403) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        if (j?.error === "feature_disabled") {
          setRows([]);
          setLoadErr("");
          return;
        }
      }
      if (!res.ok) {
        setLoadErr("Could not load relationship types.");
        return;
      }
      const json = (await res.json()) as { relationshipTypes: RelTypeRow[] };
      setRows(
        json.relationshipTypes.map((r) => ({
          ...r,
          reverseName: r.reverseName ?? r.name,
          isSystem: Boolean(r.isSystem),
          relationshipUsageCount: Number(r.relationshipUsageCount ?? 0)
        }))
      );
    } catch {
      setLoadErr("Could not load relationship types.");
    } finally {
      setLoading(false);
    }
  }, [authHeaders, logout, refreshSession]);

  useEffect(() => {
    if (crmEnabled !== true) return;
    void loadTypes();
  }, [crmEnabled, loadTypes]);

  const createType = async () => {
    setFormErr("");
    const forward = name.trim();
    if (!forward) {
      setFormErr("Enter a forward name.");
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: forward,
        sourceEntityKind: srcKind,
        targetEntityKind: tgtKind
      };
      const rev = reverseName.trim();
      if (rev !== "") body.reverseName = rev;

      let res = await fetch(`${API_BASE_URL}/tenant/crm/relationship-types`, {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      if (res.status === 401) {
        const ok = await refreshSession();
        if (!ok) {
          logout();
          return;
        }
        res = await fetch(`${API_BASE_URL}/tenant/crm/relationship-types`, {
          method: "POST",
          headers: { ...authHeaders(), "content-type": "application/json" },
          body: JSON.stringify(body)
        });
      }
      const j = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) {
        setFormErr(j?.message ?? "Could not create relationship type.");
        return;
      }
      setName("");
      setReverseName("");
      await loadTypes();
    } catch {
      setFormErr("Could not create relationship type.");
    } finally {
      setSaving(false);
    }
  };

  const cancelDeleteType = () => {
    setPendingDeleteId(null);
    setDeleteErr("");
  };

  const confirmDeleteType = async (id: string) => {
    setDeleteErr("");
    setDeleteBusy(true);
    try {
      let res = await fetch(`${API_BASE_URL}/tenant/crm/relationship-types/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: authHeaders()
      });
      if (res.status === 401) {
        const ok = await refreshSession();
        if (!ok) {
          logout();
          return;
        }
        res = await fetch(`${API_BASE_URL}/tenant/crm/relationship-types/${encodeURIComponent(id)}`, {
          method: "DELETE",
          headers: authHeaders()
        });
      }
      const j = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) {
        setDeleteErr(j?.message ?? "Could not delete relationship type.");
        return;
      }
      setPendingDeleteId(null);
      await loadTypes();
    } catch {
      setDeleteErr("Could not delete relationship type.");
    } finally {
      setDeleteBusy(false);
    }
  };

  if (crmAvailLoading) {
    return <p className="text-sm text-stone-500">Loading…</p>;
  }

  if (crmAvailError) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-rose-600">{crmAvailError}</p>
        <button
          type="button"
          className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 shadow-sm hover:bg-stone-50"
          onClick={() => void reloadCrmAvail()}
        >
          Retry
        </button>
      </div>
    );
  }

  if (crmEnabled === false) {
    return (
      <div className="space-y-3 text-sm text-stone-600">
        <p className="text-stone-800">
          Relationship types cannot be managed while CRM is disabled for this platform. A platform operator can enable
          CRM under super-admin features.
        </p>
        <p className="text-stone-500">See the Overview tab for more context.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <p className="text-sm leading-relaxed text-stone-600">
        Each type is a <span className="font-medium text-stone-800">directed</span> link: the{" "}
        <span className="font-medium text-stone-800">forward</span> label is shown when the record on the left is the
        source; the <span className="font-medium text-stone-800">reverse</span> label is shown when the record on the
        left is the target (the arrow runs source → target). Built-in types are seeded automatically; add custom
        types for your business.
      </p>

      <section className="space-y-4" aria-labelledby="crm-rt-add-heading">
        <div className={sectionHeadingAccentClass}>
          <h3 id="crm-rt-add-heading" className="text-sm font-semibold text-slate-800">
            Add custom type
          </h3>
        </div>
        <p className="text-sm text-stone-600">
          Choose which entity kinds sit on the left (source) and right (target), then name the edge in each direction.
          Names must be unique per direction pair and cannot use reserved built-in labels.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="crm-rt-src" className="mb-1.5 block text-xs font-medium text-stone-600">
              Source entity (left side of forward arrow)
            </label>
            <select
              id="crm-rt-src"
              value={srcKind}
              onChange={(e) => setSrcKind(e.target.value as CrmEntityKind)}
              className={inputClass}
            >
              <option value="ORGANIZATION">Organization</option>
              <option value="CONTACT">Contact</option>
            </select>
          </div>
          <div>
            <label htmlFor="crm-rt-tgt" className="mb-1.5 block text-xs font-medium text-stone-600">
              Target entity (right side of forward arrow)
            </label>
            <select
              id="crm-rt-tgt"
              value={tgtKind}
              onChange={(e) => setTgtKind(e.target.value as CrmEntityKind)}
              className={inputClass}
            >
              <option value="ORGANIZATION">Organization</option>
              <option value="CONTACT">Contact</option>
            </select>
          </div>
          <div>
            <label htmlFor="crm-rt-name" className="mb-1.5 block text-xs font-medium text-stone-600">
              Forward label <span className="font-normal text-stone-500">(source → target)</span>
            </label>
            <input
              id="crm-rt-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              placeholder="e.g. Advises"
              autoComplete="off"
            />
          </div>
          <div>
            <label htmlFor="crm-rt-rev" className="mb-1.5 block text-xs font-medium text-stone-600">
              Reverse label <span className="font-normal text-stone-500">(target → source)</span>
            </label>
            <input
              id="crm-rt-rev"
              value={reverseName}
              onChange={(e) => setReverseName(e.target.value)}
              className={inputClass}
              placeholder="Defaults to forward label"
              autoComplete="off"
            />
          </div>
        </div>
        {formErr ? (
          <p className="text-sm text-rose-600" role="alert">
            {formErr}
          </p>
        ) : null}
        <button
          type="button"
          disabled={saving || name.trim().length === 0}
          onClick={() => void createType()}
          className="rounded-lg border border-amber-300/80 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-950 shadow-sm hover:bg-amber-100 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Create type"}
        </button>
      </section>

      <section className="space-y-4" aria-labelledby="crm-rt-list-heading">
        <div className={sectionHeadingAccentClass}>
          <h3 id="crm-rt-list-heading" className="text-sm font-semibold text-slate-800">
            All types
          </h3>
        </div>
        {deleteErr ? (
          <p className="text-sm text-rose-600" role="alert">
            {deleteErr}
          </p>
        ) : null}
        {loading ? (
          <p className="text-sm text-stone-500">Loading…</p>
        ) : loadErr ? (
          <p className="text-sm text-rose-600">{loadErr}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-stone-200/90 shadow-sm">
            <table className="min-w-full divide-y divide-stone-200 text-left text-sm">
              <thead className="bg-stone-50/90 text-xs font-semibold uppercase tracking-wide text-stone-600">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Source → target
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Forward <span className="font-normal normal-case text-stone-500">(→)</span>
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Reverse <span className="font-normal normal-case text-stone-500">(←)</span>
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Uses
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Kind
                  </th>
                  <th scope="col" className="w-[4.5rem] min-w-[4.5rem] max-w-[4.5rem] px-0 py-3 text-left">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 bg-white text-stone-800">
                {sortedRows.map((r, idx) =>
                  pendingDeleteId === r.id ? (
                    <tr
                      key={r.id}
                      className={[idx % 2 === 0 ? "bg-white" : "bg-stone-50/40", "relative z-[1]"].join(" ")}
                    >
                      <td colSpan={5} className="relative border-2 border-amber-400 border-r-0 p-0 align-middle">
                        <div className="pointer-events-none absolute inset-0 bg-white" aria-hidden />
                        <div className="relative flex min-h-[2.75rem] flex-col justify-center px-4 py-3 pr-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
                          <p className="text-sm font-medium text-slate-800">
                            Delete custom type &ldquo;{r.name}&rdquo;?{" "}
                            <span className="font-normal text-stone-600">
                              {r.relationshipUsageCount > 0 ? (
                                <>
                                  {r.relationshipUsageCount} existing{" "}
                                  {r.relationshipUsageCount === 1 ? "relationship" : "relationships"} will be relabeled
                                  as the built-in <span className="font-medium text-stone-800">Other</span> type for
                                  this direction.
                                </>
                              ) : (
                                <>No relationships use this type.</>
                              )}
                            </span>
                          </p>
                        </div>
                      </td>
                      <td className="relative border-2 border-l-0 border-amber-400 p-0 align-top text-sm">
                        <div className="flex min-h-[2.75rem] w-[4.5rem]">
                          <button
                            type="button"
                            title="Cancel"
                            aria-label="Cancel delete"
                            disabled={deleteBusy}
                            onClick={cancelDeleteType}
                            className="flex flex-1 items-center justify-center bg-rose-100 text-rose-900 transition hover:bg-rose-200 focus:outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rose-400/80 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <X className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2} />
                          </button>
                          <button
                            type="button"
                            title="Confirm delete"
                            aria-label={`Confirm delete type ${r.name}`}
                            disabled={deleteBusy}
                            onClick={() => void confirmDeleteType(r.id)}
                            className="flex flex-1 items-center justify-center bg-emerald-100 text-emerald-900 transition hover:bg-emerald-200 focus:outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/80 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Check className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr
                      key={r.id}
                      className={[idx % 2 === 0 ? "bg-white" : "bg-stone-50/40", "transition-colors hover:bg-stone-50/90"].join(
                        " "
                      )}
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-stone-700">
                        <span className="font-medium text-stone-900">{kindLabel(r.sourceEntityKind)}</span>
                        <span className="text-stone-400"> → </span>
                        <span className="font-medium text-stone-900">{kindLabel(r.targetEntityKind)}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-medium">{r.name}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-stone-700">{r.reverseName}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-stone-700">
                        {r.relationshipUsageCount}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {r.isSystem ? (
                          <span className="rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-xs font-medium text-stone-700">
                            Built-in
                          </span>
                        ) : (
                          <span className="rounded-full border border-amber-200/90 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-950">
                            Custom
                          </span>
                        )}
                      </td>
                      <td className="border-l border-stone-200 p-0 align-top text-sm">
                        {!r.isSystem ? (
                          <div className="flex min-h-[2.75rem] w-[4.5rem]">
                            <button
                              type="button"
                              title={
                                r.relationshipUsageCount > 0
                                  ? "Delete type; relationships become Other for this direction"
                                  : "Delete relationship type"
                              }
                              aria-label={`Delete relationship type ${r.name}`}
                              disabled={Boolean(pendingDeleteId) && pendingDeleteId !== r.id}
                              onClick={() => {
                                setDeleteErr("");
                                setPendingDeleteId(r.id);
                              }}
                              className="flex w-full items-center justify-center bg-stone-100 text-stone-800 transition hover:bg-stone-200 focus:outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-stone-400/80 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <Trash2 className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2} />
                            </button>
                          </div>
                        ) : (
                          <div className="min-h-[2.75rem] w-[4.5rem]" />
                        )}
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
            {sortedRows.length === 0 ? (
              <p className="border-t border-stone-100 bg-white px-4 py-6 text-center text-sm text-stone-500">
                No relationship types returned.
              </p>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
};
