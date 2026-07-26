/**
 * StripeSubscriptionCardForm
 *
 * Stripe.js SetupIntent card capture for realm subscription billing.
 *
 * Responsibilities:
 * - Request client secret and publishable key from tenant API
 * - Mount Stripe Card Element and confirm SetupIntent on submit
 * - Tear down Stripe instances on unmount
 *
 * Related:
 * - Realm subscription settings; `@stripe/stripe-js`
 *
 * Security:
 * - PAN never touches this app — Stripe Elements tokenize card data client-side.
 */
import { loadStripe, type Stripe, type StripeCardElement } from "@stripe/stripe-js";
import { useCallback, useEffect, useRef, useState } from "react";

import { API_BASE_URL } from "../lib/api.js";

type Props = {
  /** POST endpoint that returns `{ clientSecret, publishableKey }` (e.g. `/tenant/subscription/stripe/setup-intent`). */
  setupIntentPath: string;
  authHeaders: () => Record<string, string>;
  refreshSession: () => Promise<boolean>;
  logout: () => void;
  /** Called after Stripe confirms the SetupIntent successfully. */
  onSuccess: () => void;
};

/**
 * Embedded card capture (Stripe.js Card Element + SetupIntent) — architecture **g**; PAN never touches this app.
 */
export const StripeSubscriptionCardForm = ({
  setupIntentPath,
  authHeaders,
  refreshSession,
  logout,
  onSuccess
}: Props) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const stripeRef = useRef<Stripe | null>(null);
  const cardRef = useRef<StripeCardElement | null>(null);
  const [open, setOpen] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const teardownCard = useCallback(() => {
    try {
      cardRef.current?.unmount();
    } catch {
      /* ignore */
    }
    cardRef.current = null;
    stripeRef.current = null;
    setClientSecret(null);
    setPublishableKey(null);
  }, []);

  useEffect(() => {
    return () => {
      teardownCard();
    };
  }, [teardownCard]);

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

  const startSetup = useCallback(async () => {
    setMsg("");
    setOpen(false);
    setBusy(true);
    teardownCard();
    try {
      const res = await doFetch(`${API_BASE_URL}${setupIntentPath}`, { method: "POST" });
      if (!res || !res.ok) {
        const j = res ? ((await res.json().catch(() => null)) as { message?: string } | null) : null;
        setMsg(j?.message ?? "Could not start card setup.");
        setOpen(false);
        return;
      }
      const j = (await res.json()) as { clientSecret: string; publishableKey: string };
      setClientSecret(j.clientSecret);
      setPublishableKey(j.publishableKey.trim());
      setOpen(true);
    } catch {
      setMsg("Could not start card setup.");
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }, [doFetch, setupIntentPath, teardownCard]);

  useEffect(() => {
    if (!open || !publishableKey || !clientSecret || !mountRef.current) return;

    let cancelled = false;
    void (async () => {
      const stripe = await loadStripe(publishableKey);
      if (cancelled || !stripe || !mountRef.current) return;
      stripeRef.current = stripe;
      const elements = stripe.elements();
      const card = elements.create("card", {
        style: {
          base: {
            fontSize: "16px",
            color: "#1e293b",
            "::placeholder": { color: "#94a3b8" }
          }
        }
      });
      card.mount(mountRef.current);
      cardRef.current = card;
    })();

    return () => {
      cancelled = true;
      try {
        cardRef.current?.unmount();
      } catch {
        /* ignore */
      }
      cardRef.current = null;
      stripeRef.current = null;
    };
  }, [open, publishableKey, clientSecret]);

  const confirm = useCallback(async () => {
    const stripe = stripeRef.current;
    const card = cardRef.current;
    if (!stripe || !card || !clientSecret) {
      setMsg("Card form is not ready yet.");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const { error } = await stripe.confirmCardSetup(clientSecret, {
        payment_method: { card }
      });
      if (error) {
        setMsg(error.message ?? "Card setup failed.");
        return;
      }
      setOpen(false);
      teardownCard();
      onSuccess();
    } catch {
      setMsg("Card setup failed.");
    } finally {
      setBusy(false);
    }
  }, [clientSecret, onSuccess, teardownCard]);

  return (
    <div className="mt-4 rounded-lg border border-stone-200 bg-white p-3 text-sm">
      <p className="font-semibold text-stone-900">Payment method (Stripe)</p>
      <p className="mt-1 text-xs text-stone-600">
        Card details are sent directly to Stripe. This app stores only ids and a masked summary for support.
      </p>
      {msg ? (
        <p className="mt-2 text-xs text-rose-600" role="alert">
          {msg}
        </p>
      ) : null}
      {!open ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void startSetup()}
          className="mt-3 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
        >
          {busy ? "Preparing…" : "Add or update card"}
        </button>
      ) : (
        <div className="mt-3 space-y-3">
          <div ref={mountRef} className="rounded-md border border-stone-200 bg-white px-2 py-2" />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void confirm()}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save card"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                teardownCard();
              }}
              className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-800 shadow-sm hover:bg-stone-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
