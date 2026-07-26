/**
 * Invoicing Document View.
 *
 * Reusable invoicing and quoting UI building block: Invoicing Document View.
 *
 * Responsibilities:
 * - Encapsulate a focused interaction or form segment
 * - Keep parent pages thin by isolating validation and presentation
 *
 * Related:
 * - Route: /admin/invoicing
 */
import {
  formatInvoicingCustomerBillingAddress,
  formatInvoicingPaymentTermDays,
  invoicingDocumentKindLabel,
  type InvoicingCustomerSnapshot,
  type InvoicingDocumentKind,
  type InvoicingDocumentThemeColor,
  type InvoicingIssuerSnapshot,
  type InvoicingTaxRateOption
} from "@starter/shared";
import { Building2, Landmark, Mail, Phone, Receipt } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { InvoicingDocumentAuditTrailOpener } from "./InvoicingDocumentAuditTrail.js";
import { InvoicingLineItemsTable } from "./InvoicingLineItemsTable.js";
import {
  formatInvoicingStatus,
  invDocumentDetailFrameGridClass,
  invDocumentKindTheme,
  invDocumentPaperClass,
  invDocumentCreatedOnLabel,
  invDocumentNumberLabel,
  invDocumentStatusBadgeBaseClass,
  invDocumentStatusBadgeClass,
  type InvoicingLineItemView
} from "./invoicingUi.js";
import { useInvoicingDisplayFormatters } from "./useInvoicingDisplayFormatters.js";

type Props = {
  kind: InvoicingDocumentKind;
  number: string;
  documentDate: string;
  currencyCode: string;
  issuerSnapshot: InvoicingIssuerSnapshot;
  customerSnapshot: InvoicingCustomerSnapshot;
  subtotalExcludingTaxMinor: number;
  discountTotalMinor: number;
  taxTotalMinor: number;
  totalIncludingTaxMinor: number;
  notes: string;
  termsText?: string;
  footerText?: string;
  lineItems: InvoicingLineItemView[];
  taxRateOptions?: InvoicingTaxRateOption[];
  validUntilDate?: string | null;
  /** Invoice send date (ISO date); shown in the document header as “Sent on”. */
  sentOnDate?: string | null;
  dueDate?: string | null;
  /** Net payment days — shown on invoices only. */
  paymentTermDays?: number | null;
  documentThemeColor?: InvoicingDocumentThemeColor;
  companyLogoUrl?: string | null;
};

const issuerLegalItems = (issuerSnapshot: InvoicingIssuerSnapshot) =>
  (
    [
      { key: "vat", label: "VAT ID", value: issuerSnapshot.vatIdentificationNumber, icon: Receipt },
      {
        key: "coc",
        label: "Chamber of Commerce",
        value: issuerSnapshot.chamberOfCommerceNumber,
        icon: Building2
      },
      { key: "bank", label: "Bank account", value: issuerSnapshot.bankAccountNumber, icon: Landmark }
    ] as const
  ).flatMap((item) => {
    const v = item.value?.trim();
    return v ? [{ ...item, value: v }] : [];
  });

type IssuerFooterDetail = {
  key: string;
  icon: LucideIcon;
  label?: string;
  value: ReactNode;
};

const buildIssuerFooterItems = ({
  companyPhone,
  companyEmail,
  issuerSnapshot
}: {
  companyPhone: string | null;
  companyEmail: string | null;
  issuerSnapshot: InvoicingIssuerSnapshot;
}): IssuerFooterDetail[] => {
  const items: IssuerFooterDetail[] = [];

  if (companyPhone) {
    items.push({ key: "phone", icon: Phone, value: companyPhone });
  }
  if (companyEmail) {
    items.push({ key: "email", icon: Mail, value: companyEmail });
  }

  for (const item of issuerLegalItems(issuerSnapshot)) {
    items.push({
      key: item.key,
      icon: item.icon,
      label: item.label,
      value: item.value
    });
  }

  return items;
};

const companyInitials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

type DocumentHeaderMetaItem = {
  key: string;
  label: string;
  value: string;
};

