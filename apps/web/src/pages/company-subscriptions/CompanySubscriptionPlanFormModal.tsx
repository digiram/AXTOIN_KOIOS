/**
 * Company Subscription Plan Form modal.
 *
 * Modal dialog for a focused company subscriptions create, edit, or confirmation flow.
 *
 * Responsibilities:
 * - Collect and validate user input for a single action
 * - Submit changes to tenant APIs and surface errors inline
 *
 * Related:
 * - Route: /admin/company-subscriptions
 *
 * Security:
 * - Submissions use authenticated tenant API helpers
 */
import { type CompanySubscriptionCadenceKind } from "@starter/shared";
import { useEffect, useState } from "react";

import { CRM_SECTION_HEADING_RAIL } from "../../components/crm/crmSectionHeadingRail.js";
import { useTenantDisplayPreferences } from "../../hooks/useTenantDisplayPreferences.js";
import type { CurrencyFormatId } from "../../lib/country-presets.js";
import {
  CompanySubscriptionPlanFormFields,
  type CompanySubscriptionPlanFormValues
} from "./CompanySubscriptionPlanFormFields.js";
import {
  COMPANY_SUBSCRIPTIONS_API,
  type CompanySubscriptionPlanRow,
  useCompanySubscriptionsApi
} from "./useCompanySubscriptionsApi.js";
import { defaultBillingPeriodDatesFromToday } from "./companySubscriptionCadenceDates.js";
import { amountMinorToFormMajorString, parseAmountMajorToMinor, readApiErrorMessage } from "./companySubscriptionsUi.js";

type Props = {
  providerId: string;
  providerCurrency: string;
  /** When true (seated subscription), plan form shows cost, dates, and cadence. */
  billingOnPlan: boolean;
  defaultCadenceKind: CompanySubscriptionCadenceKind;
  mode: "create" | "edit";
  plan?: CompanySubscriptionPlanRow;
  onClose: () => void;
  onSaved: (plan: CompanySubscriptionPlanRow) => void;
};

const initialValues = (
  defaultCadenceKind: CompanySubscriptionCadenceKind,
  billingOnPlan: boolean
): CompanySubscriptionPlanFormValues => {
  const dates = billingOnPlan
    ? defaultBillingPeriodDatesFromToday({
        cadenceKind: defaultCadenceKind,
        cadenceIntervalCount: "1",
        cadenceIntervalUnit: "month"
      })
    : null;
  return {
    name: "",
    sku: "",
    seatCount: "",
    cadenceKind: defaultCadenceKind,
    cadenceIntervalCount: "1",
    cadenceIntervalUnit: "month",
    amountMajor: "",
    startDate: dates?.start ?? "",
    renewalDate: dates?.renewalDate ?? "",
    endDate: dates?.endDate ?? "",
    autoRenew: true,
    notes: ""
  };
};

const valuesFromPlan = (
  plan: CompanySubscriptionPlanRow,
  locale: string,
  currencyFormat: CurrencyFormatId | null
): CompanySubscriptionPlanFormValues => ({
  name: plan.name ?? "",
  sku: plan.sku ?? "",
  seatCount: plan.seatCount != null ? String(plan.seatCount) : "",
  cadenceKind: plan.cadenceKind,
  cadenceIntervalCount: plan.cadenceIntervalCount != null ? String(plan.cadenceIntervalCount) : "1",
  cadenceIntervalUnit: (plan.cadenceIntervalUnit as CompanySubscriptionPlanFormValues["cadenceIntervalUnit"] | null) ?? "month",
  amountMajor: amountMinorToFormMajorString(plan.amountMinor, locale, currencyFormat),
  startDate: plan.startDate ?? "",
  renewalDate: plan.renewalDate ?? "",
  endDate: plan.endDate ?? "",
  autoRenew: plan.autoRenew,
  notes: plan.notes ?? ""
});

