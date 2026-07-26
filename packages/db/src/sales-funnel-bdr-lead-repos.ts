/**
 * Sales funnel BDR leads — CRUD, stage moves, activities (phase 2).
 */

import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNotNull, isNull, type SQL } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  parseSalesFunnelTagsJson,
  stringifySalesFunnelTags,
  type SalesFunnelBdrLeadCreateInput,
  type SalesFunnelBdrLeadPatchInput,
  type SalesFunnelBdrLeadsListQueryInput
} from "@starter/shared";

import { getContactById, getOrganizationById } from "./crm-repos.js";
import type { SalesFunnelContactLink } from "@starter/shared";
import { getDb } from "./client.js";
import {
  findEntityIdsByMultiFieldContains,
  getFieldEncryptionMiddleware,
  openSalesFunnelRow,
  SALES_FUNNEL_BDR_LEADS_TABLE_KEY,
  sealSalesFunnelRow,
  syncSalesFunnelSearchTokens
} from "./field-encryption/index.js";
import * as mysql from "./mysql-schema.js";
import * as pg from "./pg-schema.js";
import { getUserTenantIdAndRoleById } from "./repos.js";
import { dialectFromEnv } from "./schema.js";
import {
  getFirstPipelineBoardStageKey,
  getDefaultSalesFunnelStageKey,
  getSalesFunnelStageByKey,
  listSalesFunnelStagesForPipeline,
  stageKeyValidForPipeline
} from "./sales-funnel-repos.js";

const mysqlDb = (): MySql2Database<typeof mysql> => getDb() as MySql2Database<typeof mysql>;
const pgDb = (): NodePgDatabase<typeof pg> => getDb() as NodePgDatabase<typeof pg>;

const newId = () => randomUUID();

export type SalesFunnelBdrLeadRow = {
  id: string;
  tenantId: string;
  title: string;
  description: string;
  stageKey: string;
  tags: string[];
  ownerUserId: string | null;
  crmOrganizationId: string | null;
  stageEnteredAt: Date;
  archivedAt: Date | null;
  active: boolean;
  inactiveStageLabel: string | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SalesFunnelActivityRow = {
  id: string;
  tenantId: string;
  entityType: string;
  entityId: string;
  activityType: string;
  summary: string;
  payload: Record<string, unknown> | null;
  actorUserId: string | null;
  createdAt: Date;
};

const mapLeadPg = (row: typeof pg.salesFunnelBdrLeads.$inferSelect): SalesFunnelBdrLeadRow => ({
  id: row.id,
  tenantId: row.tenantId,
  title: row.title,
  description: row.description,
  stageKey: row.stageKey,
  tags: parseSalesFunnelTagsJson(row.tagsJson),
  ownerUserId: row.ownerUserId ?? null,
  crmOrganizationId: row.crmOrganizationId ?? null,
  stageEnteredAt: row.stageEnteredAt,
  archivedAt: row.archivedAt ?? null,
  active: row.active,
  inactiveStageLabel: row.inactiveStageLabel ?? null,
  createdByUserId: row.createdByUserId ?? null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
});

const mapLeadMysql = (row: typeof mysql.salesFunnelBdrLeads.$inferSelect): SalesFunnelBdrLeadRow => ({
  id: row.id,
  tenantId: row.tenantId,
  title: row.title,
  description: row.description,
  stageKey: row.stageKey,
  tags: parseSalesFunnelTagsJson(row.tagsJson),
  ownerUserId: row.ownerUserId ?? null,
  crmOrganizationId: row.crmOrganizationId ?? null,
  stageEnteredAt: row.stageEnteredAt,
  archivedAt: row.archivedAt ?? null,
  active: row.active,
  inactiveStageLabel: row.inactiveStageLabel ?? null,
  createdByUserId: row.createdByUserId ?? null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
});

const decryptLeadPg = async (
  tenantId: string,
  row: typeof pg.salesFunnelBdrLeads.$inferSelect
): Promise<SalesFunnelBdrLeadRow> =>
  openSalesFunnelRow(SALES_FUNNEL_BDR_LEADS_TABLE_KEY, tenantId, row as unknown as Record<string, unknown>, (plain) =>
    mapLeadPg(plain as typeof row)
  );

const decryptLeadMysql = async (
  tenantId: string,
  row: typeof mysql.salesFunnelBdrLeads.$inferSelect
): Promise<SalesFunnelBdrLeadRow> =>
  openSalesFunnelRow(SALES_FUNNEL_BDR_LEADS_TABLE_KEY, tenantId, row as unknown as Record<string, unknown>, (plain) =>
    mapLeadMysql(plain as typeof row)
  );

export type SalesFunnelLeadContactRow = { contactId: string; role: string };

const validateBdrStageKey = async (tenantId: string, stageKey: string): Promise<void> => {
  if (!(await stageKeyValidForPipeline(tenantId, "bdr", stageKey))) throw new Error("invalid_stage");
};

const validateOwnerUser = async (tenantId: string, ownerUserId: string | null | undefined): Promise<void> => {
  if (!ownerUserId) return;
  const user = await getUserTenantIdAndRoleById(ownerUserId);
  if (!user || user.tenantId !== tenantId) throw new Error("owner_not_found");
};

const validateCrmOrganization = async (
  tenantId: string,
  crmOrganizationId: string | null | undefined
): Promise<void> => {
  if (!crmOrganizationId) return;
  const org = await getOrganizationById(tenantId, crmOrganizationId);
  if (!org) throw new Error("organization_not_found");
};

const tenantHasDealPromotedFromLead = async (tenantId: string, leadId: string): Promise<boolean> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select({ id: mysql.salesFunnelSalesDeals.id })
      .from(mysql.salesFunnelSalesDeals)
      .where(
        and(
          eq(mysql.salesFunnelSalesDeals.tenantId, tenantId),
          eq(mysql.salesFunnelSalesDeals.promotedFromLeadId, leadId)
        )
      )
      .limit(1);
    return !!rows[0];
  }
  const db = pgDb();
  const rows = await db
    .select({ id: pg.salesFunnelSalesDeals.id })
    .from(pg.salesFunnelSalesDeals)
    .where(
      and(
        eq(pg.salesFunnelSalesDeals.tenantId, tenantId),
        eq(pg.salesFunnelSalesDeals.promotedFromLeadId, leadId)
      )
    )
    .limit(1);
  return !!rows[0];
};

