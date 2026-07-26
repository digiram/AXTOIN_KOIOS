/**
 * CRM HTTP serializers — shared between route modules and tests.
 */

import {
  getOrganizationById,
  getOrganizationHoldingOrganizationId,
  getOrganizationMarketSegmentsByIds,
  listOrganizationMarketingTagsForOrganization,
  listOrganizationMarketingTagsForOrganizations,
  type CrmContactRow,
  type CrmOrganizationMarketSegmentRow,
  type CrmOrganizationMarketingTagRow,
  type CrmOrganizationRow
} from "@starter/db";
import { formatCrmPrimaryAddressLine } from "@starter/shared";

const iso = (d: Date) => d.toISOString();

export type CrmOrganizationMarketSegmentRef = { id: string; name: string; layer: 1 | 2 | 3 } | null;

export type CrmOrganizationMarketingTagRef = { id: string; name: string };

const segmentRef = (
  row: CrmOrganizationMarketSegmentRow | undefined
): CrmOrganizationMarketSegmentRef => (row ? { id: row.id, name: row.name, layer: row.layer } : null);

const tagRef = (row: CrmOrganizationMarketingTagRow): CrmOrganizationMarketingTagRef => ({
  id: row.id,
  name: row.name
});

export const serializeCrmOrganization = (row: CrmOrganizationRow | null | undefined) => {
  if (!row) return null;
  const primaryAddressLine = formatCrmPrimaryAddressLine(row).trim() || null;
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    email: row.email,
    phone: row.phone,
    emails: row.emails,
    phones: row.phones,
    addresses: row.addresses,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    postalCode: row.postalCode,
    city: row.city,
    state: row.state,
    country: row.country,
    marketSegmentLayer1Id: row.marketSegmentLayer1Id,
    marketSegmentLayer2Id: row.marketSegmentLayer2Id,
    marketSegmentLayer3Id: row.marketSegmentLayer3Id,
    primaryAddressLine,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt)
  };
};

export const enrichCrmOrganizationSegmentsAndTags = async (
  tenantId: string,
  row: CrmOrganizationRow,
  opts?: {
    segmentById?: Map<string, CrmOrganizationMarketSegmentRow>;
    marketingTags?: CrmOrganizationMarketingTagRow[];
  }
) => {
  const segmentIds = [row.marketSegmentLayer1Id, row.marketSegmentLayer2Id, row.marketSegmentLayer3Id].filter(
    (id): id is string => Boolean(id?.trim())
  );
  const segmentById =
    opts?.segmentById ?? (segmentIds.length > 0 ? await getOrganizationMarketSegmentsByIds(tenantId, segmentIds) : new Map());
  const marketingTags =
    opts?.marketingTags ?? (await listOrganizationMarketingTagsForOrganization(tenantId, row.id));

  return {
    marketSegmentLayer1: segmentRef(
      row.marketSegmentLayer1Id ? segmentById.get(row.marketSegmentLayer1Id) : undefined
    ),
    marketSegmentLayer2: segmentRef(
      row.marketSegmentLayer2Id ? segmentById.get(row.marketSegmentLayer2Id) : undefined
    ),
    marketSegmentLayer3: segmentRef(
      row.marketSegmentLayer3Id ? segmentById.get(row.marketSegmentLayer3Id) : undefined
    ),
    marketingTags: marketingTags.map(tagRef)
  };
};

export const serializeCrmOrganizationEnriched = async (tenantId: string, row: CrmOrganizationRow) => {
  const base = serializeCrmOrganization(row)!;
  const extra = await enrichCrmOrganizationSegmentsAndTags(tenantId, row);
  return { ...base, ...extra };
};

export const serializeCrmOrganizationsEnrichedList = async (tenantId: string, rows: CrmOrganizationRow[]) => {
  const segmentIds = [
    ...new Set(
      rows.flatMap((r) =>
        [r.marketSegmentLayer1Id, r.marketSegmentLayer2Id, r.marketSegmentLayer3Id].filter((id): id is string =>
          Boolean(id?.trim())
        )
      )
    )
  ];
  const segmentById =
    segmentIds.length > 0 ? await getOrganizationMarketSegmentsByIds(tenantId, segmentIds) : new Map();
  const tagsByOrg = await listOrganizationMarketingTagsForOrganizations(
    tenantId,
    rows.map((r) => r.id)
  );
  return Promise.all(
    rows.map(async (row) => {
      const base = serializeCrmOrganization(row)!;
      const extra = await enrichCrmOrganizationSegmentsAndTags(tenantId, row, {
        segmentById,
        marketingTags: tagsByOrg.get(row.id) ?? []
      });
      return { ...base, ...extra };
    })
  );
};

export const serializeCrmOrganizationWithHolding = async (tenantId: string, row: CrmOrganizationRow) => {
  const enriched = await serializeCrmOrganizationEnriched(tenantId, row);
  const holdingOrganizationId = await getOrganizationHoldingOrganizationId(tenantId, row.id);
  const holding = holdingOrganizationId ? await getOrganizationById(tenantId, holdingOrganizationId) : null;
  return {
    ...enriched,
    holdingOrganizationId,
    holdingOrganizationName: holding?.name ?? null,
    holdingOrganizationPrimaryAddress: holding
      ? formatCrmPrimaryAddressLine(holding).trim() || null
      : null
  };
};

export const serializeCrmContact = (row: CrmContactRow | null | undefined) => {
  if (!row) return null;
  const primaryAddressLine = formatCrmPrimaryAddressLine(row).trim() || null;
  return {
    id: row.id,
    tenantId: row.tenantId,
    firstName: row.firstName,
    lastName: row.lastName,
    salutation: row.salutation,
    title: row.title,
    email: row.email,
    phone: row.phone,
    emails: row.emails,
    phones: row.phones,
    addresses: row.addresses,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    postalCode: row.postalCode,
    city: row.city,
    state: row.state,
    country: row.country,
    primaryAddressLine,
    hasPhoto: Boolean(row.photoRelPath?.trim()),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt)
  };
};