const buildDocumentHeaderPrimaryMetaItems = ({
  primaryLabel,
  primaryDate,
  validUntilDate,
  dueDate,
  formatDate
}: {
  primaryLabel: string;
  primaryDate: string | null;
  validUntilDate: string | null;
  dueDate: string | null;
  formatDate: (isoYmd: string) => string;
}): DocumentHeaderMetaItem[] => {
  const items: DocumentHeaderMetaItem[] = [
    {
      key: "primary-date",
      label: primaryLabel,
      value: primaryDate ? formatDate(primaryDate) : "—"
    }
  ];

  if (validUntilDate) {
    items.push({ key: "valid-until", label: "Valid until", value: formatDate(validUntilDate) });
  }
  if (dueDate) {
    items.push({ key: "due-date", label: "Due date", value: formatDate(dueDate) });
  }

  return items;
};

const buildDocumentHeaderSecondaryMetaItems = ({
  kind,
  paymentTermDays,
  numberLabel,
  number
}: {
  kind: InvoicingDocumentKind;
  paymentTermDays?: number | null;
  numberLabel: string;
  number: string;
}): DocumentHeaderMetaItem[] => {
  const items: DocumentHeaderMetaItem[] = [];
  if (kind === "invoice" && paymentTermDays != null) {
    items.push({
      key: "payment-term",
      label: "Payment term",
      value: formatInvoicingPaymentTermDays(paymentTermDays)
    });
  }
  items.push({ key: "number", label: numberLabel, value: number });
  return items;
};

const DocumentHeaderMetaRow = ({ items }: { items: DocumentHeaderMetaItem[] }) => (
  <div className="flex max-w-full flex-wrap items-center text-xs leading-tight text-slate-600 sm:flex-nowrap sm:justify-end sm:text-sm">
    {items.map((item, index) => (
      <div key={item.key} className="flex min-w-0 items-center">
        {index > 0 ? (
          <span className="mx-3 hidden shrink-0 text-stone-300 sm:inline" aria-hidden>
            |
          </span>
        ) : null}
        <span className="min-w-0 whitespace-nowrap">
          <span className="text-slate-500">{item.label} </span>
          <span className="font-medium tabular-nums text-slate-900">{item.value}</span>
        </span>
      </div>
    ))}
  </div>
);

const IssuerFooterDetailRow = ({
  icon: Icon,
  label,
  value,
  iconTileClass,
  showSeparator
}: {
  icon: LucideIcon;
  label?: string;
  value: ReactNode;
  iconTileClass: string;
  showSeparator: boolean;
}) => (
  <li
    className={[
      "flex min-w-0 max-w-full items-center gap-2 sm:max-w-none",
      showSeparator ? "border-l border-stone-300 pl-4 ml-4" : ""
    ].join(" ")}
  >
    <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded ${iconTileClass}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden strokeWidth={2} />
    </span>
    <span className="min-w-0 text-sm text-slate-700">
      {label ? <span className="text-slate-500">{label}: </span> : null}
      {value}
    </span>
  </li>
);