export const insertSalesFunnelActivity = async (input: {
  tenantId: string;
  entityType: string;
  entityId: string;
  activityType: string;
  summary: string;
  payload?: Record<string, unknown> | null;
  actorUserId?: string | null;
}): Promise<void> => {
  const id = newId();
  const payloadJson = input.payload ? JSON.stringify(input.payload) : null;
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db.insert(mysql.salesFunnelActivities).values({
      id,
      tenantId: input.tenantId,
      entityType: input.entityType,
      entityId: input.entityId,
      activityType: input.activityType,
      summary: input.summary,
      payloadJson,
      actorUserId: input.actorUserId ?? null,
      createdAt: new Date()
    });
    return;
  }
  const db = pgDb();
  await db.insert(pg.salesFunnelActivities).values({
    tenantId: input.tenantId,
    entityType: input.entityType,
    entityId: input.entityId,
    activityType: input.activityType,
    summary: input.summary,
    payloadJson,
    actorUserId: input.actorUserId ?? null
  });
};

export const getSalesFunnelBdrLeadContacts = async (
  tenantId: string,
  leadId: string
): Promise<SalesFunnelLeadContactRow[]> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select({
        contactId: mysql.salesFunnelLeadContacts.contactId,
        role: mysql.salesFunnelLeadContacts.roleLabel
      })
      .from(mysql.salesFunnelLeadContacts)
      .where(
        and(
          eq(mysql.salesFunnelLeadContacts.tenantId, tenantId),
          eq(mysql.salesFunnelLeadContacts.leadId, leadId)
        )
      );
    return rows.map((r) => ({ contactId: r.contactId, role: r.role ?? "" }));
  }
  const db = pgDb();
  const rows = await db
    .select({
      contactId: pg.salesFunnelLeadContacts.contactId,
      role: pg.salesFunnelLeadContacts.roleLabel
    })
    .from(pg.salesFunnelLeadContacts)
    .where(
      and(eq(pg.salesFunnelLeadContacts.tenantId, tenantId), eq(pg.salesFunnelLeadContacts.leadId, leadId))
    );
  return rows.map((r) => ({ contactId: r.contactId, role: r.role ?? "" }));
};

