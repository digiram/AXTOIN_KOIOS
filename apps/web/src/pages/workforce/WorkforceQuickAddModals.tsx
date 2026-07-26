/**
 * WorkforceQuickAddModals.
 *
 * Quick-add dialogs for creating/editing employees and org units from chart and list screens.
 *
 * Responsibilities:
 * - Employee create/edit modal mirroring CRM contact edit layout
 * - Org-unit create modal for off-chart palette units
 * - Validate contact channels and persist via workforce APIs
 *
 * Depends on:
 * - {@link useWorkforceApi}, {@link WorkforcePersonalAddressFields}
 *
 * Security:
 * - Employee PII fields; API enforces tenant scope and module permissions
 */

import type { CrmAddressFormRowInput } from "@starter/shared";
import { isLinkedinProfileHost, validateCrmEmailFormRows, validateCrmPhoneFormRows } from "@starter/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CrmModal } from "../../components/crm/CrmModal.js";
import { crmModalOutlineInputClass } from "../../components/crm/crmModalOutlineInputClass.js";
import { CRM_SECTION_HEADING_RAIL } from "../../components/crm/crmSectionHeadingRail.js";
import { ProfilePhotoNameModalRow } from "../../components/crm/ProfilePhotoNameModalRow.js";
import {
  ProfilePhotoEditModalPlaceholder,
  ProfilePhotoEditModalRing,
  initialsFromFirstLast,
  useEntityProfilePhoto,
  type EntityProfilePhotoHandlers
} from "../../components/crm/ProfileEntityPhoto.js";
import { API_BASE_URL } from "../../lib/api.js";
import { EmployeeKindIcon } from "./EmployeeKindIcon.js";
import { WorkforcePersonalAddressFields } from "./WorkforcePersonalAddressFields.js";
import { useWorkforceApi } from "./useWorkforceApi.js";
import {
  workforcePersonalAddressFromStorage,
  workforcePersonalAddressToStorage
} from "./workforcePersonalAddress.js";

const inputClass =
  "w-full rounded-lg border border-stone-200/90 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/25";

type EmployeeModalProps = {
  open: boolean;
  onClose: () => void;
  /** Called after a successful create (new id). */
  onCreated?: (employeeId: string) => void;
  /** When set, dialog loads this employee and PATCHes on save (same fields as create). */
  employeeId?: string | null;
  /** Called after a successful edit. */
  onSaved?: () => void;
};

type ContactChannelFieldErrors = {
  personalEmail?: string;
  workEmail?: string;
  personalPhone?: string;
  workPhone?: string;
};

type EmployeeApiRow = {
  firstName: string;
  lastName: string;
  dateOfEmployment: string | null;
  employmentOrgUnitId: string | null;
  personalPhone: string | null;
  personalEmail: string | null;
  workPhone: string | null;
  workEmail: string | null;
  personalAddress: string | null;
  workLocation: string | null;
  jobTitle: string | null;
  employeeKind: string;
  notes: string | null;
  updatedAt?: string;
  hasPhoto?: boolean;
  socials?: Array<{ provider: string; profileUrl: string }>;
};

type OrgUnitOption = { id: string; name: string };

/**
 * Create / edit employee dialog (org chart +, employees list, employee detail).
 *
 * Layout and inputs mirror CRM contact edit (section rail, outline fields, inline errors).
 *
 * @param props.employeeId - When set, loads and PATCHes existing employee
 */
