/**
 * CrmAddressesEditor
 *
 * Multi-row postal address editor for CRM create/edit modals.
 *
 * Responsibilities:
 * - Add/remove rows with kind, primary flag, and field-level validation errors
 * - Optional map-backed geocode section when provider is enabled
 * - Map form rows to API payload via shared helpers
 *
 * Related:
 * - `CrmAddressGeocodeSection`; `@starter/shared` address validation
 */
import type { CrmAddressEntry, CrmAddressFormRowInput } from "@starter/shared";
import { ChevronDown, X } from "lucide-react";

import { CrmAddressGeocodeSection, type CrmGeocodeApiDeps } from "./CrmAddressGeocodeSection.js";
import { CRM_SECTION_HEADING_RAIL } from "./crmSectionHeadingRail.js";
import { crmModalOutlineInputClass } from "./crmModalOutlineInputClass.js";

export type { CrmGeocodeApiDeps };

/** One address row in CRM modal forms (mirrors shared `CrmAddressFormRowInput`). */
export type AddressFormRow = CrmAddressFormRowInput;

const ADDRESS_KINDS = ["Home", "Work", "Other"] as const;

type Props = {
  addresses: AddressFormRow[];
  onAddressesChange: (next: AddressFormRow[]) => void;
  /** Row index → field key → message (from Zod paths). */
  addressRowFieldErrors?: Readonly<Record<number, Partial<Record<string, string>>>>;
  /** When set, shows map-backed address search if the platform geolocation provider is enabled. */
  geocodeApi?: CrmGeocodeApiDeps;
};

const setPrimaryAt = (rows: AddressFormRow[], index: number): AddressFormRow[] =>
  rows.map((r, i) => ({ ...r, isPrimary: i === index }));

const removeAddressRowAt = (rows: AddressFormRow[], removeIndex: number): AddressFormRow[] => {
  if (rows.length <= 1) return rows;
  const removedPrimary = Boolean(rows[removeIndex]?.isPrimary);
  const filtered = rows.filter((_, i) => i !== removeIndex);
  if (removedPrimary) {
    return filtered.map((r, i) => ({ ...r, isPrimary: i === 0 }));
  }
  return filtered;
};

