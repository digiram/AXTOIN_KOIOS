/**
 * EditOrganizationModal
 *
 * Modal form to load, update, and optionally delete an existing CRM organization.
 *
 * Responsibilities:
 * - Fetch organization, segments, tags, channels, and addresses on open
 * - Validate and PATCH; segment and marketing tag assignment
 * - Delete with confirmation when allowed
 *
 * Related:
 * - CRM organization detail page
 *
 * Security:
 * - Tenant-scoped organization id; module delete permission enforced server-side.
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
import { useEffect, useState } from "react";

import {
  CrmAddressesEditor,
  addressRowsFromApi,
  defaultAddressRows,
  type AddressFormRow
} from "./CrmAddressesEditor.js";
import { ContactEmployerOrganizationField } from "./ContactEmployerOrganizationField.js";
import {
  CrmOrganizationMarketingTagPicker,
  type CrmMarketingTagOption
} from "./CrmOrganizationMarketingTagPicker.js";
import {
  CrmOrganizationSegmentFields,
  type CrmMarketSegmentOption
} from "./CrmOrganizationSegmentFields.js";
import { CRM_SECTION_HEADING_RAIL } from "./crmSectionHeadingRail.js";
import { crmModalOutlineInputClass } from "./crmModalOutlineInputClass.js";
import {
  CrmChannelsEditor,
  channelRowsFromApi,
  defaultEmailRows,
  defaultPhoneRows,
  toCrmChannelPayload,
  type ChannelFormRow
} from "./CrmChannelsEditor.js";

import { API_BASE_URL } from "../../lib/api.js";
import { useCrmApi } from "../../pages/crm/useCrmApi.js";

type OrgDto = {
  id: string;
  name: string;
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
  holdingOrganizationId?: string | null;
  holdingOrganizationName?: string | null;
  holdingOrganizationPrimaryAddress?: string | null;
  marketSegmentLayer1Id?: string | null;
  marketSegmentLayer2Id?: string | null;
  marketSegmentLayer3Id?: string | null;
  marketingTags?: { id: string; name: string }[];
};

type Props = {
  organizationId: string;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
  canDelete?: boolean;
};

/** Edit-organization dialog — refreshes parent via `onSaved` or `onDeleted`. */
export const EditOrganizationModal = ({
  organizationId,
  onClose,
  onSaved,
  onDeleted,
  canDelete = true
}: Props) => {
  const { authHeaders, refreshSession, logout } = useCrmApi();

  const [name, setName] = useState("");
  const [emails, setEmails] = useState<ChannelFormRow[]>(defaultEmailRows);
  const [phones, setPhones] = useState<ChannelFormRow[]>(defaultPhoneRows);
  const [addresses, setAddresses] = useState<AddressFormRow[]>(() => defaultAddressRows());
  const [holdingOrganizationId, setHoldingOrganizationId] = useState("");
  const [holdingOrganizationName, setHoldingOrganizationName] = useState<string | null>(null);
  const [holdingOrganizationPrimaryAddress, setHoldingOrganizationPrimaryAddress] = useState<string | null>(null);
  const [segmentOptions, setSegmentOptions] = useState<CrmMarketSegmentOption[]>([]);
  const [marketingTagOptions, setMarketingTagOptions] = useState<CrmMarketingTagOption[]>([]);
  const [marketSegmentLayer1Id, setMarketSegmentLayer1Id] = useState("");
  const [marketSegmentLayer2Id, setMarketSegmentLayer2Id] = useState("");
  const [marketSegmentLayer3Id, setMarketSegmentLayer3Id] = useState("");
  const [marketingTagIds, setMarketingTagIds] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [nameError, setNameError] = useState<string | undefined>();
  const [emailRowErrors, setEmailRowErrors] = useState<Record<number, string>>({});
  const [phoneRowErrors, setPhoneRowErrors] = useState<Record<number, string>>({});
  const [addressRowFieldErrors, setAddressRowFieldErrors] = useState<
    Record<number, Partial<Record<string, string>>>
  >({});
  const [deleteAwaitingConfirm, setDeleteAwaitingConfirm] = useState(false);

  useEffect(() => {
    if (!deleteAwaitingConfirm) return;
    const id = window.setTimeout(() => setDeleteAwaitingConfirm(false), 5000);
    return () => window.clearTimeout(id);
  }, [deleteAwaitingConfirm]);

  useEffect(() => {
    setDeleteAwaitingConfirm(false);
  }, [organizationId]);

  useEffect(() => {
    let cancelled = false;
    const loadVocab = async () => {
      try {
        let segRes = await fetch(`${API_BASE_URL}/tenant/crm/organization-market-segments`, { headers: authHeaders() });
        let tagRes = await fetch(`${API_BASE_URL}/tenant/crm/organization-marketing-tags`, { headers: authHeaders() });
        if (segRes.status === 401 || tagRes.status === 401) {
          if (!(await refreshSession())) {
            logout();
            return;
          }
          segRes = await fetch(`${API_BASE_URL}/tenant/crm/organization-market-segments`, { headers: authHeaders() });
          tagRes = await fetch(`${API_BASE_URL}/tenant/crm/organization-marketing-tags`, { headers: authHeaders() });
        }
        if (!cancelled && segRes.ok) {
          const j = (await segRes.json()) as { segments: CrmMarketSegmentOption[] };
          setSegmentOptions(j.segments ?? []);
        }
        if (!cancelled && tagRes.ok) {
          const j = (await tagRes.json()) as { tags: CrmMarketingTagOption[] };
          setMarketingTagOptions(j.tags ?? []);
        }
      } catch {
        /* non-fatal */
      }
    };
    void loadVocab();
    return () => {
      cancelled = true;
    };
  }, [authHeaders, refreshSession, logout]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setError("");
      setLoading(true);
      try {
        let res = await fetch(`${API_BASE_URL}/tenant/crm/organizations/${encodeURIComponent(organizationId)}`, {
          headers: authHeaders()
        });
        if (res.status === 401) {
          if (!(await refreshSession())) {
            logout();
            return;
          }
          res = await fetch(`${API_BASE_URL}/tenant/crm/organizations/${encodeURIComponent(organizationId)}`, {
            headers: authHeaders()
          });
        }
        if (!res.ok) {
          if (!cancelled) setError(res.status === 404 ? "Organization not found." : "Could not load organization.");
          return;
        }
        const o = (await res.json()) as OrgDto;
        if (cancelled) return;
        setNameError(undefined);
        setEmailRowErrors({});
        setPhoneRowErrors({});
        setAddressRowFieldErrors({});
        setName(o.name);
        setHoldingOrganizationId(o.holdingOrganizationId?.trim() ?? "");
        setHoldingOrganizationName(o.holdingOrganizationName?.trim() ? o.holdingOrganizationName : null);
        setHoldingOrganizationPrimaryAddress(
          o.holdingOrganizationPrimaryAddress?.trim() ? o.holdingOrganizationPrimaryAddress.trim() : null
        );
        setEmails(channelRowsFromApi(o.emails, o.email, "Work", defaultEmailRows));
        setPhones(channelRowsFromApi(o.phones, o.phone, "Mobile", defaultPhoneRows));
        setAddresses(addressRowsFromApi(o.addresses, o, defaultAddressRows));
        setMarketSegmentLayer1Id(o.marketSegmentLayer1Id?.trim() ?? "");
        setMarketSegmentLayer2Id(o.marketSegmentLayer2Id?.trim() ?? "");
        setMarketSegmentLayer3Id(o.marketSegmentLayer3Id?.trim() ?? "");
        setMarketingTagIds((o.marketingTags ?? []).map((t) => t.id));
      } catch {
        if (!cancelled) setError("Could not load organization.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [organizationId, authHeaders, refreshSession, logout]);

  const save = async () => {
    setError("");
    const emailPayload = toCrmChannelPayload(emails, "Home");
    const phonePayload = toCrmChannelPayload(phones, "Mobile");
    const emailErrs = validateCrmEmailFormRows(emails, "Home");
    const phoneErrs = validateCrmPhoneFormRows(phones, "Mobile");
    const addrErrs = validateCrmAddressFormRows(addresses, "Home");
    const nextNameError = name.trim() ? undefined : "Name is required.";
    setEmailRowErrors(crmChannelErrorsByRow(emailErrs));
    setPhoneRowErrors(crmChannelErrorsByRow(phoneErrs));
    setAddressRowFieldErrors(crmAddressErrorsNested(addrErrs));
    setNameError(nextNameError);
    if (emailErrs.length > 0 || phoneErrs.length > 0 || addrErrs.length > 0 || nextNameError) {
      return;
    }

    const body: Record<string, unknown> = {
      name: name.trim(),
      emails: emailPayload,
      phones: phonePayload,
      addresses: toCrmAddressPayload(addresses, "Home"),
      holdingOrganizationId: holdingOrganizationId.trim() || null,
      marketSegmentLayer1Id: marketSegmentLayer1Id.trim() || null,
      marketSegmentLayer2Id: marketSegmentLayer2Id.trim() || null,
      marketSegmentLayer3Id: marketSegmentLayer3Id.trim() || null,
      marketingTagIds
    };

    setSaving(true);
    try {
      let res = await fetch(`${API_BASE_URL}/tenant/crm/organizations/${encodeURIComponent(organizationId)}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      if (res.status === 401) {
        if (!(await refreshSession())) {
          logout();
          return;
        }
        res = await fetch(`${API_BASE_URL}/tenant/crm/organizations/${encodeURIComponent(organizationId)}`, {
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
      setNameError(undefined);
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
      let res = await fetch(`${API_BASE_URL}/tenant/crm/organizations/${encodeURIComponent(organizationId)}`, {
        method: "DELETE",
        headers: authHeaders()
      });
      if (res.status === 401) {
        if (!(await refreshSession())) {
          logout();
          return;
        }
        res = await fetch(`${API_BASE_URL}/tenant/crm/organizations/${encodeURIComponent(organizationId)}`, {
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

  if (loading) {
    return <p className="py-10 text-center text-sm text-stone-500">Loading…</p>;
  }

  return (
    <>
      <p className="text-xs text-stone-500">* Required · Changes apply when you save.</p>

      {error ? (
        <p className="mt-3 text-sm text-rose-600" role="alert">
          {error}
        </p>
      ) : null}

      <section className="mt-4">
        <div className={CRM_SECTION_HEADING_RAIL}>
          <h3 className="text-sm font-semibold text-slate-800">Profile</h3>
        </div>
        <div className="mt-3">
          <label htmlFor="crm-edit-org-name" className="mb-1.5 block text-xs font-medium text-stone-600">
            Name <span className="text-rose-600">*</span>
          </label>
          <input
            id="crm-edit-org-name"
            value={name}
            onChange={(e) => {
              setNameError(undefined);
              setName(e.target.value);
            }}
            className={crmModalOutlineInputClass(Boolean(nameError))}
            aria-invalid={Boolean(nameError)}
            aria-describedby={nameError ? "crm-edit-org-name-err" : undefined}
          />
          {nameError ? (
            <p id="crm-edit-org-name-err" className="mt-1.5 text-xs text-rose-600" role="alert">
              {nameError}
            </p>
          ) : null}
        </div>
      </section>

      <section className="mt-4">
        <div className={CRM_SECTION_HEADING_RAIL}>
          <h3 className="text-sm font-semibold text-slate-800">Market segmentation</h3>
        </div>
        <p className="mt-1 text-xs text-stone-500">
          Optional hierarchical industry classification. Options are managed under System → Market segments & tags.
        </p>
        <div className="mt-3">
          <CrmOrganizationSegmentFields
            segments={segmentOptions}
            layer1Id={marketSegmentLayer1Id}
            layer2Id={marketSegmentLayer2Id}
            layer3Id={marketSegmentLayer3Id}
            onChange={({ layer1Id, layer2Id, layer3Id }) => {
              setMarketSegmentLayer1Id(layer1Id);
              setMarketSegmentLayer2Id(layer2Id);
              setMarketSegmentLayer3Id(layer3Id);
            }}
          />
        </div>
      </section>

      <section className="mt-4">
        <div className={CRM_SECTION_HEADING_RAIL}>
          <h3 className="text-sm font-semibold text-slate-800">Marketing tags</h3>
        </div>
        <div className="mt-3">
          <CrmOrganizationMarketingTagPicker
            inputId="crm-edit-org-marketing-tags"
            tags={marketingTagOptions}
            selectedIds={marketingTagIds}
            onChange={setMarketingTagIds}
          />
        </div>
      </section>

      <section className="mt-4">
        <div className={CRM_SECTION_HEADING_RAIL}>
          <h3 className="text-sm font-semibold text-slate-800">Holding organization</h3>
        </div>
        <p className="mt-1 text-xs text-stone-500">
          Optional. Search and select a holding organization (Subsidiary → Holding). This record is the subsidiary.
        </p>
        <ContactEmployerOrganizationField
          inputId="crm-edit-org-holding-org"
          authHeaders={authHeaders}
          refreshSession={refreshSession}
          logout={logout}
          label="Holding organization"
          excludeOrganizationId={organizationId}
          organizationId={holdingOrganizationId}
          organizationName={holdingOrganizationName}
          organizationPrimaryAddress={holdingOrganizationPrimaryAddress}
          onChange={(id, nameH, primary) => {
            setHoldingOrganizationId(id);
            setHoldingOrganizationName(nameH);
            setHoldingOrganizationPrimaryAddress(primary);
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
            {deleteAwaitingConfirm ? "Are you sure?" : "Delete organization"}
          </button>
        ) : (
          <p className="text-xs text-stone-500">Your CRM role cannot delete organizations.</p>
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
  );
};