export const getSalesFunnelBdrLeadContactIds = async (
  tenantId: string,
  leadId: string
): Promise<string[]> => {
  const rows = await getSalesFunnelBdrLeadContacts(tenantId, leadId);
  return rows.map((r) => r.contactId);
};

const replaceLeadContacts = async (
  tenantId: string,
  leadId: string,
  contacts: SalesFunnelContactLink[]
): Promise<void> => {
  const { validateSalesFunnelContactRoles } = await import("./sales-funnel-contact-role-repos.js");
  await validateSalesFunnelContactRoles(tenantId, contacts);
  for (const link of contacts) {
    const contact = await getContactById(tenantId, link.contactId);
    if (!contact) throw new Error("contact_not_found");
  }
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db
      .delete(mysql.salesFunnelLeadContacts)
      .where(
        and(
          eq(mysql.salesFunnelLeadContacts.tenantId, tenantId),
          eq(mysql.salesFunnelLeadContacts.leadId, leadId)
        )
      );
    const now = new Date();
    for (const link of contacts) {
      await db.insert(mysql.salesFunnelLeadContacts).values({
        tenantId,
        leadId,
        contactId: link.contactId,
        roleLabel: (link.role ?? "").trim(),
        createdAt: now
      });
    }
    return;
  }
  const db = pgDb();
  await db
    .delete(pg.salesFunnelLeadContacts)
    .where(
      and(eq(pg.salesFunnelLeadContacts.tenantId, tenantId), eq(pg.salesFunnelLeadContacts.leadId, leadId))
    );
  if (contacts.length) {
    await db.insert(pg.salesFunnelLeadContacts).values(
      contacts.map((link) => ({
        tenantId,
        leadId,
        contactId: link.contactId,
        roleLabel: (link.role ?? "").trim()
      }))
    );
  }
};

export const getSalesFunnelBdrLeadById = async (
  tenantId: string,
  id: string
): Promise<SalesFunnelBdrLeadRow | undefined> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select()
      .from(mysql.salesFunnelBdrLeads)
      .where(and(eq(mysql.salesFunnelBdrLeads.tenantId, tenantId), eq(mysql.salesFunnelBdrLeads.id, id)))
      .limit(1);
    return rows[0] ? await decryptLeadMysql(tenantId, rows[0]) : undefined;
  }
  const db = pgDb();
  const rows = await db
    .select()
    .from(pg.salesFunnelBdrLeads)
    .where(and(eq(pg.salesFunnelBdrLeads.tenantId, tenantId), eq(pg.salesFunnelBdrLeads.id, id)))
    .limit(1);
  return rows[0] ? await decryptLeadPg(tenantId, rows[0]) : undefined;
};

const appendLeadSearchFilter = async (
  tenantId: string,
  params: SalesFunnelBdrLeadsListQueryInput,
  parts: SQL[],
  table: typeof pg.salesFunnelBdrLeads | typeof mysql.salesFunnelBdrLeads
): Promise<boolean> => {
  const q = params.q?.trim();
  if (!q) return true;
  const middleware = getFieldEncryptionMiddleware();
  if (!middleware?.hasSearchIndex()) return true;
  const searchKey = middleware.getSearchKeyB64();
  if (!searchKey) return true;
  const ids = await findEntityIdsByMultiFieldContains(
    tenantId,
    tenantId,
    SALES_FUNNEL_BDR_LEADS_TABLE_KEY,
    q,
    searchKey,
    middleware.getNgramSize()
  );
  if (ids.length === 0) return false;
  parts.push(inArray(table.id, ids));
  return true;
};

