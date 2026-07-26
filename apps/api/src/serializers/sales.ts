/**
 * Sales funnel HTTP serializers — shared between route modules and tests.
 */

import type {
  SalesFunnelActivityRow,
  SalesFunnelBdrLeadRow,
  SalesFunnelSalesDealRow,
  SalesFunnelStageRow
} from "@starter/db";
import { parseSalesFunnelActivityContactIds } from "@starter/shared";

const iso = (d: Date) => d.toISOString();

export type FunnelContactLink = { contactId: string; role: string };

export const serializeSalesStage = (row: SalesFunnelStageRow) => ({
  id: row.id,
  pipeline: row.pipeline,
  stageKey: row.stageKey,
  name: row.name,
  sortOrder: row.sortOrder,
  outcome: row.outcome,
  closeChancePercent: row.closeChancePercent,
  readyForSales: row.readyForSales,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt)
});

export const serializeSalesBdrLead = (
  row: SalesFunnelBdrLeadRow,
  contacts: FunnelContactLink[] = [],
  promotedDealId: string | null = null
) => ({
  id: row.id,
  title: row.title,
  description: row.description,
  stageKey: row.stageKey,
  tags: row.tags,
  ownerUserId: row.ownerUserId,
  crmOrganizationId: row.crmOrganizationId,
  stageEnteredAt: iso(row.stageEnteredAt),
  archivedAt: row.archivedAt ? iso(row.archivedAt) : null,
  active: row.active,
  inactiveStageLabel: row.inactiveStageLabel,
  createdByUserId: row.createdByUserId,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
  contacts,
  contactIds: contacts.map((c) => c.contactId),
  promotedDealId
});

export const serializeSalesDeal = (row: SalesFunnelSalesDealRow, contacts: FunnelContactLink[] = []) => ({
  id: row.id,
  title: row.title,
  description: row.description,
  stageKey: row.stageKey,
  tags: row.tags,
  ownerUserId: row.ownerUserId ?? null,
  crmOrganizationId: row.crmOrganizationId ?? null,
  promotedFromLeadId: row.promotedFromLeadId ?? null,
  stageEnteredAt: iso(row.stageEnteredAt),
  archivedAt: row.archivedAt ? iso(row.archivedAt) : null,
  active: row.active,
  outcomeBucket: row.outcomeBucket ?? null,
  inactiveStageLabel: row.inactiveStageLabel,
  expectedValueMinor: row.expectedValueMinor,
  expectedValueCurrency: row.expectedValueCurrency,
  createdByUserId: row.createdByUserId,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
  contacts,
  contactIds: contacts.map((c) => c.contactId)
});

export type SerializedSalesActivityContact = {
  contactId: string;
  displayName: string;
};

export const serializeSalesActivity = (
  row: SalesFunnelActivityRow,
  contactLabels?: ReadonlyMap<string, string>
) => {
  const contactIds = parseSalesFunnelActivityContactIds(row.payload);
  const activityContacts: SerializedSalesActivityContact[] = contactIds.map((contactId) => ({
    contactId,
    displayName: contactLabels?.get(contactId) ?? contactId
  }));
  return {
    id: row.id,
    activityType: row.activityType,
    summary: row.summary,
    payload: row.payload,
    actorUserId: row.actorUserId,
    createdAt: iso(row.createdAt),
    contactIds,
    activityContacts
  };
};

export const buildSalesActivityContactLabels = async (
  tenantId: string,
  rows: SalesFunnelActivityRow[],
  getContact: (
    tenantId: string,
    id: string
  ) => Promise<
    { firstName?: string | null; lastName?: string | null; email?: string | null } | undefined
  >
): Promise<Map<string, string>> => {
  const ids = new Set<string>();
  for (const row of rows) {
    for (const id of parseSalesFunnelActivityContactIds(row.payload)) ids.add(id);
  }
  const labels = new Map<string, string>();
  for (const id of ids) {
    const contact = await getContact(tenantId, id);
    if (!contact) continue;
    const fromParts = [contact.firstName?.trim(), contact.lastName?.trim()].filter(Boolean).join(" ");
    labels.set(id, fromParts || contact.email?.trim() || id);
  }
  return labels;
};
