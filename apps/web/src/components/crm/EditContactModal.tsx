/**
 * EditContactModal
 *
 * Modal form to load, update, and optionally delete an existing CRM contact.
 *
 * Responsibilities:
 * - Fetch contact, channels, addresses, and employer on open
 * - Validate and PATCH changes; profile photo upload/remove
 * - Delete with confirmation when `canDelete` is true
 *
 * Related:
 * - CRM contact detail page; shared CRM editors
 *
 * Security:
 * - Tenant-scoped contact id; delete permission enforced server-side.
 */
import {
  crmAddressErrorsNested,
  crmChannelErrorsByRow,
  validateCrmEmailFormRows,
  validateCrmPhoneFormRows,
  toCrmAddressPayload,
  validateCrmAddressFormRows,
  type CrmAddressEntry,
  type CrmChannelEntry
} from "@starter/shared";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  CrmAddressesEditor,
  addressRowsFromApi,
  defaultAddressRows,
  type AddressFormRow
} from "./CrmAddressesEditor.js";
import { contactSalutationSelectOptions } from "./contactSalutations.js";
import { CRM_SECTION_HEADING_RAIL } from "./crmSectionHeadingRail.js";
import { ContactEmployerOrganizationField } from "./ContactEmployerOrganizationField.js";
import { crmModalOutlineInputClass } from "./crmModalOutlineInputClass.js";
import {
  CrmChannelsEditor,
  channelRowsFromApi,
  defaultEmailRows,
  defaultPhoneRows,
  toCrmChannelPayload,
  type ChannelFormRow
} from "./CrmChannelsEditor.js";
import { CrmModal } from "./CrmModal.js";
import { ProfilePhotoNameModalRow } from "./ProfilePhotoNameModalRow.js";
import {
  ProfilePhotoEditModalRing,
  initialsFromFirstLast,
  useEntityProfilePhoto,
  type EntityProfilePhotoHandlers
} from "./ProfileEntityPhoto.js";

import { API_BASE_URL } from "../../lib/api.js";
import { useCrmApi } from "../../pages/crm/useCrmApi.js";

type ContactDto = {
  id: string;
  firstName: string;
  lastName: string;
  salutation: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  emails?: CrmChannelEntry[];
  phones?: CrmChannelEntry[];
  addresses?: CrmAddressEntry[];
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  employerOrganizationId?: string | null;
  employerOrganizationName?: string | null;
  employerOrganizationPrimaryAddress?: string | null;
  hasPhoto?: boolean;
  updatedAt?: string;
};

type Props = {
  contactId: string;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
  canDelete?: boolean;
};

