/**
 * AddOrganizationModal
 *
 * Modal form to create a CRM organization with segmentation and marketing tags.
 *
 * Responsibilities:
 * - Load market segment and marketing tag options on open
 * - Validate channels and addresses before POST
 * - Create organization via tenant CRM API
 *
 * Related:
 * - CRM organizations list; `CrmOrganizationSegmentFields`
 *
 * Security:
 * - Tenant-scoped create; tag and segment ids validated server-side.
 */
import { useEffect, useState } from "react";

import {
  CrmAddressesEditor,
  defaultAddressRows,
  type AddressFormRow
} from "./CrmAddressesEditor.js";
import { CRM_SECTION_HEADING_RAIL } from "./crmSectionHeadingRail.js";
import {
  CrmChannelsEditor,
  defaultEmailRows,
  defaultPhoneRows,
  toCrmChannelPayload,
  type ChannelFormRow
} from "./CrmChannelsEditor.js";
import {
  CrmOrganizationMarketingTagPicker,
  type CrmMarketingTagOption
} from "./CrmOrganizationMarketingTagPicker.js";
import {
  CrmOrganizationSegmentFields,
  type CrmMarketSegmentOption
} from "./CrmOrganizationSegmentFields.js";
import { crmModalOutlineInputClass } from "./crmModalOutlineInputClass.js";

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
  /** Called after a successful create so the parent can navigate or refresh. */
  onCreated: (id: string) => void;
};

/** Create-organization dialog — calls `onCreated` with the new organization id on success. */
export const AddOrganizationModal = ({ onClose, onCreated }: Props) => {
  const { authHeaders, refreshSession, logout } = useCrmApi();

  const [name, setName] = useState("");
  const [emails, setEmails] = useState<ChannelFormRow[]>(defaultEmailRows);
  const [phones, setPhones] = useState<ChannelFormRow[]>(defaultPhoneRows);
  const [addresses, setAddresses] = useState<AddressFormRow[]>(() => defaultAddressRows());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [nameError, setNameError] = useState<string | undefined>();
  const [emailRowErrors, setEmailRowErrors] = useState<Record<number, string>>({});
  const [phoneRowErrors, setPhoneRowErrors] = useState<Record<number, string>>({});
  const [addressRowFieldErrors, setAddressRowFieldErrors] = useState<
    Record<number, Partial<Record<string, string>>>
  >({});
  const [segmentOptions, setSegmentOptions] = useState<CrmMarketSegmentOption[]>([]);
  const [marketingTagOptions, setMarketingTagOptions] = useState<CrmMarketingTagOption[]>([]);
  const [marketSegmentLayer1Id, setMarketSegmentLayer1Id] = useState("");
  const [marketSegmentLayer2Id, setMarketSegmentLayer2Id] = useState("");
  const [marketSegmentLayer3Id, setMarketSegmentLayer3Id] = useState("");
  const [marketingTagIds, setMarketingTagIds] = useState<string[]>([]);

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
      addresses: toCrmAddressPayload(addresses, "Home")
    };
    if (emailPayload.length > 0) body.emails = emailPayload;
    if (phonePayload.length > 0) body.phones = phonePayload;
    if (marketSegmentLayer1Id.trim()) body.marketSegmentLayer1Id = marketSegmentLayer1Id.trim();
    if (marketSegmentLayer2Id.trim()) body.marketSegmentLayer2Id = marketSegmentLayer2Id.trim();
    if (marketSegmentLayer3Id.trim()) body.marketSegmentLayer3Id = marketSegmentLayer3Id.trim();
    if (marketingTagIds.length > 0) body.marketingTagIds = marketingTagIds;

    setSaving(true);
    try {
      let res = await fetch(`${API_BASE_URL}/tenant/crm/organizations`, {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      if (res.status === 401) {
        if (!(await refreshSession())) {
          logout();
          return;
        }
        res = await fetch(`${API_BASE_URL}/tenant/crm/organizations`, {
          method: "POST",
          headers: { ...authHeaders(), "content-type": "application/json" },
          body: JSON.stringify(body)
        });
      }
      const payload = (await res.json().catch(() => null)) as { message?: string; id?: string } | null;
      if (!res.ok) {
        setError(payload?.message ?? "Could not create organization.");
        return;
      }
      if (!payload?.id) {
        setError("Invalid response from server.");
        return;
      }
      setNameError(undefined);
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
          <label htmlFor="crm-modal-org-name" className="mb-1.5 block text-xs font-medium text-stone-600">
            Name <span className="text-rose-600">*</span>
          </label>
          <input
            id="crm-modal-org-name"
            value={name}
            onChange={(e) => {
              setNameError(undefined);
              setName(e.target.value);
            }}
            className={crmModalOutlineInputClass(Boolean(nameError))}
            aria-invalid={Boolean(nameError)}
            aria-describedby={nameError ? "crm-modal-org-name-err" : undefined}
          />
          {nameError ? (
            <p id="crm-modal-org-name-err" className="mt-1.5 text-xs text-rose-600" role="alert">
              {nameError}
            </p>
          ) : null}
        </div>
      </section>

      <section className="mt-4">
        <div className={CRM_SECTION_HEADING_RAIL}>
          <h3 className="text-sm font-semibold text-slate-800">Market segmentation</h3>
        </div>
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
            inputId="crm-add-org-marketing-tags"
            tags={marketingTagOptions}
            selectedIds={marketingTagIds}
            onChange={setMarketingTagIds}
          />
        </div>
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

      <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-stone-100 pt-4">
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
          Save organization
        </button>
      </div>
    </>
  );
};