const buildLeadFilters = (
  tenantId: string,
  params: SalesFunnelBdrLeadsListQueryInput,
  table: typeof pg.salesFunnelBdrLeads | typeof mysql.salesFunnelBdrLeads
): SQL[] => {
  const parts: SQL[] = [eq(table.tenantId, tenantId)];
  if (params.pipelineActive === "archived") {
    parts.push(isNotNull(table.archivedAt));
  } else {
    if (!params.includeArchived) parts.push(isNull(table.archivedAt));
    if (params.onlyPipelineActive || params.pipelineActive === "active") {
      parts.push(eq(table.active, true));
    } else if (params.pipelineActive === "inactive") {
      parts.push(eq(table.active, false));
    }
  }
  if (params.stageKey) parts.push(eq(table.stageKey, params.stageKey));
  if (params.ownerUserId) parts.push(eq(table.ownerUserId, params.ownerUserId));
  return parts;
};

const leadMatchesClientFilters = (
  lead: SalesFunnelBdrLeadRow,
  params: SalesFunnelBdrLeadsListQueryInput
): boolean => {
  if (params.tag?.trim()) {
    const needle = params.tag.trim().toLowerCase();
    if (!lead.tags.some((t) => t.toLowerCase() === needle)) return false;
  }
  if (params.q?.trim()) {
    const needle = params.q.trim().toLowerCase();
    if (
      !lead.title.toLowerCase().includes(needle) &&
      !lead.description.toLowerCase().includes(needle)
    ) {
      return false;
    }
  }
  return true;
};

export const listSalesFunnelBdrLeads = async (
  tenantId: string,
  params: SalesFunnelBdrLeadsListQueryInput = {}
): Promise<SalesFunnelBdrLeadRow[]> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const parts = buildLeadFilters(tenantId, params, mysql.salesFunnelBdrLeads);
    if (!(await appendLeadSearchFilter(tenantId, params, parts, mysql.salesFunnelBdrLeads))) return [];
    const w = and(...parts);
    const rows = await db
      .select()
      .from(mysql.salesFunnelBdrLeads)
      .where(w)
      .orderBy(desc(mysql.salesFunnelBdrLeads.updatedAt));
    const leads = await Promise.all(rows.map((row) => decryptLeadMysql(tenantId, row)));
    return leads.filter((l) => leadMatchesClientFilters(l, params));
  }
  const db = pgDb();
  const parts = buildLeadFilters(tenantId, params, pg.salesFunnelBdrLeads);
  if (!(await appendLeadSearchFilter(tenantId, params, parts, pg.salesFunnelBdrLeads))) return [];
  const w = and(...parts);
  const rows = await db
    .select()
    .from(pg.salesFunnelBdrLeads)
    .where(w)
    .orderBy(desc(pg.salesFunnelBdrLeads.updatedAt));
  const leads = await Promise.all(rows.map((row) => decryptLeadPg(tenantId, row)));
  return leads.filter((l) => leadMatchesClientFilters(l, params));
};

export type SalesFunnelBdrBoard = {
  stages: Awaited<ReturnType<typeof listSalesFunnelStagesForPipeline>>;
  leads: SalesFunnelBdrLeadRow[];
};

export const getSalesFunnelBdrBoard = async (
  tenantId: string,
  params: SalesFunnelBdrLeadsListQueryInput = {}
): Promise<SalesFunnelBdrBoard> => {
  const stages = await listSalesFunnelStagesForPipeline(tenantId, "bdr");
  const leads = await listSalesFunnelBdrLeads(tenantId, params);
  return { stages, leads };
};

