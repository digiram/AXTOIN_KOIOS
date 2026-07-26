/**
 * Invoicing Offer Detail page.
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
import {
  canDemoteOfferToQuote,
  canPromoteOfferToInvoice,
  canSendOfferEmail,
  type InvoicingCustomerSnapshot,
  type InvoicingIssuerSnapshot,
  type InvoicingOfferStatus,
  type InvoicingTaxRateOption,
  type InvoicingDocumentThemeColor
} from "@starter/shared";
import { Check, Mail, ReceiptText, Send, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useModulePermissions } from "../../hooks/useModulePermissions.js";
import { InvoicingDemoteToQuoteModal } from "./InvoicingDemoteToQuoteModal.js";
import { InvoicingDocumentSidebarActionButton } from "./InvoicingDocumentSidebarAction.js";
import { InvoicingDocumentDetailFrame, InvoicingDocumentSidebarActions, InvoicingDocumentView, type InvoicingDocumentSourceLink } from "./InvoicingDocumentView.js";
import { InvoicingSendDocumentEmailModal } from "./InvoicingSendDocumentEmailModal.js";
import { InvoicingSendOfferModal } from "./InvoicingSendOfferModal.js";
import {
  invBackLinkClass,
  invDocumentSidebarActionDangerClass,
  invDocumentSidebarActionPrimaryClass,
  invDocumentSidebarActionSecondaryClass,
  invDocumentSidebarActionSuccessClass,
  readInvoicingApiError,
  type InvoicingLineItemView
} from "./invoicingUi.js";
import { useInvoicingApi } from "./useInvoicingApi.js";
import { useInvoicingCompanyLogoUrl } from "./useInvoicingCompanyLogo.js";

type OfferDetail = {
  id: string;
  status: InvoicingOfferStatus;
  documentNumber: string;
  displayDocumentNumber: string;
  revision: string | null;
  sourceQuoteId: string | null;
  sourceQuoteNumber: string | null;
  promotedInvoiceId: string | null;
  promotedInvoiceDisplayNumber: string | null;
  currencyCode: string;
  documentDate: string;
  offerExpiryDate: string | null;
  subtotalExcludingTaxMinor: number;
  discountTotalMinor: number;
  taxTotalMinor: number;
  totalIncludingTaxMinor: number;
  customerSnapshot: InvoicingCustomerSnapshot;
  issuerSnapshot: InvoicingIssuerSnapshot;
  notes: string;
  internalNotes: string;
  termsText: string;
  footerText: string;
  lineItems: InvoicingLineItemView[];
};

/** Route page component for tenant invoicing & quoting under AppShell. */
export const InvoicingOfferDetailPage = () => {
  const { offerId } = useParams();
  const navigate = useNavigate();
  const { authedFetch } = useInvoicingApi();
  const { canWrite } = useModulePermissions("invoicing");
  const [offer, setOffer] = useState<OfferDetail | null>(null);
  const [taxRateOptions, setTaxRateOptions] = useState<InvoicingTaxRateOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [acceptError, setAcceptError] = useState("");
  const [rejectError, setRejectError] = useState("");
  const [demoteOpen, setDemoteOpen] = useState(false);
  const [demoteError, setDemoteError] = useState("");
  const [sendOpen, setSendOpen] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sendEmailOpen, setSendEmailOpen] = useState(false);
  const [sendEmailError, setSendEmailError] = useState("");
  const [defaultQuoteValidityDays, setDefaultQuoteValidityDays] = useState<number | null>(null);
  const [documentThemeColor, setDocumentThemeColor] = useState<InvoicingDocumentThemeColor>("purple");
  const [hasCompanyLogo, setHasCompanyLogo] = useState(false);
  const [configUpdatedAt, setConfigUpdatedAt] = useState("");
  const companyLogoUrl = useInvoicingCompanyLogoUrl(hasCompanyLogo, configUpdatedAt || "none");

  const load = useCallback(async () => {
    if (!offerId) return;
    setLoading(true);
    setError("");
    try {
      const res = await authedFetch(`/tenant/invoicing/offers/${offerId}`);
      if (!res.ok) {
        setError(await readInvoicingApiError(res, "Offer not found."));
        setOffer(null);
        return;
      }
      const json = (await res.json()) as {
        offer: OfferDetail;
        configuration: {
          taxRateOptions: InvoicingTaxRateOption[];
          defaultQuoteValidityDays: number | null;
          documentThemeColor: InvoicingDocumentThemeColor;
          hasCompanyLogo: boolean;
          updatedAt: string;
        } | null;
      };
      setOffer(json.offer);
      setTaxRateOptions(json.configuration?.taxRateOptions ?? []);
      setDefaultQuoteValidityDays(json.configuration?.defaultQuoteValidityDays ?? null);
      setDocumentThemeColor(json.configuration?.documentThemeColor ?? "purple");
      setHasCompanyLogo(Boolean(json.configuration?.hasCompanyLogo));
      setConfigUpdatedAt(json.configuration?.updatedAt ?? "");
    } catch {
      setError("Could not load offer.");
    } finally {
      setLoading(false);
    }
  }, [authedFetch, offerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const promoteToInvoice = async () => {
    if (!offerId || !canWrite) return;
    setBusy(true);
    setError("");
    try {
      const res = await authedFetch(`/tenant/invoicing/offers/${offerId}/promote-to-invoice`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}"
      });
      if (!res.ok) {
        setError(await readInvoicingApiError(res, "Could not create invoice."));
        return;
      }
      const json = (await res.json()) as { invoiceId: string };
      navigate(`/admin/invoicing/invoices/${json.invoiceId}`);
    } catch {
      setError("Could not create invoice.");
    } finally {
      setBusy(false);
    }
  };

  const sendOfferEmail = async (input: { to: string; subject?: string }) => {
    if (!offerId || !canWrite) return;
    setBusy(true);
    setSendEmailError("");
    try {
      const res = await authedFetch(`/tenant/invoicing/offers/${offerId}/send-email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input)
      });
      if (!res.ok) {
        setSendEmailError(await readInvoicingApiError(res, "Could not send offer email."));
        return;
      }
      setSendEmailOpen(false);
      await load();
    } catch {
      setSendEmailError("Could not send offer email.");
    } finally {
      setBusy(false);
    }
  };

  const sendOffer = async (input: { offerExpiryDate: string; to: string; subject?: string }) => {
    if (!offerId || !canWrite) return;
    setBusy(true);
    setSendError("");
    try {
      const res = await authedFetch(`/tenant/invoicing/offers/${offerId}/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input)
      });
      if (!res.ok) {
        setSendError(await readInvoicingApiError(res, "Could not send offer."));
        return;
      }
      setSendOpen(false);
      await load();
    } catch {
      setSendError("Could not send offer.");
    } finally {
      setBusy(false);
    }
  };

  const acceptOffer = async (acceptanceProof: string) => {
    if (!offerId || !canWrite) return;
    setBusy(true);
    setAcceptError("");
    try {
      const res = await authedFetch(`/tenant/invoicing/offers/${offerId}/accept`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ acceptanceProof })
      });
      if (!res.ok) {
        setAcceptError(await readInvoicingApiError(res, "Could not accept offer."));
        return;
      }
      setAcceptOpen(false);
      await load();
    } catch {
      setAcceptError("Could not accept offer.");
    } finally {
      setBusy(false);
    }
  };

  const rejectOffer = async (reason: string) => {
    if (!offerId || !canWrite) return;
    setBusy(true);
    setRejectError("");
    try {
      const res = await authedFetch(`/tenant/invoicing/offers/${offerId}/reject`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason })
      });
      if (!res.ok) {
        setRejectError(await readInvoicingApiError(res, "Could not reject offer."));
        return;
      }
      setRejectOpen(false);
      await load();
    } catch {
      setRejectError("Could not reject offer.");
    } finally {
      setBusy(false);
    }
  };

  const demoteToQuote = async (reason: string) => {
    if (!offerId || !canWrite) return;
    setBusy(true);
    setDemoteError("");
    try {
      const res = await authedFetch(`/tenant/invoicing/offers/${offerId}/demote-to-quote`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason })
      });
      if (!res.ok) {
        setDemoteError(await readInvoicingApiError(res, "Could not create quote."));
        return;
      }
      const json = (await res.json()) as { quoteId: string };
      setDemoteOpen(false);
      navigate(`/admin/invoicing/quotes/${json.quoteId}`);
    } catch {
      setDemoteError("Could not create quote.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p className="text-sm text-stone-500">Loading…</p>;
  if (!offer) return <p className="text-sm text-rose-600">{error || "Offer not found."}</p>;

  const isDraft = offer.status === "offer_draft";
  const isSent = offer.status === "offer_sent";
  const canPromote = canWrite && canPromoteOfferToInvoice(offer.status);
  const canDemote = canWrite && canDemoteOfferToQuote(offer.status);
  const canResendEmail = canWrite && canSendOfferEmail(offer.status);
  const displayNumber = offer.displayDocumentNumber ?? offer.documentNumber;
  const customerEmail = offer.customerSnapshot.email?.trim() ?? "";
  const companyName = offer.issuerSnapshot.companyName?.trim() ?? "";
  const defaultEmailSubject = companyName ? `Offer ${displayNumber} from ${companyName}` : `Offer ${displayNumber}`;
  const sourceLinks: InvoicingDocumentSourceLink[] = [];
  if (offer.sourceQuoteId) {
    sourceLinks.push({
      label: "From quote",
      href: `/admin/invoicing/quotes/${offer.sourceQuoteId}`,
      text: offer.sourceQuoteNumber ?? "View quote"
    });
  }
  if (offer.promotedInvoiceId) {
    sourceLinks.push({
      label: "Promoted to invoice",
      href: `/admin/invoicing/invoices/${offer.promotedInvoiceId}`,
      text: offer.promotedInvoiceDisplayNumber ?? "View invoice"
    });
  }

  const sidebarActions =
    canWrite ? (
      <InvoicingDocumentSidebarActions>
        {isDraft ? (
          <>
            <InvoicingDocumentSidebarActionButton
              icon={Send}
              disabled={busy}
              className={invDocumentSidebarActionPrimaryClass}
              onClick={() => {
                setSendError("");
                setSendOpen(true);
              }}
            >
              Send offer
            </InvoicingDocumentSidebarActionButton>
            {canDemote ? (
              <InvoicingDocumentSidebarActionButton
                icon={Undo2}
                disabled={busy}
                className={invDocumentSidebarActionSecondaryClass}
                onClick={() => {
                  setDemoteError("");
                  setDemoteOpen(true);
                }}
              >
                Demote to quote
              </InvoicingDocumentSidebarActionButton>
            ) : null}
          </>
        ) : null}
        {isSent ? (
          <>
            <InvoicingDocumentSidebarActionButton
              icon={Check}
              disabled={busy}
              className={invDocumentSidebarActionSuccessClass}
              onClick={() => {
                setAcceptError("");
                setAcceptOpen(true);
              }}
            >
              Accept offer
            </InvoicingDocumentSidebarActionButton>
            <InvoicingDocumentSidebarActionButton
              icon={X}
              disabled={busy}
              className={invDocumentSidebarActionDangerClass}
              onClick={() => {
                setRejectError("");
                setRejectOpen(true);
              }}
            >
              Reject offer
            </InvoicingDocumentSidebarActionButton>
          </>
        ) : null}
        {canPromote ? (
          <InvoicingDocumentSidebarActionButton
            icon={ReceiptText}
            disabled={busy}
            className={invDocumentSidebarActionPrimaryClass}
            onClick={() => void promoteToInvoice()}
          >
            {busy ? "Creating…" : "Promote to invoice"}
          </InvoicingDocumentSidebarActionButton>
        ) : null}
        {canResendEmail ? (
          <InvoicingDocumentSidebarActionButton
            icon={Mail}
            disabled={busy}
            className={invDocumentSidebarActionSecondaryClass}
            onClick={() => {
              setSendEmailError("");
              setSendEmailOpen(true);
            }}
          >
            Resend offer
          </InvoicingDocumentSidebarActionButton>
        ) : null}
      </InvoicingDocumentSidebarActions>
    ) : undefined;

  return (
    <div className="space-y-6">
      <Link to="/admin/invoicing" className={invBackLinkClass}>
        ← All documents
      </Link>

      <InvoicingDocumentDetailFrame
        kind="offer"
        status={offer.status}
        currencyCode={offer.currencyCode}
        internalNotes={offer.internalNotes}
        sourceLinks={sourceLinks.length > 0 ? sourceLinks : undefined}
        sidebarActions={sidebarActions}
        auditDocument={offerId ? { kind: "offer", documentId: offerId } : undefined}
      >
        <InvoicingDocumentView
          kind="offer"
          number={displayNumber}
          documentDate={offer.documentDate}
          currencyCode={offer.currencyCode}
          issuerSnapshot={offer.issuerSnapshot ?? {}}
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
      </InvoicingDocumentDetailFrame>

      <InvoicingDemoteToQuoteModal
        open={acceptOpen}
        title="Accept offer"
        description="Record how the customer accepted this offer. This proof is required and will appear in the audit trail."
        confirmLabel="Accept offer"
        fieldLabel="Customer acceptance proof"
        fieldPlaceholder="e.g. Signed PDF received by email on 12 Jun 2026, verbal confirmation from Jane Doe."
        confirmButtonClass="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
        busy={busy}
        error={acceptError}
        onClose={() => setAcceptOpen(false)}
        onConfirm={acceptOffer}
      />

      <InvoicingDemoteToQuoteModal
        open={rejectOpen}
        title="Reject offer"
        description="Explain why this offer is being rejected. Your reason is required and will appear in the audit trail."
        confirmLabel="Reject offer"
        fieldLabel="Rejection reason"
        fieldPlaceholder="Explain why the customer declined or why this offer is being rejected."
        confirmButtonClass="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60"
        busy={busy}
        error={rejectError}
        onClose={() => setRejectOpen(false)}
        onConfirm={rejectOffer}
      />

      <InvoicingDemoteToQuoteModal
        open={demoteOpen}
        title="Demote offer to quote"
        description="This creates a new editable quote from the offer and records your reason in the audit trail."
        busy={busy}
        error={demoteError}
        onClose={() => setDemoteOpen(false)}
        onConfirm={demoteToQuote}
      />

      <InvoicingSendOfferModal
        open={sendOpen}
        defaultValidityDays={defaultQuoteValidityDays}
        defaultTo={customerEmail}
        defaultSubject={defaultEmailSubject}
        busy={busy}
        error={sendError}
        onClose={() => {
          if (busy) return;
          setSendOpen(false);
          setSendError("");
        }}
        onConfirm={sendOffer}
      />

      <InvoicingSendDocumentEmailModal
        kind="offer"
        resend
        open={sendEmailOpen}
        defaultTo={customerEmail}
        defaultSubject={defaultEmailSubject}
        busy={busy}
        error={sendEmailError}
        onClose={() => {
          if (busy) return;
          setSendEmailOpen(false);
          setSendEmailError("");
        }}
        onConfirm={sendOfferEmail}
      />

    </div>
  );
};
