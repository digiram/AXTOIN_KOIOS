/**
 * Super Integrations Payments panel.
 *
 * Settings or detail panel segment within super-admin admin screens.
 *
 * Responsibilities:
 * - Render a subsection of configuration or read-only detail
 * - Persist changes through tenant API where editable
 *
 * Related:
 * - Route: /super-admin
 *
 * Security:
 * - Editable fields require appropriate tenant admin or module role
 */
import {
  DEFAULT_PLATFORM_ACCEPTED_PAYMENT_METHODS,
  PLATFORM_PAYMENT_METHOD_IDS,
  type PlatformPaymentMethodId,
  type PlatformPaymentPutBodyInput
} from "@starter/shared";
import { CreditCard } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useAuth } from "../../auth/AuthContext.js";
import { Switch } from "../../components/Switch.js";
import { useUserDisplayDatetime } from "../../hooks/useUserDisplayDatetime.js";
import { API_BASE_URL } from "../../lib/api.js";

type PaymentProvider = "stripe" | "adyen";
type AdyenEnv = "test" | "live";

type PaymentGetResponse = {
  paymentsEnabled: boolean;
  provider: PaymentProvider;
  stripePublishableKey: string;
  hasStripeSecret: boolean;
  hasStripeWebhookSecret: boolean;
  adyenMerchantAccount: string;
  adyenClientKey: string;
  adyenEnvironment: AdyenEnv;
  hasAdyenApiKey: boolean;
  acceptedPaymentMethods: PlatformPaymentMethodId[];
  updatedAt: string;
};

const PAYMENT_METHOD_ROWS: {
  id: PlatformPaymentMethodId;
  title: string;
  body: string;
  logos: "card" | "paypal" | "wallets" | "ideal_wero";
}[] = [
  {
    id: "card",
    title: "Credit & debit cards",
    body: "Visa, Mastercard, Amex, and other major card networks.",
    logos: "card"
  },
  {
    id: "paypal",
    title: "PayPal",
    body: "Pay with a PayPal balance or linked funding sources.",
    logos: "paypal"
  },
  {
    id: "wallet_apple_google_pay",
    title: "Apple Pay & Google Pay",
    body: "Wallet-based checkout on supported devices and browsers.",
    logos: "wallets"
  },
  {
    id: "ideal",
    title: "iDEAL & Wero",
    body: "Bank-based checkout in the Netherlands and Europe (iDEAL and Wero; one toggle for this deployment).",
    logos: "ideal_wero"
  }
];

const inputClass =
  "w-full rounded-lg border border-stone-200/90 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/25";

/**
 * Super-admin Integrations → Payments: Stripe XOR Adyen, enable toggle, encrypted secrets (FIELD_ENCRYPTION_KEY).
 */