export const insertSalesFunnelBdrLead = async (
  tenantId: string,
  input: SalesFunnelBdrLeadCreateInput,
  actorUserId: string | null
): Promise<SalesFunnelBdrLeadRow> => {
  const stageKey = input.stageKey ?? (await getDefaultSalesFunnelStageKey(tenantId, "bdr"));
  await validateBdrStageKey(tenantId, stageKey);
  await validateOwnerUser(tenantId, input.ownerUserId);
  await validateCrmOrganization(tenantId, input.crmOrganizationId);

  const id = newId();
  const now = new Date();
  const tagsJson = stringifySalesFunnelTags(input.tags ?? []);
  const titlePlain = input.title.trim();
  const descriptionPlain = (input.description ?? "").trim();
  const sensitivePlain = { title: titlePlain, description: descriptionPlain };
  const sealed = await sealSalesFunnelRow(
    SALES_FUNNEL_BDR_LEADS_TABLE_KEY,
    tenantId,
    sensitivePlain,
    id,
    new Set(["title", "description"])
  );
  const values = {
    tenantId,
    title: String(sealed.title ?? titlePlain),
    description: String(sealed.description ?? descriptionPlain),
    stageKey,
    tagsJson,
    ownerUserId: input.ownerUserId ?? null,
    crmOrganizationId: input.crmOrganizationId ?? null,
    stageEnteredAt: now,
    archivedAt: null as Date | null,
    active: true,
    inactiveStageLabel: null as string | null,
    createdByUserId: actorUserId,
    createdAt: now,
    updatedAt: now
  };

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db.insert(mysql.salesFunnelBdrLeads).values({ id, ...values });
  } else {
    const db = pgDb();
    await db.insert(pg.salesFunnelBdrLeads).values({ id, ...values });
  }

  await syncSalesFunnelSearchTokens(
    SALES_FUNNEL_BDR_LEADS_TABLE_KEY,
    tenantId,
    id,
    sensitivePlain,
    { title: values.title, description: values.description },
    new Set(["title", "description"])
  );

  const createContacts =
    input.contacts?.map((c) => ({ contactId: c.contactId, role: c.role ?? "" })) ??
    input.contactIds?.map((contactId) => ({ contactId, role: "" }));
  if (createContacts?.length) {
    await replaceLeadContacts(tenantId, id, createContacts);
  }

  await insertSalesFunnelActivity({
    tenantId,
    entityType: "bdr_lead",
    entityId: id,
    activityType: "created",
    summary: `Lead created in ${stageKey}`,
    actorUserId
  });

  return (await getSalesFunnelBdrLeadById(tenantId, id))!;
};

