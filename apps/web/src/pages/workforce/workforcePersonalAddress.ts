/**
 * WorkforcePersonalAddress.
 *
 * Serialize and deserialize employee `personal_address` between API storage and CRM address form rows.
 *
 * Responsibilities:
 * - Parse JSON v1 structured address or legacy free-text values
 * - Format a single-line display string for profile cards
 * - Persist editor rows back to API storage format
 */

import {
  crmAddressRowHasContent,
  formatCrmAddressEntryOneLine,
  type CrmAddressEntry,
  type CrmAddressFormRowInput
} from "@starter/shared";

const WF_ADDR_V = 1 as const;

type StoredWorkforcePersonalAddressV1 = {
  v: typeof WF_ADDR_V;
  addressLine1: string;
  addressLine2: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  state: string;
  country: string;
};

const emptyHomeRow = (): CrmAddressFormRowInput => ({
  kind: "Home",
  addressLine1: "",
  addressLine2: "",
  houseNumber: "",
  postalCode: "",
  city: "",
  state: "",
  country: "",
  isPrimary: true
});

/**
 * Parse API `personal_address` (JSON v1 or legacy free text) into a single Home row for the editor.
 *
 * @param raw - Stored `personal_address` column value
 * @returns CRM address form row defaulting to Home/primary
 */
export function workforcePersonalAddressFromStorage(raw: string | null): CrmAddressFormRowInput {
  const t = raw?.trim() ?? "";
  if (!t) return emptyHomeRow();
  if (t.startsWith("{")) {
    try {
      const j = JSON.parse(t) as Partial<StoredWorkforcePersonalAddressV1>;
      if (j.v === WF_ADDR_V) {
        return {
          kind: "Home",
          addressLine1: String(j.addressLine1 ?? "").trim(),
          addressLine2: String(j.addressLine2 ?? "").trim(),
          houseNumber: String(j.houseNumber ?? "").trim(),
          postalCode: String(j.postalCode ?? "").trim(),
          city: String(j.city ?? "").trim(),
          state: String(j.state ?? "").trim(),
          country: String(j.country ?? "").trim(),
          isPrimary: true
        };
      }
    } catch {
      /* fall through to legacy */
    }
  }
  return { ...emptyHomeRow(), addressLine1: t };
}

/**
 * Serialize editor row to `personal_address` (JSON) or `null` when empty.
 *
 * @param row - Single Home address form row from the employee editor
 */
export function workforcePersonalAddressToStorage(row: CrmAddressFormRowInput): string | null {
  if (!crmAddressRowHasContent(row)) return null;
  const payload: StoredWorkforcePersonalAddressV1 = {
    v: WF_ADDR_V,
    addressLine1: row.addressLine1.trim(),
    addressLine2: row.addressLine2.trim(),
    houseNumber: row.houseNumber.trim(),
    postalCode: row.postalCode.trim(),
    city: row.city.trim(),
    state: row.state.trim(),
    country: row.country.trim()
  };
  return JSON.stringify(payload);
}

/**
 * One-line display for profile cards and lists (matches CRM address line formatting).
 *
 * @param raw - Stored `personal_address` value
 */
export function formatWorkforcePersonalAddressLine(raw: string | null): string {
  const row = workforcePersonalAddressFromStorage(raw);
  const e: CrmAddressEntry = {
    kind: "Home",
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    houseNumber: row.houseNumber,
    postalCode: row.postalCode,
    city: row.city,
    state: row.state,
    country: row.country,
    isPrimary: true
  };
  return formatCrmAddressEntryOneLine(e).trim();
}
