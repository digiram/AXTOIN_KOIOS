/**
 * WorkforcePersonalAddressFields.
 *
 * Single Home-address form block for employee personal address editing.
 *
 * Responsibilities:
 * - Reuse CRM address field grid and optional geocode lookup
 * - Always persist as one primary Home row
 *
 * Depends on:
 * - {@link CrmAddressGeocodeSection} when `geocodeApi` is provided
 */

import type { CrmAddressFormRowInput } from "@starter/shared";

import { CrmAddressGeocodeSection } from "../../components/crm/CrmAddressGeocodeSection.js";
import type { CrmGeocodeApiDeps } from "../../components/crm/CrmAddressesEditor.js";
import { crmModalOutlineInputClass } from "../../components/crm/crmModalOutlineInputClass.js";

type Props = {
  row: CrmAddressFormRowInput;
  onRowChange: (next: CrmAddressFormRowInput) => void;
  geocodeApi?: CrmGeocodeApiDeps;
};

const labelClass = "mb-1.5 block text-xs font-medium text-stone-600";

/**
 * Personal address block: same line1 / line2 + postal / house / city / state / country grid as CRM contact,
 * optional map lookup when geolocation is enabled. Always a single Home row.
 */
export const WorkforcePersonalAddressFields = ({ row, onRowChange, geocodeApi }: Props) => {
  const patch = (partial: Partial<CrmAddressFormRowInput>) => {
    onRowChange({ ...row, ...partial, kind: "Home", isPrimary: true });
  };

  const addresses = [{ ...row, kind: "Home" as const, isPrimary: true as const }];

  const onGeocodeAddressesChange = (next: CrmAddressFormRowInput[]) => {
    if (next.length === 0) {
      onRowChange({
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
      return;
    }
    const pick = next[next.length - 1]!;
    onRowChange({ ...pick, kind: "Home", isPrimary: true });
  };

  return (
    <div className="mt-4 space-y-4">
      <div>
        <p className="text-xs font-semibold text-slate-800">Address</p>
        <p className="mt-0.5 text-xs text-stone-500">
          Address line 1 and 2 match the CRM contact pattern. Use lookup when your administrator enables geolocation.
        </p>
      </div>

      {geocodeApi ? (
        <CrmAddressGeocodeSection
          addresses={addresses}
          onAddressesChange={onGeocodeAddressesChange}
          geocodeApi={geocodeApi}
        />
      ) : null}

      <div className="grid gap-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-6">
            <label htmlFor="wf-emp-addr-l1" className={labelClass}>
              Address line 1
            </label>
            <input
              id="wf-emp-addr-l1"
              value={row.addressLine1}
              onChange={(e) => patch({ addressLine1: e.target.value })}
              className={crmModalOutlineInputClass(false)}
            />
          </div>
          <div className="lg:col-span-6">
            <label htmlFor="wf-emp-addr-l2" className={labelClass}>
              Address line 2
            </label>
            <input
              id="wf-emp-addr-l2"
              value={row.addressLine2}
              onChange={(e) => patch({ addressLine2: e.target.value })}
              className={crmModalOutlineInputClass(false)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="wf-emp-addr-postal" className={labelClass}>
              Postal code
            </label>
            <input
              id="wf-emp-addr-postal"
              value={row.postalCode}
              onChange={(e) => patch({ postalCode: e.target.value })}
              className={crmModalOutlineInputClass(false)}
            />
          </div>
          <div>
            <label htmlFor="wf-emp-addr-house" className={labelClass}>
              House number
            </label>
            <input
              id="wf-emp-addr-house"
              value={row.houseNumber}
              onChange={(e) => patch({ houseNumber: e.target.value })}
              className={crmModalOutlineInputClass(false)}
            />
          </div>
          <div>
            <label htmlFor="wf-emp-addr-city" className={labelClass}>
              City
            </label>
            <input
              id="wf-emp-addr-city"
              value={row.city}
              onChange={(e) => patch({ city: e.target.value })}
              className={crmModalOutlineInputClass(false)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="wf-emp-addr-state" className={labelClass}>
              State / province
            </label>
            <input
              id="wf-emp-addr-state"
              value={row.state}
              onChange={(e) => patch({ state: e.target.value })}
              className={crmModalOutlineInputClass(false)}
            />
          </div>
          <div>
            <label htmlFor="wf-emp-addr-country" className={labelClass}>
              Country
            </label>
            <input
              id="wf-emp-addr-country"
              value={row.country}
              onChange={(e) => patch({ country: e.target.value })}
              className={crmModalOutlineInputClass(false)}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