export const updateSalesFunnelBdrLead = async (
  tenantId: string,
  id: string,
  patch: SalesFunnelBdrLeadPatchInput,
  actorUserId: string | null
): Promise<SalesFunnelBdrLeadRow> => {
  const existing = await getSalesFunnelBdrLeadById(tenantId, id);
  if (!existing) throw new Error("not_found");
  if (existing.archivedAt) throw new Error("archived");

  if (patch.stageKey) await validateBdrStageKey(tenantId, patch.stageKey);
  if (patch.ownerUserId !== undefined) await validateOwnerUser(tenantId, patch.ownerUserId);
  if (patch.crmOrganizationId !== undefined) await validateCrmOrganization(tenantId, patch.crmOrganizationId);

  const now = new Date();
  const set: Record<string, unknown> = { updatedAt: now };
  const changedSensitive = new Set<string>();
  const plainSensitive: Record<string, unknown> = {};
  if (patch.title !== undefined) {
    set.title = patch.title.trim();
    changedSensitive.add("title");
    plainSensitive.title = patch.title.trim();
  }
  if (patch.description !== undefined) {
    set.description = patch.description.trim();
    changedSensitive.add("description");
    plainSensitive.description = patch.description.trim();
  }
  if (patch.tags !== undefined) set.tagsJson = stringifySalesFunnelTags(patch.tags);
  if (patch.ownerUserId !== undefined) set.ownerUserId = patch.ownerUserId;
  if (patch.crmOrganizationId !== undefined) set.crmOrganizationId = patch.crmOrganizationId;
  if (patch.archived === true) {
    set.archivedAt = now;
    set.active = false;
    if (existing.active) {
      const st = await getSalesFunnelStageByKey(tenantId, "bdr", existing.stageKey);
      set.inactiveStageLabel = (st?.name ?? "").trim() || existing.stageKey;
    }
  }
  if (patch.archived === false) {
    set.archivedAt = null;
    const promoted = await tenantHasDealPromotedFromLead(tenantId, id);
    const nextActive = promoted ? false : true;
    set.active = nextActive;
    if (nextActive) set.inactiveStageLabel = null;
  }

  if (patch.stageKey && patch.stageKey !== existing.stageKey) {
    set.stageKey = patch.stageKey;
    set.stageEnteredAt = now;
    await insertSalesFunnelActivity({
      tenantId,
      entityType: "bdr_lead",
      entityId: id,
      activityType: "stage_change",
      summary: `Moved from ${existing.stageKey} to ${patch.stageKey}`,
      payload: { fromStageKey: existing.stageKey, toStageKey: patch.stageKey },
      actorUserId
    });
  }

  if (patch.ownerUserId !== undefined && patch.ownerUserId !== existing.ownerUserId) {
    await insertSalesFunnelActivity({
      tenantId,
      entityType: "bdr_lead",
      entityId: id,
      activityType: "assignment",
      summary: patch.ownerUserId ? "Owner assigned" : "Owner cleared",
      payload: { ownerUserId: patch.ownerUserId },
      actorUserId
    });
  }

  if (changedSensitive.size > 0) {
    const sealed = await sealSalesFunnelRow(
      SALES_FUNNEL_BDR_LEADS_TABLE_KEY,
      tenantId,
      plainSensitive,
      id,
      changedSensitive
    );
    for (const field of changedSensitive) {
      if (field in sealed) set[field] = sealed[field];
    }
  }

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db
      .update(mysql.salesFunnelBdrLeads)
      .set(set)
      .where(and(eq(mysql.salesFunnelBdrLeads.tenantId, tenantId), eq(mysql.salesFunnelBdrLeads.id, id)));
  } else {
    const db = pgDb();
    await db
      .update(pg.salesFunnelBdrLeads)
      .set(set)
      .where(and(eq(pg.salesFunnelBdrLeads.tenantId, tenantId), eq(pg.salesFunnelBdrLeads.id, id)));
  }

  if (changedSensitive.size > 0) {
    await syncSalesFunnelSearchTokens(
      SALES_FUNNEL_BDR_LEADS_TABLE_KEY,
      tenantId,
      id,
      plainSensitive,
      set,
      changedSensitive
    );
  }

  const patchContacts =
    patch.contacts?.map((c) => ({ contactId: c.contactId, role: c.role ?? "" })) ??
    (patch.contactIds !== undefined
      ? patch.contactIds.map((contactId) => ({ contactId, role: "" }))
      : undefined);
  if (patchContacts !== undefined) await replaceLeadContacts(tenantId, id, patchContacts);

  let result = (await getSalesFunnelBdrLeadById(tenantId, id))!;
  if (patch.stageKey && patch.stageKey !== existing.stageKey) {
    const afterPromote = await maybeAutoPromoteLeadFromReadyStage(
      tenantId,
      id,
      patch.stageKey,
      actorUserId
    );
    if (afterPromote) result = afterPromote;
  }
  return result;
};

/** When a lead lands in a Ready for Sales lane, create the Sales deal and archive the lead. */
const maybeAutoPromoteLeadFromReadyStage = async (
  tenantId: string,
  leadId: string,
  stageKey: string,
  actorUserId: string | null
): Promise<SalesFunnelBdrLeadRow | null> => {
  const stage = await getSalesFunnelStageByKey(tenantId, "bdr", stageKey);
  if (!stage?.readyForSales) return null;

  const lead = await getSalesFunnelBdrLeadById(tenantId, leadId);
  if (!lead || lead.archivedAt || !lead.active) return null;

  const { getSalesFunnelSalesDealByPromotedLeadId, promoteSalesFunnelBdrLeadToDeal } =
    await import("./sales-funnel-sales-deal-repos.js");
  if (await getSalesFunnelSalesDealByPromotedLeadId(tenantId, leadId)) return null;

  await promoteSalesFunnelBdrLeadToDeal(tenantId, leadId, {}, actorUserId);
  return (await getSalesFunnelBdrLeadById(tenantId, leadId)) ?? null;
};

export const moveSalesFunnelBdrLeadStage = async (
  tenantId: string,
  id: string,
  stageKey: string,
  actorUserId: string | null
): Promise<SalesFunnelBdrLeadRow> => {
  return updateSalesFunnelBdrLead(tenantId, id, { stageKey }, actorUserId);
};

