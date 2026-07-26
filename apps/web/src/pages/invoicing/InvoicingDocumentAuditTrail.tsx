/**
 * Invoicing Document Audit Trail.
 *
 * Supporting module for tenant invoicing and quoting: Invoicing Document Audit Trail.
 *
 * Responsibilities:
 * - Provide types, helpers, or components consumed by invoicing and quoting pages
 *
 * Related:
 * - Route: /admin/invoicing
 */
import { compareInvoicingAuditEventsByRecency, invoicingDocumentKindLabel, type InvoicingDocumentKind } from "@starter/shared";
import { History } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { CrmModal } from "../../components/crm/CrmModal.js";
import { InvoicingDocumentSidebarActionButton } from "./InvoicingDocumentSidebarAction.js";
import { invDocumentSidebarActionSecondaryClass, readInvoicingApiError } from "./invoicingUi.js";
import { useInvoicingApi } from "./useInvoicingApi.js";
import { useInvoicingDisplayFormatters } from "./useInvoicingDisplayFormatters.js";

type AuditEvent = {
  id: string;
  eventKind: string;
  eventLabel: string;
  actorLabel: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
};

type AuditSection = {
  key: string;
  title: string;
  subtitle: string | null;
  documentKind: InvoicingDocumentKind;
  documentId: string;
  pathSegment: string | null;
  isCurrent: boolean;
  events: AuditEvent[];
};

type FlatAuditEntry = AuditEvent & {
  sectionKey: string;
  sectionTitle: string;
  sectionSubtitle: string | null;
  sectionPathSegment: string | null;
  sectionIsCurrent: boolean;
  sectionDocumentKind: InvoicingDocumentKind;
};

const payloadLinks = (event: AuditEvent): { label: string; href: string }[] => {
  const links: { label: string; href: string }[] = [];
  const offerId = typeof event.payload.offerId === "string" ? event.payload.offerId : null;
  const quoteId = typeof event.payload.quoteId === "string" ? event.payload.quoteId : null;
  const invoiceId = typeof event.payload.invoiceId === "string" ? event.payload.invoiceId : null;

  if (event.eventKind === "quote_promoted_to_offer" && offerId) {
    links.push({ label: "View offer", href: `/admin/invoicing/offers/${offerId}` });
  }
  if (event.eventKind === "quote_promoted_to_invoice" && invoiceId) {
    links.push({ label: "View invoice", href: `/admin/invoicing/invoices/${invoiceId}` });
  }
  if (event.eventKind === "offer_demoted_to_quote" && quoteId) {
    links.push({ label: "View quote", href: `/admin/invoicing/quotes/${quoteId}` });
  }
  if (event.eventKind === "invoice_demoted_to_quote" && quoteId) {
    links.push({ label: "View quote", href: `/admin/invoicing/quotes/${quoteId}` });
  }
  if (event.eventKind === "quote_created_from_offer" && offerId) {
    links.push({ label: "Source offer", href: `/admin/invoicing/offers/${offerId}` });
  }
  if (event.eventKind === "quote_created_from_invoice" && invoiceId) {
    links.push({ label: "Source invoice", href: `/admin/invoicing/invoices/${invoiceId}` });
  }
  if (event.eventKind === "offer_promoted_to_invoice" && invoiceId) {
    links.push({ label: "View invoice", href: `/admin/invoicing/invoices/${invoiceId}` });
  }

  return links;
};

const flattenAndSortSections = (sections: AuditSection[]): FlatAuditEntry[] =>
  sections
    .flatMap((section) =>
      section.events.map((event) => ({
        ...event,
        sectionKey: section.key,
        sectionTitle: section.title,
        sectionSubtitle: section.subtitle,
        sectionPathSegment: section.pathSegment,
        sectionIsCurrent: section.isCurrent,
        sectionDocumentKind: section.documentKind
      }))
    )
    .sort(compareInvoicingAuditEventsByRecency);

