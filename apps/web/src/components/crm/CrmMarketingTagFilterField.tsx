/**
 * CrmMarketingTagFilterField
 *
 * List-filter wrapper around the organization marketing tag multi-select.
 *
 * Responsibilities:
 * - Fixed “Marketing tags” label and filter-appropriate empty presentation
 * - Delegate selection UX to `CrmOrganizationMarketingTagPicker`
 *
 * Related:
 * - CRM organizations list filters
 */
import {
  CrmOrganizationMarketingTagPicker,
  type CrmMarketingTagOption
} from "./CrmOrganizationMarketingTagPicker.js";

type Props = {
  inputId: string;
  tags: CrmMarketingTagOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  inputClassName?: string;
};

/** Marketing tag multi-select for organization list filters. */
export const CrmMarketingTagFilterField = ({
  inputId,
  tags,
  selectedIds,
  onChange,
  disabled = false,
  inputClassName
}: Props) => (
  <CrmOrganizationMarketingTagPicker
    inputId={inputId}
    tags={tags}
    selectedIds={selectedIds}
    onChange={onChange}
    disabled={disabled}
    label="Marketing tags"
    inputClassName={inputClassName}
    helperText={null}
    emptyPresentation="input"
  />
);