/** Restore an inactive lead to the first BDR lane (not available for promoted leads). */
export const reactivateSalesFunnelBdrLead = async (
  tenantId: string,
  id: string,
  actorUserId: string | null
): Promise<SalesFunnelBdrLeadRow> => {
  const existing = await getSalesFunnelBdrLeadById(tenantId, id);
  if (!existing) throw new Error("not_found");
  if (existing.active && !existing.archivedAt) throw new Error("already_active");
  if (await tenantHasDealPromotedFromLead(tenantId, id)) throw new Error("promoted");

  const stageKey = await getFirstPipelineBoardStageKey(tenantId, "bdr");
  const stage = await getSalesFunnelStageByKey(tenantId, "bdr", stageKey);
  const stageName = (stage?.name ?? "").trim() || stageKey;
  const now = new Date();
  const set = {
    updatedAt: now,
    stageKey,
    stageEnteredAt: now,
    active: true,
    archivedAt: null as Date | null,
    inactiveStageLabel: null as string | null
  };

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db
      .update(mysql.salesFunnelBdrLeads)
      .set(set)
      .where(and(eq(mysql.salesFunnelBdrLeads.tenantId, tenantId), eq(mysql.salesFunnelBdrLeads.id, id)));
  } else {
    const db = pgDb();
    await db
      .update(pg.salesFunnelBdrLeads)
      .set(set)
      .where(and(eq(pg.salesFunnelBdrLeads.tenantId, tenantId), eq(pg.salesFunnelBdrLeads.id, id)));
  }

  await insertSalesFunnelActivity({
    tenantId,
    entityType: "bdr_lead",
    entityId: id,
    activityType: "reactivated",
    summary: `Reactivated and moved to ${stageName}`,
    payload: { stageKey },
    actorUserId
  });

  return (await getSalesFunnelBdrLeadById(tenantId, id))!;
};

const assertActivityContactsOnEntity = async (
  tenantId: string,
  entityType: "bdr_lead" | "sales_deal",
  entityId: string,
  contactIds: string[] | undefined
): Promise<void> => {
  if (!contactIds?.length) return;
  const unique = [...new Set(contactIds)];
  const links =
    entityType === "bdr_lead"
      ? await getSalesFunnelBdrLeadContacts(tenantId, entityId)
      : await (
          await import("./sales-funnel-sales-deal-repos.js")
        ).getSalesFunnelSalesDealContacts(tenantId, entityId);
  const allowed = new Set(links.map((l) => l.contactId));
  for (const id of unique) {
    if (!allowed.has(id)) throw new Error("contact_not_on_record");
  }
};

export const addSalesFunnelManualActivity = async (input: {
  tenantId: string;
  entityType: "bdr_lead" | "sales_deal";
  entityId: string;
  activityType: string;
  body: string;
  actorUserId: string | null;
  direction?: "INBOUND" | "OUTBOUND" | null;
  scheduledAt?: string | null;
  contactIds?: string[];
}): Promise<SalesFunnelActivityRow> => {
  if (input.entityType === "bdr_lead") {
    const lead = await getSalesFunnelBdrLeadById(input.tenantId, input.entityId);
    if (!lead) throw new Error("not_found");
  } else {
    const { getSalesFunnelSalesDealById } = await import("./sales-funnel-sales-deal-repos.js");
    const deal = await getSalesFunnelSalesDealById(input.tenantId, input.entityId);
    if (!deal) throw new Error("not_found");
  }

  const contactIds = input.contactIds?.length ? [...new Set(input.contactIds)] : [];
  await assertActivityContactsOnEntity(
    input.tenantId,
    input.entityType,
    input.entityId,
    contactIds
  );

  const summary = input.body.trim();
  const payload: Record<string, unknown> = {};
  if (input.direction) payload.direction = input.direction;
  if (input.scheduledAt) payload.scheduledAt = input.scheduledAt;
  if (contactIds.length > 0) payload.contactIds = contactIds;

  await insertSalesFunnelActivity({
    tenantId: input.tenantId,
    entityType: input.entityType,
    entityId: input.entityId,
    activityType: input.activityType.trim().toLowerCase(),
    summary,
    payload: Object.keys(payload).length > 0 ? payload : null,
    actorUserId: input.actorUserId
  });

  const rows = await listSalesFunnelActivities(input.tenantId, input.entityType, input.entityId);
  return rows[0]!;
};

