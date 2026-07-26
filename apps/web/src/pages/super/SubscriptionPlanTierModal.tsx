/**
 * Subscription Plan Tier modal.
 *
 * Modal dialog for a focused super-admin create, edit, or confirmation flow.
 *
 * Responsibilities:
 * - Collect and validate user input for a single action
 * - Submit changes to tenant APIs and surface errors inline
 *
 * Related:
 * - Route: /super-admin
 *
 * Security:
 * - Submissions use authenticated tenant API helpers
 */
import { useEffect, useState } from "react";

import { Switch } from "../../components/Switch.js";
import { CrmModal } from "../../components/crm/CrmModal.js";
import { API_BASE_URL } from "../../lib/api.js";

/** React component for super-admin UI. */
export type PlanDto = {
  id: string;
  tierName: string;
  durationUnit: "day" | "month" | "year";
  durationCount: number;
  priceCents: number;
  currencyCode: string;
  allowCancelAnytime: boolean;
  /** Free trial in calendar days (UTC); 0 = billing starts at subscribe. */
  trialDays: number;
  /** Subscribers may schedule a switch to another tier of the same scope for the next period end. */
  allowTierChangeNextPeriod: boolean;
  billingScope: "tenant" | "user";
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  /** True when at least one subscription payment row references this tier; catalog fields cannot be edited. */
  ledgerAffected?: boolean;
  /** Hidden from subscriber catalogs; set via disable action when ledger-linked. */
  disabled?: boolean;
};

const inputClass =
  "w-full rounded-lg border border-stone-200/90 bg-white px-3 py-1.5 text-sm text-stone-900 shadow-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/25";

const hintClass = "mt-0.5 text-xs leading-snug text-stone-600";

const dollarsFromCents = (cents: number) => (cents / 100).toFixed(2);

const parseDollarsToCents = (raw: string): number | null => {
  const t = raw.trim().replace(/,/g, "");
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
};

type Props = {
  open: boolean;
  mode: "create" | "edit";
  plan: PlanDto | null;
  /** Platform subscription billing currency (tiers always bill in this ISO code). */
  subscriptionCurrencyCode: string;
  authHeaders: () => Record<string, string>;
  refreshSession: () => Promise<boolean>;
  logout: () => void;
  onClose: () => void;
  onSaved: () => Promise<void>;
};

