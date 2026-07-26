/**
 * Company Subscription Provider Form Fields.
 *
 * Reusable company subscriptions UI building block: Company Subscription Provider Form Fields.
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

  COMPANY_SUBSCRIPTION_KINDS,

  type CompanySubscriptionCadenceKind,

  type CompanySubscriptionKind,

  type CompanySubscriptionStatus

} from "@starter/shared";



import { SearchableCurrencySelect } from "../../components/SearchableCurrencySelect.js";

import { Switch } from "../../components/Switch.js";

import { CompanySubscriptionAmountField } from "./CompanySubscriptionAmountField.js";

import { mergeProviderCadenceDerivedDates } from "./companySubscriptionCadenceDates.js";

import {

  csFieldClass,

  csLabelClass,

  isSingularCompanySubscription,

  patchForProviderSubscriptionKind,

  providerActiveFromStatus,

  statusLabel,

  statusToProviderActive,

  subscriptionKindLabel

} from "./companySubscriptionsUi.js";



/** React component for company subscriptions UI. */
export type CompanySubscriptionProviderFormValues = {

  name: string;

  subscriptionKind: CompanySubscriptionKind;

  vendorName: string;

  category: string;

  description: string;

  status: CompanySubscriptionStatus;

  contractStartDate: string;

  renewalDate: string;

  contractEndDate: string;

  cadenceKind: CompanySubscriptionCadenceKind;

  cadenceIntervalCount: string;

  cadenceIntervalUnit: (typeof COMPANY_SUBSCRIPTION_CADENCE_UNITS)[number];

  amountMajor: string;

  currencyCode: string;

  notes: string;

};



type Props = {

  idPrefix: string;

  values: CompanySubscriptionProviderFormValues;

  onChange: (patch: Partial<CompanySubscriptionProviderFormValues>) => void;

  disabled?: boolean;

  nameError?: string;

  currencyListPlacement?: "above" | "below";

};



/** React component for company subscriptions UI. */
export const CompanySubscriptionProviderFormFields = ({

  idPrefix,

  values,

  onChange,

  disabled = false,

  nameError,

  currencyListPlacement = "below"

}: Props) => {

  const active = providerActiveFromStatus(values.status);

  const statusHint =

    values.status !== "active" && values.status !== "cancelled" ? statusLabel(values.status) : null;

  const isSingular = isSingularCompanySubscription(values.subscriptionKind);



  const patch = (next: Partial<CompanySubscriptionProviderFormValues>) => {

    if (next.subscriptionKind !== undefined && next.subscriptionKind !== values.subscriptionKind) {

      onChange(patchForProviderSubscriptionKind(next.subscriptionKind, values));

      return;

    }

    onChange(isSingular ? mergeProviderCadenceDerivedDates(values, next) : next);

  };



  return (

    <div className="grid gap-4 sm:grid-cols-2">

      <div className="sm:col-span-2 flex flex-col gap-3 lg:flex-row lg:items-end">

        <div className="w-full shrink-0 lg:w-[12.5rem]">

          <label htmlFor={`${idPrefix}-kind`} className={csLabelClass}>

            Subscription type

          </label>

          <select

            id={`${idPrefix}-kind`}

            value={values.subscriptionKind}

            disabled={disabled}

            onChange={(e) => patch({ subscriptionKind: e.target.value as CompanySubscriptionKind })}

            className={csFieldClass}

          >

            {COMPANY_SUBSCRIPTION_KINDS.map((k) => (

              <option key={k} value={k}>

                {subscriptionKindLabel(k)}

              </option>

            ))}

          </select>

        </div>

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

        <div className="flex shrink-0 items-center gap-2.5 pb-0.5 lg:pb-2.5">

          <div className="text-right">

            <p className="text-xs font-medium text-stone-600">Active</p>

            {statusHint ? <p className="text-[11px] text-amber-800">{statusHint}</p> : null}

          </div>

          <Switch

            id={`${idPrefix}-active`}

            checked={active}

            disabled={disabled}

            aria-label={active ? "Subscription active" : "Subscription inactive"}

            onCheckedChange={(next) => onChange({ status: statusToProviderActive(next) })}

          />

        </div>

      </div>



      <p className="sm:col-span-2 -mt-1 text-xs text-stone-500">

        {isSingular

          ? "Recurring cost, contract dates, and billing cadence apply to this subscription."

          : "Recurring cost, contract dates, and billing cadence are configured on each plan."}

      </p>



      <div className={`sm:col-span-2 grid gap-4 ${isSingular ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>

        <div>

          <label htmlFor={`${idPrefix}-vendor`} className={csLabelClass}>

            Vendor

          </label>

          <input

            id={`${idPrefix}-vendor`}

            value={values.vendorName}

            disabled={disabled}

            onChange={(e) => onChange({ vendorName: e.target.value })}

            className={csFieldClass}

          />

        </div>

        <div>

          <label htmlFor={`${idPrefix}-category`} className={csLabelClass}>

            Category

          </label>

          <input

            id={`${idPrefix}-category`}

            value={values.category}

            disabled={disabled}

            onChange={(e) => onChange({ category: e.target.value })}

            className={csFieldClass}

          />

        </div>

        {isSingular ? (

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

        ) : null}

      </div>



      {isSingular && values.cadenceKind === "custom" ? (

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



      {isSingular ? (

        <>

          <div className="sm:col-span-2 grid gap-4 sm:grid-cols-3">

            <div>

              <label htmlFor={`${idPrefix}-start`} className={csLabelClass}>

                Contract start

              </label>

              <input

                id={`${idPrefix}-start`}

                type="date"

                value={values.contractStartDate}

                disabled={disabled}

                onChange={(e) => patch({ contractStartDate: e.target.value })}

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

                Contract end

              </label>

              <input

                id={`${idPrefix}-end`}

                type="date"

                value={values.contractEndDate}

                disabled={disabled}

                onChange={(e) => onChange({ contractEndDate: e.target.value })}

                className={csFieldClass}

              />

            </div>

          </div>

          <p className="sm:col-span-2 -mt-2 text-xs text-stone-500">

            Renewal and end dates default to one billing period after contract start. You can adjust them manually.

          </p>



          <CompanySubscriptionAmountField

            inputId={`${idPrefix}-amount`}

            label="Recurring cost"

            value={values.amountMajor}

            currencyCode={values.currencyCode}

            disabled={disabled}

            onChange={(amountMajor) => onChange({ amountMajor })}

          />

        </>

      ) : null}



      <div className={isSingular ? "" : "sm:col-span-2"}>

        <label htmlFor={`${idPrefix}-currency`} className={csLabelClass}>

          Currency

        </label>

        {disabled ? (

          <input

            id={`${idPrefix}-currency`}

            value={values.currencyCode}

            readOnly

            disabled

            className={csFieldClass}

          />

        ) : (

          <SearchableCurrencySelect

            inputId={`${idPrefix}-currency`}

            value={values.currencyCode}

            onChange={(code) => onChange({ currencyCode: code })}

            listPlacement={currencyListPlacement}

          />

        )}

      </div>



      <div className="sm:col-span-2">

        <label htmlFor={`${idPrefix}-description`} className={csLabelClass}>

          Description

        </label>

        <textarea

          id={`${idPrefix}-description`}

          rows={3}

          value={values.description}

          disabled={disabled}

          onChange={(e) => onChange({ description: e.target.value })}

          className={csFieldClass}

        />

      </div>

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