/** Multi-row address section for CRM modals. */
export const CrmAddressesEditor = ({ addresses, onAddressesChange, addressRowFieldErrors, geocodeApi }: Props) => {
  const typeSelectWrapClass =
    "relative flex h-[42px] w-full shrink-0 max-w-[8rem] items-center rounded-lg border border-stone-200/90 bg-stone-100 sm:h-[42px]";
  const typeSelectClass =
    "h-full min-h-0 w-full flex-1 appearance-none rounded-lg border-0 bg-transparent py-2 pl-2.5 pr-9 text-sm text-stone-800 outline-none focus:outline-none";
  const typeSelectChevronClass =
    "pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500 right-[10px]";
  const segmentBtn =
    "flex shrink-0 items-center justify-center self-end rounded-lg border border-stone-200 py-2 transition-colors";
  const removeBtn = `${segmentBtn} h-[42px] w-10 bg-stone-50 text-stone-400 hover:bg-rose-600 hover:text-white focus-visible:outline-none`;
  const primaryBtn = `${segmentBtn} h-[42px] min-w-[2.75rem] px-3 text-xs font-semibold tracking-wide focus-visible:outline-none`;
  const primaryActive = `${primaryBtn} border-indigo-500 bg-indigo-600 text-white shadow-sm hover:bg-indigo-700`;
  const primaryIdle = `${primaryBtn} bg-stone-50 text-stone-500 hover:bg-stone-100 hover:text-indigo-800`;

  const labelClass = "mb-1.5 block text-xs font-medium text-stone-600";

  return (
    <section className="mt-6 border-t border-stone-100 pt-5">
      <div className={`flex flex-wrap items-start justify-between gap-3 ${CRM_SECTION_HEADING_RAIL}`}>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-800">Addresses</h3>
          <p className="mt-1 text-xs text-stone-500">
            Multiple locations; use #1 for the address shown on lists and maps from the primary columns.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            const row: AddressFormRow = {
              kind: "Home",
              addressLine1: "",
              addressLine2: "",
              houseNumber: "",
              postalCode: "",
              city: "",
              state: "",
              country: "",
              isPrimary: false
            };
            if (addresses.length === 0) onAddressesChange([{ ...row, isPrimary: true }]);
            else onAddressesChange([...addresses.map((a) => ({ ...a })), row]);
          }}
          className="shrink-0 rounded-md border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 shadow-sm hover:bg-stone-50"
        >
          + Add address
        </button>
      </div>

      {geocodeApi ? (
        <CrmAddressGeocodeSection
          addresses={addresses}
          onAddressesChange={onAddressesChange}
          geocodeApi={geocodeApi}
        />
      ) : null}

      <ul className="mt-4 flex flex-col gap-0">
        {addresses.map((row, index) => {
          const rowErr = addressRowFieldErrors?.[index];
          const fe = (field: string) => Boolean(rowErr?.[field]);

          const patchRow = (partial: Partial<AddressFormRow>) => {
            const next = [...addresses];
            next[index] = { ...next[index]!, ...partial };
            onAddressesChange(next);
          };

          return (
            <li key={`addr-${index}`} className="border-b border-dashed border-stone-200 pb-6 last:border-b-0 last:pb-0">
              <div className="grid gap-4">
                  {/* Row 1: type + line1 + line2 */}
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-end">
                    <div className="lg:col-span-2">
                      <label htmlFor={`crm-addr-kind-${index}`} className={labelClass}>
                        Type
                      </label>
                      <div className={typeSelectWrapClass}>
                        <select
                          id={`crm-addr-kind-${index}`}
                          aria-label={`Address type ${index + 1}`}
                          value={row.kind}
                          onChange={(e) => patchRow({ kind: e.target.value })}
                          className={typeSelectClass}
                        >
                          {ADDRESS_KINDS.map((k) => (
                            <option key={k} value={k}>
                              {k}
                            </option>
                          ))}
                          {(ADDRESS_KINDS as readonly string[]).includes(row.kind) ? null : (
                            <option value={row.kind}>{row.kind}</option>
                          )}
                        </select>
                        <ChevronDown className={typeSelectChevronClass} aria-hidden strokeWidth={2} />
                      </div>
                      {fe("kind") ? (
                        <p className="mt-1 text-xs text-rose-600" role="alert">
                          {rowErr!.kind}
                        </p>
                      ) : null}
                    </div>
                    <div className="lg:col-span-5">
                      <label htmlFor={`crm-addr-l1-${index}`} className={labelClass}>
                        Address line 1
                      </label>
                      <input
                        id={`crm-addr-l1-${index}`}
                        value={row.addressLine1}
                        onChange={(e) => patchRow({ addressLine1: e.target.value })}
                        className={crmModalOutlineInputClass(fe("addressLine1"))}
                        aria-invalid={fe("addressLine1")}
                      />
                      {fe("addressLine1") ? (
                        <p className="mt-1 text-xs text-rose-600" role="alert">
                          {rowErr!.addressLine1}
                        </p>
                      ) : null}
                    </div>
                    <div className="lg:col-span-5">
                      <label htmlFor={`crm-addr-l2-${index}`} className={labelClass}>
                        Address line 2
                      </label>
                      <input
                        id={`crm-addr-l2-${index}`}
                        value={row.addressLine2}
                        onChange={(e) => patchRow({ addressLine2: e.target.value })}
                        className={crmModalOutlineInputClass(fe("addressLine2"))}
                        aria-invalid={fe("addressLine2")}
                      />
                      {fe("addressLine2") ? (
                        <p className="mt-1 text-xs text-rose-600" role="alert">
                          {rowErr!.addressLine2}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {/* Row 2: postal + house + city */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                      <label htmlFor={`crm-addr-postal-${index}`} className={labelClass}>
                        Postal code
                      </label>
                      <input
                        id={`crm-addr-postal-${index}`}
                        value={row.postalCode}
                        onChange={(e) => patchRow({ postalCode: e.target.value })}
                        className={crmModalOutlineInputClass(fe("postalCode"))}
                        aria-invalid={fe("postalCode")}
                      />
                      {fe("postalCode") ? (
                        <p className="mt-1 text-xs text-rose-600" role="alert">
                          {rowErr!.postalCode}
                        </p>
                      ) : null}
                    </div>
                    <div>
                      <label htmlFor={`crm-addr-house-${index}`} className={labelClass}>
                        House number
                      </label>
                      <input
                        id={`crm-addr-house-${index}`}
                        value={row.houseNumber}
                        onChange={(e) => patchRow({ houseNumber: e.target.value })}
                        className={crmModalOutlineInputClass(fe("houseNumber"))}
                        aria-invalid={fe("houseNumber")}
                      />
                      {fe("houseNumber") ? (
                        <p className="mt-1 text-xs text-rose-600" role="alert">
                          {rowErr!.houseNumber}
                        </p>
                      ) : null}
                    </div>
                    <div>
                      <label htmlFor={`crm-addr-city-${index}`} className={labelClass}>
                        City
                      </label>
                      <input
                        id={`crm-addr-city-${index}`}
                        value={row.city}
                        onChange={(e) => patchRow({ city: e.target.value })}
                        className={crmModalOutlineInputClass(fe("city"))}
                        aria-invalid={fe("city")}
                      />
                      {fe("city") ? (
                        <p className="mt-1 text-xs text-rose-600" role="alert">
                          {rowErr!.city}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {/* Row 3: state + country + actions */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-12 sm:items-end">
                    <div className="sm:col-span-4">
                      <label htmlFor={`crm-addr-state-${index}`} className={labelClass}>
                        State / province
                      </label>
                      <input
                        id={`crm-addr-state-${index}`}
                        value={row.state}
                        onChange={(e) => patchRow({ state: e.target.value })}
                        className={crmModalOutlineInputClass(fe("state"))}
                        aria-invalid={fe("state")}
                      />
                      {fe("state") ? (
                        <p className="mt-1 text-xs text-rose-600" role="alert">
                          {rowErr!.state}
                        </p>
                      ) : null}
                    </div>
                    <div className="sm:col-span-4">
                      <label htmlFor={`crm-addr-country-${index}`} className={labelClass}>
                        Country
                      </label>
                      <input
                        id={`crm-addr-country-${index}`}
                        value={row.country}
                        onChange={(e) => patchRow({ country: e.target.value })}
                        className={crmModalOutlineInputClass(fe("country"))}
                        aria-invalid={fe("country")}
                      />
                      {fe("country") ? (
                        <p className="mt-1 text-xs text-rose-600" role="alert">
                          {rowErr!.country}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap justify-end gap-2 sm:col-span-4">
                      {addresses.length > 1 ? (
                        <button
                          type="button"
                          title="Remove address"
                          aria-label={`Remove address ${index + 1}`}
                          onClick={() => onAddressesChange(removeAddressRowAt(addresses, index))}
                          className={removeBtn}
                        >
                          <X className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2} />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        title="Primary address for lists"
                        className={row.isPrimary ? primaryActive : primaryIdle}
                        onClick={() => onAddressesChange(setPrimaryAt(addresses, index))}
                      >
                        #1
                      </button>
                    </div>
                  </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

/** Single empty primary Home row for new CRM entities. */
export const defaultAddressRows = (): AddressFormRow[] => [
  {
    kind: "Home",
    addressLine1: "",
    addressLine2: "",
    houseNumber: "",
    postalCode: "",
    city: "",
    state: "",
    country: "",
    isPrimary: true
  }
];

type LegacyMirror = {
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
};

/** Maps API `addresses` or legacy scalar columns into editor rows. */
export function addressRowsFromApi(
  entries: CrmAddressEntry[] | undefined,
  legacy: LegacyMirror,
  emptyFallback: () => AddressFormRow[]
): AddressFormRow[] {
  const raw = entries ?? [];
  const withContent = raw.filter((e) =>
    [
      e.addressLine1,
      e.addressLine2,
      e.houseNumber,
      e.postalCode,
      e.city,
      e.state,
      e.country
    ].some((v) => (v ?? "").trim().length > 0)
  );
  if (withContent.length > 0) {
    const rows = withContent.map((e) => ({
      kind: e.kind || "Home",
      addressLine1: e.addressLine1 ?? "",
      addressLine2: e.addressLine2 ?? "",
      houseNumber: e.houseNumber ?? "",
      postalCode: e.postalCode ?? "",
      city: e.city ?? "",
      state: e.state ?? "",
      country: e.country ?? "",
      isPrimary: Boolean(e.isPrimary)
    }));
    let pi = rows.findIndex((r) => r.isPrimary);
    if (pi < 0) pi = 0;
    return rows.map((r, i) => ({ ...r, isPrimary: i === pi }));
  }
  const leg = [
    legacy.addressLine1,
    legacy.addressLine2,
    legacy.postalCode,
    legacy.city,
    legacy.state,
    legacy.country
  ].some((v) => (v ?? "").trim().length > 0);
  if (leg) {
    return [
      {
        kind: "Home",
        addressLine1: legacy.addressLine1 ?? "",
        addressLine2: legacy.addressLine2 ?? "",
        houseNumber: "",
        postalCode: legacy.postalCode ?? "",
        city: legacy.city ?? "",
        state: legacy.state ?? "",
        country: legacy.country ?? "",
        isPrimary: true
      }
    ];
  }
  return emptyFallback();
}