export const addSalesFunnelBdrLeadNote = async (
  tenantId: string,
  leadId: string,
  body: string,
  actorUserId: string | null
): Promise<SalesFunnelActivityRow> => {
  const lead = await getSalesFunnelBdrLeadById(tenantId, leadId);
  if (!lead) throw new Error("not_found");
  return addSalesFunnelManualActivity({
    tenantId,
    entityType: "bdr_lead",
    entityId: leadId,
    activityType: "note",
    body,
    actorUserId
  });
};

export const listSalesFunnelActivities = async (
  tenantId: string,
  entityType: string,
  entityId: string
): Promise<SalesFunnelActivityRow[]> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select()
      .from(mysql.salesFunnelActivities)
      .where(
        and(
          eq(mysql.salesFunnelActivities.tenantId, tenantId),
          eq(mysql.salesFunnelActivities.entityType, entityType),
          eq(mysql.salesFunnelActivities.entityId, entityId)
        )
      )
      .orderBy(desc(mysql.salesFunnelActivities.createdAt));
    return rows.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      entityType: r.entityType,
      entityId: r.entityId,
      activityType: r.activityType,
      summary: r.summary,
      payload: r.payloadJson ? (JSON.parse(r.payloadJson) as Record<string, unknown>) : null,
      actorUserId: r.actorUserId ?? null,
      createdAt: r.createdAt
    }));
  }
  const db = pgDb();
  const rows = await db
    .select()
    .from(pg.salesFunnelActivities)
    .where(
      and(
        eq(pg.salesFunnelActivities.tenantId, tenantId),
        eq(pg.salesFunnelActivities.entityType, entityType),
        eq(pg.salesFunnelActivities.entityId, entityId)
      )
    )
    .orderBy(desc(pg.salesFunnelActivities.createdAt));
  return rows.map((r) => ({
    id: r.id,
    tenantId: r.tenantId,
    entityType: r.entityType,
    entityId: r.entityId,
    activityType: r.activityType,
    summary: r.summary,
    payload: r.payloadJson ? (JSON.parse(r.payloadJson) as Record<string, unknown>) : null,
    actorUserId: r.actorUserId ?? null,
    createdAt: r.createdAt
  }));
};

/** Hard-delete an archived lead and its funnel activities (contacts cascade). */
export const deleteSalesFunnelBdrLeadPermanently = async (tenantId: string, id: string): Promise<void> => {
  const existing = await getSalesFunnelBdrLeadById(tenantId, id);
  if (!existing) throw new Error("not_found");
  if (!existing.archivedAt) throw new Error("not_archived");

  const entityType = "bdr_lead";
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db
      .delete(mysql.salesFunnelActivities)
      .where(
        and(
          eq(mysql.salesFunnelActivities.tenantId, tenantId),
          eq(mysql.salesFunnelActivities.entityType, entityType),
          eq(mysql.salesFunnelActivities.entityId, id)
        )
      );
    await db
      .delete(mysql.salesFunnelBdrLeads)
      .where(and(eq(mysql.salesFunnelBdrLeads.tenantId, tenantId), eq(mysql.salesFunnelBdrLeads.id, id)));
    return;
  }
  const db = pgDb();
  await db
    .delete(pg.salesFunnelActivities)
    .where(
      and(
        eq(pg.salesFunnelActivities.tenantId, tenantId),
        eq(pg.salesFunnelActivities.entityType, entityType),
        eq(pg.salesFunnelActivities.entityId, id)
      )
    );
  await db
    .delete(pg.salesFunnelBdrLeads)
    .where(and(eq(pg.salesFunnelBdrLeads.tenantId, tenantId), eq(pg.salesFunnelBdrLeads.id, id)));
};
