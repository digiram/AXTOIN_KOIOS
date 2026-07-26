/**
 * Add Company Subscription Provider modal.
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
import { useState } from "react";

import { CRM_SECTION_HEADING_RAIL } from "../../components/crm/crmSectionHeadingRail.js";
import { useTenantDisplayPreferences } from "../../hooks/useTenantDisplayPreferences.js";
import {
  CompanySubscriptionProviderFormFields,
  type CompanySubscriptionProviderFormValues
} from "./CompanySubscriptionProviderFormFields.js";
import {
  COMPANY_SUBSCRIPTIONS_API,
  type CompanySubscriptionProviderRow,
  useCompanySubscriptionsApi
} from "./useCompanySubscriptionsApi.js";
import { buildProviderSaveBody, defaultSingularProviderBillingFields, readApiErrorMessage } from "./companySubscriptionsUi.js";

type Props = {
  defaultCurrency: string;
  onClose: () => void;
  onCreated: (provider: CompanySubscriptionProviderRow) => void;
};

const initialValues = (defaultCurrency: string): CompanySubscriptionProviderFormValues => {
  const billing = defaultSingularProviderBillingFields();
  return {
    name: "",
    subscriptionKind: "singular",
    vendorName: "",
    category: "",
    description: "",
    status: "active",
    ...billing,
    amountMajor: "",
    currencyCode: defaultCurrency,
    notes: ""
  };
};

/** Modal UI for a focused company subscriptions workflow. */
export const AddCompanySubscriptionProviderModal = ({ defaultCurrency, onClose, onCreated }: Props) => {
  const { authedFetch } = useCompanySubscriptionsApi();
  const { preferences: tenantPrefs } = useTenantDisplayPreferences();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [nameError, setNameError] = useState<string | undefined>();
  const [values, setValues] = useState(() => initialValues(defaultCurrency));

  const patch = (next: Partial<CompanySubscriptionProviderFormValues>) => {
    setValues((v) => ({ ...v, ...next }));
    if ("name" in next) setNameError(undefined);
  };

  const save = async () => {
    setError("");
    const nextNameError = values.name.trim() ? undefined : "Name is required.";
    setNameError(nextNameError);
    if (nextNameError) return;

    const built = buildProviderSaveBody(values, tenantPrefs?.currencyFormat ?? null);
    if ("error" in built) {
      setError(built.error);
      return;
    }

    setSaving(true);
    try {
      const res = await authedFetch(`${COMPANY_SUBSCRIPTIONS_API}/providers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(built.body)
      });
      if (!res?.ok) {
        setError(res ? await readApiErrorMessage(res) : "Could not create provider.");
        return;
      }
      const json = (await res.json()) as { provider: CompanySubscriptionProviderRow };
      onClose();
      onCreated(json.provider);
    } catch {
      setError("Could not create provider.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <p className="text-xs text-stone-500">* Required · Saves a new vendor subscription record.</p>
      {error ? (
        <p className="mt-3 text-sm text-rose-600" role="alert">
          {error}
        </p>
      ) : null}

      <section className="mt-4">
        <div className={CRM_SECTION_HEADING_RAIL}>
          <h3 className="text-sm font-semibold text-slate-800">Provider</h3>
        </div>
        <div className="mt-3">
          <CompanySubscriptionProviderFormFields
            idPrefix="cs-add"
            values={values}
            onChange={patch}
            nameError={nameError}
            currencyListPlacement="above"
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
          {saving ? "Saving…" : "Add provider"}
        </button>
      </div>
    </>
  );
};
