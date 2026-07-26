/**
 * Invoicing Document Form Fields.
 *
 * Reusable invoicing and quoting UI building block: Invoicing Document Form Fields.
 *
 * Responsibilities:
 * - Encapsulate a focused interaction or form segment
 * - Keep parent pages thin by isolating validation and presentation
 *
 * Related:
 * - Route: /admin/invoicing
 */
import {
  defaultQuoteExpiryDate,
  quoteExpiryDateFromValidityDays,
  quoteValidityDaysFromDates
} from "@starter/shared";
import { useMemo } from "react";

import { SearchableCurrencySelect } from "../../components/SearchableCurrencySelect.js";
import { InvoicingCustomerFields } from "./InvoicingCustomerFields.js";
import {
  invFieldClass,
  invLabelClass,
  invReadOnlyFieldClass,
  sumDraftLinesTotalMinor,
  type InvoicingLineDraft
} from "./invoicingUi.js";
import { useInvoicingDisplayFormatters } from "./useInvoicingDisplayFormatters.js";

type Props = {
  crmEnabled: boolean;
  currencyCode: string;
  onCurrencyChange: (code: string) => void;
  documentDate: string;
  onDocumentDateChange: (value: string) => void;
  expiryDate: string;
  onExpiryDateChange: (value: string) => void;
  expiryLabel?: string;
  /** When true, show validity days beside expiry date with cross-calculation. */
  dualQuoteExpiry?: boolean;
  notes: string;
  onNotesChange: (value: string) => void;
  internalNotes: string;
  onInternalNotesChange: (value: string) => void;
  crmOrganizationId: string;
  crmOrganizationName: string | null;
  crmContactId: string;
  crmContactName: string | null;
  onOrganizationChange: (id: string, name: string | null) => void;
  onContactChange: (contactId: string, contactName: string | null) => void;
  lines: InvoicingLineDraft[];
};

/** React component for invoicing & quoting UI. */
export const InvoicingDocumentFormFields = ({
  crmEnabled,
  currencyCode,
  onCurrencyChange,
  documentDate,
  onDocumentDateChange,
  expiryDate,
  onExpiryDateChange,
  expiryLabel = "Quote expiry",
  dualQuoteExpiry = false,
  notes,
  onNotesChange,
  internalNotes,
  onInternalNotesChange,
  crmOrganizationId,
  crmOrganizationName,
  crmContactId,
  crmContactName,
  onOrganizationChange,
  onContactChange,
  lines
}: Props) => {
  const { formatMoney, amountFormatters } = useInvoicingDisplayFormatters();
  const totalMinor = useMemo(
    () => sumDraftLinesTotalMinor(lines, amountFormatters),
    [amountFormatters, lines]
  );
  const resolvedExpiryDate = expiryDate.trim() || defaultQuoteExpiryDate(documentDate);
  const validityDays = quoteValidityDaysFromDates(documentDate, resolvedExpiryDate);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        {crmEnabled ? (
          <InvoicingCustomerFields
            part="organization"
            crmOrganizationId={crmOrganizationId}
            crmOrganizationName={crmOrganizationName}
            crmContactId={crmContactId}
            crmContactName={crmContactName}
            onOrganizationChange={onOrganizationChange}
            onContactChange={onContactChange}
          />
        ) : (
          <>
            <span className={invLabelClass}>Customer Org</span>
            <p className={invReadOnlyFieldClass}>CRM disabled</p>
          </>
        )}
      </div>
      <div>
        <span className={invLabelClass}>Total</span>
        <p className={invReadOnlyFieldClass} aria-live="polite">
          {formatMoney(totalMinor, currencyCode)}
        </p>
      </div>

      <div>
        {crmEnabled ? (
          <InvoicingCustomerFields
            part="contact"
            crmOrganizationId={crmOrganizationId}
            crmOrganizationName={crmOrganizationName}
            crmContactId={crmContactId}
            crmContactName={crmContactName}
            onOrganizationChange={onOrganizationChange}
            onContactChange={onContactChange}
          />
        ) : (
          <>
            <span className={invLabelClass}>Customer Contact</span>
            <p className={invReadOnlyFieldClass}>—</p>
          </>
        )}
      </div>
      <div>
        <label htmlFor="invoicing-doc-currency" className={invLabelClass}>
          Currency
        </label>
        <SearchableCurrencySelect
          inputId="invoicing-doc-currency"
          value={currencyCode}
          onChange={onCurrencyChange}
          listPlacement="below"
        />
      </div>

      <div>
        <label htmlFor="invoicing-doc-date" className={invLabelClass}>
          Document date
        </label>
        <input
          id="invoicing-doc-date"
          type="date"
          className={invFieldClass}
          value={documentDate}
          onChange={(e) => onDocumentDateChange(e.target.value)}
        />
      </div>
      <div>
        {dualQuoteExpiry ? (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="invoicing-doc-expiry-days" className={invLabelClass}>
                Validity (days)
              </label>
              <input
                id="invoicing-doc-expiry-days"
                type="number"
                min={0}
                inputMode="numeric"
                className={`${invFieldClass} tabular-nums`}
                value={validityDays}
                onChange={(e) => {
                  const n = Number.parseInt(e.target.value, 10);
                  if (Number.isFinite(n) && n >= 0) {
                    onExpiryDateChange(quoteExpiryDateFromValidityDays(documentDate, n));
                  }
                }}
              />
            </div>
            <div>
              <label htmlFor="invoicing-doc-expiry" className={invLabelClass}>
                {expiryLabel}
              </label>
              <input
                id="invoicing-doc-expiry"
                type="date"
                className={invFieldClass}
                value={expiryDate}
                onChange={(e) => onExpiryDateChange(e.target.value)}
              />
            </div>
          </div>
        ) : (
          <>
            <label htmlFor="invoicing-doc-expiry" className={invLabelClass}>
              {expiryLabel}
            </label>
            <input
              id="invoicing-doc-expiry"
              type="date"
              className={invFieldClass}
              value={expiryDate}
              onChange={(e) => onExpiryDateChange(e.target.value)}
            />
          </>
        )}
      </div>

      <div>
        <label htmlFor="invoicing-doc-notes" className={invLabelClass}>
          Note (customer-visible)
        </label>
        <textarea
          id="invoicing-doc-notes"
          className={invFieldClass}
          rows={3}
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="invoicing-doc-internal-notes" className={invLabelClass}>
          Note (not customer-visible)
        </label>
        <textarea
          id="invoicing-doc-internal-notes"
          className={invFieldClass}
          rows={3}
          value={internalNotes}
          onChange={(e) => onInternalNotesChange(e.target.value)}
        />
      </div>
    </div>
  );
};