export const WorkforceQuickAddEmployeeModal = ({
  open,
  onClose,
  onCreated,
  employeeId = null,
  onSaved
}: EmployeeModalProps) => {
  const { authedFetch, authHeaders, refreshSession, logout } = useWorkforceApi();
  const isEdit = Boolean(employeeId);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ firstName?: string; lastName?: string }>({});
  const [contactChannelErrors, setContactChannelErrors] = useState<ContactChannelFieldErrors>({});
  const [dateOfEmployment, setDateOfEmployment] = useState("");
  const [personalPhone, setPersonalPhone] = useState("");
  const [personalEmail, setPersonalEmail] = useState("");
  const [workPhone, setWorkPhone] = useState("");
  const [workEmail, setWorkEmail] = useState("");
  const [personalAddressRow, setPersonalAddressRow] = useState<CrmAddressFormRowInput>(() =>
    workforcePersonalAddressFromStorage(null)
  );
  const [workLocation, setWorkLocation] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [employeeKind, setEmployeeKind] = useState<"person" | "agent">("person");
  const [employmentOrgUnitId, setEmploymentOrgUnitId] = useState("");
  const [orgUnits, setOrgUnits] = useState<OrgUnitOption[]>([]);
  const [orgUnitsLoading, setOrgUnitsLoading] = useState(false);
  const [notes, setNotes] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [linkedinError, setLinkedinError] = useState<string | undefined>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [empHasPhoto, setEmpHasPhoto] = useState(false);
  const [empPhotoUpdatedAt, setEmpPhotoUpdatedAt] = useState("");
  const authedFetchRef = useRef(authedFetch);
  authedFetchRef.current = authedFetch;

  const clearCreateFields = () => {
    setFirstName("");
    setLastName("");
    setFieldErrors({});
    setContactChannelErrors({});
    setDateOfEmployment("");
    setPersonalPhone("");
    setPersonalEmail("");
    setWorkPhone("");
    setWorkEmail("");
    setPersonalAddressRow(workforcePersonalAddressFromStorage(null));
    setWorkLocation("");
    setJobTitle("");
    setEmployeeKind("person");
    setEmploymentOrgUnitId("");
    setNotes("");
    setLinkedinUrl("");
    setLinkedinError(undefined);
    setEmpHasPhoto(false);
    setEmpPhotoUpdatedAt("");
  };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setOrgUnitsLoading(true);
    void (async () => {
      try {
        const res = await authedFetchRef.current(`${API_BASE_URL}/tenant/workforce/org-units`);
        if (!res?.ok || cancelled) return;
        const j = (await res.json()) as { orgUnits: Array<{ id: string; name: string }> };
        const sorted = (j.orgUnits ?? [])
          .map((u) => ({ id: u.id, name: u.name.trim() }))
          .filter((u) => u.name.length > 0)
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
        if (!cancelled) setOrgUnits(sorted);
      } finally {
        if (!cancelled) setOrgUnitsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setLoading(false);
      return;
    }
    setError("");
    if (!employeeId) {
      setLoading(false);
      clearCreateFields();
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await authedFetchRef.current(
          `${API_BASE_URL}/tenant/workforce/employees/${encodeURIComponent(employeeId)}`
        );
        if (!res?.ok || cancelled) {
          if (!cancelled) setError("Could not load employee.");
          return;
        }
        const j = (await res.json()) as EmployeeApiRow;
        if (cancelled) return;
        setFirstName(j.firstName);
        setLastName(j.lastName);
        setFieldErrors({});
        setContactChannelErrors({});
        setDateOfEmployment(j.dateOfEmployment ?? "");
        setPersonalPhone(j.personalPhone ?? "");
        setPersonalEmail(j.personalEmail ?? "");
        setWorkPhone(j.workPhone ?? "");
        setWorkEmail(j.workEmail ?? "");
        setPersonalAddressRow(workforcePersonalAddressFromStorage(j.personalAddress));
        setWorkLocation(j.workLocation ?? "");
        setJobTitle(j.jobTitle ?? "");
        setEmployeeKind(j.employeeKind === "agent" ? "agent" : "person");
        setEmploymentOrgUnitId(j.employmentOrgUnitId ?? "");
        setNotes(j.notes ?? "");
        const linkedin = (j.socials ?? []).find((s) => s.provider === "linkedin");
        setLinkedinUrl(linkedin?.profileUrl ?? "");
        setLinkedinError(undefined);
        setEmpHasPhoto(Boolean(j.hasPhoto));
        setEmpPhotoUpdatedAt(j.updatedAt ?? "");
      } catch {
        if (!cancelled) setError("Could not load employee.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, employeeId]);

  const submit = useCallback(async () => {
    setError("");
    const fn = firstName.trim();
    const ln = lastName.trim();
    const nextNameErrors: { firstName?: string; lastName?: string } = {};
    if (!fn) nextNameErrors.firstName = "First name is required.";
    if (!ln) nextNameErrors.lastName = "Last name is required.";

    const personalEmailErrs = validateCrmEmailFormRows(
      [{ kind: "Home", value: personalEmail, isPrimary: true }],
      "Home"
    );
    const workEmailErrs = validateCrmEmailFormRows(
      [{ kind: "Work", value: workEmail, isPrimary: true }],
      "Work"
    );
    const personalPhoneErrs = validateCrmPhoneFormRows(
      [{ kind: "Mobile", value: personalPhone, isPrimary: true }],
      "Mobile"
    );
    const workPhoneErrs = validateCrmPhoneFormRows(
      [{ kind: "Work", value: workPhone, isPrimary: true }],
      "Work"
    );

    const nextChannel: ContactChannelFieldErrors = {
      personalEmail: personalEmailErrs[0]?.message,
      workEmail: workEmailErrs[0]?.message,
      personalPhone: personalPhoneErrs[0]?.message,
      workPhone: workPhoneErrs[0]?.message
    };

    setFieldErrors(nextNameErrors);
    setContactChannelErrors(nextChannel);

    const linkedinTrimmed = linkedinUrl.trim();
    let nextLinkedinError: string | undefined;
    if (linkedinTrimmed) {
      try {
        const parsed = new URL(linkedinTrimmed);
        if (!isLinkedinProfileHost(parsed.hostname)) {
          nextLinkedinError = "URL must be a LinkedIn profile (linkedin.com).";
        }
      } catch {
        nextLinkedinError = "Enter a valid LinkedIn profile URL.";
      }
    }
    setLinkedinError(nextLinkedinError);

    if (
      nextNameErrors.firstName ||
      nextNameErrors.lastName ||
      personalEmailErrs.length > 0 ||
      workEmailErrs.length > 0 ||
      personalPhoneErrs.length > 0 ||
      workPhoneErrs.length > 0 ||
      nextLinkedinError
    ) {
      return;
    }

    const body = {
      firstName: fn,
      lastName: ln,
      dateOfEmployment: dateOfEmployment.trim() || null,
      personalPhone: personalPhone.trim() || null,
      personalEmail: personalEmail.trim() || null,
      workPhone: workPhone.trim() || null,
      workEmail: workEmail.trim() || null,
      personalAddress: workforcePersonalAddressToStorage(personalAddressRow),
      workLocation: workLocation.trim() || null,
      employmentOrgUnitId: employmentOrgUnitId.trim() || null,
      jobTitle: jobTitle.trim() || null,
      employeeKind,
      notes: notes.trim() || null,
      linkedinUrl: linkedinTrimmed || null
    };
    setBusy(true);
    try {
      if (employeeId) {
        const res = await authedFetch(`${API_BASE_URL}/tenant/workforce/employees/${encodeURIComponent(employeeId)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body)
        });
        if (!res?.ok) {
          const j = res
            ? ((await res.json().catch(() => null)) as { message?: string } | null)
            : null;
          setError(j?.message ?? "Could not save changes.");
          return;
        }
        setFieldErrors({});
        setContactChannelErrors({});
        onSaved?.();
        onClose();
        return;
      }
      const res = await authedFetch(`${API_BASE_URL}/tenant/workforce/employees`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res?.ok) {
        const j = res
          ? ((await res.json().catch(() => null)) as { message?: string } | null)
          : null;
        setError(j?.message ?? "Could not create employee.");
        return;
      }
      const j = (await res.json()) as { employee: { id: string } };
      setFieldErrors({});
      setContactChannelErrors({});
      onCreated?.(j.employee.id);
      onClose();
    } catch {
      setError("Request failed.");
    } finally {
      setBusy(false);
    }
  }, [
    authedFetch,
    dateOfEmployment,
    employeeId,
    employeeKind,
    employmentOrgUnitId,
    firstName,
    jobTitle,
    lastName,
    linkedinUrl,
    notes,
    onClose,
    onCreated,
    onSaved,
    personalAddressRow,
    personalEmail,
    personalPhone,
    workEmail,
    workLocation,
    workPhone
  ]);

  const refreshEmpPhotoMeta = useCallback(async () => {
    if (!employeeId) return;
    const res = await authedFetch(`${API_BASE_URL}/tenant/workforce/employees/${encodeURIComponent(employeeId)}`);
    if (!res?.ok) return;
    const j = (await res.json()) as EmployeeApiRow;
    setEmpHasPhoto(Boolean(j.hasPhoto));
    setEmpPhotoUpdatedAt(j.updatedAt ?? "");
  }, [employeeId, authedFetch]);

  const empPhotoHandlers = useMemo((): EntityProfilePhotoHandlers | null => {
    if (!employeeId) return null;
    const base = `${API_BASE_URL}/tenant/workforce/employees/${encodeURIComponent(employeeId)}/photo`;
    return {
      hasPhoto: empHasPhoto,
      cacheKey: empPhotoUpdatedAt,
      photoGetUrl: base,
      photoPostUrl: base,
      photoDeleteUrl: base,
      authedFetch,
      onChanged: () => void refreshEmpPhotoMeta()
    };
  }, [employeeId, empHasPhoto, empPhotoUpdatedAt, authedFetch, refreshEmpPhotoMeta]);

  const photoDrop = useEntityProfilePhoto(empPhotoHandlers ?? undefined);
  const empInitials = useMemo(() => initialsFromFirstLast(firstName, lastName), [firstName, lastName]);

  return (
    <CrmModal
      title={isEdit ? "Edit employee" : "New employee"}
      open={open}
      onClose={busy ? () => {} : onClose}
      wide
      panelProps={
        empPhotoHandlers
          ? {
              ...photoDrop.cardDropSurfaceProps,
              className: photoDrop.dragOver ? "outline outline-2 outline-offset-2 outline-amber-400/90" : ""
            }
          : undefined
      }
    >
      <p className="text-xs text-stone-500">* Required · Changes apply when you save.</p>

      {error ? (
        <p className="mt-3 text-sm text-rose-600" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="py-10 text-center text-sm text-stone-500">Loading…</p>
      ) : (
        <>
          <section className="mt-4">
            <ProfilePhotoNameModalRow
              photo={
                <>
                  <div className={`${CRM_SECTION_HEADING_RAIL} w-full shrink-0`}>
                    <h3 className="text-sm font-semibold text-slate-800">Profile photo</h3>
                  </div>
                  <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-start px-1 pt-3">
                    {empPhotoHandlers ? (
                      <ProfilePhotoEditModalRing
                        handlers={empPhotoHandlers}
                        upload={photoDrop.upload}
                        remove={photoDrop.remove}
                        busy={photoDrop.busy}
                        error={photoDrop.error}
                        initials={empInitials}
                        dragOver={photoDrop.dragOver}
                      />
                    ) : (
                      <>
                        <ProfilePhotoEditModalPlaceholder initials={empInitials} />
                        <p className="mt-2 max-w-[14rem] text-center text-[11px] leading-snug text-slate-500">
                          You can add a profile photo after this employee is saved.
                        </p>
                      </>
                    )}
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
                      <label htmlFor="wf-emp-fn" className="mb-1.5 block text-xs font-medium text-stone-600">
                        First name <span className="text-rose-600">*</span>
                      </label>
                      <input
                        id="wf-emp-fn"
                        value={firstName}
                        onChange={(e) => {
                          setFieldErrors((fe) => ({ ...fe, firstName: undefined }));
                          setFirstName(e.target.value);
                        }}
                        className={crmModalOutlineInputClass(Boolean(fieldErrors.firstName))}
                        aria-invalid={Boolean(fieldErrors.firstName)}
                        aria-describedby={fieldErrors.firstName ? "wf-emp-fn-err" : undefined}
                        autoFocus={!isEdit}
                      />
                      {fieldErrors.firstName ? (
                        <p id="wf-emp-fn-err" className="mt-1.5 text-xs text-rose-600" role="alert">
                          {fieldErrors.firstName}
                        </p>
                      ) : null}
                    </div>
                    <div>
                      <label htmlFor="wf-emp-ln" className="mb-1.5 block text-xs font-medium text-stone-600">
                        Last name <span className="text-rose-600">*</span>
                      </label>
                      <input
                        id="wf-emp-ln"
                        value={lastName}
                        onChange={(e) => {
                          setFieldErrors((fe) => ({ ...fe, lastName: undefined }));
                          setLastName(e.target.value);
                        }}
                        className={crmModalOutlineInputClass(Boolean(fieldErrors.lastName))}
                        aria-invalid={Boolean(fieldErrors.lastName)}
                        aria-describedby={fieldErrors.lastName ? "wf-emp-ln-err" : undefined}
                      />
                      {fieldErrors.lastName ? (
                        <p id="wf-emp-ln-err" className="mt-1.5 text-xs text-rose-600" role="alert">
                          {fieldErrors.lastName}
                        </p>
                      ) : null}
                    </div>
                    <div className="sm:col-span-2">
                      <label htmlFor="wf-emp-title" className="mb-1.5 block text-xs font-medium text-stone-600">
                        Job title
                      </label>
                      <input
                        id="wf-emp-title"
                        value={jobTitle}
                        onChange={(e) => setJobTitle(e.target.value)}
                        placeholder="Job title"
                        className={crmModalOutlineInputClass(false)}
                      />
                    </div>
                  </div>
                </>
              }
            />
          </section>

          <section className="mt-4">
            <div className={CRM_SECTION_HEADING_RAIL}>
              <h3 className="text-sm font-semibold text-slate-800">Employment</h3>
            </div>
            <div className="mt-3 grid gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="min-w-0">
                  <label htmlFor="wf-emp-doe" className="mb-1.5 block text-xs font-medium text-stone-600">
                    Date of employment
                  </label>
                  <input
                    id="wf-emp-doe"
                    type="date"
                    value={dateOfEmployment}
                    onChange={(e) => setDateOfEmployment(e.target.value)}
                    className={crmModalOutlineInputClass(false)}
                  />
                </div>
                <div className="min-w-0">
                  <p id="wf-emp-kind-label" className="mb-1.5 block text-xs font-medium text-stone-600">
                    Kind
                  </p>
                  <div
                    role="radiogroup"
                    aria-labelledby="wf-emp-kind-label"
                    className="grid h-[2.625rem] w-full grid-cols-2 overflow-hidden rounded-lg border border-stone-200/90 bg-stone-50/90 shadow-sm"
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={employeeKind === "agent"}
                      onClick={() => setEmployeeKind("agent")}
                      className={[
                        "inline-flex h-full min-h-0 items-center justify-center gap-2 border-r border-stone-200/90 px-3 text-sm font-semibold transition-colors",
                        employeeKind === "agent"
                          ? "bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-900/20"
                          : "text-stone-700 hover:bg-white"
                      ].join(" ")}
                    >
                      <EmployeeKindIcon
                        kind="agent"
                        className={employeeKind === "agent" ? "h-4 w-4 shrink-0 text-white" : "h-4 w-4 shrink-0 text-stone-500"}
                      />
                      Agent
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={employeeKind === "person"}
                      onClick={() => setEmployeeKind("person")}
                      className={[
                        "inline-flex h-full min-h-0 items-center justify-center gap-2 px-3 text-sm font-semibold transition-colors",
                        employeeKind === "person"
                          ? "bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-900/20"
                          : "text-stone-700 hover:bg-white"
                      ].join(" ")}
                    >
                      <EmployeeKindIcon
                        kind="person"
                        className={employeeKind === "person" ? "h-4 w-4 shrink-0 text-white" : "h-4 w-4 shrink-0 text-stone-500"}
                      />
                      Person
                    </button>
                  </div>
                </div>
              </div>
              <div>
                <label htmlFor="wf-emp-ou" className="mb-1.5 block text-xs font-medium text-stone-600">
                  Organizational unit
                </label>
                <select
                  id="wf-emp-ou"
                  value={employmentOrgUnitId}
                  disabled={orgUnitsLoading}
                  onChange={(e) => setEmploymentOrgUnitId(e.target.value)}
                  className={crmModalOutlineInputClass(false)}
                >
                  <option value="">None</option>
                  {orgUnits.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-stone-500">
                  Employment unit (many employees per unit). Separate from the org-chart assignee on a unit.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="wf-emp-we" className="mb-1.5 block text-xs font-medium text-stone-600">
                    Work email
                  </label>
                  <input
                    id="wf-emp-we"
                    type="email"
                    value={workEmail}
                    onChange={(e) => {
                      setContactChannelErrors((c) => ({ ...c, workEmail: undefined }));
                      setWorkEmail(e.target.value);
                    }}
                    className={crmModalOutlineInputClass(Boolean(contactChannelErrors.workEmail))}
                    aria-invalid={Boolean(contactChannelErrors.workEmail)}
                    aria-describedby={contactChannelErrors.workEmail ? "wf-emp-we-err" : undefined}
                  />
                  {contactChannelErrors.workEmail ? (
                    <p id="wf-emp-we-err" className="mt-1.5 text-xs text-rose-600" role="alert">
                      {contactChannelErrors.workEmail}
                    </p>
                  ) : null}
                </div>
                <div>
                  <label htmlFor="wf-emp-wp" className="mb-1.5 block text-xs font-medium text-stone-600">
                    Work phone
                  </label>
                  <input
                    id="wf-emp-wp"
                    type="tel"
                    value={workPhone}
                    onChange={(e) => {
                      setContactChannelErrors((c) => ({ ...c, workPhone: undefined }));
                      setWorkPhone(e.target.value);
                    }}
                    className={crmModalOutlineInputClass(Boolean(contactChannelErrors.workPhone))}
                    aria-invalid={Boolean(contactChannelErrors.workPhone)}
                    aria-describedby={contactChannelErrors.workPhone ? "wf-emp-wp-err" : undefined}
                  />
                  {contactChannelErrors.workPhone ? (
                    <p id="wf-emp-wp-err" className="mt-1.5 text-xs text-rose-600" role="alert">
                      {contactChannelErrors.workPhone}
                    </p>
                  ) : null}
                </div>
              </div>
              <div>
                <label htmlFor="wf-emp-wl" className="mb-1.5 block text-xs font-medium text-stone-600">
                  Work location
                </label>
                <input
                  id="wf-emp-wl"
                  value={workLocation}
                  onChange={(e) => setWorkLocation(e.target.value)}
                  placeholder="Office, site, or city"
                  className={crmModalOutlineInputClass(false)}
                />
              </div>
            </div>
          </section>

          <section className="mt-4">
            <div className={CRM_SECTION_HEADING_RAIL}>
              <h3 className="text-sm font-semibold text-slate-800">Personal</h3>
            </div>
            <div className="mt-3 grid gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="min-w-0">
                  <label htmlFor="wf-emp-pe" className="mb-1.5 block text-xs font-medium text-stone-600">
                    Personal email
                  </label>
                  <input
                    id="wf-emp-pe"
                    type="email"
                    value={personalEmail}
                    onChange={(e) => {
                      setContactChannelErrors((c) => ({ ...c, personalEmail: undefined }));
                      setPersonalEmail(e.target.value);
                    }}
                    className={crmModalOutlineInputClass(Boolean(contactChannelErrors.personalEmail))}
                    aria-invalid={Boolean(contactChannelErrors.personalEmail)}
                    aria-describedby={contactChannelErrors.personalEmail ? "wf-emp-pe-err" : undefined}
                  />
                  {contactChannelErrors.personalEmail ? (
                    <p id="wf-emp-pe-err" className="mt-1.5 text-xs text-rose-600" role="alert">
                      {contactChannelErrors.personalEmail}
                    </p>
                  ) : null}
                </div>
                <div className="min-w-0">
                  <label htmlFor="wf-emp-pp" className="mb-1.5 block text-xs font-medium text-stone-600">
                    Personal phone
                  </label>
                  <input
                    id="wf-emp-pp"
                    type="tel"
                    value={personalPhone}
                    onChange={(e) => {
                      setContactChannelErrors((c) => ({ ...c, personalPhone: undefined }));
                      setPersonalPhone(e.target.value);
                    }}
                    className={crmModalOutlineInputClass(Boolean(contactChannelErrors.personalPhone))}
                    aria-invalid={Boolean(contactChannelErrors.personalPhone)}
                    aria-describedby={contactChannelErrors.personalPhone ? "wf-emp-pp-err" : undefined}
                  />
                  {contactChannelErrors.personalPhone ? (
                    <p id="wf-emp-pp-err" className="mt-1.5 text-xs text-rose-600" role="alert">
                      {contactChannelErrors.personalPhone}
                    </p>
                  ) : null}
                </div>
              </div>
              <div>
                <WorkforcePersonalAddressFields
                  row={personalAddressRow}
                  onRowChange={setPersonalAddressRow}
                  geocodeApi={{ authHeaders, refreshSession, logout }}
                />
              </div>
            </div>
          </section>

          <section className="mt-4">
            <div className={CRM_SECTION_HEADING_RAIL}>
              <h3 className="text-sm font-semibold text-slate-800">Socials</h3>
            </div>
            <div className="mt-3">
              <label htmlFor="wf-emp-linkedin" className="mb-1.5 block text-xs font-medium text-stone-600">
                LinkedIn profile URL
              </label>
              <input
                id="wf-emp-linkedin"
                type="url"
                value={linkedinUrl}
                onChange={(e) => {
                  setLinkedinError(undefined);
                  setLinkedinUrl(e.target.value);
                }}
                placeholder="https://www.linkedin.com/in/…"
                className={crmModalOutlineInputClass(Boolean(linkedinError))}
                aria-invalid={Boolean(linkedinError)}
                aria-describedby={linkedinError ? "wf-emp-linkedin-err" : "wf-emp-linkedin-hint"}
              />
              {linkedinError ? (
                <p id="wf-emp-linkedin-err" className="mt-1.5 text-xs text-rose-600" role="alert">
                  {linkedinError}
                </p>
              ) : (
                <p id="wf-emp-linkedin-hint" className="mt-1 text-xs text-stone-500">
                  Paste a LinkedIn profile URL. Clear the field and save to remove it.
                </p>
              )}
            </div>
          </section>

          <section className="mt-4">
            <div className={CRM_SECTION_HEADING_RAIL}>
              <h3 className="text-sm font-semibold text-slate-800">Notes</h3>
            </div>
            <div className="mt-3">
              <label htmlFor="wf-emp-notes" className="mb-1.5 block text-xs font-medium text-stone-600">
                Internal notes
              </label>
              <textarea
                id="wf-emp-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={`${crmModalOutlineInputClass(false)} min-h-[4rem]`}
              />
            </div>
          </section>

          <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-stone-100 pt-4">
            <button
              type="button"
              disabled={busy}
              className="rounded-lg border border-stone-200 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => void submit()}
            >
              {busy ? "Saving…" : isEdit ? "Save changes" : "Create employee"}
            </button>
          </div>
        </>
      )}
    </CrmModal>
  );
};

type OrgUnitModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
};

/**
 * Create palette org unit (off chart until placed on the chart).
 *
 * @param props.onCreated - Called after successful org-unit create
 */
export const WorkforceQuickAddOrgUnitModal = ({ open, onClose, onCreated }: OrgUnitModalProps) => {
  const { authedFetch } = useWorkforceApi();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName("");
    setError("");
  }, [open]);

  const submit = useCallback(async () => {
    setError("");
    const n = name.trim();
    if (!n) {
      setError("Unit name is required.");
      return;
    }
    setBusy(true);
    try {
      const res = await authedFetch(`${API_BASE_URL}/tenant/workforce/org-units`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: n, onOrgChart: false })
      });
      if (!res || !res.ok) {
        const j = res ? ((await res.json().catch(() => null)) as { message?: string } | null) : null;
        setError(j?.message ?? "Could not create org unit.");
        return;
      }
      onCreated?.();
      onClose();
    } catch {
      setError("Request failed.");
    } finally {
      setBusy(false);
    }
  }, [authedFetch, name, onClose, onCreated]);

  return (
    <CrmModal title="New organizational unit" open={open} onClose={busy ? () => {} : onClose}>
      <p className="text-xs text-stone-500">New units start in the palette. Drag them onto the chart when ready.</p>
      {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
      <div className="mt-4 space-y-3">
        <label className="block text-xs font-medium text-stone-600">
          Unit name
          <input className={`${inputClass} mt-1`} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            disabled={busy}
            className="rounded-lg border border-stone-200 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !name.trim()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void submit()}
          >
            {busy ? "Saving…" : "Create"}
          </button>
        </div>
      </div>
    </CrmModal>
  );
};