/** Edit-contact dialog — refreshes parent via `onSaved` or `onDeleted`. */
export const EditContactModal = ({ contactId, onClose, onSaved, onDeleted, canDelete = true }: Props) => {
  const { authHeaders, authedFetch, refreshSession, logout } = useCrmApi();

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

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ firstName?: string; lastName?: string }>({});
  const [emailRowErrors, setEmailRowErrors] = useState<Record<number, string>>({});
  const [phoneRowErrors, setPhoneRowErrors] = useState<Record<number, string>>({});
  const [addressRowFieldErrors, setAddressRowFieldErrors] = useState<
    Record<number, Partial<Record<string, string>>>
  >({});
  const [deleteAwaitingConfirm, setDeleteAwaitingConfirm] = useState(false);
  const [hasPhoto, setHasPhoto] = useState(false);
  const [photoUpdatedAt, setPhotoUpdatedAt] = useState("");

  const salutationOptions = useMemo(() => contactSalutationSelectOptions(salutation), [salutation]);

  useEffect(() => {
    if (!deleteAwaitingConfirm) return;
    const id = window.setTimeout(() => setDeleteAwaitingConfirm(false), 5000);
    return () => window.clearTimeout(id);
  }, [deleteAwaitingConfirm]);

  useEffect(() => {
    setDeleteAwaitingConfirm(false);
  }, [contactId]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setError("");
      setLoading(true);
      try {
        let res = await fetch(`${API_BASE_URL}/tenant/crm/contacts/${encodeURIComponent(contactId)}`, {
          headers: authHeaders()
        });
        if (res.status === 401) {
          if (!(await refreshSession())) {
            logout();
            return;
          }
          res = await fetch(`${API_BASE_URL}/tenant/crm/contacts/${encodeURIComponent(contactId)}`, {
            headers: authHeaders()
          });
        }
        if (!res.ok) {
          if (!cancelled) setError(res.status === 404 ? "Contact not found." : "Could not load contact.");
          return;
        }
        const c = (await res.json()) as ContactDto;
        if (cancelled) return;
        setFieldErrors({});
        setEmailRowErrors({});
        setPhoneRowErrors({});
        setAddressRowFieldErrors({});
        setSalutation(c.salutation ?? "");
        setJobTitle(c.title ?? "");
        setFirstName(c.firstName);
        setLastName(c.lastName);
        setEmails(channelRowsFromApi(c.emails, c.email, "Work", defaultEmailRows));
        setPhones(channelRowsFromApi(c.phones, c.phone, "Mobile", defaultPhoneRows));
        setAddresses(addressRowsFromApi(c.addresses, c, defaultAddressRows));
        setEmployerOrganizationId(c.employerOrganizationId?.trim() ?? "");
        setEmployerOrganizationName(c.employerOrganizationName?.trim() ? c.employerOrganizationName : null);
        setEmployerOrganizationPrimaryAddress(
          c.employerOrganizationPrimaryAddress?.trim() ? c.employerOrganizationPrimaryAddress.trim() : null
        );
        setHasPhoto(Boolean(c.hasPhoto));
        setPhotoUpdatedAt(c.updatedAt ?? "");
      } catch {
        if (!cancelled) setError("Could not load contact.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [contactId, authHeaders, refreshSession, logout]);

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

    const body: Record<string, unknown> = {
      salutation: nullable(salutation),
      title: nullable(jobTitle),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      emails: emailPayload,
      phones: phonePayload,
      addresses: toCrmAddressPayload(addresses, "Home"),
      employerOrganizationId: employerOrganizationId.trim() || null
    };

    setSaving(true);
    try {
      let res = await fetch(`${API_BASE_URL}/tenant/crm/contacts/${encodeURIComponent(contactId)}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      if (res.status === 401) {
        if (!(await refreshSession())) {
          logout();
          return;
        }
        res = await fetch(`${API_BASE_URL}/tenant/crm/contacts/${encodeURIComponent(contactId)}`, {
          method: "PATCH",
          headers: { ...authHeaders(), "content-type": "application/json" },
          body: JSON.stringify(body)
        });
      }
      const errBody = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) {
        setError(errBody?.message ?? "Could not save changes.");
        return;
      }
      setFieldErrors({});
      setEmailRowErrors({});
      setPhoneRowErrors({});
      setAddressRowFieldErrors({});
      onClose();
      onSaved();
    } catch {
      setError("Request failed.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleteAwaitingConfirm) {
      setDeleteAwaitingConfirm(true);
      return;
    }
    setSaving(true);
    setError("");
    try {
      let res = await fetch(`${API_BASE_URL}/tenant/crm/contacts/${encodeURIComponent(contactId)}`, {
        method: "DELETE",
        headers: authHeaders()
      });
      if (res.status === 401) {
        if (!(await refreshSession())) {
          logout();
          return;
        }
        res = await fetch(`${API_BASE_URL}/tenant/crm/contacts/${encodeURIComponent(contactId)}`, {
          method: "DELETE",
          headers: authHeaders()
        });
      }
      if (res.ok) {
        setDeleteAwaitingConfirm(false);
        onClose();
        onDeleted();
      } else {
        setDeleteAwaitingConfirm(false);
        setError("Could not delete.");
      }
    } catch {
      setDeleteAwaitingConfirm(false);
      setError("Request failed.");
    } finally {
      setSaving(false);
    }
  };

  const refreshContactHead = useCallback(async () => {
    try {
      let res = await fetch(`${API_BASE_URL}/tenant/crm/contacts/${encodeURIComponent(contactId)}`, {
        headers: authHeaders()
      });
      if (res.status === 401) {
        if (!(await refreshSession())) {
          logout();
          return;
        }
        res = await fetch(`${API_BASE_URL}/tenant/crm/contacts/${encodeURIComponent(contactId)}`, {
          headers: authHeaders()
        });
      }
      if (!res.ok) return;
      const c = (await res.json()) as ContactDto;
      setHasPhoto(Boolean(c.hasPhoto));
      setPhotoUpdatedAt(c.updatedAt ?? "");
    } catch {
      /* ignore */
    }
  }, [contactId, authHeaders, refreshSession, logout]);

  const editPhotoHandlers = useMemo((): EntityProfilePhotoHandlers => {
    const base = `${API_BASE_URL}/tenant/crm/contacts/${encodeURIComponent(contactId)}/photo`;
    return {
      hasPhoto,
      cacheKey: photoUpdatedAt,
      photoGetUrl: base,
      photoPostUrl: base,
      photoDeleteUrl: base,
      authedFetch,
      onChanged: () => void refreshContactHead()
    };
  }, [contactId, hasPhoto, photoUpdatedAt, authedFetch, refreshContactHead]);

  const photoDrop = useEntityProfilePhoto(editPhotoHandlers);
  const initialsGlyph = useMemo(() => initialsFromFirstLast(firstName, lastName), [firstName, lastName]);

  return (
    <CrmModal
      title="Edit contact"
      open
      onClose={onClose}
      wide
      panelProps={{
        ...photoDrop.cardDropSurfaceProps,
        className: photoDrop.dragOver ? "outline outline-2 outline-offset-2 outline-amber-400/90" : ""
      }}
    >
      {loading ? (
        <p className="py-10 text-center text-sm text-stone-500">Loading…</p>
      ) : (
        <>
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
                <ProfilePhotoEditModalRing
                  handlers={editPhotoHandlers}
                  upload={photoDrop.upload}
                  remove={photoDrop.remove}
                  busy={photoDrop.busy}
                  error={photoDrop.error}
                  initials={initialsGlyph}
                  dragOver={photoDrop.dragOver}
                />
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
                <label htmlFor="crm-edit-salutation" className="mb-1.5 block text-xs font-medium text-stone-600">
                  Salutation
                </label>
                <select
                  id="crm-edit-salutation"
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
                <label htmlFor="crm-edit-title" className="mb-1.5 block text-xs font-medium text-stone-600">
                  Title
                </label>
                <input
                  id="crm-edit-title"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="Job title"
                  className={crmModalOutlineInputClass(false)}
                />
              </div>
              <div>
                <label htmlFor="crm-edit-fn" className="mb-1.5 block text-xs font-medium text-stone-600">
                  First name <span className="text-rose-600">*</span>
                </label>
                <input
                  id="crm-edit-fn"
                  value={firstName}
                  onChange={(e) => {
                    setFieldErrors((fe) => ({ ...fe, firstName: undefined }));
                    setFirstName(e.target.value);
                  }}
                  className={crmModalOutlineInputClass(Boolean(fieldErrors.firstName))}
                  aria-invalid={Boolean(fieldErrors.firstName)}
                  aria-describedby={fieldErrors.firstName ? "crm-edit-fn-err" : undefined}
                />
                {fieldErrors.firstName ? (
                  <p id="crm-edit-fn-err" className="mt-1.5 text-xs text-rose-600" role="alert">
                    {fieldErrors.firstName}
                  </p>
                ) : null}
              </div>
              <div>
                <label htmlFor="crm-edit-ln" className="mb-1.5 block text-xs font-medium text-stone-600">
                  Last name <span className="text-rose-600">*</span>
                </label>
                <input
                  id="crm-edit-ln"
                  value={lastName}
                  onChange={(e) => {
                    setFieldErrors((fe) => ({ ...fe, lastName: undefined }));
                    setLastName(e.target.value);
                  }}
                  className={crmModalOutlineInputClass(Boolean(fieldErrors.lastName))}
                  aria-invalid={Boolean(fieldErrors.lastName)}
                  aria-describedby={fieldErrors.lastName ? "crm-edit-ln-err" : undefined}
                />
                {fieldErrors.lastName ? (
                  <p id="crm-edit-ln-err" className="mt-1.5 text-xs text-rose-600" role="alert">
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
          inputId="crm-edit-contact-employer-org"
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

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-stone-100 pt-4">
        {canDelete ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => void remove()}
            className={[
              "rounded-lg px-4 py-2 text-sm font-semibold shadow-sm disabled:opacity-50",
              deleteAwaitingConfirm
                ? "border border-rose-900 bg-rose-600 text-white hover:bg-rose-700"
                : "border border-rose-300 text-rose-700 hover:bg-rose-50"
            ].join(" ")}
          >
            {deleteAwaitingConfirm ? "Are you sure?" : "Delete contact"}
          </button>
        ) : (
          <p className="text-xs text-stone-500">Your CRM role cannot delete contacts.</p>
        )}
        <div className="flex flex-wrap gap-3">
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
      </div>
        </>
      )}
    </CrmModal>
  );
};
