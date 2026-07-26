/**
 * Invoicing Customer Fields.
 *
 * Reusable invoicing and quoting UI building block: Invoicing Customer Fields.
 *
 * Responsibilities:
 * - Encapsulate a focused interaction or form segment
 * - Keep parent pages thin by isolating validation and presentation
 *
 * Related:
 * - Route: /admin/invoicing
 */
import { useCallback } from "react";

import { useAuth } from "../../auth/AuthContext.js";
import { ContactEmployerOrganizationField } from "../../components/crm/ContactEmployerOrganizationField.js";
import { CrmContactSearchField } from "../../components/crm/CrmContactSearchField.js";
import { invFieldClass, invLabelClass } from "./invoicingUi.js";

type BaseProps = {
  crmOrganizationId: string;
  crmOrganizationName: string | null;
  crmContactId: string;
  crmContactName: string | null;
  onOrganizationChange: (id: string, name: string | null) => void;
  onContactChange: (contactId: string, contactName: string | null) => void;
  disabled?: boolean;
};

type Props = BaseProps & {
  /** Render only organization, only contact, or both stacked (default). */
  part?: "both" | "organization" | "contact";
};

const invoicingContactInputClass =
  "w-full min-h-[2.625rem] rounded-lg border border-stone-200 bg-white py-2 pl-10 pr-3 text-sm text-stone-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:bg-stone-50 disabled:text-stone-500";
const invoicingContactClearClass =
  "inline-flex h-[2.625rem] w-[2.625rem] shrink-0 items-center justify-center rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60";

/** React component for invoicing & quoting UI. */
export const InvoicingCustomerFields = ({
  crmOrganizationId,
  crmOrganizationName,
  crmContactId,
  crmContactName,
  onOrganizationChange,
  onContactChange,
  disabled = false,
  part = "both"
}: Props) => {
  const { getAccessToken, refreshSession, logout } = useAuth();

  const authHeaders = useCallback(() => {
    const token = getAccessToken();
    const h: Record<string, string> = {};
    if (token) h.authorization = `Bearer ${token}`;
    return h;
  }, [getAccessToken]);

  const organizationField = (
    <div className={disabled ? "pointer-events-none opacity-60" : undefined}>
      <ContactEmployerOrganizationField
        inputId="invoicing-crm-org"
        authHeaders={authHeaders}
        refreshSession={refreshSession}
        logout={logout}
        organizationId={crmOrganizationId}
        organizationName={crmOrganizationName}
        label="Customer Org"
        className="relative"
        labelClassName={invLabelClass}
        inputClassName={`${invFieldClass} min-h-[2.625rem] pl-10`}
        onChange={(id, name) => {
          onOrganizationChange(id, name);
          onContactChange("", null);
        }}
      />
    </div>
  );

  const contactField = (
    <div className={disabled ? "pointer-events-none opacity-60" : undefined}>
      <CrmContactSearchField
        inputId="invoicing-crm-contact"
        authHeaders={authHeaders}
        refreshSession={refreshSession}
        logout={logout}
        contactId={crmContactId}
        contactName={crmContactName}
        label="Customer Contact"
        employerOrganizationId={crmOrganizationId || undefined}
        disabled={disabled || !crmOrganizationId}
        className="relative"
        labelClassName={invLabelClass}
        inputClassName={invoicingContactInputClass}
        inputRowClassName="mt-1 flex gap-2"
        clearButtonClassName={invoicingContactClearClass}
        onChange={onContactChange}
      />
    </div>
  );

  if (part === "organization") return organizationField;
  if (part === "contact") return contactField;

  return (
    <div className="space-y-4">
      {organizationField}
      {contactField}
      <p className="text-xs text-stone-500">
        Link a CRM organization before promoting to an offer or invoice.
      </p>
    </div>
  );
};
