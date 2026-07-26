/**
 * Tenant Subscription Settings panel.
 *
 * Settings or detail panel segment within tenant admin admin screens.
 *
 * Responsibilities:
 * - Render a subsection of configuration or read-only detail
 * - Persist changes through tenant API where editable
 *
 * Related:
 * - Route: /admin
 *
 * Security:
 * - Editable fields require appropriate tenant admin or module role
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { StripeSubscriptionCardForm } from "../../components/StripeSubscriptionCardForm.js";
import { useUserDisplayDatetime } from "../../hooks/useUserDisplayDatetime.js";
import { API_BASE_URL } from "../../lib/api.js";

type CatalogPlan = {
  id: string;
  tierName: string;
  priceCents: number;
  currencyCode: string;
  allowCancelAnytime: boolean;
  trialDays?: number;
  allowTierChangeNextPeriod?: boolean;
};

type SubscriptionDto = {
  id: string;
  planId: string;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  cancelEffectiveMode: string | null;
  effectiveEndAt: string | null;
  trialEndsAt?: string | null;
  pendingPlanId?: string | null;
  stripe?: {
    publishableKey: string | null;
    setupIntentAvailable: boolean;
    pspCustomerId: string | null;
    pspSubscriptionId: string | null;
    defaultPaymentMethodId: string | null;
    card: {
      brand: string | null;
      last4: string | null;
      expMonth: number | null;
      expYear: number | null;
    } | null;
  };
  billing?: {
    pastDueSince: string | null;
    failedChargeCount: number;
    lastPaymentErrorCode: string | null;
    nextRetryAt: string | null;
  };
};

type Props = {
  authHeaders: () => Record<string, string>;
  refreshSession: () => Promise<boolean>;
  logout: () => void;
};

const sectionHeadingAccentClass = "border-l-4 border-slate-200 pl-4";

/** Panel segment within tenant admin settings or detail screens. */
export const TenantSubscriptionSettingsPanel = ({ authHeaders, refreshSession, logout }: Props) => {
  const { formatDateTimeUtc } = useUserDisplayDatetime();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [plans, setPlans] = useState<CatalogPlan[]>([]);
  const [sub, setSub] = useState<SubscriptionDto | null>(null);
  /** When false, platform does not require or accept new org subscription sign-ups; full app use is allowed without a plan. */
  const [subscriptionsEnabled, setSubscriptionsEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [nextPlanId, setNextPlanId] = useState("");

  const doFetch = useCallback(
    async (url: string, init?: RequestInit) => {
      let res = await fetch(url, { ...init, headers: { ...authHeaders(), ...init?.headers } });
      if (res.status === 401) {
        if (!(await refreshSession())) {
          logout();
          return null;
        }
        res = await fetch(url, { ...init, headers: { ...authHeaders(), ...init?.headers } });
      }
      return res;
    },
    [authHeaders, logout, refreshSession]
  );

  const load = useCallback(async () => {
    setErr("");
    setLoading(true);
    try {
      const [cRes, sRes] = await Promise.all([
        doFetch(`${API_BASE_URL}/tenant/subscription/catalog`),
        doFetch(`${API_BASE_URL}/tenant/subscription`)
      ]);
      if (!cRes?.ok || !sRes?.ok) {
        setErr("Could not load organization subscription.");
        return;
      }
      const cj = (await cRes.json()) as { plans: CatalogPlan[] };
      const sj = (await sRes.json()) as { subscription: SubscriptionDto | null; subscriptionsEnabled?: boolean };
      setPlans(cj.plans ?? []);
      setSub(sj.subscription ?? null);
      setSubscriptionsEnabled(sj.subscriptionsEnabled === true);
    } catch {
      setErr("Could not load organization subscription.");
    } finally {
      setLoading(false);
    }
  }, [doFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  const subscribe = async (planId: string) => {
    setBusy(true);
    setErr("");
    try {
      const res = await doFetch(`${API_BASE_URL}/tenant/subscription`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planId })
      });
      if (!res || !res.ok) {
        const j = (await res?.json().catch(() => null)) as { message?: string } | null;
        setErr(j?.message ?? "Could not start subscription.");
        return;
      }
      await load();
    } catch {
      setErr("Could not start subscription.");
    } finally {
      setBusy(false);
    }
  };

  const schedulePlanChange = async () => {
    if (!nextPlanId) return;
    setBusy(true);
    setErr("");
    try {
      const res = await doFetch(`${API_BASE_URL}/tenant/subscription/schedule-plan-change`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planId: nextPlanId })
      });
      if (!res || !res.ok) {
        const j = (await res?.json().catch(() => null)) as { message?: string } | null;
        setErr(j?.message ?? "Could not schedule plan change.");
        return;
      }
      setNextPlanId("");
      await load();
    } catch {
      setErr("Could not schedule plan change.");
    } finally {
      setBusy(false);
    }
  };

  const clearScheduledPlanChange = async () => {
    setBusy(true);
    setErr("");
    try {
      const res = await doFetch(`${API_BASE_URL}/tenant/subscription/scheduled-plan-change`, {
        method: "DELETE"
      });
      if (!res || !res.ok) {
        const j = (await res?.json().catch(() => null)) as { message?: string } | null;
        setErr(j?.message ?? "Could not clear scheduled change.");
        return;
      }
      await load();
    } catch {
      setErr("Could not clear scheduled change.");
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (effective: "immediate" | "period_end") => {
    setBusy(true);
    setErr("");
    try {
      const res = await doFetch(`${API_BASE_URL}/tenant/subscription/cancel`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ effective })
      });
      if (!res || !res.ok) {
        const j = (await res?.json().catch(() => null)) as { message?: string } | null;
        setErr(j?.message ?? "Could not cancel subscription.");
        return;
      }
      await load();
    } catch {
      setErr("Could not cancel subscription.");
    } finally {
      setBusy(false);
    }
  };

  const activePlan = sub ? plans.find((p) => p.id === sub.planId) : undefined;
  const pendingPlan = sub?.pendingPlanId ? plans.find((p) => p.id === sub.pendingPlanId) : undefined;
  const alternativePlans = useMemo(
    () => (sub ? plans.filter((p) => p.id !== sub.planId) : []),
    [plans, sub]
  );
  const canScheduleTierChange =
    Boolean(sub && activePlan?.allowTierChangeNextPeriod !== false && alternativePlans.length > 0);

  if (loading) {
    return <p className="text-sm text-stone-500">Loading organization subscription…</p>;
  }

  return (
    <div className="space-y-6">
      <div className={sectionHeadingAccentClass}>
        <h2 className="text-base font-semibold text-slate-900">Organization subscription</h2>
        <p className="mt-1 text-sm text-stone-600">
          Tenant-wide billing (per-tenant catalog tiers, monthly UTC periods). Only tenant administrators can manage
          this. Refunds go through your payment provider.
        </p>
      </div>

      {err ? (
        <p className="text-sm text-rose-600" role="alert">
          {err}
        </p>
      ) : null}

      {sub ? (
        <div className="rounded-lg border border-stone-200 bg-stone-50/50 p-4 text-sm text-stone-800">
          <p className="font-semibold text-stone-900">Status: {sub.status}</p>
          <p className="mt-2 text-stone-700">
            Current period (UTC): {formatDateTimeUtc(sub.currentPeriodStart)} →{" "}
            {formatDateTimeUtc(sub.currentPeriodEnd)}
          </p>
          {activePlan ? (
            <p className="mt-1 text-stone-600">
              Plan: <span className="font-medium">{activePlan.tierName}</span>
            </p>
          ) : null}
          {sub.trialEndsAt ? (
            <p className="mt-2 text-xs text-amber-900/90">
              Trial active until {formatDateTimeUtc(sub.trialEndsAt)} (UTC-based). Billing should start after
              this instant; no first-period ledger row is created until your worker charges.
            </p>
          ) : null}
          {sub.pendingPlanId ? (
            <p className="mt-2 text-xs text-indigo-900/90">
              Scheduled change: <span className="font-medium">{pendingPlan?.tierName ?? sub.pendingPlanId}</span> at
              next period end ({formatDateTimeUtc(sub.currentPeriodEnd)} UTC boundary — applied by billing
              worker).
            </p>
          ) : null}
          {sub.billing && sub.billing.failedChargeCount > 0 ? (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              Billing issue: {sub.billing.failedChargeCount} failed charge attempt
              {sub.billing.failedChargeCount === 1 ? "" : "s"}
              {sub.billing.lastPaymentErrorCode ? ` (${sub.billing.lastPaymentErrorCode})` : ""}. Update your card
              below or check the Stripe dashboard.
            </p>
          ) : null}
          {sub.stripe?.card ? (
            <p className="mt-2 text-xs text-stone-600">
              Card on file:{" "}
              <span className="font-medium text-stone-900">
                {(sub.stripe.card.brand ?? "card").toUpperCase()} ·••• {sub.stripe.card.last4}
              </span>
              {sub.stripe.card.expMonth != null && sub.stripe.card.expYear != null
                ? ` · exp ${sub.stripe.card.expMonth}/${sub.stripe.card.expYear}`
                : null}
            </p>
          ) : sub.stripe?.publishableKey ? (
            <p className="mt-2 text-xs text-stone-600">No default card on file yet.</p>
          ) : (
            <p className="mt-2 text-xs text-stone-500">
              Stripe publishable key is not configured. Super-admin → Integrations → Payments.
            </p>
          )}
          {sub.stripe?.setupIntentAvailable ? (
            <StripeSubscriptionCardForm
              setupIntentPath="/tenant/subscription/stripe/setup-intent"
              authHeaders={authHeaders}
              refreshSession={refreshSession}
              logout={logout}
              onSuccess={() => void load()}
            />
          ) : null}
          {canScheduleTierChange && (sub.status === "active" || sub.status === "canceling") ? (
            <div className="mt-4 space-y-2 rounded-lg border border-stone-200 bg-white p-3">
              <p className="text-xs font-semibold text-stone-800">Change tier next period</p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <label htmlFor="tenant-sub-next-plan" className="sr-only">
                  Target plan
                </label>
                <select
                  id="tenant-sub-next-plan"
                  className="w-full max-w-md rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm"
                  value={nextPlanId}
                  onChange={(e) => setNextPlanId(e.target.value)}
                  disabled={busy}
                >
                  <option value="">Select catalog tier…</option>
                  {alternativePlans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.tierName} —{" "}
                      {(p.priceCents / 100).toLocaleString(undefined, { style: "currency", currency: p.currencyCode })}{" "}
                      / month
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={busy || !nextPlanId}
                  onClick={() => void schedulePlanChange()}
                  className="shrink-0 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                >
                  Schedule
                </button>
              </div>
              {sub.pendingPlanId ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void clearScheduledPlanChange()}
                  className="text-xs font-semibold text-stone-600 underline decoration-stone-400 hover:text-stone-900"
                >
                  Clear scheduled change
                </button>
              ) : null}
            </div>
          ) : null}
          {sub.status === "active" || sub.status === "canceling" ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {activePlan?.allowCancelAnytime ? (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void cancel("period_end")}
                    className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-800 shadow-sm hover:bg-stone-50 disabled:opacity-50"
                  >
                    Cancel at period end
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void cancel("immediate")}
                    className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-800 shadow-sm hover:bg-rose-50 disabled:opacity-50"
                  >
                    Cancel immediately
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void cancel("period_end")}
                  className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-800 shadow-sm hover:bg-stone-50 disabled:opacity-50"
                >
                  Cancel at end of period
                </button>
              )}
            </div>
          ) : null}
        </div>
      ) : !subscriptionsEnabled ? (
        <p className="rounded-lg border border-stone-200 bg-stone-50/80 px-4 py-3 text-sm text-stone-700">
          Subscription billing is turned off for this platform. Your organization can use the app without a paid plan. If
          your operator enables subscription billing later, catalog tiers will appear here.
        </p>
      ) : plans.length === 0 ? (
        <p className="text-sm text-stone-600">No tenant-wide monthly plans are in the catalog yet.</p>
      ) : (
        <ul className="divide-y divide-stone-200 rounded-lg border border-stone-200">
          {plans.map((p) => (
            <li key={p.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-stone-900">{p.tierName}</p>
                <p className="text-xs text-stone-600">
                  {(p.priceCents / 100).toLocaleString(undefined, { style: "currency", currency: p.currencyCode })} / month
                  {(p.trialDays ?? 0) > 0 ? ` · ${p.trialDays}-day trial (no charge until trial ends)` : null}
                  {p.allowCancelAnytime ? " · cancel any day (with provider refund rules)" : " · cancel at period end only"}
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void subscribe(p.id)}
                className="shrink-0 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                Subscribe organization
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
