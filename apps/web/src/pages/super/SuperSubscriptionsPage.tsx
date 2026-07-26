/**
 * Super Subscriptions page.
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
import { Check, ChevronLeft, ChevronRight, Download, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";

import { useAuth } from "../../auth/AuthContext.js";
import { AutosaveFieldWrap } from "../../components/AutosaveFieldWrap.js";
import { SearchableCurrencySelect } from "../../components/SearchableCurrencySelect.js";
import { Switch } from "../../components/Switch.js";
import { AUTOSAVE_UI_RESET_MS, type AutosaveUiStatus } from "../../components/autosave-status-ui.js";
import { authLabelClass } from "../../components/auth/fieldStyles.js";
import { useUserDisplayDatetime } from "../../hooks/useUserDisplayDatetime.js";
import { API_BASE_URL } from "../../lib/api.js";
import { bindTableRowPrimaryAction, tableRowClickableClass } from "../../lib/tableRowAction.js";
import {
  superDataTableClass,
  superDataTableEmptyCellClass,
  superDataTableEmptyRowClass,
  superDataTableOuterClass,
  superDataTableRowClass,
  superDataTableTbodyClass,
  superDataTableThClass,
  superDataTableTheadClass,
  superDataTableUsersActionsThClass,
  superDataTableUsersActionsTdClass
} from "./superDataTableStyles.js";
import { SubscriptionPlanTierModal, type PlanDto } from "./SubscriptionPlanTierModal.js";

const SUB_TABS = [
  { id: "subscriptions" as const, label: "Subscriptions" },
  { id: "catalog_audit" as const, label: "Catalog audit" },
  { id: "configuration" as const, label: "Configuration" }
];

type TabId = (typeof SUB_TABS)[number]["id"];

type SubscriptionSettingsDto = {
  subscriptionsEnabled: boolean;
  subscriptionCurrencyCode: string;
  subscriptionCurrencyLocked: boolean;
  updatedAt: string;
};

type PaymentDto = {
  id: string;
  planId: string | null;
  tenantId: string;
  userId: string | null;
  amountCents: number;
  currencyCode: string;
  status: string;
  dueAt: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
  reimbursedAt: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  tenantName: string;
  userEmail: string | null;
  tierName: string | null;
};

type PlanCatalogAuditEntryDto = {
  id: string;
  createdAt: string;
  action: string;
  planId: string | null;
  actorUserId: string | null;
  summary: string;
  detailJson: string | null;
};

const PAYMENT_STATUSES = [
  "",
  "outstanding",
  "due",
  "overdue",
  "paid",
  "cancelled",
  "reimbursed"
] as const;

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;

const isUuid = (s: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s.trim());

const statusBadgeClass = (status: string): string => {
  const s = status.toLowerCase();
  if (s === "paid") return "bg-emerald-100 text-emerald-900 ring-emerald-600/15";
  if (s === "overdue") return "bg-rose-100 text-rose-900 ring-rose-600/15";
  if (s === "due" || s === "outstanding") return "bg-amber-100 text-amber-950 ring-amber-600/15";
  if (s === "cancelled") return "bg-slate-200 text-slate-800 ring-slate-600/15";
  if (s === "reimbursed") return "bg-violet-100 text-violet-900 ring-violet-600/15";
  return "bg-stone-100 text-stone-800 ring-stone-600/10";
};

const formatMoney = (cents: number, currency: string) =>
  (cents / 100).toLocaleString(undefined, { style: "currency", currency: currency || "USD" });

const planDurationLabel = (plan: PlanDto) => {
  const u = plan.durationUnit === "day" ? "day" : plan.durationUnit === "month" ? "month" : "year";
  return `${plan.durationCount} ${u}${plan.durationCount === 1 ? "" : "s"}`;
};

/** Route page component for tenant super-admin under AppShell. */
export const SuperSubscriptionsPage = () => {
  const { getAccessToken, refreshSession, logout } = useAuth();
  const { formatDateTime } = useUserDisplayDatetime();
  const tabListId = useId();
  const [activeTab, setActiveTab] = useState<TabId>("subscriptions");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [subscriptionsEnabled, setSubscriptionsEnabled] = useState(false);
  const [subscriptionCurrencyCode, setSubscriptionCurrencyCode] = useState("USD");
  const [subscriptionCurrencyLocked, setSubscriptionCurrencyLocked] = useState(false);
  const [subscriptionCurrencyDraft, setSubscriptionCurrencyDraft] = useState("USD");
  const [settingsUpdatedAt, setSettingsUpdatedAt] = useState<string | null>(null);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [settingsErr, setSettingsErr] = useState("");
  const [subscriptionCurrencyAutosaveUi, setSubscriptionCurrencyAutosaveUi] = useState<AutosaveUiStatus>("idle");
  const subscriptionCurrencyFieldId = useId();

  const [plans, setPlans] = useState<PlanDto[]>([]);
  const [payments, setPayments] = useState<PaymentDto[]>([]);
  const [paymentsTotal, setPaymentsTotal] = useState(0);
  const [paymentsLimit, setPaymentsLimit] = useState(50);
  const [paymentsOffset, setPaymentsOffset] = useState(0);
  const [paymentsBusy, setPaymentsBusy] = useState(false);
  const [paymentsErr, setPaymentsErr] = useState("");
  const [paymentDevDeleteEnabled, setPaymentDevDeleteEnabled] = useState(false);
  const [pendingDeletePaymentId, setPendingDeletePaymentId] = useState<string | null>(null);
  const [paymentDeleteBusy, setPaymentDeleteBusy] = useState(false);
  const [paymentDeleteErr, setPaymentDeleteErr] = useState("");
  const [draftTenantId, setDraftTenantId] = useState("");
  const [appliedTenantId, setAppliedTenantId] = useState("");
  const [draftStatus, setDraftStatus] = useState<string>("");
  const [appliedStatus, setAppliedStatus] = useState<string>("");
  const [draftCreatedFrom, setDraftCreatedFrom] = useState("");
  const [appliedCreatedFrom, setAppliedCreatedFrom] = useState("");
  const [draftCreatedTo, setDraftCreatedTo] = useState("");
  const [appliedCreatedTo, setAppliedCreatedTo] = useState("");
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(50);
  const [pageIndex, setPageIndex] = useState(0);
  const [exportBusy, setExportBusy] = useState(false);
  const [filterApplyErr, setFilterApplyErr] = useState("");

  const [auditEntries, setAuditEntries] = useState<PlanCatalogAuditEntryDto[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditOffset, setAuditOffset] = useState(0);
  const [auditLimit] = useState(50);
  const [auditBusy, setAuditBusy] = useState(false);
  const [auditErr, setAuditErr] = useState("");

  const [planModal, setPlanModal] = useState<null | { mode: "create" } | { mode: "edit"; plan: PlanDto }>(null);

  const authHeaders = useCallback(() => {
    const token = getAccessToken();
    const h: Record<string, string> = {};
    if (token) h.authorization = `Bearer ${token}`;
    return h;
  }, [getAccessToken]);

  const loadSettings = useCallback(async () => {
    let res = await fetch(`${API_BASE_URL}/platform/subscriptions/settings`, { headers: authHeaders() });
    if (res.status === 401) {
      if (!(await refreshSession())) {
        logout();
        return;
      }
      res = await fetch(`${API_BASE_URL}/platform/subscriptions/settings`, { headers: authHeaders() });
    }
    if (!res.ok) return;
    const j = (await res.json()) as SubscriptionSettingsDto;
    setSubscriptionsEnabled(j.subscriptionsEnabled);
    setSubscriptionCurrencyCode(j.subscriptionCurrencyCode ?? "USD");
    setSubscriptionCurrencyLocked(Boolean(j.subscriptionCurrencyLocked));
    setSubscriptionCurrencyDraft((j.subscriptionCurrencyCode ?? "USD").trim().toUpperCase());
    setSettingsUpdatedAt(j.updatedAt);
  }, [authHeaders, logout, refreshSession]);

  const loadPlans = useCallback(async () => {
    let res = await fetch(`${API_BASE_URL}/platform/subscriptions/plans`, { headers: authHeaders() });
    if (res.status === 401) {
      if (!(await refreshSession())) {
        logout();
        return;
      }
      res = await fetch(`${API_BASE_URL}/platform/subscriptions/plans`, { headers: authHeaders() });
    }
    if (!res.ok) return;
    const j = (await res.json()) as { plans: PlanDto[] };
    setPlans(j.plans ?? []);
  }, [authHeaders, logout, refreshSession]);

  const loadPayments = useCallback(async () => {
    setPaymentsErr("");
    setPaymentsBusy(true);
    const offset = pageIndex * pageSize;
    const sp = new URLSearchParams();
    sp.set("limit", String(pageSize));
    sp.set("offset", String(offset));
    if (appliedTenantId.trim()) sp.set("tenantId", appliedTenantId.trim());
    if (appliedStatus) sp.set("status", appliedStatus);
    if (appliedCreatedFrom.trim()) {
      const d = new Date(appliedCreatedFrom);
      if (!Number.isNaN(d.getTime())) sp.set("createdFrom", d.toISOString());
    }
    if (appliedCreatedTo.trim()) {
      const d = new Date(appliedCreatedTo);
      if (!Number.isNaN(d.getTime())) sp.set("createdTo", d.toISOString());
    }
    const q = sp.toString();
    try {
      let res = await fetch(`${API_BASE_URL}/platform/subscriptions/payments?${q}`, { headers: authHeaders() });
      if (res.status === 401) {
        if (!(await refreshSession())) {
          logout();
          return;
        }
        res = await fetch(`${API_BASE_URL}/platform/subscriptions/payments?${q}`, { headers: authHeaders() });
      }
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { message?: string } | null;
        setPaymentsErr(j?.message ?? "Could not load payments.");
        setPayments([]);
        setPaymentsTotal(0);
        setPaymentDevDeleteEnabled(false);
        setPendingDeletePaymentId(null);
        return;
      }
      const j = (await res.json()) as {
        payments: PaymentDto[];
        total: number;
        limit: number;
        offset: number;
        devDeleteSubscriptionPaymentsEnabled?: boolean;
      };
      const list = j.payments ?? [];
      setPaymentDevDeleteEnabled(Boolean(j.devDeleteSubscriptionPaymentsEnabled));
      setPayments(list);
      setPaymentsTotal(Number(j.total ?? 0));
      setPaymentsLimit(Number(j.limit ?? pageSize));
      setPaymentsOffset(Number(j.offset ?? offset));
      setPendingDeletePaymentId((cur) => (cur && list.some((row) => row.id === cur) ? cur : null));
    } catch {
      setPaymentsErr("Could not load payments.");
      setPayments([]);
      setPaymentsTotal(0);
      setPaymentDevDeleteEnabled(false);
      setPendingDeletePaymentId(null);
    } finally {
      setPaymentsBusy(false);
    }
  }, [appliedCreatedFrom, appliedCreatedTo, appliedStatus, appliedTenantId, authHeaders, logout, pageIndex, pageSize, refreshSession]);

  const loadAudit = useCallback(async () => {
    setAuditErr("");
    setAuditBusy(true);
    const sp = new URLSearchParams();
    sp.set("limit", String(auditLimit));
    sp.set("offset", String(auditOffset));
    try {
      let res = await fetch(`${API_BASE_URL}/platform/subscriptions/plans/audit?${sp}`, { headers: authHeaders() });
      if (res.status === 401) {
        if (!(await refreshSession())) {
          logout();
          return;
        }
        res = await fetch(`${API_BASE_URL}/platform/subscriptions/plans/audit?${sp}`, { headers: authHeaders() });
      }
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { message?: string } | null;
        setAuditErr(j?.message ?? "Could not load catalog audit log.");
        setAuditEntries([]);
        setAuditTotal(0);
        return;
      }
      const j = (await res.json()) as {
        entries: PlanCatalogAuditEntryDto[];
        total: number;
        limit: number;
        offset: number;
      };
      setAuditEntries(j.entries ?? []);
      setAuditTotal(Number(j.total ?? 0));
    } catch {
      setAuditErr("Could not load catalog audit log.");
      setAuditEntries([]);
      setAuditTotal(0);
    } finally {
      setAuditBusy(false);
    }
  }, [auditLimit, auditOffset, authHeaders, logout, refreshSession]);

  const loadCore = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      await Promise.all([loadSettings(), loadPlans()]);
    } catch {
      setError("Could not load subscription data.");
    } finally {
      setLoading(false);
    }
  }, [loadPlans, loadSettings]);

  useEffect(() => {
    void loadCore();
  }, [loadCore]);

  useEffect(() => {
    void loadPayments();
  }, [loadPayments]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (pendingDeletePaymentId) {
        setPendingDeletePaymentId(null);
        setPaymentDeleteErr("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingDeletePaymentId]);

  useEffect(() => {
    if (activeTab !== "catalog_audit") return;
    void loadAudit();
  }, [activeTab, loadAudit]);

  const putSubscriptionSettingsPatch = useCallback(
    async (body: { subscriptionsEnabled?: boolean; subscriptionCurrencyCode?: string }) => {
      setSettingsErr("");
      let res = await fetch(`${API_BASE_URL}/platform/subscriptions/settings`, {
        method: "PUT",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      if (res.status === 401) {
        if (!(await refreshSession())) {
          logout();
          return false;
        }
        res = await fetch(`${API_BASE_URL}/platform/subscriptions/settings`, {
          method: "PUT",
          headers: { ...authHeaders(), "content-type": "application/json" },
          body: JSON.stringify(body)
        });
      }
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { message?: string } | null;
        setSettingsErr(j?.message ?? "Could not update settings.");
        return false;
      }
      const j = (await res.json()) as SubscriptionSettingsDto;
      setSubscriptionsEnabled(j.subscriptionsEnabled);
      setSubscriptionCurrencyCode(j.subscriptionCurrencyCode ?? "USD");
      setSubscriptionCurrencyLocked(Boolean(j.subscriptionCurrencyLocked));
      setSubscriptionCurrencyDraft((j.subscriptionCurrencyCode ?? "USD").trim().toUpperCase());
      setSettingsUpdatedAt(j.updatedAt);
      return true;
    },
    [authHeaders, logout, refreshSession]
  );

  const toggleSubscriptionsEnabled = useCallback(
    async (next: boolean) => {
      const prev = subscriptionsEnabled;
      setSubscriptionsEnabled(next);
      setToggleBusy(true);
      try {
        const ok = await putSubscriptionSettingsPatch({ subscriptionsEnabled: next });
        if (!ok) setSubscriptionsEnabled(prev);
      } catch {
        setSubscriptionsEnabled(prev);
        setSettingsErr("Could not update settings.");
      } finally {
        setToggleBusy(false);
      }
    },
    [putSubscriptionSettingsPatch, subscriptionsEnabled]
  );

  const onSubscriptionCurrencyAutosave = useCallback(
    async (ccy: string) => {
      if (subscriptionCurrencyLocked) return;
      const revertTo = subscriptionCurrencyCode.trim().toUpperCase();
      const c = ccy.trim().toUpperCase();
      if (!c) {
        setSubscriptionCurrencyDraft(revertTo);
        return;
      }
      if (!/^[A-Z]{3}$/.test(c)) return;
      if (c === revertTo) return;
      setSubscriptionCurrencyDraft(c);
      setSubscriptionCurrencyAutosaveUi("saving");
      const ok = await putSubscriptionSettingsPatch({ subscriptionCurrencyCode: c });
      if (ok) {
        await loadPlans();
        setSubscriptionCurrencyAutosaveUi("saved");
        window.setTimeout(() => {
          setSubscriptionCurrencyAutosaveUi("idle");
        }, AUTOSAVE_UI_RESET_MS);
      } else {
        setSubscriptionCurrencyDraft(revertTo);
        setSubscriptionCurrencyAutosaveUi("error");
        window.setTimeout(() => {
          setSubscriptionCurrencyAutosaveUi("idle");
        }, AUTOSAVE_UI_RESET_MS);
      }
    },
    [
      loadPlans,
      putSubscriptionSettingsPatch,
      subscriptionCurrencyCode,
      subscriptionCurrencyLocked
    ]
  );

  const reloadPlansOnly = useCallback(async () => {
    await loadPlans();
  }, [loadPlans]);

  const cancelPendingPaymentDelete = useCallback(() => {
    setPendingDeletePaymentId(null);
    setPaymentDeleteErr("");
  }, []);

  const confirmPendingPaymentDelete = useCallback(
    async (p: PaymentDto) => {
      setPaymentDeleteErr("");
      setPaymentDeleteBusy(true);
      const del = async () =>
        fetch(`${API_BASE_URL}/platform/subscriptions/payments/${p.id}`, {
          method: "DELETE",
          headers: authHeaders()
        });
      try {
        let res = await del();
        if (res.status === 401) {
          if (!(await refreshSession())) {
            logout();
            return;
          }
          res = await del();
        }
        if (!res.ok) {
          const j = (await res.json().catch(() => null)) as { message?: string } | null;
          setPaymentDeleteErr(j?.message ?? "Could not delete payment.");
          return;
        }
        setPendingDeletePaymentId(null);
        await Promise.all([loadPayments(), reloadPlansOnly()]);
      } catch {
        setPaymentDeleteErr("Could not delete payment.");
      } finally {
        setPaymentDeleteBusy(false);
      }
    },
    [authHeaders, loadPayments, logout, refreshSession, reloadPlansOnly]
  );

  const onApplyPaymentFilters = useCallback(() => {
    setFilterApplyErr("");
    const t = draftTenantId.trim();
    if (t && !isUuid(t)) {
      setFilterApplyErr("Tenant ID must be a valid UUID, or leave the field empty.");
      return;
    }
    setAppliedTenantId(t);
    setAppliedStatus(draftStatus);
    setAppliedCreatedFrom(draftCreatedFrom);
    setAppliedCreatedTo(draftCreatedTo);
    setPageIndex(0);
    setPendingDeletePaymentId(null);
    setPaymentDeleteErr("");
  }, [draftCreatedFrom, draftCreatedTo, draftStatus, draftTenantId]);

  const onClearPaymentFilters = useCallback(() => {
    setFilterApplyErr("");
    setDraftTenantId("");
    setDraftStatus("");
    setDraftCreatedFrom("");
    setDraftCreatedTo("");
    setAppliedTenantId("");
    setAppliedStatus("");
    setAppliedCreatedFrom("");
    setAppliedCreatedTo("");
    setPageIndex(0);
    setPendingDeletePaymentId(null);
    setPaymentDeleteErr("");
  }, []);

  const onExportPaymentsCsv = useCallback(async () => {
    setFilterApplyErr("");
    const t = appliedTenantId.trim();
    if (t && !isUuid(t)) {
      setFilterApplyErr("Fix tenant ID before exporting.");
      return;
    }
    const sp = new URLSearchParams();
    if (t) sp.set("tenantId", t);
    if (appliedStatus) sp.set("status", appliedStatus);
    if (appliedCreatedFrom.trim()) {
      const d = new Date(appliedCreatedFrom);
      if (!Number.isNaN(d.getTime())) sp.set("createdFrom", d.toISOString());
    }
    if (appliedCreatedTo.trim()) {
      const d = new Date(appliedCreatedTo);
      if (!Number.isNaN(d.getTime())) sp.set("createdTo", d.toISOString());
    }
    const q = sp.toString();
    setExportBusy(true);
    try {
      let res = await fetch(`${API_BASE_URL}/platform/subscriptions/payments/export?${q}`, { headers: authHeaders() });
      if (res.status === 401) {
        if (!(await refreshSession())) {
          logout();
          return;
        }
        res = await fetch(`${API_BASE_URL}/platform/subscriptions/payments/export?${q}`, { headers: authHeaders() });
      }
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { message?: string } | null;
        setFilterApplyErr(j?.message ?? "Export failed.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `subscription-payments-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setFilterApplyErr("Export failed.");
    } finally {
      setExportBusy(false);
    }
  }, [
    appliedCreatedFrom,
    appliedCreatedTo,
    appliedStatus,
    appliedTenantId,
    authHeaders,
    logout,
    refreshSession
  ]);

  const paymentRangeLabel =
    paymentsTotal === 0
      ? "0 results"
      : `${pageIndex * pageSize + 1}–${Math.min(paymentsTotal, pageIndex * pageSize + payments.length)} of ${paymentsTotal}`;

  const canAuditPrev = auditOffset > 0;
  const canAuditNext = auditOffset + auditEntries.length < auditTotal;

  if (loading) {
    return <p className="text-sm text-stone-500">Loading…</p>;
  }

  return (
    <div className="w-full space-y-8">
      <p className="leading-relaxed text-slate-600">
        Manage subscription billing at the platform level: review generated payment rows, define catalog plans, and
        control whether tenants and members may subscribe. When subscription billing is off, the app does not require a
        paid plan and new sign-ups are blocked; existing subscriptions and payment rows are unchanged.
      </p>

      {error ? (
        <p className="text-sm text-rose-600" role="alert">
          {error}
        </p>
      ) : null}

      <section
        className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm ring-1 ring-slate-900/5"
        aria-labelledby="super-sub-billing-toggle-heading"
      >
        <div className="flex flex-col sm:flex-row sm:items-stretch">
          <div className="min-w-0 flex-1 p-5 sm:p-6">
            <h2 id="super-sub-billing-toggle-heading" className="text-sm font-semibold text-slate-900">
              Subscription billing
            </h2>
            <p className="mt-1 text-sm text-stone-600">
              When <strong className="font-semibold text-slate-800">on</strong>, tenant admins and members can start
              paid catalog subscriptions (subject to payments configuration). When{" "}
              <strong className="font-semibold text-slate-800">off</strong>, no one can create new subscriptions;
              everyone may use the app without a plan. Use the toggle in the gray strip; changes apply when you flip it.
              Existing subscriptions and ledger rows are unchanged.
            </p>
            {settingsErr ? (
              <p className="mt-3 text-sm text-rose-600" role="alert">
                {settingsErr}
              </p>
            ) : null}
            {settingsUpdatedAt ? (
              <p className="mt-2 text-xs text-stone-500">Last updated {formatDateTime(settingsUpdatedAt)}</p>
            ) : null}
          </div>
          <div className="mx-auto flex w-[8%] min-w-16 max-w-full shrink-0 items-center justify-center border-t border-stone-200/90 bg-stone-100 px-1 py-3 sm:mx-0 sm:flex-none sm:border-l sm:border-t-0 sm:px-1.5 sm:py-4">
            <Switch
              checked={subscriptionsEnabled}
              disabled={toggleBusy}
              aria-busy={toggleBusy}
              aria-label={subscriptionsEnabled ? "Subscription billing, on" : "Subscription billing, off"}
              onCheckedChange={(next) => void toggleSubscriptionsEnabled(next)}
            />
          </div>
        </div>
      </section>

      <div className="border-b border-stone-200">
        <div id={tabListId} role="tablist" aria-label="Subscription sections" className="flex flex-wrap gap-1">
          {SUB_TABS.map((tab) => {
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`super-sub-tab-${tab.id}`}
                aria-selected={selected}
                aria-controls={`super-sub-panel-${tab.id}`}
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

      {activeTab === "subscriptions" ? (
        <div id="super-sub-panel-subscriptions" role="tabpanel" aria-labelledby="super-sub-tab-subscriptions" className="space-y-4">
          <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm ring-1 ring-slate-900/5">
            <p className="text-sm font-semibold text-slate-900">Payment ledger filters</p>
            <p className="mt-1 text-xs text-stone-600">
              Filter by tenant, status, and created date (UTC). Export respects the same filters (up to 10,000 rows).
            </p>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <div className="min-w-[12rem] flex-1">
                <label className="block text-xs font-medium text-slate-700" htmlFor="super-sub-pay-tenant">
                  Tenant ID
                </label>
                <input
                  id="super-sub-pay-tenant"
                  type="text"
                  value={draftTenantId}
                  onChange={(e) => setDraftTenantId(e.target.value)}
                  placeholder="UUID"
                  className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  autoComplete="off"
                />
              </div>
              <div className="w-40 min-w-[9rem]">
                <label className="block text-xs font-medium text-slate-700" htmlFor="super-sub-pay-status">
                  Status
                </label>
                <select
                  id="super-sub-pay-status"
                  value={draftStatus}
                  onChange={(e) => setDraftStatus(e.target.value)}
                  className="mt-1 w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">Any</option>
                  {PAYMENT_STATUSES.filter((s) => s !== "").map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-[10rem]">
                <label className="block text-xs font-medium text-slate-700" htmlFor="super-sub-pay-from">
                  Created from
                </label>
                <input
                  id="super-sub-pay-from"
                  type="datetime-local"
                  value={draftCreatedFrom}
                  onChange={(e) => setDraftCreatedFrom(e.target.value)}
                  className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div className="min-w-[10rem]">
                <label className="block text-xs font-medium text-slate-700" htmlFor="super-sub-pay-to">
                  Created to
                </label>
                <input
                  id="super-sub-pay-to"
                  type="datetime-local"
                  value={draftCreatedTo}
                  onChange={(e) => setDraftCreatedTo(e.target.value)}
                  className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div className="w-28">
                <label className="block text-xs font-medium text-slate-700" htmlFor="super-sub-pay-pagesize">
                  Page size
                </label>
                <select
                  id="super-sub-pay-pagesize"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value) as (typeof PAGE_SIZE_OPTIONS)[number]);
                    setPageIndex(0);
                  }}
                  className="mt-1 w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void onApplyPaymentFilters()}
                  className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/45"
                >
                  Apply filters
                </button>
                <button
                  type="button"
                  onClick={onClearPaymentFilters}
                  className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-stone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/45"
                >
                  Reset
                </button>
                <button
                  type="button"
                  disabled={exportBusy}
                  onClick={() => void onExportPaymentsCsv()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-stone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/45 disabled:opacity-60"
                >
                  <Download className="h-4 w-4 shrink-0" aria-hidden />
                  {exportBusy ? "Exporting…" : "Export CSV"}
                </button>
              </div>
            </div>
            {filterApplyErr ? (
              <p className="mt-3 text-sm text-rose-600" role="alert">
                {filterApplyErr}
              </p>
            ) : null}
            {paymentsErr ? (
              <p className="mt-2 text-sm text-rose-600" role="alert">
                {paymentsErr}
              </p>
            ) : null}
            {paymentDevDeleteEnabled ? (
              <p className="mt-2 text-xs text-amber-800">
                Development server: subscription ledger rows can be removed with the trash control (two-step confirm).
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-700">
            <p className="tabular-nums">
              {paymentsBusy ? "Loading…" : paymentRangeLabel}
              {paymentsLimit ? (
                <span className="ml-2 text-xs text-stone-500">
                  (page {pageIndex + 1}, limit {paymentsLimit})
                </span>
              ) : null}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={paymentsBusy || pageIndex === 0}
                onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-stone-50 disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
                Previous
              </button>
              <button
                type="button"
                disabled={paymentsBusy || (pageIndex + 1) * pageSize >= paymentsTotal}
                onClick={() => setPageIndex((i) => i + 1)}
                className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-stone-50 disabled:opacity-50"
              >
                Next
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>

          <div className={`relative ${superDataTableOuterClass}`}>
            {paymentsBusy ? (
              <div
                className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center bg-white/60"
                aria-hidden
              />
            ) : null}
            <table className={superDataTableClass("min-w-[56rem]")} aria-label="Subscription payments">
              <caption className="sr-only">Subscription payment ledger</caption>
              <thead className={superDataTableTheadClass}>
                <tr>
                  <th scope="col" className={superDataTableThClass}>
                    Status
                  </th>
                  <th scope="col" className={superDataTableThClass}>
                    Amount
                  </th>
                  <th scope="col" className={superDataTableThClass}>
                    Due
                  </th>
                  <th scope="col" className={superDataTableThClass}>
                    Paid
                  </th>
                  <th scope="col" className={superDataTableThClass}>
                    Cancelled
                  </th>
                  <th scope="col" className={superDataTableThClass}>
                    Reimbursed
                  </th>
                  <th scope="col" className={superDataTableThClass}>
                    Tenant
                  </th>
                  <th scope="col" className={superDataTableThClass}>
                    User
                  </th>
                  <th scope="col" className={superDataTableThClass}>
                    Plan
                  </th>
                  <th scope="col" className={superDataTableThClass}>
                    Created
                  </th>
                  {paymentDevDeleteEnabled ? (
                    <th scope="col" className={superDataTableUsersActionsThClass}>
                      <span className="sr-only">Actions</span>
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody className={superDataTableTbodyClass}>
                {payments.length === 0 ? (
                  <tr className={superDataTableEmptyRowClass}>
                    <td
                      className={superDataTableEmptyCellClass}
                      colSpan={paymentDevDeleteEnabled ? 11 : 10}
                    >
                      No subscription payments yet. Generated charges will appear here with status (outstanding, due,
                      overdue, paid, cancelled, reimbursed).
                    </td>
                  </tr>
                ) : (
                  payments.map((p, idx) =>
                    pendingDeletePaymentId === p.id ? (
                      <tr
                        key={p.id}
                        className={[idx % 2 === 0 ? "bg-white" : "bg-slate-50/40", "relative z-[1]"].join(" ")}
                      >
                        <td
                          colSpan={10}
                          className="relative border-2 border-amber-400 border-r-0 p-0 align-middle"
                        >
                          <div className="pointer-events-none absolute inset-0 bg-white" aria-hidden />
                          <div className="relative flex min-h-[2.75rem] items-center justify-end px-3 py-2 pr-2">
                            <div className="max-w-full text-right">
                              <p className="text-sm font-medium text-slate-800">
                                Permanently delete this subscription payment row from the ledger?
                              </p>
                              {paymentDeleteErr ? (
                                <p className="mt-1 text-sm text-rose-600" role="alert">
                                  {paymentDeleteErr}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="relative border-2 border-l-0 border-amber-400 p-0 align-top text-sm">
                          <div className="flex min-h-[2.75rem] w-[4.5rem]">
                            <button
                              type="button"
                              title="Cancel"
                              aria-label="Cancel delete payment"
                              disabled={paymentDeleteBusy}
                              onClick={cancelPendingPaymentDelete}
                              className="flex flex-1 items-center justify-center bg-rose-100 text-rose-900 transition hover:bg-rose-200 focus:outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rose-400/80 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <X className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2} />
                            </button>
                            <button
                              type="button"
                              title="Confirm delete"
                              aria-label={`Confirm delete subscription payment ${p.id}`}
                              disabled={paymentDeleteBusy}
                              onClick={() => void confirmPendingPaymentDelete(p)}
                              className="flex flex-1 items-center justify-center bg-emerald-100 text-emerald-900 transition hover:bg-emerald-200 focus:outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/80 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <Check className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={p.id} className={superDataTableRowClass(idx)}>
                        <td className="px-3 py-2 align-middle">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${statusBadgeClass(p.status)}`}
                          >
                            {p.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 align-middle font-medium tabular-nums text-slate-900">
                          {formatMoney(p.amountCents, p.currencyCode)}
                        </td>
                        <td className="px-3 py-2 align-middle text-xs text-slate-600">
                          {p.dueAt ? formatDateTime(p.dueAt) : "—"}
                        </td>
                        <td className="px-3 py-2 align-middle text-xs text-slate-600">
                          {p.paidAt ? formatDateTime(p.paidAt) : "—"}
                        </td>
                        <td className="px-3 py-2 align-middle text-xs text-slate-600">
                          {p.cancelledAt ? formatDateTime(p.cancelledAt) : "—"}
                        </td>
                        <td className="px-3 py-2 align-middle text-xs text-slate-600">
                          {p.reimbursedAt ? formatDateTime(p.reimbursedAt) : "—"}
                        </td>
                        <td className="px-3 py-2 align-middle text-xs text-slate-800">{p.tenantName}</td>
                        <td className="px-3 py-2 align-middle text-xs text-slate-800">{p.userEmail ?? "—"}</td>
                        <td className="px-3 py-2 align-middle text-xs text-slate-800">{p.tierName ?? "—"}</td>
                        <td className="px-3 py-2 align-middle text-xs text-slate-600">
                          {formatDateTime(p.createdAt)}
                        </td>
                        {paymentDevDeleteEnabled ? (
                          <td className={superDataTableUsersActionsTdClass}>
                            <div className="flex min-h-[2.75rem] w-[4.5rem]">
                              <button
                                type="button"
                                title="Delete payment (development only)"
                                aria-label={`Delete subscription payment ${p.id}`}
                                disabled={paymentsBusy || paymentDeleteBusy}
                                onClick={() => {
                                  setPaymentDeleteErr("");
                                  setPendingDeletePaymentId(p.id);
                                }}
                                className="flex flex-1 items-center justify-center text-slate-600 transition hover:bg-rose-50 hover:text-rose-700 focus:outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400/80 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <Trash2 className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2} />
                              </button>
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    )
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {activeTab === "catalog_audit" ? (
        <div
          id="super-sub-panel-catalog_audit"
          role="tabpanel"
          aria-labelledby="super-sub-tab-catalog_audit"
          className="space-y-4"
        >
          <p className="text-sm text-stone-600">
            Append-only log of catalog changes (create, update, disable/enable, delete). Plan IDs are kept even if the
            tier row is removed.
          </p>
          {auditErr ? (
            <p className="text-sm text-rose-600" role="alert">
              {auditErr}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-700">
            <p className="tabular-nums">
              {auditBusy
                ? "Loading…"
                : auditTotal === 0
                  ? "0 entries"
                  : `${auditOffset + 1}–${auditOffset + auditEntries.length} of ${auditTotal}`}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={auditBusy || !canAuditPrev}
                onClick={() => setAuditOffset((o) => Math.max(0, o - auditLimit))}
                className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-stone-50 disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
                Previous
              </button>
              <button
                type="button"
                disabled={auditBusy || !canAuditNext}
                onClick={() => setAuditOffset((o) => o + auditLimit)}
                className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-stone-50 disabled:opacity-50"
              >
                Next
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
          <div className={`relative ${superDataTableOuterClass}`}>
            {auditBusy ? (
              <div
                className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center bg-white/60"
                aria-hidden
              />
            ) : null}
            <table className={superDataTableClass("min-w-[48rem]")} aria-label="Plan catalog audit log">
              <caption className="sr-only">Plan catalog audit log</caption>
              <thead className={superDataTableTheadClass}>
                <tr>
                  <th scope="col" className={superDataTableThClass}>
                    When
                  </th>
                  <th scope="col" className={superDataTableThClass}>
                    Action
                  </th>
                  <th scope="col" className={superDataTableThClass}>
                    Plan ID
                  </th>
                  <th scope="col" className={superDataTableThClass}>
                    Actor
                  </th>
                  <th scope="col" className={superDataTableThClass}>
                    Summary
                  </th>
                  <th scope="col" className={superDataTableThClass}>
                    Detail
                  </th>
                </tr>
              </thead>
              <tbody className={superDataTableTbodyClass}>
                {auditEntries.length === 0 ? (
                  <tr className={superDataTableEmptyRowClass}>
                    <td className={superDataTableEmptyCellClass} colSpan={6}>
                      {auditBusy ? "Loading audit log…" : "No catalog changes recorded yet."}
                    </td>
                  </tr>
                ) : (
                  auditEntries.map((row, idx) => (
                    <tr key={row.id} className={superDataTableRowClass(idx)}>
                      <td className="px-3 py-2 align-middle text-xs text-slate-600">
                        {formatDateTime(row.createdAt)}
                      </td>
                      <td className="px-3 py-2 align-middle text-xs font-medium text-slate-800">{row.action}</td>
                      <td className="px-3 py-2 align-middle font-mono text-xs text-slate-700">{row.planId ?? "—"}</td>
                      <td className="px-3 py-2 align-middle font-mono text-xs text-slate-700">
                        {row.actorUserId ?? "—"}
                      </td>
                      <td className="max-w-[14rem] px-3 py-2 align-middle text-xs text-slate-800">{row.summary}</td>
                      <td className="max-w-[18rem] px-3 py-2 align-middle text-xs text-slate-600">
                        {row.detailJson ? (
                          <span className="line-clamp-2 break-all" title={row.detailJson}>
                            {row.detailJson}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {activeTab === "configuration" ? (
        <div
          id="super-sub-panel-configuration"
          role="tabpanel"
          aria-labelledby="super-sub-tab-configuration"
          className="w-full max-w-full space-y-8"
        >
          {settingsErr ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
              {settingsErr}
            </p>
          ) : null}

          <p className="text-sm text-stone-600">
            Turn subscription billing on or off using the <strong className="font-semibold text-slate-800">Subscription billing</strong>{" "}
            section above the tabs. This tab is for catalog currency and related settings only.
          </p>

          <section
            className="w-full min-w-0 rounded-xl border border-stone-200 bg-white shadow-sm ring-1 ring-slate-900/5"
            aria-labelledby="super-sub-currency-heading"
          >
            <div className="w-full min-w-0 overflow-visible p-5 sm:p-6">
              <h2 id="super-sub-currency-heading" className="text-sm font-semibold text-slate-900">
                Subscription billing currency
              </h2>
              <div className="mt-4 w-full min-w-0">
                <label className={authLabelClass} htmlFor={subscriptionCurrencyFieldId}>
                  Currency
                </label>
                <fieldset
                  disabled={subscriptionCurrencyLocked}
                  className="min-w-0 w-full border-0 p-0 disabled:opacity-[0.72]"
                >
                  <AutosaveFieldWrap
                    statusId="super-subscription-currency-autosave"
                    status={subscriptionCurrencyAutosaveUi}
                    className="w-full overflow-visible"
                  >
                    <SearchableCurrencySelect
                      inputId={subscriptionCurrencyFieldId}
                      value={subscriptionCurrencyDraft}
                      onChange={(code) => void onSubscriptionCurrencyAutosave(code)}
                      listPlacement="above"
                    />
                  </AutosaveFieldWrap>
                </fieldset>
              </div>
              <p className="mt-4 text-sm text-stone-600">
                One ISO currency for every subscription tier and for generated payment rows. Presentment and shopper
                conversion happen at your payment provider (Stripe, Adyen, etc.); this value is the catalog settlement
                currency. Changes save automatically.
              </p>
              {subscriptionCurrencyLocked ? (
                <p
                  className="mt-3 rounded-lg border border-amber-200/90 bg-amber-50/80 px-3 py-2 text-xs leading-relaxed text-amber-950"
                  role="status"
                >
                  Currency is locked because at least one subscription payment has been generated for a tier. You
                  cannot change it without removing those ledger rows; keep using your processor for cross-currency
                  conversion.
                </p>
              ) : null}
            </div>
          </section>

          <section
            className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm ring-1 ring-slate-900/5"
            aria-labelledby="super-sub-plans-heading"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h2 id="super-sub-plans-heading" className="text-sm font-semibold text-slate-900">
                  Subscription plans
                </h2>
                <p className="mt-1 text-sm text-stone-600">
                  Catalog tiers in <strong className="font-semibold text-slate-800">{subscriptionCurrencyCode}</strong>.
                  Use <strong className="font-semibold text-slate-800">Add tier</strong> for a new plan. You can{" "}
                  <strong className="font-semibold text-slate-800">Edit</strong> a row only until subscription payment
                  rows exist for that tier; after that, use <strong className="font-semibold text-slate-800">View</strong>{" "}
                  to inspect locked terms.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPlanModal({ mode: "create" })}
                className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/45"
              >
                Add tier
              </button>
            </div>

            <div className={["mt-4", superDataTableOuterClass].join(" ")}>
              <table className={superDataTableClass("min-w-[40rem]")} aria-label="Subscription plans">
                <caption className="sr-only">Platform subscription catalog tiers</caption>
                <thead className={superDataTableTheadClass}>
                  <tr>
                    <th scope="col" className={superDataTableThClass}>
                      Tier
                    </th>
                    <th scope="col" className={superDataTableThClass}>
                      Billing period
                    </th>
                    <th scope="col" className={superDataTableThClass}>
                      Price / cycle
                    </th>
                    <th scope="col" className={superDataTableThClass}>
                      Trial (days)
                    </th>
                    <th scope="col" className={superDataTableThClass}>
                      Cancel
                    </th>
                    <th scope="col" className={superDataTableThClass}>
                      Scope
                    </th>
                  </tr>
                </thead>
                <tbody className={superDataTableTbodyClass}>
                  {plans.length === 0 ? (
                    <tr className={superDataTableEmptyRowClass}>
                      <td className={superDataTableEmptyCellClass} colSpan={6}>
                        No plans yet. Add a tier to define your subscription catalog.
                      </td>
                    </tr>
                  ) : (
                    plans.map((plan, idx) => (
                      <tr
                        key={plan.id}
                        className={[superDataTableRowClass(idx), tableRowClickableClass].join(" ")}
                        {...bindTableRowPrimaryAction({
                          onAction: () => setPlanModal({ mode: "edit", plan }),
                          ariaLabel: plan.ledgerAffected
                            ? `View subscription tier ${plan.tierName}`
                            : `Edit subscription tier ${plan.tierName}`,
                          role: "button"
                        })}
                      >
                        <td className="px-3 py-2 align-middle font-medium text-slate-900">
                          <span className="inline-flex flex-wrap items-center gap-2">
                            {plan.tierName}
                            {plan.disabled ? (
                              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-800">
                                Disabled
                              </span>
                            ) : null}
                          </span>
                        </td>
                        <td className="px-3 py-2 align-middle text-slate-700">{planDurationLabel(plan)}</td>
                        <td className="px-3 py-2 align-middle font-medium tabular-nums text-slate-900">
                          {formatMoney(plan.priceCents, plan.currencyCode)}
                        </td>
                        <td className="px-3 py-2 align-middle tabular-nums text-slate-700">{plan.trialDays ?? 0}</td>
                        <td className="px-3 py-2 align-middle text-slate-700">
                          {plan.allowCancelAnytime ? (
                            <span className="text-xs font-medium text-emerald-800">Any day</span>
                          ) : (
                            <span className="text-xs text-slate-500">Term</span>
                          )}
                        </td>
                        <td className="px-3 py-2 align-middle text-slate-700">
                          {plan.billingScope === "tenant" ? "Per tenant" : "Per user"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <SubscriptionPlanTierModal
              open={planModal !== null}
              mode={planModal?.mode ?? "create"}
              plan={planModal?.mode === "edit" ? planModal.plan : null}
              subscriptionCurrencyCode={subscriptionCurrencyCode}
              authHeaders={authHeaders}
              refreshSession={refreshSession}
              logout={logout}
              onClose={() => setPlanModal(null)}
              onSaved={reloadPlansOnly}
            />
          </section>
        </div>
      ) : null}
    </div>
  );
};