/** React component for invoicing & quoting UI. */
export const InvoicingDocumentView = ({
  kind,
  number,
  documentDate,
  currencyCode,
  issuerSnapshot,
  customerSnapshot,
  subtotalExcludingTaxMinor,
  discountTotalMinor,
  taxTotalMinor,
  totalIncludingTaxMinor,
  notes,
  termsText,
  footerText,
  lineItems,
  taxRateOptions = [],
  validUntilDate,
  sentOnDate,
  dueDate,
  paymentTermDays,
  documentThemeColor = "purple",
  companyLogoUrl = null
}: Props) => {
  const { formatDocumentMoney, formatDate } = useInvoicingDisplayFormatters();
  const kindLabel = invoicingDocumentKindLabel(kind);
  const theme = invDocumentKindTheme(kind, documentThemeColor);
  const numberLabel = invDocumentNumberLabel(kind);
  const primaryDateLabel = invDocumentCreatedOnLabel(kind);
  const customerName = customerSnapshot.organizationName?.trim() || null;
  const contactName = customerSnapshot.contactName?.trim() || null;
  const customerPhone = customerSnapshot.phone?.trim() || null;
  const customerEmail = customerSnapshot.email?.trim() || null;
  const billingAddress = formatInvoicingCustomerBillingAddress(customerSnapshot);
  const companyName = issuerSnapshot.companyName?.trim() || null;
  const companyAddress = issuerSnapshot.companyAddress?.trim() || null;
  const companyPhone = issuerSnapshot.companyPhone?.trim() || null;
  const companyEmail = issuerSnapshot.companyEmail?.trim() || null;

  const hasCustomerDetails = Boolean(
    customerName || contactName || customerPhone || customerEmail
  );
  const hasCustomerBlock = Boolean(hasCustomerDetails || billingAddress);
  const issuerFooterItems = buildIssuerFooterItems({
    companyPhone,
    companyEmail,
    issuerSnapshot
  });
  const hasNotes = Boolean(notes?.trim());
  const hasTerms = Boolean(termsText?.trim());
  const hasFooter = Boolean(footerText?.trim());
  const validUntilDateValue = validUntilDate?.trim() || null;
  const sentOnDateValue = sentOnDate?.trim() || null;
  const dueDateValue = dueDate?.trim() || null;
  const companyAddressLines = companyAddress
    ? companyAddress.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    : [];
  const companyAddressFirstLine = companyAddressLines[0] ?? null;
  const companyAddressSecondLine = companyAddressLines[1] ?? null;
  const companyAddressRemainingLines =
    companyAddressLines.length > 2 ? companyAddressLines.slice(2).join("\n") : null;

  const headerPrimaryMetaItems = buildDocumentHeaderPrimaryMetaItems({
    primaryLabel: primaryDateLabel,
    primaryDate: kind === "invoice" ? sentOnDateValue : documentDate,
    validUntilDate: kind === "invoice" ? null : validUntilDateValue,
    dueDate: kind === "invoice" ? dueDateValue : null,
    formatDate
  });
  const headerSecondaryMetaItems = buildDocumentHeaderSecondaryMetaItems({
    kind,
    paymentTermDays,
    numberLabel,
    number
  });

  const showLogo = Boolean(companyLogoUrl || companyName);
  const companyColClass = showLogo ? "sm:col-start-2" : "sm:col-start-1";
  const documentColClass = showLogo ? "sm:col-start-3" : "sm:col-start-2";
  const hasCompanyBlock = Boolean(companyName || companyAddress);
  const logoInitials = companyName ? companyInitials(companyName) : "?";

  return (
    <article className={invDocumentPaperClass} aria-label={`${kindLabel} ${number}`}>
      <header className="border-b border-stone-200 pb-4">
        <div className="flex flex-col gap-2 sm:grid sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,max-content)] sm:grid-rows-[auto_auto_auto] sm:items-start sm:gap-x-6 sm:gap-y-1">
          {showLogo ? (
            <div
              className={`flex min-w-[8rem] items-center justify-center self-stretch px-4 py-3 sm:col-start-1 sm:row-span-3 ${theme.logoBlock}`}
            >
              {companyLogoUrl ? (
                <img
                  src={companyLogoUrl}
                  alt={companyName ? `${companyName} logo` : "Company logo"}
                  className="max-h-16 max-w-full object-contain"
                />
              ) : (
                <span className="text-lg font-bold tracking-wide text-white">{logoInitials}</span>
              )}
            </div>
          ) : null}

          {companyName ? (
            <p
              className={`m-0 min-w-0 p-0 text-lg font-bold leading-none text-slate-900 ${companyColClass} sm:row-start-1`}
            >
              {companyName}
            </p>
          ) : null}

          {companyAddressFirstLine ? (
            <p
              className={`m-0 min-w-0 p-0 text-sm leading-none text-slate-600 ${companyColClass} sm:row-start-2`}
            >
              {companyAddressFirstLine}
            </p>
          ) : null}

          {companyAddressSecondLine || companyAddressRemainingLines ? (
            <div className={`m-0 min-w-0 space-y-0.5 p-0 ${companyColClass} sm:row-start-3`}>
              {companyAddressSecondLine ? (
                <p className="m-0 p-0 text-sm leading-none text-slate-600">{companyAddressSecondLine}</p>
              ) : null}
              {companyAddressRemainingLines ? (
                <p className="m-0 whitespace-pre-wrap p-0 text-sm leading-none text-slate-600">
                  {companyAddressRemainingLines}
                </p>
              ) : null}
            </div>
          ) : null}

          <p
            className={[
              "m-0 min-w-0 p-0 text-lg font-bold leading-none uppercase tracking-wide",
              theme.accentLabel,
              hasCompanyBlock ? `${documentColClass} sm:row-start-1 sm:text-right` : "sm:col-span-full sm:text-right"
            ].join(" ")}
          >
            {kindLabel}
          </p>
          <div
            className={[
              "m-0 min-w-0 p-0",
              hasCompanyBlock ? `${documentColClass} sm:row-start-2 sm:text-right` : "sm:col-span-full sm:text-right"
            ].join(" ")}
          >
            <DocumentHeaderMetaRow items={headerPrimaryMetaItems} />
          </div>
          <div
            className={[
              "m-0 min-w-0 p-0",
              hasCompanyBlock ? `${documentColClass} sm:row-start-3 sm:text-right` : "sm:col-span-full sm:text-right"
            ].join(" ")}
          >
            <DocumentHeaderMetaRow items={headerSecondaryMetaItems} />
          </div>
        </div>
      </header>

      {hasCustomerBlock ? (
        <section className="border-b border-stone-200 py-4">
          <div className="overflow-hidden rounded-xl border border-stone-200/80 bg-white shadow-sm ring-1 ring-slate-900/[0.03]">
            <div className="flex items-stretch">
              <div
                className={`flex w-[10%] min-w-[2.75rem] shrink-0 items-center justify-center self-stretch px-2 py-3 text-sm font-bold uppercase tracking-wider text-white ${theme.grandTotal}`}
                aria-hidden
              >
                To
              </div>
              <div className="min-w-0 flex-1 bg-stone-50/80 px-4 py-3 sm:px-5">
                <div
                  className={[
                    "grid gap-4",
                    hasCustomerDetails && billingAddress ? "sm:grid-cols-2 sm:gap-6" : ""
                  ].join(" ")}
                >
                  {hasCustomerDetails ? (
                    <div className="flex min-w-0 flex-col justify-center space-y-1 text-sm text-slate-800">
                      {customerName ? (
                        <p className="text-lg font-bold text-slate-900">{customerName}</p>
                      ) : null}
                      {contactName ? <p>{contactName}</p> : null}
                      {customerPhone ? <p>{customerPhone}</p> : null}
                      {customerEmail ? <p>{customerEmail}</p> : null}
                    </div>
                  ) : null}
                  {billingAddress ? (
                    <div
                      className={[
                        "flex min-w-0 flex-col justify-center text-sm text-slate-600",
                        hasCustomerDetails ? "sm:border-l sm:border-stone-200 sm:pl-6" : ""
                      ].join(" ")}
                    >
                      <p className="whitespace-pre-wrap">{billingAddress}</p>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {hasNotes ? (
        <section className="border-b border-stone-200 py-4">
          <p className="text-sm font-bold text-slate-900">Notes</p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{notes.trim()}</p>
        </section>
      ) : null}

      <section className="py-6">
        <InvoicingLineItemsTable
          variant="document"
          kind={kind}
          documentThemeColor={documentThemeColor}
          currencyCode={currencyCode}
          lines={lineItems}
          taxRateOptions={taxRateOptions}
        />
      </section>

      <section className="border-y border-stone-200 bg-stone-50 px-4 py-3">
        <dl className="ml-auto space-y-1 text-sm text-slate-700 sm:w-fit sm:text-right">
          <div className="flex justify-between gap-8 sm:justify-end">
            <dt>Subtotal</dt>
            <dd className="tabular-nums font-medium text-slate-900">
              {formatDocumentMoney(subtotalExcludingTaxMinor, currencyCode)}
            </dd>
          </div>
          {discountTotalMinor > 0 ? (
            <div className="flex justify-between gap-8 sm:justify-end">
              <dt>Discount</dt>
              <dd className="tabular-nums font-medium text-slate-900">
                −{formatDocumentMoney(discountTotalMinor, currencyCode)}
              </dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-8 sm:justify-end">
            <dt>Tax</dt>
            <dd className="tabular-nums font-medium text-slate-900">
              {taxTotalMinor > 0 ? formatDocumentMoney(taxTotalMinor, currencyCode) : "N/A"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="flex justify-end py-6">
        <div
          className={`flex min-w-[14rem] items-stretch overflow-hidden rounded-md shadow-sm ${theme.grandTotal}`}
        >
          <div className="flex flex-1 items-center px-4 py-3 text-sm font-semibold text-white">Total</div>
          <div
            className={`flex items-center px-4 py-3 text-lg font-bold tabular-nums text-white ${theme.grandTotalHighlight}`}
          >
            {formatDocumentMoney(totalIncludingTaxMinor, currencyCode)}
          </div>
        </div>
      </section>

      {hasTerms ? (
        <section className="border-t border-stone-200 py-6">
          <p className="text-sm font-bold text-slate-900">Payment terms &amp; conditions</p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{termsText!.trim()}</p>
        </section>
      ) : null}

      {issuerFooterItems.length > 0 ? (
        <section className="border-t border-stone-200 py-6">
          <ul className="flex flex-wrap items-center justify-center gap-y-3">
            {issuerFooterItems.map((item, index) => (
              <IssuerFooterDetailRow
                key={item.key}
                icon={item.icon}
                label={item.label}
                value={item.value}
                iconTileClass={theme.iconTile}
                showSeparator={index > 0}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {hasFooter ? (
        <footer className="border-t border-stone-200 pt-6 text-center">
          <p className="whitespace-pre-wrap text-xs text-slate-500">{footerText!.trim()}</p>
        </footer>
      ) : null}
    </article>
  );
};

/** React component for invoicing & quoting UI. */
export type InvoicingDocumentSourceLink = {
  label: string;
  href: string;
  text: string;
};

const documentPropertiesTitle = (kind: InvoicingDocumentKind) => {
  switch (kind) {
    case "quote":
      return "Quote properties";
    case "offer":
      return "Offer properties";
    case "invoice":
      return "Invoice properties";
  }
};

/** Panel segment within invoicing & quoting settings or detail screens. */
export const InvoicingDocumentPropertiesPanel = ({
  kind,
  status,
  currencyCode,
  createdOnDate,
  sourceLinks = []
}: {
  kind: InvoicingDocumentKind;
  status: string;
  currencyCode: string;
  /** Document date shown as “Created on” in invoice properties. */
  createdOnDate?: string | null;
  sourceLinks?: InvoicingDocumentSourceLink[];
}) => {
  const { formatDate } = useInvoicingDisplayFormatters();
  const createdOnValue = createdOnDate?.trim() || null;

  return (
  <section className="w-full rounded-xl border border-stone-200 bg-white p-4 shadow-sm ring-1 ring-slate-900/5">
    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
      {documentPropertiesTitle(kind)}
    </h3>
    <dl className="mt-3 space-y-3 text-sm">
      <div>
        <dt className="text-slate-500">Status</dt>
        <dd className="mt-1">
          <span
            className={[
              invDocumentStatusBadgeBaseClass,
              invDocumentStatusBadgeClass(status)
            ].join(" ")}
            title={formatInvoicingStatus(status)}
          >
            <span className="truncate">{formatInvoicingStatus(status)}</span>
          </span>
        </dd>
      </div>
      <div>
        <dt className="text-slate-500">Currency</dt>
        <dd className="mt-1 font-medium text-slate-900">{currencyCode}</dd>
      </div>
      {kind === "invoice" && createdOnValue ? (
        <div>
          <dt className="text-slate-500">Created on</dt>
          <dd className="mt-1 font-medium tabular-nums text-slate-900">{formatDate(createdOnValue)}</dd>
        </div>
      ) : null}
      {sourceLinks.map((link) => (
        <div key={`${link.label}-${link.href}`}>
          <dt className="text-slate-500">{link.label}</dt>
          <dd className="mt-1">
            <Link to={link.href} className="font-medium text-indigo-700 hover:text-indigo-600">
              {link.text}
            </Link>
          </dd>
        </div>
      ))}
    </dl>
  </section>
  );
};

/** Primary workflow actions — rendered above the properties card in the sidebar. */
export const InvoicingDocumentSidebarActions = ({ children }: { children: ReactNode }) => (
  <div className="flex w-full flex-col gap-2">{children}</div>
);

/** Document preview beside properties — one page scroll, not independent panes. */
export const InvoicingDocumentDetailFrame = ({
  kind,
  status,
  currencyCode,
  createdOnDate,
  internalNotes,
  customerDisputeNote = null,
  sourceLinks,
  sidebarNotice,
  sidebarActions,
  sidebarPayments,
  auditDocument,
  children
}: {
  kind: InvoicingDocumentKind;
  status: string;
  currencyCode: string;
  createdOnDate?: string | null;
  internalNotes: string | null;
  /** Customer-provided dispute note — staff sidebar only, not on the document preview. */
  customerDisputeNote?: string | null;
  sourceLinks?: InvoicingDocumentSourceLink[];
  sidebarNotice?: ReactNode;
  sidebarActions?: ReactNode;
  /** Payment history cards — below staff note panels when present, otherwise below audit trail. */
  sidebarPayments?: ReactNode;
  auditDocument?: { kind: InvoicingDocumentKind; documentId: string };
  children: ReactNode;
}) => {
  const hasInternalNotes = Boolean(internalNotes?.trim());
  const hasCustomerDisputeNote = Boolean(customerDisputeNote?.trim());
  const hasStaffNotePanels = hasInternalNotes || hasCustomerDisputeNote;

  return (
    <div className={invDocumentDetailFrameGridClass}>
      <div className="min-w-0 w-full">{children}</div>
      <aside className="flex w-full min-w-0 flex-col gap-4">
        {sidebarNotice ? (
          <div className="rounded-xl border border-indigo-200/80 bg-indigo-50/40 p-3 text-sm text-indigo-950">
            {sidebarNotice}
          </div>
        ) : null}
        {sidebarActions ?? null}
        <InvoicingDocumentPropertiesPanel
          kind={kind}
          status={status}
          currencyCode={currencyCode}
          createdOnDate={kind === "invoice" ? createdOnDate : undefined}
          sourceLinks={sourceLinks}
        />
        {auditDocument ? (
          <InvoicingDocumentAuditTrailOpener kind={auditDocument.kind} documentId={auditDocument.documentId} />
        ) : null}
        {!hasStaffNotePanels ? sidebarPayments : null}
        {hasInternalNotes ? <InvoicingDocumentInternalNotes internalNotes={internalNotes} /> : null}
        {hasCustomerDisputeNote ? (
          <InvoicingDocumentCustomerDisputeNote customerDisputeNote={customerDisputeNote} />
        ) : null}
        {hasStaffNotePanels ? sidebarPayments : null}
      </aside>
    </div>
  );
};

/** Staff-only panel — kept outside the customer-facing document preview. */
export const InvoicingDocumentInternalNotes = ({ internalNotes }: { internalNotes: string | null }) => {
  if (!internalNotes?.trim()) return null;
  return (
    <section className="w-full rounded-xl border border-amber-200/80 bg-amber-50/40 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">Internal note</p>
      <p className="mt-2 whitespace-pre-wrap text-sm text-amber-950">{internalNotes.trim()}</p>
      <p className="mt-3 text-xs text-amber-800/80">Not shown on customer-facing documents.</p>
    </section>
  );
};

/** Customer dispute explanation — staff sidebar only (also in audit trail and dispute emails). */
export const InvoicingDocumentCustomerDisputeNote = ({
  customerDisputeNote
}: {
  customerDisputeNote: string | null;
}) => {
  const note = customerDisputeNote?.trim();
  if (!note) return null;
  return (
    <section className="w-full rounded-xl bg-stone-100 p-4">
      <p className="text-sm font-medium text-slate-900">Customer note</p>
      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{note}</p>
    </section>
  );
};
