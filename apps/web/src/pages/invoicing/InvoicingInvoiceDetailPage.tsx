/**
 * Invoicing Invoice Detail page.
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
  canArchiveInvoice,
  canDemoteInvoiceToQuote,
  canDisputeInvoice,
  canRegisterInvoicePayment,
  canResolveInvoiceDispute,
  canSendInvoiceEmail,
  type InvoicingCustomerSnapshot,
  type InvoicingInvoiceDisputeResolution,
  type InvoicingInvoiceStatus,
  type InvoicingIssuerSnapshot,
  type InvoicingTaxRateOption,
  type InvoicingDocumentThemeColor
} from "@starter/shared";
import { AlertTriangle, Archive, CheckCircle2, Mail, MinusCircle, Plus, ReceiptText, Send, Undo2, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useModulePermissions } from "../../hooks/useModulePermissions.js";
import { InvoicingDemoteToQuoteModal } from "./InvoicingDemoteToQuoteModal.js";
import { InvoicingDisputeAcknowledgeModal } from "./InvoicingDisputeAcknowledgeModal.js";
import {
  InvoicingDisputeDiscountModal,
  InvoicingDisputeFullCreditModal
} from "./InvoicingDisputeFollowUpModals.js";
import { InvoicingSendDocumentEmailModal } from "./InvoicingSendDocumentEmailModal.js";
import { InvoicingSendInvoiceModal } from "./InvoicingSendInvoiceModal.js";
import { InvoicingDocumentSidebarActionButton } from "./InvoicingDocumentSidebarAction.js";
import { InvoicingDocumentDetailFrame, InvoicingDocumentSidebarActions, InvoicingDocumentView } from "./InvoicingDocumentView.js";
import {
  InvoicingInvoicePaymentCards,
  type InvoicingInvoicePaymentView
} from "./InvoicingInvoicePaymentsPanel.js";
import { InvoicingRegisterPaymentModal } from "./InvoicingRegisterPaymentModal.js";
import {
  invBackLinkClass,
  invDocumentSidebarActionPrimaryClass,
  invDocumentSidebarActionSecondaryClass,
  invDocumentSidebarActionSuccessClass,
  invDocumentSidebarActionDangerClass,
  readInvoicingApiError,
  type InvoicingLineItemView
} from "./invoicingUi.js";
import { useInvoicingApi } from "./useInvoicingApi.js";
import { useInvoicingCompanyLogoUrl } from "./useInvoicingCompanyLogo.js";

type InvoiceDetail = {
  id: string;
  status: InvoicingInvoiceStatus;
  disputeResolution: InvoicingInvoiceDisputeResolution | null;
  customerDisputeNote: string | null;
  disputeAcknowledgmentFollowUpApplied: boolean;
  documentNumber: string;
  displayDocumentNumber: string;
  revision: string | null;
  sourceQuoteId: string | null;
  sourceOfferId: string | null;
  sourceOfferDisplayNumber: string | null;
  sourceInvoiceId: string | null;
  currencyCode: string;
  documentDate: string;
  invoiceDate: string | null;
  serviceDeliveryDate: string | null;
  paymentTermDays: number | null;
  sourceQuotePaymentTermDays?: number | null;
  dueDate: string | null;
  partialPaymentAnchorDate: string | null;
  finalizedAt: string | null;
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
  payments: InvoicingInvoicePaymentView[];
};

/** Route page component for tenant invoicing & quoting under AppShell. */
export const InvoicingInvoiceDetailPage = () => {
  const { invoiceId } = useParams();
  const navigate = useNavigate();
  const { authedFetch } = useInvoicingApi();
  const { canWrite } = useModulePermissions("invoicing");
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [taxRateOptions, setTaxRateOptions] = useState<InvoicingTaxRateOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [demoteOpen, setDemoteOpen] = useState(false);
  const [demoteError, setDemoteError] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeError, setDisputeError] = useState("");
  const [acknowledgeDisputeOpen, setAcknowledgeDisputeOpen] = useState(false);
  const [acknowledgeDisputeError, setAcknowledgeDisputeError] = useState("");
  const [denyDisputeOpen, setDenyDisputeOpen] = useState(false);
  const [denyDisputeError, setDenyDisputeError] = useState("");
  const [discountDisputeOpen, setDiscountDisputeOpen] = useState(false);
  const [discountDisputeError, setDiscountDisputeError] = useState("");
  const [fullCreditDisputeOpen, setFullCreditDisputeOpen] = useState(false);
  const [fullCreditDisputeError, setFullCreditDisputeError] = useState("");
  const [sendOpen, setSendOpen] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sendEmailOpen, setSendEmailOpen] = useState(false);
  const [sendEmailError, setSendEmailError] = useState("");
  const [defaultPaymentTermDays, setDefaultPaymentTermDays] = useState<number | null>(null);
  const [documentThemeColor, setDocumentThemeColor] = useState<InvoicingDocumentThemeColor>("purple");
  const [hasCompanyLogo, setHasCompanyLogo] = useState(false);
  const [configUpdatedAt, setConfigUpdatedAt] = useState("");
  const companyLogoUrl = useInvoicingCompanyLogoUrl(hasCompanyLogo, configUpdatedAt || "none");

  const load = useCallback(async () => {
    if (!invoiceId) return;
    setLoading(true);
    setError("");
    try {
      const res = await authedFetch(`/tenant/invoicing/invoices/${invoiceId}`);
      if (!res.ok) {
        setError(await readInvoicingApiError(res, "Invoice not found."));
        setInvoice(null);
        return;
      }
      const json = (await res.json()) as {
        invoice: InvoiceDetail;
        configuration: {
          taxRateOptions: InvoicingTaxRateOption[];
          defaultPaymentTermDays: number | null;
          documentThemeColor: InvoicingDocumentThemeColor;
          hasCompanyLogo: boolean;
          updatedAt: string;
        } | null;
      };
      setInvoice(json.invoice);
      setTaxRateOptions(json.configuration?.taxRateOptions ?? []);
      setDefaultPaymentTermDays(json.configuration?.defaultPaymentTermDays ?? null);
      setDocumentThemeColor(json.configuration?.documentThemeColor ?? "purple");
      setHasCompanyLogo(Boolean(json.configuration?.hasCompanyLogo));
      setConfigUpdatedAt(json.configuration?.updatedAt ?? "");
    } catch {
      setError("Could not load invoice.");
    } finally {
      setLoading(false);
    }
  }, [authedFetch, invoiceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const sendInvoiceEmail = async (input: { to: string; subject?: string }) => {
    if (!invoiceId || !canWrite) return;
    setBusy(true);
    setSendEmailError("");
    try {
      const res = await authedFetch(`/tenant/invoicing/invoices/${invoiceId}/send-email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input)
      });
      if (!res.ok) {
        setSendEmailError(await readInvoicingApiError(res, "Could not send invoice email."));
        return;
      }
      setSendEmailOpen(false);
      await load();
    } catch {
      setSendEmailError("Could not send invoice email.");
    } finally {
      setBusy(false);
    }
  };

  const sendInvoice = async (input: { dueDate: string; to: string; subject?: string }) => {
    if (!invoiceId || !canWrite) return;
    setBusy(true);
    setSendError("");
    try {
      const res = await authedFetch(`/tenant/invoicing/invoices/${invoiceId}/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input)
      });
      if (!res.ok) {
        setSendError(await readInvoicingApiError(res, "Could not send invoice."));
        return;
      }
      setSendOpen(false);
      await load();
    } catch {
      setSendError("Could not send invoice.");
    } finally {
      setBusy(false);
    }
  };

  const demoteToQuote = async (reason: string) => {
    if (!invoiceId || !canWrite) return;
    setBusy(true);
    setDemoteError("");
    try {
      const res = await authedFetch(`/tenant/invoicing/invoices/${invoiceId}/demote-to-quote`, {
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

  const registerPayment = async (input: {
    amountMinor: number;
    paymentDate: string;
    reference: string;
    note: string;
  }) => {
    if (!invoiceId || !canWrite || !invoice) return;
    setBusy(true);
    setPaymentError("");
    try {
      const res = await authedFetch(`/tenant/invoicing/invoices/${invoiceId}/payments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          amountMinor: input.amountMinor,
          paymentDate: input.paymentDate,
          reference: input.reference || null,
          note: input.note
        })
      });
      if (!res.ok) {
        setPaymentError(await readInvoicingApiError(res, "Could not register payment."));
        return;
      }
      const json = (await res.json()) as {
        outcome: "full" | "partial";
        revisedInvoiceId?: string;
      };
      setPaymentOpen(false);
      if (json.outcome === "partial" && json.revisedInvoiceId) {
        navigate(`/admin/invoicing/invoices/${json.revisedInvoiceId}`);
        return;
      }
      await load();
    } catch {
      setPaymentError("Could not register payment.");
    } finally {
      setBusy(false);
    }
  };

  const disputeInvoice = async (disputedInformation: string) => {
    if (!invoiceId || !canWrite) return;
    setBusy(true);
    setDisputeError("");
    try {
      const res = await authedFetch(`/tenant/invoicing/invoices/${invoiceId}/dispute`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ disputedInformation })
      });
      if (!res.ok) {
        setDisputeError(await readInvoicingApiError(res, "Could not mark invoice as disputed."));
        return;
      }
      setDisputeOpen(false);
      await load();
    } catch {
      setDisputeError("Could not mark invoice as disputed.");
    } finally {
      setBusy(false);
    }
  };

  const acknowledgeDispute = async (input: { companyResponse: string; outstandingPaymentPlan: string }) => {
    if (!invoiceId || !canWrite) return;
    setBusy(true);
    setAcknowledgeDisputeError("");
    try {
      const res = await authedFetch(`/tenant/invoicing/invoices/${invoiceId}/dispute/acknowledge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input)
      });
      if (!res.ok) {
        setAcknowledgeDisputeError(await readInvoicingApiError(res, "Could not acknowledge dispute."));
        return;
      }
      setAcknowledgeDisputeOpen(false);
      await load();
    } catch {
      setAcknowledgeDisputeError("Could not acknowledge dispute.");
    } finally {
      setBusy(false);
    }
  };

  const denyDispute = async (denialReason: string) => {
    if (!invoiceId || !canWrite) return;
    setBusy(true);
    setDenyDisputeError("");
    try {
      const res = await authedFetch(`/tenant/invoicing/invoices/${invoiceId}/dispute/deny`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ denialReason })
      });
      if (!res.ok) {
        setDenyDisputeError(await readInvoicingApiError(res, "Could not deny dispute."));
        return;
      }
      setDenyDisputeOpen(false);
      await load();
    } catch {
      setDenyDisputeError("Could not deny dispute.");
    } finally {
      setBusy(false);
    }
  };

  const applyDisputeDiscount = async (input: {
    adjustmentDate: string;
    amountMinor: number;
    description: string;
  }) => {
    if (!invoiceId || !canWrite) return;
    setBusy(true);
    setDiscountDisputeError("");
    try {
      const res = await authedFetch(`/tenant/invoicing/invoices/${invoiceId}/dispute/acknowledgment/discount`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input)
      });
      if (!res.ok) {
        setDiscountDisputeError(await readInvoicingApiError(res, "Could not apply dispute discount."));
        return;
      }
      const json = (await res.json()) as { revisedInvoiceId?: string; outcome?: { revisedInvoiceId: string } };
      setDiscountDisputeOpen(false);
      const revisedInvoiceId = json.outcome?.revisedInvoiceId ?? json.revisedInvoiceId;
      if (revisedInvoiceId) {
        navigate(`/admin/invoicing/invoices/${revisedInvoiceId}`);
        return;
      }
      await load();
    } catch {
      setDiscountDisputeError("Could not apply dispute discount.");
    } finally {
      setBusy(false);
    }
  };

  const applyDisputeFullCredit = async (input: { creditDate: string; note: string }) => {
    if (!invoiceId || !canWrite) return;
    setBusy(true);
    setFullCreditDisputeError("");
    try {
      const res = await authedFetch(`/tenant/invoicing/invoices/${invoiceId}/dispute/acknowledgment/full-credit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input)
      });
      if (!res.ok) {
        setFullCreditDisputeError(await readInvoicingApiError(res, "Could not credit invoice."));
        return;
      }
      setFullCreditDisputeOpen(false);
      const json = (await res.json()) as { outcome?: { revisedInvoiceId: string } };
      if (json.outcome?.revisedInvoiceId) {
        navigate(`/admin/invoicing/invoices/${json.outcome.revisedInvoiceId}`);
        return;
      }
      await load();
    } catch {
      setFullCreditDisputeError("Could not credit invoice.");
    } finally {
      setBusy(false);
    }
  };

  const archive = async () => {
    if (!invoiceId || !canWrite) return;
    setBusy(true);
    setError("");
    try {
      const res = await authedFetch(`/tenant/invoicing/invoices/${invoiceId}/archive`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}"
      });
      if (!res.ok) {
        setError(await readInvoicingApiError(res, "Could not archive invoice."));
        return;
      }
      await load();
    } catch {
      setError("Could not archive invoice.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p className="text-sm text-stone-500">Loading…</p>;
  if (!invoice) return <p className="text-sm text-rose-600">{error || "Invoice not found."}</p>;

  const canSend = canWrite && invoice.status === "invoice_draft";
  const canResendEmail = canWrite && canSendInvoiceEmail(invoice.status);
  const canDemote = canWrite && canDemoteInvoiceToQuote(invoice.status);
  const canRegisterPayment = canWrite && canRegisterInvoicePayment(invoice.status);
  const canDispute = canWrite && canDisputeInvoice(invoice.status);
  const canResolveDispute = canWrite && canResolveInvoiceDispute(invoice.status, invoice.disputeResolution);
  const canApplyDisputeFollowUp =
    canWrite &&
    invoice.status === "invoice_dispute_acknowledged" &&
    !invoice.disputeAcknowledgmentFollowUpApplied;
  const canArchive = canWrite && canArchiveInvoice(invoice.status);
  const displayNumber = invoice.displayDocumentNumber ?? invoice.documentNumber;
  const customerEmail = invoice.customerSnapshot.email?.trim() ?? "";
  const companyName = invoice.issuerSnapshot.companyName?.trim() ?? "";
  const defaultEmailSubject = companyName ? `Invoice ${displayNumber} from ${companyName}` : `Invoice ${displayNumber}`;

  const sourceLinks = invoice.sourceOfferId
    ? [
        {
          label: "From offer",
          href: `/admin/invoicing/offers/${invoice.sourceOfferId}`,
          text: invoice.sourceOfferDisplayNumber ?? "View offer"
        }
      ]
    : invoice.sourceQuoteId
      ? [
          {
            label: "From quote",
            href: `/admin/invoicing/quotes/${invoice.sourceQuoteId}`,
            text: "Open quote"
          }
        ]
      : invoice.sourceInvoiceId
        ? [
            {
              label: "Previous revision",
              href: `/admin/invoicing/invoices/${invoice.sourceInvoiceId}`,
              text: "Open previous invoice"
            }
          ]
        : undefined;

  return (
    <div className="space-y-6">
      <Link to="/admin/invoicing" className={invBackLinkClass}>
        ← All documents
      </Link>

      <InvoicingDocumentDetailFrame
        kind="invoice"
        status={invoice.status}
        currencyCode={invoice.currencyCode}
        createdOnDate={invoice.documentDate}
        internalNotes={invoice.internalNotes}
        customerDisputeNote={invoice.customerDisputeNote}
        sourceLinks={sourceLinks}
        sidebarActions={
          canWrite ? (
            <InvoicingDocumentSidebarActions>
              {canRegisterPayment ? (
                <InvoicingDocumentSidebarActionButton
                  icon={Plus}
                  disabled={busy}
                  className={invDocumentSidebarActionSuccessClass}
                  onClick={() => {
                    setPaymentError("");
                    setPaymentOpen(true);
                  }}
                >
                  Register payment
                </InvoicingDocumentSidebarActionButton>
              ) : null}
              {canSend ? (
                <InvoicingDocumentSidebarActionButton
                  icon={Send}
                  disabled={busy}
                  className={invDocumentSidebarActionPrimaryClass}
                  onClick={() => {
                    setSendError("");
                    setSendOpen(true);
                  }}
                >
                  Send invoice
                </InvoicingDocumentSidebarActionButton>
              ) : null}
              {canDispute ? (
                <InvoicingDocumentSidebarActionButton
                  icon={AlertTriangle}
                  disabled={busy}
                  className={invDocumentSidebarActionDangerClass}
                  onClick={() => {
                    setDisputeError("");
                    setDisputeOpen(true);
                  }}
                >
                  Mark as disputed
                </InvoicingDocumentSidebarActionButton>
              ) : null}
              {canResolveDispute ? (
                <>
                  <InvoicingDocumentSidebarActionButton
                    icon={CheckCircle2}
                    disabled={busy}
                    className={invDocumentSidebarActionSuccessClass}
                    onClick={() => {
                      setAcknowledgeDisputeError("");
                      setAcknowledgeDisputeOpen(true);
                    }}
                  >
                    Acknowledge dispute
                  </InvoicingDocumentSidebarActionButton>
                  <InvoicingDocumentSidebarActionButton
                    icon={XCircle}
                    disabled={busy}
                    className={invDocumentSidebarActionDangerClass}
                    onClick={() => {
                      setDenyDisputeError("");
                      setDenyDisputeOpen(true);
                    }}
                  >
                    Deny dispute
                  </InvoicingDocumentSidebarActionButton>
                </>
              ) : null}
              {canApplyDisputeFollowUp ? (
                <>
                  <InvoicingDocumentSidebarActionButton
                    icon={MinusCircle}
                    disabled={busy}
                    className={invDocumentSidebarActionSecondaryClass}
                    onClick={() => {
                      setDiscountDisputeError("");
                      setDiscountDisputeOpen(true);
                    }}
                  >
                    Add discount line
                  </InvoicingDocumentSidebarActionButton>
                  <InvoicingDocumentSidebarActionButton
                    icon={ReceiptText}
                    disabled={busy}
                    className={invDocumentSidebarActionSuccessClass}
                    onClick={() => {
                      setFullCreditDisputeError("");
                      setFullCreditDisputeOpen(true);
                    }}
                  >
                    Credit remaining balance
                  </InvoicingDocumentSidebarActionButton>
                </>
              ) : null}
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
              {canArchive ? (
                <InvoicingDocumentSidebarActionButton
                  icon={Archive}
                  disabled={busy}
                  className={invDocumentSidebarActionSecondaryClass}
                  onClick={() => void archive()}
                >
                  {busy ? "…" : "Archive"}
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
                  Resend invoice
                </InvoicingDocumentSidebarActionButton>
              ) : null}
            </InvoicingDocumentSidebarActions>
          ) : undefined
        }
        sidebarPayments={
          <InvoicingInvoicePaymentCards currencyCode={invoice.currencyCode} payments={invoice.payments} />
        }
        auditDocument={invoiceId ? { kind: "invoice", documentId: invoiceId } : undefined}
      >
        <InvoicingDocumentView
          kind="invoice"
          number={displayNumber}
          documentDate={invoice.documentDate}
          currencyCode={invoice.currencyCode}
          issuerSnapshot={invoice.issuerSnapshot ?? {}}
          customerSnapshot={invoice.customerSnapshot}
          subtotalExcludingTaxMinor={invoice.subtotalExcludingTaxMinor}
          discountTotalMinor={invoice.discountTotalMinor}
          taxTotalMinor={invoice.taxTotalMinor}
          totalIncludingTaxMinor={invoice.totalIncludingTaxMinor}
          notes={invoice.notes}
          termsText={invoice.termsText}
          footerText={invoice.footerText}
          lineItems={invoice.lineItems}
          taxRateOptions={taxRateOptions}
          paymentTermDays={invoice.paymentTermDays}
          sentOnDate={invoice.finalizedAt?.slice(0, 10) ?? null}
          dueDate={invoice.dueDate}
          documentThemeColor={documentThemeColor}
          companyLogoUrl={companyLogoUrl}
        />
      </InvoicingDocumentDetailFrame>

      <InvoicingDemoteToQuoteModal
        open={demoteOpen}
        title="Demote invoice to quote"
        description="This creates a new editable quote from the invoice and records your reason in the audit trail. You can revise the quote, promote it to a new offer revision, and issue a revised invoice."
        busy={busy}
        error={demoteError}
        onClose={() => setDemoteOpen(false)}
        onConfirm={demoteToQuote}
      />

      <InvoicingRegisterPaymentModal
        open={paymentOpen}
        status={invoice.status}
        currencyCode={invoice.currencyCode}
        outstandingMinor={invoice.totalIncludingTaxMinor}
        busy={busy}
        error={paymentError}
        onClose={() => setPaymentOpen(false)}
        onConfirm={registerPayment}
      />

      <InvoicingDemoteToQuoteModal
        open={disputeOpen}
        title="Mark invoice as disputed"
        description="Record the note the customer provided about why this invoice is disputed. It appears in the audit trail, staff sidebar, and the email to the customer."
        confirmLabel="Mark as disputed"
        fieldLabel="Customer note"
        fieldPlaceholder="Enter the note the customer provided explaining why this invoice is disputed."
        confirmButtonClass="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60"
        busy={busy}
        error={disputeError}
        onClose={() => setDisputeOpen(false)}
        onConfirm={disputeInvoice}
      />

      <InvoicingDisputeAcknowledgeModal
        open={acknowledgeDisputeOpen}
        busy={busy}
        error={acknowledgeDisputeError}
        onClose={() => setAcknowledgeDisputeOpen(false)}
        onConfirm={acknowledgeDispute}
      />

      <InvoicingDemoteToQuoteModal
        open={denyDisputeOpen}
        title="Deny dispute"
        description="Add a comment for the customer explaining why the dispute was denied. They will receive it by email, followed by a separate email with the updated invoice and new due date."
        confirmLabel="Deny dispute and email customer"
        fieldLabel="Comment"
        fieldPlaceholder="Explain why the dispute was denied."
        confirmButtonClass="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60"
        busy={busy}
        error={denyDisputeError}
        onClose={() => setDenyDisputeOpen(false)}
        onConfirm={denyDispute}
      />

      <InvoicingDisputeDiscountModal
        open={discountDisputeOpen}
        currencyCode={invoice.currencyCode}
        outstandingMinor={invoice.totalIncludingTaxMinor}
        busy={busy}
        error={discountDisputeError}
        onClose={() => setDiscountDisputeOpen(false)}
        onConfirm={applyDisputeDiscount}
      />

      <InvoicingDisputeFullCreditModal
        open={fullCreditDisputeOpen}
        currencyCode={invoice.currencyCode}
        outstandingMinor={invoice.totalIncludingTaxMinor}
        busy={busy}
        error={fullCreditDisputeError}
        onClose={() => setFullCreditDisputeOpen(false)}
        onConfirm={applyDisputeFullCredit}
      />

      <InvoicingSendInvoiceModal
        open={sendOpen}
        defaultPaymentTermDays={defaultPaymentTermDays}
        sourceQuotePaymentTermDays={invoice.sourceQuotePaymentTermDays ?? null}
        partialPaymentAnchorDate={invoice.partialPaymentAnchorDate}
        defaultTo={customerEmail}
        defaultSubject={defaultEmailSubject}
        busy={busy}
        error={sendError}
        onClose={() => {
          if (busy) return;
          setSendOpen(false);
          setSendError("");
        }}
        onConfirm={sendInvoice}
      />

      <InvoicingSendDocumentEmailModal
        kind="invoice"
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
        onConfirm={sendInvoiceEmail}
      />

    </div>
  );
};
