/**
 * Company Subscription Plan Form Fields.
 *
 * Reusable company subscriptions UI building block: Company Subscription Plan Form Fields.
 *
 * Responsibilities:
 * - Encapsulate a focused interaction or form segment
 * - Keep parent pages thin by isolating validation and presentation
 *
 * Related:
 * - Route: /admin/company-subscriptions
 */
import {
  COMPANY_SUBSCRIPTION_CADENCE_KINDS,
  COMPANY_SUBSCRIPTION_CADENCE_UNITS,
  type CompanySubscriptionCadenceKind
} from "@starter/shared";

import { Switch } from "../../components/Switch.js";
import { CompanySubscriptionAmountField } from "./CompanySubscriptionAmountField.js";
import { mergePlanCadenceDerivedDates } from "./companySubscriptionCadenceDates.js";
import { csFieldClass, csLabelClass } from "./companySubscriptionsUi.js";

/** React component for company subscriptions UI. */
export type CompanySubscriptionPlanFormValues = {
  name: string;
  sku: string;
  seatCount: string;
  cadenceKind: CompanySubscriptionCadenceKind;
  cadenceIntervalCount: string;
  cadenceIntervalUnit: (typeof COMPANY_SUBSCRIPTION_CADENCE_UNITS)[number];
  amountMajor: string;
  startDate: string;
  renewalDate: string;
  endDate: string;
  autoRenew: boolean;
  notes: string;
};

type Props = {
  idPrefix: string;
  /** Provider-level currency — not editable on plans. */
  providerCurrency: string;
  /** When true (seated subscription), show cost, dates, and cadence on the plan. */
  billingOnPlan: boolean;
  values: CompanySubscriptionPlanFormValues;
  onChange: (patch: Partial<CompanySubscriptionPlanFormValues>) => void;
  disabled?: boolean;
  nameError?: string;
};