/** Modal UI for a focused super-admin workflow. */
export const SubscriptionPlanTierModal = ({
  open,
  mode,
  plan,
  subscriptionCurrencyCode,
  authHeaders,
  refreshSession,
  logout,
  onClose,
  onSaved
}: Props) => {
  const [tierName, setTierName] = useState("");
  const [durationUnit, setDurationUnit] = useState<PlanDto["durationUnit"]>("month");
  const [durationCount, setDurationCount] = useState("1");
  const [priceDollars, setPriceDollars] = useState("");
  const [allowCancelAnytime, setAllowCancelAnytime] = useState(false);
  const [trialDays, setTrialDays] = useState("0");
  const [allowTierChangeNextPeriod, setAllowTierChangeNextPeriod] = useState(true);
  const [billingScope, setBillingScope] = useState<PlanDto["billingScope"]>("tenant");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!open) return;
    setMsg("");
    if (mode === "edit" && plan) {
      setTierName(plan.tierName);
      setDurationUnit(plan.durationUnit);
      setDurationCount(String(plan.durationCount));
      setPriceDollars(dollarsFromCents(plan.priceCents));
      setAllowCancelAnytime(plan.allowCancelAnytime);
      setTrialDays(String(plan.trialDays ?? 0));
      setAllowTierChangeNextPeriod(plan.allowTierChangeNextPeriod ?? true);
      setBillingScope(plan.billingScope);
    } else {
      setTierName("");
      setDurationUnit("month");
      setDurationCount("1");
      setPriceDollars("");
      setAllowCancelAnytime(false);
      setTrialDays("0");
      setAllowTierChangeNextPeriod(true);
      setBillingScope("tenant");
    }
  }, [open, mode, plan]);

  const doRequest = async (url: string, init: RequestInit) => {
    let res = await fetch(url, { ...init, headers: { ...authHeaders(), ...init.headers } });
    if (res.status === 401) {
      if (!(await refreshSession())) {
        logout();
        return null;
      }
      res = await fetch(url, { ...init, headers: { ...authHeaders(), ...init.headers } });
    }
    return res;
  };

  const readOnly = mode === "edit" && Boolean(plan?.ledgerAffected);

  const validateAndBody = (): Record<string, unknown> | null => {
    if (readOnly) return null;
    const dc = Number.parseInt(durationCount, 10);
    const cents = parseDollarsToCents(priceDollars);
    const td = Number.parseInt(trialDays, 10);
    if (!tierName.trim() || !Number.isFinite(dc) || dc < 1 || cents === null || !Number.isFinite(td) || td < 0 || td > 365) {
      setMsg("Enter a tier name, billing period (count ≥ 1), valid price, and trial days (0–365).");
      return null;
    }
    return {
      tierName: tierName.trim(),
      durationUnit,
      durationCount: dc,
      priceCents: cents,
      allowCancelAnytime,
      trialDays: td,
      allowTierChangeNextPeriod,
      billingScope,
      sortOrder: mode === "edit" && plan ? plan.sortOrder : 0
    };
  };

  const submit = async () => {
    setMsg("");
    const body = validateAndBody();
    if (!body) return;
    setBusy(true);
    try {
      const url =
        mode === "create"
          ? `${API_BASE_URL}/platform/subscriptions/plans`
          : `${API_BASE_URL}/platform/subscriptions/plans/${plan!.id}`;
      const res = await doRequest(url, {
        method: mode === "create" ? "POST" : "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res || !res.ok) {
        const j = (await res?.json().catch(() => null)) as { message?: string; error?: string } | null;
        setMsg(
          j?.message ??
            (res?.status === 409 && j?.error === "plan_ledger_locked"
              ? "This tier already has subscription payments and cannot be changed."
              : mode === "create"
                ? "Could not create plan."
                : "Could not save plan.")
        );
        return;
      }
      await onSaved();
      onClose();
    } catch {
      setMsg(mode === "create" ? "Could not create plan." : "Could not save plan.");
    } finally {
      setBusy(false);
    }
  };

  const setPlanDisabled = async (disabled: boolean) => {
    if (!plan) return;
    const verb = disabled ? "disable" : "re-enable";
    if (!globalThis.confirm(`${disabled ? "Disable" : "Re-enable"} plan “${plan.tierName}”?`)) return;
    setMsg("");
    setBusy(true);
    try {
      const res = await doRequest(`${API_BASE_URL}/platform/subscriptions/plans/${plan.id}/disabled`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ disabled })
      });
      if (!res || !res.ok) {
        const j = (await res?.json().catch(() => null)) as { message?: string } | null;
        setMsg(j?.message ?? `Could not ${verb} plan.`);
        return;
      }
      await onSaved();
      onClose();
    } catch {
      setMsg(`Could not ${verb} plan.`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!plan || !globalThis.confirm(`Delete plan “${plan.tierName}”? This cannot be undone.`)) return;
    setMsg("");
    setBusy(true);
    try {
      const res = await doRequest(`${API_BASE_URL}/platform/subscriptions/plans/${plan.id}`, {
        method: "DELETE"
      });
      if (!res || (!res.ok && res.status !== 204)) {
        const j = (await res?.json().catch(() => null)) as { message?: string; error?: string } | null;
        setMsg(
          j?.message ??
            (res?.status === 409 && j?.error === "plan_cannot_delete_has_ledger"
              ? "This tier has ledger payments — use Disable instead of delete."
              : "Could not delete plan.")
        );
        return;
      }
      await onSaved();
      onClose();
    } catch {
      setMsg("Could not delete plan.");
    } finally {
      setBusy(false);
    }
  };

  const title =
    mode === "create" ? "Add subscription tier" : readOnly ? "Subscription tier (locked)" : "Edit subscription tier";

  return (
    <CrmModal title={title} open={open} onClose={busy ? () => {} : onClose}>
      <div className="space-y-3">
        {readOnly ? (
          <p
            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm leading-snug text-amber-950"
            role="status"
          >
            This tier already has subscription payment rows in the ledger. Pricing, billing period, scope, and
            cancellation rules stay fixed so historical rows stay consistent. Use{" "}
            <strong className="font-semibold text-stone-800">Disable tier</strong> below to hide it from new
            subscriptions while keeping audit links. Add a new tier if you need different terms.
          </p>
        ) : null}
        <div className="space-y-1.5">
          <label htmlFor="sub-plan-tier-name" className="text-sm font-semibold text-stone-900">
            Tier name
          </label>
          <p id="sub-plan-tier-name-hint" className={hintClass}>
            Label shown in your plan catalog, checkout, and on generated payment rows (for example “Starter” or
            “Enterprise”).
          </p>
          <input
            id="sub-plan-tier-name"
            className={inputClass}
            value={tierName}
            onChange={(e) => setTierName(e.target.value)}
            autoComplete="off"
            aria-describedby="sub-plan-tier-name-hint"
            disabled={busy || readOnly}
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2 md:items-start md:gap-x-5">
          <div className="min-w-0 space-y-1.5">
            <span className="text-sm font-semibold text-stone-900">Billing period and scope</span>
            <p id="sub-plan-period-hint" className={hintClass}>
              Cycle length before the next charge (count + days, months, or years).
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <input
                type="number"
                min={1}
                value={durationCount}
                onChange={(e) => setDurationCount(e.target.value)}
                className={`${inputClass} w-[4.5rem] shrink-0`}
                aria-describedby="sub-plan-period-hint sub-plan-scope-hint"
                disabled={busy || readOnly}
              />
              <select
                value={durationUnit}
                onChange={(e) => setDurationUnit(e.target.value as PlanDto["durationUnit"])}
                className={`${inputClass} min-w-[7.5rem] shrink-0 max-w-[10rem]`}
                aria-describedby="sub-plan-period-hint"
                disabled={busy || readOnly}
              >
                <option value="day">day(s)</option>
                <option value="month">month(s)</option>
                <option value="year">year(s)</option>
              </select>
              <span className="shrink-0 pl-0.5 text-xs font-medium text-stone-600 sm:border-l sm:border-stone-200 sm:pl-2.5">
                Scope
              </span>
              <label htmlFor="sub-plan-billing-scope" className="sr-only">
                Billing scope
              </label>
              <select
                id="sub-plan-billing-scope"
                value={billingScope}
                onChange={(e) => setBillingScope(e.target.value as PlanDto["billingScope"])}
                className={`${inputClass} min-w-[8.5rem] flex-1 sm:max-w-[12rem]`}
                aria-describedby="sub-plan-scope-hint"
                disabled={busy || readOnly}
              >
                <option value="tenant">Per tenant</option>
                <option value="user">Per user</option>
              </select>
            </div>
            <p id="sub-plan-scope-hint" className={hintClass}>
              <strong className="font-semibold text-stone-800">Per tenant</strong> stores one payment method for the
              whole organization. <strong className="font-semibold text-stone-800">Per user</strong> bills per seat.
            </p>
          </div>

          <div className="min-w-0 space-y-1.5">
            <span className="text-sm font-semibold text-stone-900">Price per cycle</span>
            <p id="sub-plan-price-hint" className={hintClass}>
              Major units (not cents) in{" "}
              <strong className="font-semibold text-stone-800">{subscriptionCurrencyCode.trim().toUpperCase()}</strong>{" "}
              — platform currency under Configuration; shopper conversion is at your processor.
            </p>
            <input
              id="sub-plan-price-amount"
              value={priceDollars}
              onChange={(e) => setPriceDollars(e.target.value)}
              className={`${inputClass} max-w-xs md:max-w-none`}
              inputMode="decimal"
              placeholder="0.00"
              aria-describedby="sub-plan-price-hint"
              disabled={busy || readOnly}
            />
          </div>
        </div>

        <div className="rounded-lg border border-stone-200/90 bg-stone-50/60 px-3 py-2">
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div className="min-w-0 space-y-0.5">
              <span className="text-sm font-semibold text-stone-900">Cancel any day</span>
              <p className="text-xs leading-snug text-stone-600">
                When on, subscribers may end mid-cycle; unused prepaid time is reimbursed by day per your rules. Off
                = fixed-term cancellation only.
              </p>
            </div>
            <Switch
              checked={allowCancelAnytime}
              onCheckedChange={setAllowCancelAnytime}
              disabled={busy || readOnly}
              aria-label={allowCancelAnytime ? "Cancel any day, enabled" : "Cancel any day, disabled"}
            />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 md:items-start">
          <div className="space-y-1.5">
            <label htmlFor="sub-plan-trial-days" className="text-sm font-semibold text-stone-900">
              Trial (calendar days, UTC)
            </label>
            <p className={hintClass}>
              0 = first charge at subscribe. Greater than 0 defers the first ledger line until after the trial; your
              billing worker should create the first charge when <code className="text-xs">trial_ends_at</code> has
              passed.
            </p>
            <input
              id="sub-plan-trial-days"
              type="number"
              min={0}
              max={365}
              value={trialDays}
              onChange={(e) => setTrialDays(e.target.value)}
              className={`${inputClass} max-w-[8rem]`}
              disabled={busy || readOnly}
            />
          </div>
          <div className="rounded-lg border border-stone-200/90 bg-stone-50/60 px-3 py-2">
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <div className="min-w-0 space-y-0.5">
                <span className="text-sm font-semibold text-stone-900">Tier change next period</span>
                <p className="text-xs leading-snug text-stone-600">
                  When on, subscribers on this tier may pick another catalog tier of the same scope; the switch applies
                  at the next <code className="text-xs">current_period_end</code> (worker).
                </p>
              </div>
              <Switch
                checked={allowTierChangeNextPeriod}
                onCheckedChange={setAllowTierChangeNextPeriod}
                disabled={busy || readOnly}
                aria-label={
                  allowTierChangeNextPeriod ? "Tier change next period, enabled" : "Tier change next period, disabled"
                }
              />
            </div>
          </div>
        </div>

        {msg ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm leading-snug text-rose-800" role="alert">
            {msg}
          </p>
        ) : null}

        <div
          className={[
            "flex flex-col-reverse gap-1.5 border-t border-stone-100 pt-3 sm:flex-row sm:items-center",
            mode === "edit" ? "sm:justify-between" : "sm:justify-end"
          ].join(" ")}
        >
          {mode === "edit" && plan ? (
            readOnly ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void setPlanDisabled(!plan.disabled)}
                className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-950 transition hover:bg-amber-100 disabled:opacity-50"
              >
                {plan.disabled ? "Re-enable tier (catalog)" : "Disable tier (catalog)"}
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => void remove()}
                className="rounded-lg border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-800 transition hover:bg-rose-50 disabled:opacity-50"
              >
                Delete tier
              </button>
            )
          ) : null}
          <div className="flex flex-col-reverse gap-1.5 sm:flex-row sm:justify-end sm:gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-800 shadow-sm transition hover:bg-stone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/45"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || readOnly}
              onClick={() => void submit()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/45"
            >
              {busy ? "Saving…" : mode === "create" ? "Create tier" : readOnly ? "Locked" : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </CrmModal>
  );
};