const DocumentContextBadge = ({ entry }: { entry: FlatAuditEntry }) => {
  const label = invoicingDocumentKindLabel(entry.sectionDocumentKind);
  const title = entry.sectionTitle;
  const href = entry.sectionPathSegment && !entry.sectionIsCurrent
    ? `/admin/invoicing/${entry.sectionPathSegment}`
    : null;

  return (
    <div className="min-w-0">
      {href ? (
        <Link to={href} className="block truncate font-medium text-indigo-700 hover:text-indigo-600" title={title}>
          {title}
        </Link>
      ) : (
        <p className="truncate font-medium text-slate-800" title={title}>
          {title}
        </p>
      )}
      <p className="truncate text-xs text-stone-500">
        {label}
        {entry.sectionSubtitle ? ` · ${entry.sectionSubtitle}` : null}
        {entry.sectionIsCurrent ? " · Current" : null}
      </p>
    </div>
  );
};

const AuditTrailTableHeader = () => (
  <div
    className="hidden border-b border-stone-200 bg-stone-50/90 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-stone-500 sm:grid sm:grid-cols-[7.5rem_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.75fr)] sm:gap-4"
    aria-hidden
  >
    <span>When</span>
    <span>Activity</span>
    <span>Document</span>
    <span className="text-right sm:text-left">By</span>
  </div>
);

const AuditTrailRow = ({ entry, formatInstantParts }: { entry: FlatAuditEntry; formatInstantParts: (iso: string) => { date: string; time: string } }) => {
  const when = formatInstantParts(entry.createdAt);
  const links = payloadLinks(entry);
  const reason = typeof entry.payload.reason === "string" ? entry.payload.reason.trim() : "";
  const acceptanceProof =
    typeof entry.payload.acceptanceProof === "string" ? entry.payload.acceptanceProof.trim() : "";
  const disputedInformation =
    typeof entry.payload.disputedInformation === "string" ? entry.payload.disputedInformation.trim() : "";
  const companyResponse =
    typeof entry.payload.companyResponse === "string" ? entry.payload.companyResponse.trim() : "";
  const outstandingPaymentPlan =
    typeof entry.payload.outstandingPaymentPlan === "string" ? entry.payload.outstandingPaymentPlan.trim() : "";
  const denialReason =
    typeof entry.payload.denialReason === "string" ? entry.payload.denialReason.trim() : "";
  const paymentRemark = typeof entry.payload.note === "string" ? entry.payload.note.trim() : "";

  return (
    <li className="border-b border-stone-100 px-4 py-3 last:border-b-0 sm:grid sm:grid-cols-[7.5rem_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.75fr)] sm:items-start sm:gap-4">
      <div className="text-xs text-stone-600 sm:pt-0.5">
        <p className="font-medium text-slate-800">{when.date}</p>
        {when.time ? <p className="text-stone-500">{when.time}</p> : null}
      </div>

      <div className="mt-2 min-w-0 sm:mt-0">
        <p className="text-sm font-medium text-slate-900">{entry.eventLabel}</p>
        {acceptanceProof ? (
          <p className="mt-1 text-xs text-stone-600">Customer acceptance: {acceptanceProof}</p>
        ) : null}
        {disputedInformation ? (
          <p className="mt-1 text-xs text-stone-600">Customer note: {disputedInformation}</p>
        ) : null}
        {companyResponse ? (
          <p className="mt-1 text-xs text-stone-600">Company response: {companyResponse}</p>
        ) : null}
        {outstandingPaymentPlan ? (
          <p className="mt-1 text-xs text-stone-600">Outstanding payment plan: {outstandingPaymentPlan}</p>
        ) : null}
        {denialReason ? (
          <p className="mt-1 text-xs text-stone-600">Comment: {denialReason}</p>
        ) : null}
        {reason ? <p className="mt-1 text-xs text-stone-600">Reason: {reason}</p> : null}
        {paymentRemark && entry.eventKind === "invoice_payment_registered" ? (
          <p className="mt-1 whitespace-pre-wrap text-xs text-stone-600">Remark: {paymentRemark}</p>
        ) : null}
        {links.length > 0 ? (
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {links.map((link) => (
              <Link
                key={`${entry.id}-${link.href}`}
                to={link.href}
                className="font-medium text-indigo-700 hover:text-indigo-600"
              >
                {link.label}
              </Link>
            ))}
          </p>
        ) : null}
      </div>

      <div className="mt-2 min-w-0 sm:mt-0">
        <DocumentContextBadge entry={entry} />
      </div>

      <div className="mt-2 text-xs text-stone-600 sm:mt-0 sm:pt-0.5">
        {entry.actorLabel ?? <span className="text-stone-400">System</span>}
      </div>
    </li>
  );
};

