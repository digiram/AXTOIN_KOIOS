/**
 * Invoicing Quote Detail page.
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
  canSendQuoteEmail,
  isDeletableQuoteStatus,
  isEditableQuoteStatus,
  type InvoicingCustomerSnapshot,
  type InvoicingIssuerSnapshot,
  type InvoicingTaxRateOption,
  type InvoicingQuoteStatus,
  type InvoicingDocumentThemeColor
} from "@starter/shared";
import { Archive, ArrowUpRight, Mail, Pencil, ReceiptText, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useModulePermissions } from "../../hooks/useModulePermissions.js";
import {
  InvoicingDocumentSidebarActionButton,
  InvoicingDocumentSidebarActionLink
} from "./InvoicingDocumentSidebarAction.js";
import { InvoicingDocumentDetailFrame, InvoicingDocumentSidebarActions, InvoicingDocumentView, type InvoicingDocumentSourceLink } from "./InvoicingDocumentView.js";
import { InvoicingSendDocumentEmailModal } from "./InvoicingSendDocumentEmailModal.js";
import {
  invDocumentSidebarActionPrimaryClass,
  invDocumentSidebarActionSecondaryClass,
  invBackLinkClass,
  readInvoicingApiError,
  type InvoicingLineItemView
} from "./invoicingUi.js";
import { useInvoicingApi } from "./useInvoicingApi.js";
import { useInvoicingCompanyLogoUrl } from "./useInvoicingCompanyLogo.js";

type QuoteDetail = {
  id: string;
  status: InvoicingQuoteStatus;
  documentNumber: string | null;
  revision: string | null;
  displayDocumentNumber: string;
  temporaryReference: string | null;
  sourceOfferId: string | null;
  sourceOfferDisplayNumber: string | null;
  promotedOfferId: string | null;
  promotedOfferDisplayNumber: string | null;
  promotedInvoiceId: string | null;
  promotedInvoiceDisplayNumber: string | null;
  currencyCode: string;
  documentDate: string;
  quoteExpiryDate: string | null;
  isQuoteExpired?: boolean;
  paymentTermDays: number;
  subtotalExcludingTaxMinor: number;
  discountTotalMinor: number;
  taxTotalMinor: number;
  totalIncludingTaxMinor: number;
  customerSnapshot: InvoicingCustomerSnapshot;
  issuerSnapshot: InvoicingIssuerSnapshot;
  crmOrganizationId: string | null;
  notes: string;
  internalNotes: string;
  termsText: string;
  footerText: string;
  lineItems: InvoicingLineItemView[];
};

type Configuration = {
  allowDirectQuoteToInvoice: boolean;
  taxRateOptions: InvoicingTaxRateOption[];
  documentThemeColor: InvoicingDocumentThemeColor;
  hasCompanyLogo: boolean;
  updatedAt: string;
};

/** Route page component for tenant invoicing & quoting under AppShell. */
export const InvoicingQuoteDetailPage = () => {
  const { quoteId } = useParams();
  const navigate = useNavigate();
  const { authedFetch } = useInvoicingApi();
  const { canWrite, canDelete } = useModulePermissions("invoicing");
  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [configuration, setConfiguration] = useState<Configuration | null>(null);
  const companyLogoUrl = useInvoicingCompanyLogoUrl(
    Boolean(configuration?.hasCompanyLogo),
    configuration?.updatedAt ?? "none"
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [sendEmailOpen, setSendEmailOpen] = useState(false);
  const [sendEmailError, setSendEmailError] = useState("");

  const load = useCallback(async () => {
    if (!quoteId) return;
    setLoading(true);
    setError("");
    try {
      const res = await authedFetch(`/tenant/invoicing/quotes/${quoteId}`);
      if (!res.ok) {
        setError(await readInvoicingApiError(res, "Quote not found."));
        setQuote(null);
        return;
      }
      const json = (await res.json()) as { quote: QuoteDetail; configuration: Configuration | null };
      setQuote(json.quote);
      setConfiguration(json.configuration);
    } catch {
      setError("Could not load quote.");
    } finally {
      setLoading(false);
    }
  }, [authedFetch, quoteId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!deleteConfirm) return;
    const id = window.setTimeout(() => setDeleteConfirm(false), 5000);
    return () => window.clearTimeout(id);
  }, [deleteConfirm]);

  const deleteQuote = async () => {
    if (!quoteId || !canDelete || !quote || !isDeletableQuoteStatus(quote.status)) return;
    setBusy("delete");
    setError("");
    try {
      const res = await authedFetch(`/tenant/invoicing/quotes/${quoteId}`, { method: "DELETE" });
      if (!res.ok) {
        setError(await readInvoicingApiError(res, "Could not delete quote."));
        return;
      }
      navigate("/admin/invoicing");
    } catch {
      setError("Could not delete quote.");
    } finally {
      setBusy("");
      setDeleteConfirm(false);
    }
  };

  const promoteToOffer = async () => {
    if (!quoteId || !canWrite) return;
    setBusy("promote-offer");
    setError("");
    try {
      const res = await authedFetch(`/tenant/invoicing/quotes/${quoteId}/promote-to-offer`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}"
      });
      if (!res.ok) {
        setError(await readInvoicingApiError(res, "Could not promote to offer."));
        return;
      }
      const json = (await res.json()) as { offerId: string };
      navigate(`/admin/invoicing/offers/${json.offerId}`);
    } catch {
      setError("Could not promote to offer.");
    } finally {
      setBusy("");
    }
  };

  const promoteToInvoice = async () => {
    if (!quoteId || !canWrite) return;
    setBusy("promote-invoice");
    setError("");
    try {
      const res = await authedFetch(`/tenant/invoicing/quotes/${quoteId}/promote-to-invoice`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}"
      });
      if (!res.ok) {
        setError(await readInvoicingApiError(res, "Could not promote to invoice."));
        return;
      }
      const json = (await res.json()) as { invoiceId: string };
      navigate(`/admin/invoicing/invoices/${json.invoiceId}`);
    } catch {
      setError("Could not promote to invoice.");
    } finally {
      setBusy("");
    }
  };

  const sendQuoteEmail = async (input: { to: string; subject?: string }) => {
    if (!quoteId || !canWrite) return;
    setBusy("send-email");
    setSendEmailError("");
    try {
      const res = await authedFetch(`/tenant/invoicing/quotes/${quoteId}/send-email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input)
      });
      if (!res.ok) {
        setSendEmailError(await readInvoicingApiError(res, "Could not send quote email."));
        return;
      }
      setSendEmailOpen(false);
      await load();
    } catch {
      setSendEmailError("Could not send quote email.");
    } finally {
      setBusy("");
    }
  };

  const archiveQuote = async () => {
    if (!quoteId || !canWrite) return;
    setBusy("archive");
    setError("");
    try {
      const res = await authedFetch(`/tenant/invoicing/quotes/${quoteId}/archive`, { method: "POST" });
      if (!res.ok) {
        setError(await readInvoicingApiError(res, "Could not archive quote."));
        return;
      }
      await load();
    } catch {
      setError("Could not archive quote.");
    } finally {
      setBusy("");
    }
  };

  if (loading) return <p className="text-sm text-stone-500">Loading…</p>;
  if (!quote) return <p className="text-sm text-rose-600">{error || "Quote not found."}</p>;

  const number = quote.documentNumber ?? quote.temporaryReference ?? quote.id.slice(0, 8);
  const editable = isEditableQuoteStatus(quote.status);
  const deletable = isDeletableQuoteStatus(quote.status);
  const canEmail = canSendQuoteEmail(quote.status);
  const customerEmail = quote.customerSnapshot.email?.trim() ?? "";
  const companyName = quote.issuerSnapshot.companyName?.trim() ?? "";
  const defaultEmailSubject = companyName ? `Quote ${number} from ${companyName}` : `Quote ${number}`;
  const sourceLinks: InvoicingDocumentSourceLink[] = [];
  if (quote.sourceOfferId) {
    sourceLinks.push({
      label: "From offer",
      href: `/admin/invoicing/offers/${quote.sourceOfferId}`,
      text: quote.sourceOfferDisplayNumber ?? "View offer"
    });
  }
  if (quote.promotedOfferId) {
    sourceLinks.push({
      label: "Promoted to offer",
      href: `/admin/invoicing/offers/${quote.promotedOfferId}`,
      text: quote.promotedOfferDisplayNumber ?? "View offer"
    });
  }
  if (quote.promotedInvoiceId) {
    sourceLinks.push({
      label: "Promoted to invoice",
      href: `/admin/invoicing/invoices/${quote.promotedInvoiceId}`,
      text: quote.promotedInvoiceDisplayNumber ?? "View invoice"
    });
  }

  return (
    <div className="space-y-6">
      <Link to="/admin/invoicing" className={invBackLinkClass}>
        ← All documents
      </Link>

      <InvoicingDocumentDetailFrame
        kind="quote"
        status={quote.status}
        currencyCode={quote.currencyCode}
        internalNotes={quote.internalNotes}
        sourceLinks={sourceLinks.length > 0 ? sourceLinks : undefined}
        sidebarNotice={
          quote.isQuoteExpired && editable ? (
            <span className="text-amber-900">
              This quote is past its validity date. You can still promote it, but the customer may need an updated offer.
            </span>
          ) : !quote.crmOrganizationId && editable ? (
            <>
              Add a CRM customer on{" "}
              <Link to={`/admin/invoicing/quotes/${quoteId}/edit`} className="font-medium underline">
                edit
              </Link>{" "}
              before promoting.
            </>
          ) : undefined
        }
        sidebarActions={
          canWrite ? (
            <InvoicingDocumentSidebarActions>
              {editable ? (
                <>
                  <InvoicingDocumentSidebarActionLink
                    to={`/admin/invoicing/quotes/${quoteId}/edit`}
                    icon={Pencil}
                    className={invDocumentSidebarActionSecondaryClass}
                  >
                    Edit
                  </InvoicingDocumentSidebarActionLink>
                  <InvoicingDocumentSidebarActionButton
                    icon={ArrowUpRight}
                    disabled={busy !== ""}
                    className={invDocumentSidebarActionPrimaryClass}
                    onClick={() => void promoteToOffer()}
                  >
                    {busy === "promote-offer" ? "…" : "Promote to offer"}
                  </InvoicingDocumentSidebarActionButton>
                  {configuration?.allowDirectQuoteToInvoice ? (
                    <InvoicingDocumentSidebarActionButton
                      icon={ReceiptText}
                      disabled={busy !== ""}
                      className={invDocumentSidebarActionPrimaryClass}
                      onClick={() => void promoteToInvoice()}
                    >
                      {busy === "promote-invoice" ? "…" : "Promote to invoice"}
                    </InvoicingDocumentSidebarActionButton>
                  ) : null}
                  <InvoicingDocumentSidebarActionButton
                    icon={Archive}
                    disabled={busy !== ""}
                    className={invDocumentSidebarActionSecondaryClass}
                    onClick={() => void archiveQuote()}
                  >
                    Archive
                  </InvoicingDocumentSidebarActionButton>
                </>
              ) : null}
              {canEmail ? (
                <InvoicingDocumentSidebarActionButton
                  icon={Mail}
                  disabled={busy !== ""}
                  className={invDocumentSidebarActionSecondaryClass}
                  onClick={() => {
                    setSendEmailError("");
                    setSendEmailOpen(true);
                  }}
                >
                  {busy === "send-email" ? "…" : "Email quote"}
                </InvoicingDocumentSidebarActionButton>
              ) : null}
            </InvoicingDocumentSidebarActions>
          ) : undefined
        }
        auditDocument={quoteId ? { kind: "quote", documentId: quoteId } : undefined}
      >
        <InvoicingDocumentView
          kind="quote"
          number={number}
          documentDate={quote.documentDate}
          currencyCode={quote.currencyCode}
          issuerSnapshot={quote.issuerSnapshot ?? {}}
          customerSnapshot={quote.customerSnapshot}
          subtotalExcludingTaxMinor={quote.subtotalExcludingTaxMinor}
          discountTotalMinor={quote.discountTotalMinor}
          taxTotalMinor={quote.taxTotalMinor}
          totalIncludingTaxMinor={quote.totalIncludingTaxMinor}
          notes={quote.notes}
          termsText={quote.termsText}
          footerText={quote.footerText}
          lineItems={quote.lineItems}
          taxRateOptions={configuration?.taxRateOptions}
          validUntilDate={quote.quoteExpiryDate}
          paymentTermDays={quote.paymentTermDays}
          documentThemeColor={configuration?.documentThemeColor ?? "purple"}
          companyLogoUrl={companyLogoUrl}
        />
      </InvoicingDocumentDetailFrame>

      <InvoicingSendDocumentEmailModal
        kind="quote"
        open={sendEmailOpen}
        defaultTo={customerEmail}
        defaultSubject={defaultEmailSubject}
        busy={busy === "send-email"}
        error={sendEmailError}
        onClose={() => {
          if (busy === "send-email") return;
          setSendEmailOpen(false);
          setSendEmailError("");
        }}
        onConfirm={sendQuoteEmail}
      />

      {canDelete && deletable ? (
        <div className="rounded-xl border border-red-200 bg-red-50/50 p-4">
          <p className="text-sm font-medium text-red-900">Delete quote</p>
          <p className="mt-1 text-sm text-red-800">
            Permanently removes this archived quote and its line items. This cannot be undone.
          </p>
          <InvoicingDocumentSidebarActionButton
            icon={Trash2}
            disabled={busy !== ""}
            className={[
              "mt-3 rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-60",
              deleteConfirm
                ? "bg-red-700 text-white hover:bg-red-800"
                : "border border-red-300 bg-white text-red-800 hover:bg-red-100"
            ].join(" ")}
            onClick={() => {
              if (!deleteConfirm) {
                setDeleteConfirm(true);
                return;
              }
              void deleteQuote();
            }}
          >
            {busy === "delete" ? "Deleting…" : deleteConfirm ? "Click again to delete permanently" : "Delete quote"}
          </InvoicingDocumentSidebarActionButton>
        </div>
      ) : null}

    </div>
  );
};
