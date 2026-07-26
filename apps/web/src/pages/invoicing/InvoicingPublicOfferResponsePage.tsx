/**
 * Invoicing Public Offer Response page.
 *
 * Tenant invoicing and quoting screen mounted under AppShell at /admin/invoicing.
 *
 * Responsibilities:
 * - Load and render primary invoicing and quoting data for the route
 * - Wire user actions to tenant API endpoints
 * - Compose shared module components and modals
 *
 * Related:
 * - Route: /admin/invoicing
 *
 * Security:
 * - Tenant-scoped API calls via authenticated session
 */
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import type { InvoicingCustomerSnapshot, InvoicingDocumentThemeColor, InvoicingTaxRateOption } from "@starter/shared";
import { invoicingPublicOfferDecisionBodySchema } from "@starter/shared";

import { API_BASE_URL } from "../../lib/api.js";
import { InvoicingDocumentView } from "./InvoicingDocumentView.js";
import { invFieldClass, invFocusRingClass, invLabelClass, readInvoicingApiError, type InvoicingLineItemView } from "./invoicingUi.js";

const PublicPanel = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm ring-1 ring-slate-900/5">
    <h2 className="text-lg font-semibold text-stone-900">{title}</h2>
    <div className="mt-4">{children}</div>
  </section>
);

type PublicOfferDetail = {
  id: string;
  status: string;
  displayDocumentNumber: string;
  currencyCode: string;
  documentDate: string;
  offerExpiryDate: string | null;
  subtotalExcludingTaxMinor: number;
  discountTotalMinor: number;
  taxTotalMinor: number;
  totalIncludingTaxMinor: number;
  customerSnapshot: InvoicingCustomerSnapshot;
  issuerSnapshot: Record<string, string | null | undefined>;
  notes: string;
  termsText: string;
  footerText: string;
  lineItems: InvoicingLineItemView[];
};

const usePublicOfferCompanyLogoUrl = (token: string, hasCompanyLogo: boolean, cacheKey: string) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!hasCompanyLogo || !token) {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
      setObjectUrl(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      const res = await fetch(
        `${API_BASE_URL}/public/invoicing/offers/respond/${encodeURIComponent(token)}/logo?cache=${encodeURIComponent(cacheKey)}`
      );
      if (cancelled || !res.ok) return;
      const blob = await res.blob();
      if (cancelled) return;
      const u = URL.createObjectURL(blob);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = u;
      setObjectUrl(u);
    })();

    return () => {
      cancelled = true;
    };
  }, [cacheKey, hasCompanyLogo, token]);

  useEffect(
    () => () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    },
    []
  );

  return objectUrl;
};