export const SuperIntegrationsPaymentsPanel = () => {
  const { getAccessToken, refreshSession, logout } = useAuth();
  const { formatDateTime } = useUserDisplayDatetime();
  const authHeaders = useCallback(() => {
    const token = getAccessToken();
    const h: Record<string, string> = {};
    if (token) h.authorization = `Bearer ${token}`;
    return h;
  }, [getAccessToken]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [paymentsEnabled, setPaymentsEnabled] = useState(false);
  const [provider, setProvider] = useState<PaymentProvider>("stripe");
  const [stripePublishableKey, setStripePublishableKey] = useState("");
  const [stripeSecret, setStripeSecret] = useState("");
  const [stripeWebhook, setStripeWebhook] = useState("");
  const [adyenMerchant, setAdyenMerchant] = useState("");
  const [adyenClient, setAdyenClient] = useState("");
  const [adyenEnv, setAdyenEnv] = useState<AdyenEnv>("test");
  const [adyenApi, setAdyenApi] = useState("");
  const [hasStripeSecret, setHasStripeSecret] = useState(false);
  const [hasStripeWebhook, setHasStripeWebhook] = useState(false);
  const [hasAdyenApiKey, setHasAdyenApiKey] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [methodSelection, setMethodSelection] = useState<Set<PlatformPaymentMethodId>>(
    () => new Set(DEFAULT_PLATFORM_ACCEPTED_PAYMENT_METHODS)
  );

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      let res = await fetch(`${API_BASE_URL}/platform/integrations/payments`, { headers: authHeaders() });
      if (res.status === 401) {
        const ok = await refreshSession();
        if (!ok) {
          logout();
          return;
        }
        res = await fetch(`${API_BASE_URL}/platform/integrations/payments`, { headers: authHeaders() });
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message ?? "Could not load payment settings.");
        return;
      }
      const json = (await res.json()) as PaymentGetResponse;
      setPaymentsEnabled(json.paymentsEnabled);
      setProvider(json.provider);
      setStripePublishableKey(json.stripePublishableKey);
      setStripeSecret("");
      setStripeWebhook("");
      setAdyenMerchant(json.adyenMerchantAccount);
      setAdyenClient(json.adyenClientKey);
      setAdyenEnv(json.adyenEnvironment);
      setAdyenApi("");
      setHasStripeSecret(json.hasStripeSecret);
      setHasStripeWebhook(json.hasStripeWebhookSecret);
      setHasAdyenApiKey(json.hasAdyenApiKey);
      setUpdatedAt(json.updatedAt);
      setMethodSelection(new Set(json.acceptedPaymentMethods ?? DEFAULT_PLATFORM_ACCEPTED_PAYMENT_METHODS));
    } catch {
      setError("Could not load payment settings.");
    } finally {
      setLoading(false);
    }
  }, [authHeaders, logout, refreshSession]);

  useEffect(() => {
    void load();
  }, [load]);

  const buildPutBody = useCallback(
    (paymentsEnabledOverride?: boolean): PlatformPaymentPutBodyInput => {
      const acceptedPaymentMethods = PLATFORM_PAYMENT_METHOD_IDS.filter((id) => methodSelection.has(id));
      const body: PlatformPaymentPutBodyInput = {
        paymentsEnabled: paymentsEnabledOverride ?? paymentsEnabled,
        provider,
        stripePublishableKey,
        adyenMerchantAccount: adyenMerchant,
        adyenClientKey: adyenClient,
        adyenEnvironment: adyenEnv,
        acceptedPaymentMethods
      };
      if (stripeSecret.trim() !== "") body.stripeSecretKey = stripeSecret.trim();
      if (stripeWebhook.trim() !== "") body.stripeWebhookSecret = stripeWebhook.trim();
      if (adyenApi.trim() !== "") body.adyenApiKey = adyenApi.trim();
      return body;
    },
    [
      paymentsEnabled,
      provider,
      stripePublishableKey,
      adyenMerchant,
      adyenClient,
      adyenEnv,
      stripeSecret,
      stripeWebhook,
      adyenApi,
      methodSelection
    ]
  );

  const putPayments = useCallback(
    async (body: PlatformPaymentPutBodyInput) => {
      let res = await fetch(`${API_BASE_URL}/platform/integrations/payments`, {
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
        res = await fetch(`${API_BASE_URL}/platform/integrations/payments`, {
          method: "PUT",
          headers: { ...authHeaders(), "content-type": "application/json" },
          body: JSON.stringify(body)
        });
      }
      const data = (await res.json().catch(() => null)) as PaymentGetResponse | { message?: string } | null;
      if (!res.ok) {
        const msg = data && typeof data === "object" && "message" in data ? String(data.message) : "";
        setSaveError(msg || "Could not save payment settings.");
        return false;
      }
      const json = data as PaymentGetResponse;
      setPaymentsEnabled(json.paymentsEnabled);
      setProvider(json.provider);
      setStripePublishableKey(json.stripePublishableKey);
      setStripeSecret("");
      setStripeWebhook("");
      setAdyenMerchant(json.adyenMerchantAccount);
      setAdyenClient(json.adyenClientKey);
      setAdyenEnv(json.adyenEnvironment);
      setAdyenApi("");
      setHasStripeSecret(json.hasStripeSecret);
      setHasStripeWebhook(json.hasStripeWebhookSecret);
      setHasAdyenApiKey(json.hasAdyenApiKey);
      setUpdatedAt(json.updatedAt);
      setMethodSelection(new Set(json.acceptedPaymentMethods ?? DEFAULT_PLATFORM_ACCEPTED_PAYMENT_METHODS));
      return true;
    },
    [authHeaders, logout, refreshSession]
  );

  const saveConfiguration = async () => {
    setSaveError("");
    setSaving(true);
    try {
      const ok = await putPayments(buildPutBody());
      if (ok) await load();
    } finally {
      setSaving(false);
    }
  };

  const togglePaymentsEnabled = useCallback(
    async (next: boolean) => {
      const prev = paymentsEnabled;
      setPaymentsEnabled(next);
      setSaveError("");
      setToggleBusy(true);
      try {
        const ok = await putPayments(buildPutBody(next));
        if (!ok) {
          setPaymentsEnabled(prev);
          return;
        }
        await load();
      } catch {
        setPaymentsEnabled(prev);
        setSaveError("Could not update payment integration.");
      } finally {
        setToggleBusy(false);
      }
    },
    [buildPutBody, load, paymentsEnabled, putPayments]
  );

  if (loading) {
    return <p className="text-sm text-stone-500">Loading…</p>;
  }

  return (
    <div
      id="super-integ-panel-payments"
      role="tabpanel"
      aria-labelledby="super-integ-tab-payments"
      className="space-y-8"
    >
      {saveError ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
          {saveError}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-rose-600" role="alert">
          {error}
        </p>
      ) : null}

      <section
        className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm ring-1 ring-slate-900/5"
        aria-labelledby="super-integ-pay-enable-heading"
      >
        <div className="flex flex-col sm:flex-row sm:items-stretch">
          <div className="min-w-0 flex-1 p-5 sm:p-6">
            <h2 id="super-integ-pay-enable-heading" className="text-sm font-semibold text-slate-900">
              Payment processing
            </h2>
            <p className="mt-1 text-sm text-stone-600">
              Subscriptions, invoices, and ledger logic stay in this application. The selected provider (Stripe{" "}
              <strong className="font-semibold text-slate-800">or</strong> Adyen — never both) is only used to collect
              charges and webhooks. When disabled, no tenant-facing payment APIs should call the processor. Use the{" "}
              <strong className="font-semibold text-slate-800">toggle</strong> in the gray strip; changes apply
              immediately when you flip it (same credentials as the form below).
            </p>
          </div>
          <div className="mx-auto flex w-[8%] min-w-16 max-w-full shrink-0 items-center justify-center border-t border-stone-200/90 bg-stone-100 px-1 py-3 sm:mx-0 sm:flex-none sm:border-l sm:border-t-0 sm:px-1.5 sm:py-4">
            <Switch
              checked={paymentsEnabled}
              disabled={toggleBusy || saving || Boolean(error)}
              aria-busy={toggleBusy}
              aria-label={paymentsEnabled ? "Payment processing, on" : "Payment processing, off"}
              onCheckedChange={(next) => void togglePaymentsEnabled(next)}
            />
          </div>
        </div>
      </section>

      <section
        className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm ring-1 ring-slate-900/5"
        aria-labelledby="super-integ-pay-provider-heading"
      >
        <h2 id="super-integ-pay-provider-heading" className="text-sm font-semibold text-slate-900">
          Active processor
        </h2>
        <p className="mt-1 text-sm text-stone-600">
          Pick exactly one. Saving applies this choice for all payment capture calls configured for this deployment.
        </p>
        <fieldset className="mt-4 space-y-3">
          <legend className="sr-only">Payment processor</legend>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-stone-200/90 p-3 hover:bg-stone-50/80">
            <input
              type="radio"
              name="payment-provider"
              checked={provider === "stripe"}
              onChange={() => setProvider("stripe")}
              className="mt-1 border-stone-300 text-indigo-600 focus:ring-amber-400"
            />
            <span>
              <span className="text-sm font-semibold text-stone-900">Stripe</span>
              <span className="mt-0.5 block text-xs text-stone-600">Cards, wallets, and Stripe Billing-compatible flows.</span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-stone-200/90 p-3 hover:bg-stone-50/80">
            <input
              type="radio"
              name="payment-provider"
              checked={provider === "adyen"}
              onChange={() => setProvider("adyen")}
              className="mt-1 border-stone-300 text-indigo-600 focus:ring-amber-400"
            />
            <span>
              <span className="text-sm font-semibold text-stone-900">Adyen</span>
              <span className="mt-0.5 block text-xs text-stone-600">Unified commerce / Adyen Checkout and webhooks.</span>
            </span>
          </label>
        </fieldset>
      </section>

      <section
        className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm ring-1 ring-slate-900/5"
        aria-labelledby="super-integ-pay-methods-heading"
      >
        <div className="p-5 sm:p-6">
          <h2 id="super-integ-pay-methods-heading" className="text-sm font-semibold text-slate-900">
            Accepted payment methods
          </h2>
          <p className="mt-1 text-sm text-stone-600">
            Turn methods on or off for this deployment. Checkout and payment flows should only offer methods that are
            enabled here (subject to processor and shopper eligibility). At least one method must stay on. Use{" "}
            <strong className="font-semibold text-slate-800">Save configuration</strong> below; the payment-processing
            toggle at the top also saves your current choices immediately.
          </p>
        </div>
        {PAYMENT_METHOD_ROWS.map((row) => (
          <div
            key={row.id}
            className="flex flex-col border-t border-stone-200/90 sm:flex-row sm:items-stretch"
          >
            <div className="flex min-w-0 flex-1 gap-3 p-5 sm:items-center sm:p-6">
              <div className="flex shrink-0 items-center justify-center self-start rounded-lg border border-stone-200/80 bg-stone-50/90 px-2 py-1.5 sm:self-center">
                {row.logos === "card" ? (
                  <CreditCard className="h-8 w-8 text-stone-800" strokeWidth={1.75} aria-hidden />
                ) : row.logos === "paypal" ? (
                  <img
                    src="https://cdn.simpleicons.org/paypal/00457C"
                    width={72}
                    height={28}
                    className="h-7 w-auto max-w-[4.5rem]"
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                ) : row.logos === "wallets" ? (
                  <div className="flex items-center gap-1.5">
                    <img
                      src="https://cdn.simpleicons.org/apple/000000"
                      width={28}
                      height={28}
                      className="h-7 w-7"
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
                    <img
                      src="https://cdn.simpleicons.org/googlepay/4285F4"
                      width={28}
                      height={28}
                      className="h-7 w-7"
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5" role="group" aria-label="iDEAL and Wero">
                    <img
                      src="/payment-brands/ideal.svg"
                      width={72}
                      height={28}
                      className="h-7 w-auto max-w-[4.5rem]"
                      alt="iDEAL"
                      loading="lazy"
                      decoding="async"
                    />
                    <img
                      src="/payment-brands/wero.svg"
                      width={60}
                      height={28}
                      className="h-7 w-auto max-w-[3.75rem]"
                      alt="Wero"
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-stone-900">{row.title}</h3>
                <p className="mt-0.5 text-xs text-stone-600">{row.body}</p>
              </div>
            </div>
            <div className="mx-auto flex w-[8%] min-w-16 max-w-full shrink-0 items-center justify-center border-t border-stone-200/90 bg-stone-100 px-1 py-3 sm:mx-0 sm:flex-none sm:border-l sm:border-t-0 sm:px-1.5 sm:py-4">
              <Switch
                checked={methodSelection.has(row.id)}
                disabled={toggleBusy || saving || Boolean(error)}
                aria-label={methodSelection.has(row.id) ? `${row.title}, on` : `${row.title}, off`}
                onCheckedChange={(next) => {
                  if (!next && methodSelection.size === 1 && methodSelection.has(row.id)) {
                    setSaveError("At least one payment method must stay enabled.");
                    return;
                  }
                  setSaveError("");
                  setMethodSelection((prev) => {
                    const n = new Set(prev);
                    if (next) n.add(row.id);
                    else n.delete(row.id);
                    return n;
                  });
                }}
              />
            </div>
          </div>
        ))}
      </section>

      {provider === "stripe" ? (
        <section
          className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm ring-1 ring-slate-900/5"
          aria-labelledby="super-integ-pay-stripe-heading"
        >
          <h2 id="super-integ-pay-stripe-heading" className="text-sm font-semibold text-slate-900">
            Stripe configuration
          </h2>
          <p className="mt-1 text-sm text-stone-600">
            Publishable key is safe to expose to browsers; secret and webhook signing secrets are encrypted at rest with{" "}
            <code className="rounded bg-stone-100 px-1 py-0.5 text-xs">FIELD_ENCRYPTION_KEY</code>. Leave secret fields
            blank to keep the current stored values.
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="super-integ-stripe-pk" className="mb-1.5 block text-xs font-medium text-stone-600">
                Publishable key
              </label>
              <input
                id="super-integ-stripe-pk"
                value={stripePublishableKey}
                onChange={(e) => setStripePublishableKey(e.target.value)}
                className={inputClass}
                placeholder="pk_live_… or pk_test_…"
                autoComplete="off"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="super-integ-stripe-sk" className="mb-1.5 block text-xs font-medium text-stone-600">
                Secret key {hasStripeSecret ? <span className="font-normal text-stone-500">(stored)</span> : null}
              </label>
              <input
                id="super-integ-stripe-sk"
                type="password"
                value={stripeSecret}
                onChange={(e) => setStripeSecret(e.target.value)}
                className={inputClass}
                placeholder={hasStripeSecret ? "Leave blank to keep current" : "sk_live_… or sk_test_…"}
                autoComplete="new-password"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="super-integ-stripe-wh" className="mb-1.5 block text-xs font-medium text-stone-600">
                Webhook signing secret <span className="font-normal text-stone-500">(optional)</span>
                {hasStripeWebhook ? <span className="ml-1 font-normal text-stone-500">(stored)</span> : null}
              </label>
              <input
                id="super-integ-stripe-wh"
                type="password"
                value={stripeWebhook}
                onChange={(e) => setStripeWebhook(e.target.value)}
                className={inputClass}
                placeholder="whsec_…"
                autoComplete="new-password"
              />
            </div>
            <div className="sm:col-span-2 rounded-md border border-stone-100 bg-stone-50 px-3 py-2 text-xs leading-relaxed text-stone-700">
              <span className="font-semibold text-stone-800">Stripe webhook URL</span> (Dashboard → Developers →
              Webhooks → Add endpoint):{" "}
              <code className="mt-1 block break-all font-mono text-[0.8rem] text-stone-900">
                {API_BASE_URL}/webhooks/stripe
              </code>
              <span className="mt-1 block text-stone-600">
                Subscribe to at least <code className="font-mono">setup_intent.succeeded</code>,{" "}
                <code className="font-mono">payment_intent.succeeded</code>, and{" "}
                <code className="font-mono">payment_intent.payment_failed</code>.
              </span>
            </div>
          </div>
        </section>
      ) : (
        <section
          className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm ring-1 ring-slate-900/5"
          aria-labelledby="super-integ-pay-adyen-heading"
        >
          <h2 id="super-integ-pay-adyen-heading" className="text-sm font-semibold text-slate-900">
            Adyen configuration
          </h2>
          <p className="mt-1 text-sm text-stone-600">
            API key is encrypted at rest. Client key is typically used from the browser for Drop-in / Components. Leave
            API key blank to keep the current stored value.
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="super-integ-adyen-merchant" className="mb-1.5 block text-xs font-medium text-stone-600">
                Merchant account
              </label>
              <input
                id="super-integ-adyen-merchant"
                value={adyenMerchant}
                onChange={(e) => setAdyenMerchant(e.target.value)}
                className={inputClass}
                autoComplete="off"
              />
            </div>
            <div>
              <label htmlFor="super-integ-adyen-env" className="mb-1.5 block text-xs font-medium text-stone-600">
                Environment
              </label>
              <select
                id="super-integ-adyen-env"
                value={adyenEnv}
                onChange={(e) => setAdyenEnv(e.target.value as AdyenEnv)}
                className={inputClass}
              >
                <option value="test">Test</option>
                <option value="live">Live</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="super-integ-adyen-client" className="mb-1.5 block text-xs font-medium text-stone-600">
                Client key
              </label>
              <input
                id="super-integ-adyen-client"
                value={adyenClient}
                onChange={(e) => setAdyenClient(e.target.value)}
                className={inputClass}
                autoComplete="off"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="super-integ-adyen-api" className="mb-1.5 block text-xs font-medium text-stone-600">
                API key {hasAdyenApiKey ? <span className="font-normal text-stone-500">(stored)</span> : null}
              </label>
              <input
                id="super-integ-adyen-api"
                type="password"
                value={adyenApi}
                onChange={(e) => setAdyenApi(e.target.value)}
                className={inputClass}
                placeholder={hasAdyenApiKey ? "Leave blank to keep current" : "AQE…"}
                autoComplete="new-password"
              />
            </div>
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {updatedAt ? (
          <p className="text-xs text-stone-500">Last updated {formatDateTime(updatedAt)}</p>
        ) : (
          <span />
        )}
        <button
          type="button"
          disabled={saving || toggleBusy || Boolean(error)}
          onClick={() => void saveConfiguration()}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
        >
          Save configuration
        </button>
      </div>
    </div>
  );
};
