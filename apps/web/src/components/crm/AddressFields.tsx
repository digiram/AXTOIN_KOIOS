/** Reusable structured address inputs (Organization / Contact forms). */

import type { ReactElement } from "react";

import { AutosaveFieldWrap } from "../AutosaveFieldWrap.js";
import type { AutosaveUiStatus } from "../autosave-status-ui.js";

export type AddressValue = {
  addressLine1?: string | null;
  addressLine2?: string | null;
  postalCode?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
};

type AutosaveGroup = { status: AutosaveUiStatus; statusId: string };

type Props = {
  value: AddressValue;
  onChange: (next: AddressValue) => void;
  inputClass: string;
  /** Prefix for stable `id` / `htmlFor` pairs when multiple address forms exist on one page. */
  idPrefix?: string;
  /**
   * Same autosave status on every field (icons per input); one screen reader live region on line 1 only
   * (see `AutosaveFieldWrap` `announceStatus`).
   */
  autosaveGroup?: AutosaveGroup;
};

export const AddressFields = ({ value, onChange, inputClass, idPrefix = "crm", autosaveGroup }: Props) => {
  const patch = (partial: Partial<AddressValue>) => onChange({ ...value, ...partial });
  const fid = (suffix: string) => `${idPrefix}-${suffix}`;

  const a11y = autosaveGroup ? ({ "aria-describedby": autosaveGroup.statusId } as const) : {};

  const wrap = (announceStatus: boolean, input: ReactElement) =>
    autosaveGroup ? (
      <AutosaveFieldWrap
        statusId={autosaveGroup.statusId}
        status={autosaveGroup.status}
        announceStatus={announceStatus}
      >
        {input}
      </AutosaveFieldWrap>
    ) : (
      input
    );

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label htmlFor={fid("addr-line1")} className="mb-1.5 block text-xs font-medium text-stone-600">
          Address line 1
        </label>
        {wrap(
          true,
          <input
            id={fid("addr-line1")}
            value={value.addressLine1 ?? ""}
            onChange={(e) => patch({ addressLine1: e.target.value })}
            className={inputClass}
            {...a11y}
          />
        )}
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={fid("addr-line2")} className="mb-1.5 block text-xs font-medium text-stone-600">
          Address line 2
        </label>
        {wrap(
          false,
          <input
            id={fid("addr-line2")}
            value={value.addressLine2 ?? ""}
            onChange={(e) => patch({ addressLine2: e.target.value })}
            className={inputClass}
            {...a11y}
          />
        )}
      </div>
      <div>
        <label htmlFor={fid("postal")} className="mb-1.5 block text-xs font-medium text-stone-600">
          Postal code
        </label>
        {wrap(
          false,
          <input
            id={fid("postal")}
            value={value.postalCode ?? ""}
            onChange={(e) => patch({ postalCode: e.target.value })}
            className={inputClass}
            {...a11y}
          />
        )}
      </div>
      <div>
        <label htmlFor={fid("city")} className="mb-1.5 block text-xs font-medium text-stone-600">
          City
        </label>
        {wrap(
          false,
          <input
            id={fid("city")}
            value={value.city ?? ""}
            onChange={(e) => patch({ city: e.target.value })}
            className={inputClass}
            {...a11y}
          />
        )}
      </div>
      <div>
        <label htmlFor={fid("state")} className="mb-1.5 block text-xs font-medium text-stone-600">
          State / province
        </label>
        {wrap(
          false,
          <input
            id={fid("state")}
            value={value.state ?? ""}
            onChange={(e) => patch({ state: e.target.value })}
            className={inputClass}
            {...a11y}
          />
        )}
      </div>
      <div>
        <label htmlFor={fid("country")} className="mb-1.5 block text-xs font-medium text-stone-600">
          Country
        </label>
        {wrap(
          false,
          <input
            id={fid("country")}
            value={value.country ?? ""}
            onChange={(e) => patch({ country: e.target.value })}
            className={inputClass}
            {...a11y}
          />
        )}
      </div>
    </div>
  );
};