/** Route page component for tenant invoicing & quoting under AppShell. */
export const InvoicingPublicOfferResponsePage = () => {
  const { token = "" } = useParams();
  const [searchParams] = useSearchParams();
  const decisionParam = searchParams.get("decision");
  const decision = decisionParam === "accept" || decisionParam === "reject" ? decisionParam : null;

  const [offer, setOffer] = useState<PublicOfferDetail | null>(null);
  const [taxRateOptions, setTaxRateOptions] = useState<InvoicingTaxRateOption[]>([]);
  const [documentThemeColor, setDocumentThemeColor] = useState<InvoicingDocumentThemeColor>("purple");
  const [hasCompanyLogo, setHasCompanyLogo] = useState(false);
  const [configUpdatedAt, setConfigUpdatedAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [completedDecision, setCompletedDecision] = useState<"accept" | "reject" | null>(null);
  const [responderName, setResponderName] = useState("");
  const [comment, setComment] = useState("");
  const [nameError, setNameError] = useState("");
  const [commentError, setCommentError] = useState("");

  const companyLogoUrl = usePublicOfferCompanyLogoUrl(token, hasCompanyLogo, configUpdatedAt || "none");

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError("This offer response link is invalid.");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    void (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/public/invoicing/offers/respond/${encodeURIComponent(token)}`);
        if (cancelled) return;
        if (!res.ok) {
          setError(await readInvoicingApiError(res, "This offer response link is no longer available."));
          setOffer(null);
          return;
        }
        const json = (await res.json()) as {
          offer: PublicOfferDetail;
          configuration: {
            taxRateOptions: InvoicingTaxRateOption[];
            documentThemeColor: InvoicingDocumentThemeColor;
            hasCompanyLogo: boolean;
            updatedAt: string;
          } | null;
        };
        setOffer(json.offer);
        setTaxRateOptions(json.configuration?.taxRateOptions ?? []);
        setDocumentThemeColor(json.configuration?.documentThemeColor ?? "purple");
        setHasCompanyLogo(Boolean(json.configuration?.hasCompanyLogo));
        setConfigUpdatedAt(json.configuration?.updatedAt ?? "");
        const contactName = json.offer.customerSnapshot.contactName?.trim();
        if (contactName) setResponderName(contactName);
      } catch {
        if (!cancelled) {
          setError("Could not load this offer.");
          setOffer(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const submitDecision = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !decision || busy) return;

    const parsed = invoicingPublicOfferDecisionBodySchema.safeParse({
      decision,
      responderName,
      comment
    });
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      setNameError(fieldErrors.responderName?.[0] ?? "");
      setCommentError(fieldErrors.comment?.[0] ?? "");
      setError("Your name and a comment are both required.");
      return;
    }

    setNameError("");
    setCommentError("");
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE_URL}/public/invoicing/offers/respond/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data)
      });
      if (!res.ok) {
        setError(await readInvoicingApiError(res, "Could not submit your response."));
        return;
      }
      setCompletedDecision(decision);
    } catch {
      setError("Could not submit your response.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <p className="text-sm text-stone-500">Loading offer…</p>
      </div>
    );
  }

  if (!offer) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <PublicPanel title="Offer unavailable">
          <p className="text-sm text-stone-600">{error || "This offer response link is no longer available."}</p>
          <p className="mt-4 text-sm text-stone-500">
            The link may have expired with the offer validity date, or the offer may already have been decided.
          </p>
        </PublicPanel>
      </div>
    );
  }

  if (completedDecision) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <PublicPanel title={completedDecision === "accept" ? "Offer accepted" : "Offer rejected"}>
          <p className="text-sm text-stone-600">
            Thank you. Your {completedDecision === "accept" ? "acceptance" : "rejection"} of offer{" "}
            <span className="font-medium text-stone-900">{offer.displayDocumentNumber}</span> has been recorded.
          </p>
        </PublicPanel>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Secure offer response</p>
        <h1 className="text-2xl font-semibold text-stone-900">
          {decision === "accept" ? "Accept offer" : decision === "reject" ? "Reject offer" : "Review offer"}
        </h1>
        <p className="text-sm text-stone-600">
          You are responding as a guest. Only this secure link authorizes you to view and respond to this offer.
        </p>
      </div>

      <InvoicingDocumentView
        kind="offer"
        number={offer.displayDocumentNumber}
        documentDate={offer.documentDate}
        currencyCode={offer.currencyCode}
        issuerSnapshot={offer.issuerSnapshot}
        customerSnapshot={offer.customerSnapshot}
        subtotalExcludingTaxMinor={offer.subtotalExcludingTaxMinor}
        discountTotalMinor={offer.discountTotalMinor}
        taxTotalMinor={offer.taxTotalMinor}
        totalIncludingTaxMinor={offer.totalIncludingTaxMinor}
        notes={offer.notes}
        termsText={offer.termsText}
        footerText={offer.footerText}
        lineItems={offer.lineItems}
        taxRateOptions={taxRateOptions}
        validUntilDate={offer.offerExpiryDate}
        documentThemeColor={documentThemeColor}
        companyLogoUrl={companyLogoUrl}
      />

      {decision ? (
        <PublicPanel title={decision === "accept" ? "Confirm acceptance" : "Confirm rejection"}>
          <form className="space-y-4" onSubmit={submitDecision}>
            <p className="text-sm text-stone-600">
              Your name and a comment are both required so the sender can record your{" "}
              {decision === "accept" ? "acceptance" : "rejection"}.
            </p>
            <div>
              <label htmlFor="offer-response-name" className={invLabelClass}>
                Your name <span className="text-rose-600">*</span>
              </label>
              <input
                id="offer-response-name"
                required
                aria-required="true"
                className={invFieldClass}
                value={responderName}
                disabled={busy}
                onChange={(event) => {
                  setResponderName(event.target.value);
                  if (nameError) setNameError("");
                }}
              />
              {nameError ? <p className="mt-1 text-sm text-rose-600">{nameError}</p> : null}
            </div>
            <div>
              <label htmlFor="offer-response-comment" className={invLabelClass}>
                {decision === "accept" ? "Acceptance comment" : "Rejection comment"}{" "}
                <span className="text-rose-600">*</span>
              </label>
              <textarea
                id="offer-response-comment"
                required
                aria-required="true"
                rows={4}
                className={invFieldClass}
                value={comment}
                disabled={busy}
                onChange={(event) => {
                  setComment(event.target.value);
                  if (commentError) setCommentError("");
                }}
              />
              {commentError ? <p className="mt-1 text-sm text-rose-600">{commentError}</p> : null}
            </div>
            {error ? <p className="text-sm text-rose-600">{error}</p> : null}
            <div className="flex flex-wrap justify-end gap-2">
              {decision === "accept" ? (
                <Link
                  to={`/offer/respond/${encodeURIComponent(token)}?decision=reject`}
                  className="rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50"
                >
                  Reject instead
                </Link>
              ) : (
                <Link
                  to={`/offer/respond/${encodeURIComponent(token)}?decision=accept`}
                  className="rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50"
                >
                  Accept instead
                </Link>
              )}
              <button
                type="submit"
                disabled={busy || responderName.trim() === "" || comment.trim() === ""}
                className={[
                  "rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60",
                  decision === "accept" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700",
                  invFocusRingClass
                ].join(" ")}
              >
                {busy ? "Submitting…" : decision === "accept" ? "Accept offer" : "Reject offer"}
              </button>
            </div>
          </form>
        </PublicPanel>
      ) : (
        <PublicPanel title="Choose your response">
          <p className="mb-4 text-center text-sm text-stone-600">
            Select whether you want to accept or reject this offer.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              to={`/offer/respond/${encodeURIComponent(token)}?decision=accept`}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Accept offer
            </Link>
            <Link
              to={`/offer/respond/${encodeURIComponent(token)}?decision=reject`}
              className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700"
            >
              Reject offer
            </Link>
          </div>
        </PublicPanel>
      )}
    </div>
  );
};
