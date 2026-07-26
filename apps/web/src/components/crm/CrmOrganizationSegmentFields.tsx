/**
 * CrmOrganizationSegmentFields
 *
 * Three-layer market segment pickers for organization create/edit modals.
 *
 * Responsibilities:
 * - Cascade layer 1 → 2 → 3 selects with parent-aware option lists
 * - Format segment path summaries for display elsewhere
 * - Build flat filter options for list search comboboxes
 *
 * Related:
 * - `CrmMarketSegmentFilterField`; CRM organization modals
 */
import { useMemo } from "react";

import { crmModalOutlineInputClass } from "./crmModalOutlineInputClass.js";

/** One node in the tenant market segment hierarchy. */
export type CrmMarketSegmentOption = {
  id: string;
  layer: 1 | 2 | 3;
  parentId: string | null;
  name: string;
};

type Props = {
  segments: CrmMarketSegmentOption[];
  layer1Id: string;
  layer2Id: string;
  layer3Id: string;
  onChange: (next: { layer1Id: string; layer2Id: string; layer3Id: string }) => void;
  disabled?: boolean;
};

const selectClass = (hasError?: boolean) => crmModalOutlineInputClass(Boolean(hasError));

/** Cascading L1/L2/L3 segment selects for organization forms. */
export const CrmOrganizationSegmentFields = ({
  segments,
  layer1Id,
  layer2Id,
  layer3Id,
  onChange,
  disabled = false
}: Props) => {
  const layer1Options = useMemo(
    () => segments.filter((s) => s.layer === 1).sort((a, b) => a.name.localeCompare(b.name)),
    [segments]
  );
  const layer2Options = useMemo(() => {
    if (!layer1Id) return [];
    return segments
      .filter((s) => s.layer === 2 && s.parentId === layer1Id)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [segments, layer1Id]);
  const layer3Options = useMemo(() => {
    if (!layer2Id) return [];
    return segments
      .filter((s) => s.layer === 3 && s.parentId === layer2Id)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [segments, layer2Id]);

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div>
        <label htmlFor="crm-org-segment-l1" className="mb-1.5 block text-xs font-medium text-stone-600">
          Market segment · Layer 1
        </label>
        <select
          id="crm-org-segment-l1"
          disabled={disabled}
          value={layer1Id}
          onChange={(e) => onChange({ layer1Id: e.target.value, layer2Id: "", layer3Id: "" })}
          className={selectClass()}
        >
          <option value="">— None —</option>
          {layer1Options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="crm-org-segment-l2" className="mb-1.5 block text-xs font-medium text-stone-600">
          Layer 2
        </label>
        <select
          id="crm-org-segment-l2"
          disabled={disabled || !layer1Id || layer2Options.length === 0}
          value={layer2Id}
          onChange={(e) => onChange({ layer1Id, layer2Id: e.target.value, layer3Id: "" })}
          className={selectClass()}
        >
          <option value="">— None —</option>
          {layer2Options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="crm-org-segment-l3" className="mb-1.5 block text-xs font-medium text-stone-600">
          Layer 3
        </label>
        <select
          id="crm-org-segment-l3"
          disabled={disabled || !layer2Id || layer3Options.length === 0}
          value={layer3Id}
          onChange={(e) => onChange({ layer1Id, layer2Id, layer3Id: e.target.value })}
          className={selectClass()}
        >
          <option value="">— None —</option>
          {layer3Options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

/** Joins layer names into a `L1 › L2 › L3` summary, or null when empty. */
export const formatCrmOrganizationSegmentSummary = (
  layer1?: { name: string } | null,
  layer2?: { name: string } | null,
  layer3?: { name: string } | null
): string | null => {
  const parts = [layer1?.name, layer2?.name, layer3?.name].filter((n) => n && n.trim().length > 0) as string[];
  return parts.length > 0 ? parts.join(" › ") : null;
};

/** Flattened segment row for filter listboxes (includes ancestor breadcrumb). */
export type CrmMarketSegmentFilterOption = {
  id: string;
  layer: 1 | 2 | 3;
  name: string;
  pathLabel: string;
  ancestorLabels: string[];
};

/** Builds searchable filter options from the full segment tree. */
export const buildCrmMarketSegmentFilterOptions = (
  segments: CrmMarketSegmentOption[]
): CrmMarketSegmentFilterOption[] => {
  const byId = new Map(segments.map((s) => [s.id, s]));

  const resolvePathParts = (segment: CrmMarketSegmentOption): string[] => {
    if (segment.layer === 1) return [segment.name];
    const parent = segment.parentId ? byId.get(segment.parentId) : undefined;
    if (!parent) return [segment.name];
    if (segment.layer === 2) return [...resolvePathParts(parent), segment.name];
    const grandparent = parent.parentId ? byId.get(parent.parentId) : undefined;
    const parts: string[] = [];
    if (grandparent) parts.push(grandparent.name);
    parts.push(parent.name, segment.name);
    return parts;
  };

  return segments
    .map((s) => {
      const parts = resolvePathParts(s);
      return {
        id: s.id,
        layer: s.layer,
        name: s.name,
        pathLabel: parts.join(" › "),
        ancestorLabels: parts.slice(0, -1)
      };
    })
    .sort((a, b) => a.pathLabel.localeCompare(b.pathLabel));
};
