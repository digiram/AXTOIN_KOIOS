/**
 * AddContactModal
 *
 * Modal form to create a new CRM contact with channels, addresses, and employer link.
 *
 * Responsibilities:
 * - Client-side validation via shared CRM Zod helpers
 * - POST to tenant CRM contacts API with optional profile photo upload
 * - Compose shared editors (`CrmChannelsEditor`, `CrmAddressesEditor`, etc.)
 *
 * Related:
 * - CRM contacts list and overview pages
 *
 * Security:
 * - Authenticated tenant API; employer org id validated server-side.
 */
import { useMemo, useState } from "react";

import {
  CrmAddressesEditor,
  defaultAddressRows,
  type AddressFormRow
} from "./CrmAddressesEditor.js";
import { contactSalutationSelectOptions } from "./contactSalutations.js";
import { CRM_SECTION_HEADING_RAIL } from "./crmSectionHeadingRail.js";
import {
  CrmChannelsEditor,
  defaultEmailRows,
  defaultPhoneRows,
  toCrmChannelPayload,
  type ChannelFormRow
} from "./CrmChannelsEditor.js";
import { ContactEmployerOrganizationField } from "./ContactEmployerOrganizationField.js";
import { crmModalOutlineInputClass } from "./crmModalOutlineInputClass.js";
import { CrmModal } from "./CrmModal.js";
import { ProfilePhotoNameModalRow } from "./ProfilePhotoNameModalRow.js";
import {
  ProfilePhotoEditModalPlaceholder,
  initialsFromFirstLast
} from "./ProfileEntityPhoto.js";

import {
  crmAddressErrorsNested,
  crmChannelErrorsByRow,
  toCrmAddressPayload,
  validateCrmAddressFormRows,
  validateCrmEmailFormRows,
  validateCrmPhoneFormRows
} from "@starter/shared";

import { API_BASE_URL } from "../../lib/api.js";
import { useCrmApi } from "../../pages/crm/useCrmApi.js";

type Props = {
  onClose: () => void;
  onCreated: (id: string) => void;
};