const AuditTrailSkeleton = () => (
  <div className="divide-y divide-stone-100 rounded-xl border border-stone-200">
    {Array.from({ length: 4 }, (_, i) => (
      <div key={i} className="animate-pulse px-4 py-3 sm:grid sm:grid-cols-[7.5rem_1fr_1fr_0.75fr] sm:gap-4">
        <div className="h-8 rounded bg-stone-100" />
        <div className="mt-2 h-8 rounded bg-stone-100 sm:mt-0" />
        <div className="mt-2 h-8 rounded bg-stone-100 sm:mt-0" />
        <div className="mt-2 h-4 rounded bg-stone-100 sm:mt-0" />
      </div>
    ))}
  </div>
);

const InvoicingDocumentAuditTrailContent = ({
  kind,
  documentId,
  active
}: {
  kind: InvoicingDocumentKind;
  documentId: string;
  active: boolean;
}) => {
  const { authedFetch } = useInvoicingApi();
  const { formatInstantParts, locale } = useInvoicingDisplayFormatters();
  const [sections, setSections] = useState<AuditSection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const segment = kind === "quote" ? "quotes" : kind === "offer" ? "offers" : "invoices";
      const res = await authedFetch(`/tenant/invoicing/${segment}/${documentId}/audit`);
      if (!res.ok) {
        setSections([]);
        setError(await readInvoicingApiError(res, "Could not load audit trail."));
        return;
      }
      const json = (await res.json()) as { audit: { sections: AuditSection[] } };
      setSections(json.audit.sections);
    } catch {
      setSections([]);
      setError("Could not load audit trail.");
    } finally {
      setLoading(false);
    }
  }, [authedFetch, documentId, kind]);

  useEffect(() => {
    if (!active) return;
    void load();
  }, [active, load]);

  const entries = useMemo(() => flattenAndSortSections(sections), [sections]);

  if (loading) return <AuditTrailSkeleton />;
  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50/60 px-4 py-8 text-center">
        <p className="text-sm text-rose-700">{error}</p>
      </div>
    );
  }
  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-stone-200 bg-stone-50/50 px-4 py-12 text-center">
        <p className="text-sm text-stone-600">No activity recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-stone-600">
        {entries.length.toLocaleString(locale)} {entries.length === 1 ? "event" : "events"}, newest first.
      </p>
      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm ring-1 ring-slate-900/5">
        <AuditTrailTableHeader />
        <ol className="max-h-[min(58vh,640px)] overflow-y-auto">
          {entries.map((entry) => (
            <AuditTrailRow key={entry.id} entry={entry} formatInstantParts={formatInstantParts} />
          ))}
        </ol>
      </div>
    </div>
  );
};

/** React component for invoicing & quoting UI. */
export const InvoicingDocumentAuditTrailOpener = ({
  kind,
  documentId
}: {
  kind: InvoicingDocumentKind;
  documentId: string;
}) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <InvoicingDocumentSidebarActionButton
        icon={History}
        className={invDocumentSidebarActionSecondaryClass}
        onClick={() => setOpen(true)}
      >
        View audit trail
      </InvoicingDocumentSidebarActionButton>
      <CrmModal title="Audit trail" open={open} onClose={() => setOpen(false)} wide>
        <InvoicingDocumentAuditTrailContent kind={kind} documentId={documentId} active={open} />
      </CrmModal>
    </>
  );
};