/** React component for company subscriptions UI. */
export const CompanySubscriptionPlanFormFields = ({
  idPrefix,
  providerCurrency,
  billingOnPlan,
  values,
  onChange,
  disabled = false,
  nameError
}: Props) => {
  const patch = (next: Partial<CompanySubscriptionPlanFormValues>) => {
    onChange(billingOnPlan ? mergePlanCadenceDerivedDates(values, next) : { ...values, ...next });
  };

  return (
  <div className="grid gap-4 sm:grid-cols-2">
    <div className="sm:col-span-2 flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1">
        <label htmlFor={`${idPrefix}-name`} className={csLabelClass}>
          Name <span className="text-rose-600">*</span>
        </label>
        <input
          id={`${idPrefix}-name`}
          value={values.name}
          disabled={disabled}
          onChange={(e) => onChange({ name: e.target.value })}
          className={csFieldClass}
          aria-invalid={Boolean(nameError)}
        />
        {nameError ? (
          <p className="mt-1.5 text-xs text-rose-600" role="alert">
            {nameError}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2.5 pb-0.5 sm:pb-2.5">
        <p className="text-xs font-medium text-stone-600">Auto-renew</p>
        <Switch
          id={`${idPrefix}-auto-renew`}
          checked={values.autoRenew}
          disabled={disabled}
          aria-label={values.autoRenew ? "Auto-renew on" : "Auto-renew off"}
          onCheckedChange={(next) => onChange({ autoRenew: next })}
        />
      </div>
    </div>

    <div className="sm:col-span-2">
      <label htmlFor={`${idPrefix}-sku`} className={csLabelClass}>
        SKU / product code
      </label>
      <input
        id={`${idPrefix}-sku`}
        value={values.sku}
        disabled={disabled}
        onChange={(e) => onChange({ sku: e.target.value })}
        className={csFieldClass}
      />
    </div>

    <div className={billingOnPlan ? undefined : "sm:col-span-2"}>
      <label htmlFor={`${idPrefix}-seats`} className={csLabelClass}>
        Licensed seat count
      </label>
      <input
        id={`${idPrefix}-seats`}
        inputMode="numeric"
        value={values.seatCount}
        disabled={disabled}
        onChange={(e) => onChange({ seatCount: e.target.value })}
        className={csFieldClass}
        placeholder="Optional"
      />
    </div>

    {billingOnPlan ? (
    <>
    <div>
      <label htmlFor={`${idPrefix}-cadence`} className={csLabelClass}>
        Billing cadence
      </label>
      <select
        id={`${idPrefix}-cadence`}
        value={values.cadenceKind}
        disabled={disabled}
        onChange={(e) => patch({ cadenceKind: e.target.value as CompanySubscriptionCadenceKind })}
        className={csFieldClass}
      >
        {COMPANY_SUBSCRIPTION_CADENCE_KINDS.map((c) => (
          <option key={c} value={c}>
            {c.charAt(0).toUpperCase() + c.slice(1)}
          </option>
        ))}
      </select>
    </div>

    {values.cadenceKind === "custom" ? (
      <>
        <div>
          <label htmlFor={`${idPrefix}-cadence-count`} className={csLabelClass}>
            Every (count)
          </label>
          <input
            id={`${idPrefix}-cadence-count`}
            inputMode="numeric"
            value={values.cadenceIntervalCount}
            disabled={disabled}
            onChange={(e) => patch({ cadenceIntervalCount: e.target.value })}
            className={csFieldClass}
          />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-cadence-unit`} className={csLabelClass}>
            Unit
          </label>
          <select
            id={`${idPrefix}-cadence-unit`}
            value={values.cadenceIntervalUnit}
            disabled={disabled}
            onChange={(e) =>
              patch({
                cadenceIntervalUnit: e.target.value as (typeof COMPANY_SUBSCRIPTION_CADENCE_UNITS)[number]
              })
            }
            className={csFieldClass}
          >
            {COMPANY_SUBSCRIPTION_CADENCE_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
      </>
    ) : null}

    <div className="sm:col-span-2 grid gap-4 sm:grid-cols-3">
      <div>
        <label htmlFor={`${idPrefix}-start`} className={csLabelClass}>
          Start date
        </label>
        <input
          id={`${idPrefix}-start`}
          type="date"
          value={values.startDate}
          disabled={disabled}
          onChange={(e) => patch({ startDate: e.target.value })}
          className={csFieldClass}
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-renewal`} className={csLabelClass}>
          Renewal date
        </label>
        <input
          id={`${idPrefix}-renewal`}
          type="date"
          value={values.renewalDate}
          disabled={disabled}
          onChange={(e) => onChange({ renewalDate: e.target.value })}
          className={csFieldClass}
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-end`} className={csLabelClass}>
          End date
        </label>
        <input
          id={`${idPrefix}-end`}
          type="date"
          value={values.endDate}
          disabled={disabled}
          onChange={(e) => onChange({ endDate: e.target.value })}
          className={csFieldClass}
        />
      </div>
    </div>
    <p className="sm:col-span-2 -mt-2 text-xs text-stone-500">
      Renewal and end dates default to one billing period after start. You can adjust them manually.
    </p>

    <div className="sm:col-span-2">
      <CompanySubscriptionAmountField
        inputId={`${idPrefix}-amount`}
        label="Cost per seat"
        value={values.amountMajor}
        currencyCode={providerCurrency}
        disabled={disabled}
        onChange={(amountMajor) => onChange({ amountMajor })}
      />
      <p className="mt-1.5 text-xs text-stone-500">
        Recurring amount for one seat per billing period, in {providerCurrency.trim().toUpperCase()}. Licensed seat
        count (above) is used to estimate total plan cost on the overview.
      </p>
    </div>
    </>
    ) : (
      <p className="sm:col-span-2 text-xs text-stone-500">
        Billing cadence, contract dates, and cost are configured on the subscription above (singular subscription).
      </p>
    )}

    <div className="sm:col-span-2">
      <label htmlFor={`${idPrefix}-notes`} className={csLabelClass}>
        Notes
      </label>
      <textarea
        id={`${idPrefix}-notes`}
        rows={2}
        value={values.notes}
        disabled={disabled}
        onChange={(e) => onChange({ notes: e.target.value })}
        className={csFieldClass}
      />
    </div>
  </div>
  );
};