/** Create-contact dialog — calls `onCreated` with the new contact id on success. */
export const AddContactModal = ({ onClose, onCreated }: Props) => {
  const { authHeaders, refreshSession, logout } = useCrmApi();

  const [salutation, setSalutation] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [emails, setEmails] = useState<ChannelFormRow[]>(defaultEmailRows);
  const [phones, setPhones] = useState<ChannelFormRow[]>(defaultPhoneRows);
  const [addresses, setAddresses] = useState<AddressFormRow[]>(() => defaultAddressRows());
  const [employerOrganizationId, setEmployerOrganizationId] = useState("");
  const [employerOrganizationName, setEmployerOrganizationName] = useState<string | null>(null);
  const [employerOrganizationPrimaryAddress, setEmployerOrganizationPrimaryAddress] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ firstName?: string; lastName?: string }>({});
  const [emailRowErrors, setEmailRowErrors] = useState<Record<number, string>>({});
  const [phoneRowErrors, setPhoneRowErrors] = useState<Record<number, string>>({});
  const [addressRowFieldErrors, setAddressRowFieldErrors] = useState<
    Record<number, Partial<Record<string, string>>>
  >({});

  const salutationOptions = useMemo(() => contactSalutationSelectOptions(salutation), [salutation]);
  const initialsGlyph = useMemo(() => initialsFromFirstLast(firstName, lastName), [firstName, lastName]);

  const nullable = (s: string) => {
    const t = s.trim();
    return t.length === 0 ? null : t;
  };

  const save = async () => {
    setError("");
    const emailPayload = toCrmChannelPayload(emails, "Home");
    const phonePayload = toCrmChannelPayload(phones, "Mobile");
    const emailErrs = validateCrmEmailFormRows(emails, "Home");
    const phoneErrs = validateCrmPhoneFormRows(phones, "Mobile");
    const addrErrs = validateCrmAddressFormRows(addresses, "Home");
    const nextFieldErrors: { firstName?: string; lastName?: string } = {};
    if (!firstName.trim()) nextFieldErrors.firstName = "First name is required.";
    if (!lastName.trim()) nextFieldErrors.lastName = "Last name is required.";
    setEmailRowErrors(crmChannelErrorsByRow(emailErrs));
    setPhoneRowErrors(crmChannelErrorsByRow(phoneErrs));
    setAddressRowFieldErrors(crmAddressErrorsNested(addrErrs));
    setFieldErrors(nextFieldErrors);
    if (
      emailErrs.length > 0 ||
      phoneErrs.length > 0 ||
      addrErrs.length > 0 ||
      Object.keys(nextFieldErrors).length > 0
    ) {
      return;
    }

    const addressPayload = toCrmAddressPayload(addresses, "Home");

    const body: Record<string, unknown> = {
      salutation: nullable(salutation),
      title: nullable(jobTitle),
      firstName: firstName.trim(),
      lastName: lastName.trim()
    };
    if (emailPayload.length > 0) body.emails = emailPayload;
    if (phonePayload.length > 0) body.phones = phonePayload;
    if (addressPayload.length > 0) body.addresses = addressPayload;
    const empTrim = employerOrganizationId.trim();
    if (empTrim) body.employerOrganizationId = empTrim;

    setSaving(true);
    try {
      let res = await fetch(`${API_BASE_URL}/tenant/crm/contacts`, {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      if (res.status === 401) {
        if (!(await refreshSession())) {
          logout();
          return;
        }
        res = await fetch(`${API_BASE_URL}/tenant/crm/contacts`, {
          method: "POST",
          headers: { ...authHeaders(), "content-type": "application/json" },
          body: JSON.stringify(body)
        });
      }
      const payload = (await res.json().catch(() => null)) as { message?: string; id?: string } | null;
      if (!res.ok) {
        setError(payload?.message ?? "Could not create contact.");
        return;
      }
      if (!payload?.id) {
        setError("Invalid response from server.");
        return;
      }
      setFieldErrors({});
      setEmailRowErrors({});
      setPhoneRowErrors({});
      setAddressRowFieldErrors({});
      onClose();
      onCreated(payload.id);
    } catch {
      setError("Request failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <CrmModal title="Add contact" open onClose={onClose} wide>
      <p className="text-xs text-stone-500">* Required · Changes apply when you save.</p>

      {error ? (
        <p className="mt-3 text-sm text-rose-600" role="alert">
          {error}
        </p>
      ) : null}

      <section className="mt-4">
        <ProfilePhotoNameModalRow
          photo={
            <>
              <div className={`${CRM_SECTION_HEADING_RAIL} w-full shrink-0`}>
                <h3 className="text-sm font-semibold text-slate-800">Profile photo</h3>
              </div>
              <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-start px-1 pt-3">
                <ProfilePhotoEditModalPlaceholder initials={initialsGlyph} />
                <p className="mt-2 max-w-[14rem] text-center text-[11px] leading-snug text-slate-500">
                  You can add a profile photo after this contact is saved.
                </p>
              </div>
            </>
          }
          name={
            <>
              <div className={CRM_SECTION_HEADING_RAIL}>
                <h3 className="text-sm font-semibold text-slate-800">Name</h3>
              </div>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="crm-modal-salutation" className="mb-1.5 block text-xs font-medium text-stone-600">
                    Salutation
                  </label>
                  <select
                    id="crm-modal-salutation"
                    value={salutation}
                    onChange={(e) => setSalutation(e.target.value)}
                    className={`${crmModalOutlineInputClass(false)} appearance-none bg-white pr-10`}
                  >
                    <option value="">—</option>
                    {salutationOptions.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="crm-modal-title" className="mb-1.5 block text-xs font-medium text-stone-600">
                    Title
                  </label>
                  <input
                    id="crm-modal-title"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    placeholder="Job title"
                    className={crmModalOutlineInputClass(false)}
                  />
                </div>
                <div>
                  <label htmlFor="crm-modal-fn" className="mb-1.5 block text-xs font-medium text-stone-600">
                    First name <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id="crm-modal-fn"
                    value={firstName}
                    onChange={(e) => {
                      setFieldErrors((fe) => ({ ...fe, firstName: undefined }));
                      setFirstName(e.target.value);
                    }}
                    className={crmModalOutlineInputClass(Boolean(fieldErrors.firstName))}
                    aria-invalid={Boolean(fieldErrors.firstName)}
                    aria-describedby={fieldErrors.firstName ? "crm-modal-fn-err" : undefined}
                  />
                  {fieldErrors.firstName ? (
                    <p id="crm-modal-fn-err" className="mt-1.5 text-xs text-rose-600" role="alert">
                      {fieldErrors.firstName}
                    </p>
                  ) : null}
                </div>
                <div>
                  <label htmlFor="crm-modal-ln" className="mb-1.5 block text-xs font-medium text-stone-600">
                    Last name <span className="text-rose-600">*</span>
                  </label>
                  <input
                    id="crm-modal-ln"
                    value={lastName}
                    onChange={(e) => {
                      setFieldErrors((fe) => ({ ...fe, lastName: undefined }));
                      setLastName(e.target.value);
                    }}
                    className={crmModalOutlineInputClass(Boolean(fieldErrors.lastName))}
                    aria-invalid={Boolean(fieldErrors.lastName)}
                    aria-describedby={fieldErrors.lastName ? "crm-modal-ln-err" : undefined}
                  />
                  {fieldErrors.lastName ? (
                    <p id="crm-modal-ln-err" className="mt-1.5 text-xs text-rose-600" role="alert">
                      {fieldErrors.lastName}
                    </p>
                  ) : null}
                </div>
              </div>
            </>
          }
        />
      </section>

      <section className="mt-4">
        <div className={CRM_SECTION_HEADING_RAIL}>
          <h3 className="text-sm font-semibold text-slate-800">Organization</h3>
        </div>
        <p className="mt-1 text-xs text-stone-500">
          Optional. Search and select an organization to link this contact as an employee (Employee → Employer).
        </p>
        <ContactEmployerOrganizationField
          inputId="crm-add-contact-employer-org"
          authHeaders={authHeaders}
          refreshSession={refreshSession}
          logout={logout}
          organizationId={employerOrganizationId}
          organizationName={employerOrganizationName}
          organizationPrimaryAddress={employerOrganizationPrimaryAddress}
          onChange={(id, name, primary) => {
            setEmployerOrganizationId(id);
            setEmployerOrganizationName(name);
            setEmployerOrganizationPrimaryAddress(primary);
          }}
        />
      </section>

      <CrmChannelsEditor
        emails={emails}
        phones={phones}
        onEmailsChange={(next) => {
          setEmailRowErrors({});
          setEmails(next);
        }}
        onPhonesChange={(next) => {
          setPhoneRowErrors({});
          setPhones(next);
        }}
        emailRowErrors={emailRowErrors}
        phoneRowErrors={phoneRowErrors}
      />

      <CrmAddressesEditor
        addresses={addresses}
        onAddressesChange={(next) => {
          setAddressRowFieldErrors({});
          setAddresses(next);
        }}
        addressRowFieldErrors={addressRowFieldErrors}
        geocodeApi={{ authHeaders, refreshSession, logout }}
      />

      <div className="mt-6 flex flex-wrap justify-end gap-4 border-t border-stone-100 pt-4">
        <button
          type="button"
          disabled={saving}
          onClick={onClose}
          className="rounded-lg border border-stone-200 px-4 py-2 text-sm font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
        >
          Save changes
        </button>
      </div>
    </CrmModal>
  );
};