/** Modal UI for a focused company subscriptions workflow. */
export const CompanySubscriptionPlanFormModal = ({
  providerId,
  providerCurrency,
  billingOnPlan,
  defaultCadenceKind,
  mode,
  plan,
  onClose,
  onSaved
}: Props) => {
  const { authedFetch } = useCompanySubscriptionsApi();
  const { preferences: tenantPrefs } = useTenantDisplayPreferences();
  const listLocale = tenantPrefs?.locale ?? "en-US";
  const currencyFormat = tenantPrefs?.currencyFormat ?? null;
  const subscriptionCurrency = providerCurrency.trim().toUpperCase() || tenantPrefs?.preferredCurrency || "USD";
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [nameError, setNameError] = useState<string | undefined>();
  const [values, setValues] = useState(() => initialValues(defaultCadenceKind, billingOnPlan));

  useEffect(() => {
    if (mode === "edit" && plan) {
      setValues(valuesFromPlan(plan, listLocale, currencyFormat));
      return;
    }
    setValues(initialValues(defaultCadenceKind, billingOnPlan));
  }, [billingOnPlan, currencyFormat, defaultCadenceKind, listLocale, mode, plan]);

  const patch = (next: Partial<CompanySubscriptionPlanFormValues>) => {
    setValues((v) => ({ ...v, ...next }));
    if ("name" in next) setNameError(undefined);
  };

  const save = async () => {
    setError("");
    const nextNameError = values.name.trim() ? undefined : "Name is required.";
    setNameError(nextNameError);
    if (nextNameError) return;

    let amountMinor: number | null = null;
    if (billingOnPlan) {
      const parsed = parseAmountMajorToMinor(values.amountMajor, currencyFormat);
      if (parsed === "invalid") {
        setError("Enter a valid cost amount.");
        return;
      }
      amountMinor = parsed;
    }

    const body: Record<string, unknown> = {
      name: values.name.trim(),
      sku: values.sku.trim() || null,
      amountMinor: billingOnPlan ? amountMinor : null,
      currencyCode: subscriptionCurrency,
      cadenceKind: billingOnPlan ? values.cadenceKind : "monthly",
      startDate: billingOnPlan ? values.startDate.trim() || null : null,
      renewalDate: billingOnPlan ? values.renewalDate.trim() || null : null,
      endDate: billingOnPlan ? values.endDate.trim() || null : null,
      autoRenew: values.autoRenew,
      notes: values.notes.trim() || null,
      cadenceIntervalCount: null,
      cadenceIntervalUnit: null
    };

    if (values.seatCount.trim() !== "") {
      const sc = Number.parseInt(values.seatCount, 10);
      if (!Number.isFinite(sc) || sc < 0) {
        setError("Seat count must be a non-negative number.");
        return;
      }
      body.seatCount = sc;
    } else {
      body.seatCount = null;
    }

    if (billingOnPlan && values.cadenceKind === "custom") {
      const count = Number.parseInt(values.cadenceIntervalCount, 10);
      if (!Number.isFinite(count) || count < 1) {
        setError("Custom cadence requires a valid interval count.");
        return;
      }
      body.cadenceIntervalCount = count;
      body.cadenceIntervalUnit = values.cadenceIntervalUnit;
    }

    setSaving(true);
    try {
      const url =
        mode === "create"
          ? `${COMPANY_SUBSCRIPTIONS_API}/providers/${encodeURIComponent(providerId)}/plans`
          : `${COMPANY_SUBSCRIPTIONS_API}/providers/${encodeURIComponent(providerId)}/plans/${encodeURIComponent(plan!.id)}`;
      const res = await authedFetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res?.ok) {
        setError(res ? await readApiErrorMessage(res) : "Could not save plan.");
        return;
      }
      const json = (await res.json()) as { plan: CompanySubscriptionPlanRow };
      onClose();
      onSaved(json.plan);
    } catch {
      setError("Could not save plan.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <p className="text-xs text-stone-500">* Required · A plan groups pricing and seat assignments under this provider.</p>
      {error ? (
        <p className="mt-3 text-sm text-rose-600" role="alert">
          {error}
        </p>
      ) : null}

      <section className="mt-4">
        <div className={CRM_SECTION_HEADING_RAIL}>
          <h3 className="text-sm font-semibold text-slate-800">Plan</h3>
        </div>
        <div className="mt-3">
          <CompanySubscriptionPlanFormFields
            idPrefix="cs-plan"
            providerCurrency={subscriptionCurrency}
            billingOnPlan={billingOnPlan}
            values={values}
            onChange={patch}
            nameError={nameError}
          />
        </div>
      </section>

      <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-stone-100 pt-4">
        <button
          type="button"
          disabled={saving}
          onClick={onClose}
          className="rounded-lg border border-stone-200 px-4 py-2 text-sm font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : mode === "create" ? "Add plan" : "Save plan"}
        </button>
      </div>
    </>
  );
};
