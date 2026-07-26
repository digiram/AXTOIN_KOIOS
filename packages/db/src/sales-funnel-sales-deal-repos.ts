/**
 * Sales funnel Sales pipeline deals — CRUD, stage moves, activities (phase 3).
 */

import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNotNull, isNull, or, type SQL } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  parseSalesFunnelTagsJson,
  stringifySalesFunnelTags,
  type SalesFunnelBdrLeadPromoteInput,
  type SalesFunnelContactLink,
  type SalesFunnelSalesDealCreateInput,
  type SalesFunnelSalesDealPatchInput,
  type SalesFunnelSalesDealsListQueryInput
} from "@starter/shared";

import { getContactById, getOrganizationById } from "./crm-repos.js";
import { getDb } from "./client.js";
import {
  findEntityIdsByMultiFieldContains,
  getFieldEncryptionMiddleware,
  openSalesFunnelRow,
  SALES_FUNNEL_SALES_DEALS_TABLE_KEY,
  sealSalesFunnelRow,
  syncSalesFunnelSearchTokens
} from "./field-encryption/index.js";
import * as mysql from "./mysql-schema.js";
import * as pg from "./pg-schema.js";
import { getUserDisplayLabelById, getUserTenantIdAndRoleById } from "./repos.js";
import {
  addSalesFunnelManualActivity,
  getSalesFunnelBdrLeadById,
  getSalesFunnelBdrLeadContacts,
  insertSalesFunnelActivity,
  listSalesFunnelActivities,
  type SalesFunnelActivityRow
} from "./sales-funnel-bdr-lead-repos.js";
import {
  getDefaultSalesFunnelStageKey,
  getFirstPipelineBoardStageKey,
  getSalesFunnelStageByKey,
  listSalesFunnelStagesForPipeline,
  stageKeyValidForPipeline
} from "./sales-funnel-repos.js";
import { dialectFromEnv } from "./schema.js";

const mysqlDb = (): MySql2Database<typeof mysql> => getDb() as MySql2Database<typeof mysql>;
const pgDb = (): NodePgDatabase<typeof pg> => getDb() as NodePgDatabase<typeof pg>;

const newId = () => randomUUID();

export type SalesFunnelSalesDealRow = {
  id: string;
  tenantId: string;
  title: string;
  description: string;
  stageKey: string;
  tags: string[];
  ownerUserId: string | null;
  crmOrganizationId: string | null;
  promotedFromLeadId: string | null;
  stageEnteredAt: Date;
  archivedAt: Date | null;
  active: boolean;
  outcomeBucket: string | null;
  inactiveStageLabel: string | null;
  expectedValueMinor: number | null;
  expectedValueCurrency: string | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const mapDealPg = (row: typeof pg.salesFunnelSalesDeals.$inferSelect): SalesFunnelSalesDealRow => ({
  id: row.id,
  tenantId: row.tenantId,
  title: row.title,
  description: row.description,
  stageKey: row.stageKey,
  tags: parseSalesFunnelTagsJson(row.tagsJson),
  ownerUserId: row.ownerUserId ?? null,
  crmOrganizationId: row.crmOrganizationId ?? null,
  promotedFromLeadId: row.promotedFromLeadId ?? null,
  stageEnteredAt: row.stageEnteredAt,
  archivedAt: row.archivedAt ?? null,
  active: row.active,
  outcomeBucket: row.outcomeBucket ?? null,
  inactiveStageLabel: row.inactiveStageLabel ?? null,
  expectedValueMinor: row.expectedValueMinor != null ? Number(row.expectedValueMinor) : null,
  expectedValueCurrency: row.expectedValueCurrency ?? null,
  createdByUserId: row.createdByUserId ?? null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
});

const mapDealMysql = (row: typeof mysql.salesFunnelSalesDeals.$inferSelect): SalesFunnelSalesDealRow => ({
  id: row.id,
  tenantId: row.tenantId,
  title: row.title,
  description: row.description,
  stageKey: row.stageKey,
  tags: parseSalesFunnelTagsJson(row.tagsJson),
  ownerUserId: row.ownerUserId ?? null,
  crmOrganizationId: row.crmOrganizationId ?? null,
  promotedFromLeadId: row.promotedFromLeadId ?? null,
  stageEnteredAt: row.stageEnteredAt,
  archivedAt: row.archivedAt ?? null,
  active: row.active,
  outcomeBucket: row.outcomeBucket ?? null,
  inactiveStageLabel: row.inactiveStageLabel ?? null,
  expectedValueMinor: row.expectedValueMinor != null ? Number(row.expectedValueMinor) : null,
  expectedValueCurrency: row.expectedValueCurrency ?? null,
  createdByUserId: row.createdByUserId ?? null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
});

const decryptDealPg = async (
  tenantId: string,
  row: typeof pg.salesFunnelSalesDeals.$inferSelect
): Promise<SalesFunnelSalesDealRow> =>
  openSalesFunnelRow(SALES_FUNNEL_SALES_DEALS_TABLE_KEY, tenantId, row as unknown as Record<string, unknown>, (plain) =>
    mapDealPg(plain as typeof row)
  );

const decryptDealMysql = async (
  tenantId: string,
  row: typeof mysql.salesFunnelSalesDeals.$inferSelect
): Promise<SalesFunnelSalesDealRow> =>
  openSalesFunnelRow(SALES_FUNNEL_SALES_DEALS_TABLE_KEY, tenantId, row as unknown as Record<string, unknown>, (plain) =>
    mapDealMysql(plain as typeof row)
  );

export type SalesFunnelDealContactRow = { contactId: string; role: string };

const validateSalesStageKey = async (tenantId: string, stageKey: string): Promise<void> => {
  if (!(await stageKeyValidForPipeline(tenantId, "sales", stageKey))) throw new Error("invalid_stage");
};

const validateOwnerUser = async (tenantId: string, ownerUserId: string | null | undefined): Promise<void> => {
  if (!ownerUserId) return;
  const user = await getUserTenantIdAndRoleById(ownerUserId);
  if (!user || user.tenantId !== tenantId) throw new Error("owner_not_found");
};

const validatePromotedLead = async (tenantId: string, leadId: string | null | undefined): Promise<void> => {
  if (!leadId) return;
  const lead = await getSalesFunnelBdrLeadById(tenantId, leadId);
  if (!lead) throw new Error("lead_not_found");
};

const validateCrmOrganization = async (
  tenantId: string,
  crmOrganizationId: string | null | undefined
): Promise<void> => {
  if (!crmOrganizationId) return;
  const org = await getOrganizationById(tenantId, crmOrganizationId);
  if (!org) throw new Error("organization_not_found");
};

export const getSalesFunnelSalesDealContacts = async (
  tenantId: string,
  dealId: string
): Promise<SalesFunnelDealContactRow[]> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select({
        contactId: mysql.salesFunnelDealContacts.contactId,
        role: mysql.salesFunnelDealContacts.roleLabel
      })
      .from(mysql.salesFunnelDealContacts)
      .where(
        and(
          eq(mysql.salesFunnelDealContacts.tenantId, tenantId),
          eq(mysql.salesFunnelDealContacts.dealId, dealId)
        )
      );
    return rows.map((r) => ({ contactId: r.contactId, role: r.role ?? "" }));
  }
  const db = pgDb();
  const rows = await db
    .select({
      contactId: pg.salesFunnelDealContacts.contactId,
      role: pg.salesFunnelDealContacts.roleLabel
    })
    .from(pg.salesFunnelDealContacts)
    .where(
      and(eq(pg.salesFunnelDealContacts.tenantId, tenantId), eq(pg.salesFunnelDealContacts.dealId, dealId))
    );
  return rows.map((r) => ({ contactId: r.contactId, role: r.role ?? "" }));
};

export const getSalesFunnelSalesDealContactIds = async (
  tenantId: string,
  dealId: string
): Promise<string[]> => {
  const rows = await getSalesFunnelSalesDealContacts(tenantId, dealId);
  return rows.map((r) => r.contactId);
};

const replaceDealContacts = async (
  tenantId: string,
  dealId: string,
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
      .delete(mysql.salesFunnelDealContacts)
      .where(
        and(
          eq(mysql.salesFunnelDealContacts.tenantId, tenantId),
          eq(mysql.salesFunnelDealContacts.dealId, dealId)
        )
      );
    const now = new Date();
    for (const link of contacts) {
      await db.insert(mysql.salesFunnelDealContacts).values({
        tenantId,
        dealId,
        contactId: link.contactId,
        roleLabel: (link.role ?? "").trim(),
        createdAt: now
      });
    }
    return;
  }
  const db = pgDb();
  await db
    .delete(pg.salesFunnelDealContacts)
    .where(
      and(eq(pg.salesFunnelDealContacts.tenantId, tenantId), eq(pg.salesFunnelDealContacts.dealId, dealId))
    );
  if (contacts.length) {
    await db.insert(pg.salesFunnelDealContacts).values(
      contacts.map((link) => ({
        tenantId,
        dealId,
        contactId: link.contactId,
        roleLabel: (link.role ?? "").trim()
      }))
    );
  }
};

export const getSalesFunnelSalesDealById = async (
  tenantId: string,
  id: string
): Promise<SalesFunnelSalesDealRow | undefined> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select()
      .from(mysql.salesFunnelSalesDeals)
      .where(and(eq(mysql.salesFunnelSalesDeals.tenantId, tenantId), eq(mysql.salesFunnelSalesDeals.id, id)))
      .limit(1);
    return rows[0] ? await decryptDealMysql(tenantId, rows[0]) : undefined;
  }
  const db = pgDb();
  const rows = await db
    .select()
    .from(pg.salesFunnelSalesDeals)
    .where(and(eq(pg.salesFunnelSalesDeals.tenantId, tenantId), eq(pg.salesFunnelSalesDeals.id, id)))
    .limit(1);
  return rows[0] ? await decryptDealPg(tenantId, rows[0]) : undefined;
};

const appendDealSearchFilter = async (
  tenantId: string,
  params: SalesFunnelSalesDealsListQueryInput,
  parts: SQL[],
  table: typeof pg.salesFunnelSalesDeals | typeof mysql.salesFunnelSalesDeals
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
    SALES_FUNNEL_SALES_DEALS_TABLE_KEY,
    q,
    searchKey,
    middleware.getNgramSize()
  );
  if (ids.length === 0) return false;
  parts.push(inArray(table.id, ids));
  return true;
};

const buildDealFilters = (
  tenantId: string,
  params: SalesFunnelSalesDealsListQueryInput,
  table: typeof pg.salesFunnelSalesDeals | typeof mysql.salesFunnelSalesDeals
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

const dealMatchesClientFilters = (
  deal: SalesFunnelSalesDealRow,
  params: SalesFunnelSalesDealsListQueryInput
): boolean => {
  if (params.tag?.trim()) {
    const needle = params.tag.trim().toLowerCase();
    if (!deal.tags.some((t) => t.toLowerCase() === needle)) return false;
  }
  if (params.q?.trim()) {
    const needle = params.q.trim().toLowerCase();
    if (
      !deal.title.toLowerCase().includes(needle) &&
      !deal.description.toLowerCase().includes(needle)
    ) {
      return false;
    }
  }
  return true;
};

export const listSalesFunnelSalesDeals = async (
  tenantId: string,
  params: SalesFunnelSalesDealsListQueryInput = {}
): Promise<SalesFunnelSalesDealRow[]> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const parts = buildDealFilters(tenantId, params, mysql.salesFunnelSalesDeals);
    if (!(await appendDealSearchFilter(tenantId, params, parts, mysql.salesFunnelSalesDeals))) return [];
    const w = and(...parts);
    const rows = await db
      .select()
      .from(mysql.salesFunnelSalesDeals)
      .where(w)
      .orderBy(desc(mysql.salesFunnelSalesDeals.updatedAt));
    const deals = await Promise.all(rows.map((row) => decryptDealMysql(tenantId, row)));
    return deals.filter((d) => dealMatchesClientFilters(d, params));
  }
  const db = pgDb();
  const parts = buildDealFilters(tenantId, params, pg.salesFunnelSalesDeals);
  if (!(await appendDealSearchFilter(tenantId, params, parts, pg.salesFunnelSalesDeals))) return [];
  const w = and(...parts);
  const rows = await db
    .select()
    .from(pg.salesFunnelSalesDeals)
    .where(w)
    .orderBy(desc(pg.salesFunnelSalesDeals.updatedAt));
  const deals = await Promise.all(rows.map((row) => decryptDealPg(tenantId, row)));
  return deals.filter((d) => dealMatchesClientFilters(d, params));
};

/** Board: active open deals + inactive won/lost terminal deals (split column). */
export const listSalesFunnelSalesBoardDeals = async (
  tenantId: string,
  params: SalesFunnelSalesDealsListQueryInput = {}
): Promise<SalesFunnelSalesDealRow[]> => {
  const boardBase = (
    table: typeof pg.salesFunnelSalesDeals | typeof mysql.salesFunnelSalesDeals
  ): SQL[] => {
    const parts: SQL[] = [eq(table.tenantId, tenantId)];
    if (!params.includeArchived) parts.push(isNull(table.archivedAt));
    if (params.stageKey) parts.push(eq(table.stageKey, params.stageKey));
    if (params.ownerUserId) parts.push(eq(table.ownerUserId, params.ownerUserId));
    return parts;
  };

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const t = mysql.salesFunnelSalesDeals;
    const shared = boardBase(t);
    const w = or(
      and(...shared, eq(t.active, true)),
      and(...shared, eq(t.active, false), inArray(t.outcomeBucket, ["won", "lost"]))
    );
    const rows = await db.select().from(t).where(w).orderBy(desc(t.updatedAt));
    const deals = await Promise.all(rows.map((row) => decryptDealMysql(tenantId, row)));
    return deals.filter((d) => dealMatchesClientFilters(d, params));
  }
  const db = pgDb();
  const t = pg.salesFunnelSalesDeals;
  const shared = boardBase(t);
  const w = or(
    and(...shared, eq(t.active, true)),
    and(...shared, eq(t.active, false), inArray(t.outcomeBucket, ["won", "lost"]))
  );
  const rows = await db.select().from(t).where(w).orderBy(desc(t.updatedAt));
  const deals = await Promise.all(rows.map((row) => decryptDealPg(tenantId, row)));
  return deals.filter((d) => dealMatchesClientFilters(d, params));
};

export type SalesFunnelSalesBoard = {
  stages: Awaited<ReturnType<typeof listSalesFunnelStagesForPipeline>>;
  deals: SalesFunnelSalesDealRow[];
};

export const getSalesFunnelSalesBoard = async (
  tenantId: string,
  params: SalesFunnelSalesDealsListQueryInput = {}
): Promise<SalesFunnelSalesBoard> => {
  const stages = await listSalesFunnelStagesForPipeline(tenantId, "sales");
  const deals = await listSalesFunnelSalesBoardDeals(tenantId, params);
  return { stages, deals };
};

export const insertSalesFunnelSalesDeal = async (
  tenantId: string,
  input: SalesFunnelSalesDealCreateInput,
  actorUserId: string | null
): Promise<SalesFunnelSalesDealRow> => {
  const stageKey = input.stageKey ?? (await getDefaultSalesFunnelStageKey(tenantId, "sales"));
  await validateSalesStageKey(tenantId, stageKey);
  await validateOwnerUser(tenantId, input.ownerUserId);
  await validatePromotedLead(tenantId, input.promotedFromLeadId);
  await validateCrmOrganization(tenantId, input.crmOrganizationId);

  const id = newId();
  const now = new Date();
  const tagsJson = stringifySalesFunnelTags(input.tags ?? []);
  const titlePlain = input.title.trim();
  const descriptionPlain = (input.description ?? "").trim();
  const sensitivePlain = { title: titlePlain, description: descriptionPlain };
  const sealed = await sealSalesFunnelRow(
    SALES_FUNNEL_SALES_DEALS_TABLE_KEY,
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
    promotedFromLeadId: input.promotedFromLeadId ?? null,
    stageEnteredAt: now,
    archivedAt: null as Date | null,
    active: true,
    outcomeBucket: null as string | null,
    inactiveStageLabel: null as string | null,
    expectedValueMinor: input.expectedValueMinor ?? null,
    expectedValueCurrency: input.expectedValueCurrency ?? null,
    createdByUserId: actorUserId,
    createdAt: now,
    updatedAt: now
  };

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db.insert(mysql.salesFunnelSalesDeals).values({ id, ...values });
  } else {
    const db = pgDb();
    await db.insert(pg.salesFunnelSalesDeals).values({ id, ...values });
  }

  await syncSalesFunnelSearchTokens(
    SALES_FUNNEL_SALES_DEALS_TABLE_KEY,
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
    await replaceDealContacts(tenantId, id, createContacts);
  }

  await insertSalesFunnelActivity({
    tenantId,
    entityType: "sales_deal",
    entityId: id,
    activityType: "created",
    summary: `Deal created in ${stageKey}`,
    actorUserId
  });

  return (await getSalesFunnelSalesDealById(tenantId, id))!;
};

export const updateSalesFunnelSalesDeal = async (
  tenantId: string,
  id: string,
  patch: SalesFunnelSalesDealPatchInput,
  actorUserId: string | null
): Promise<SalesFunnelSalesDealRow> => {
  const existing = await getSalesFunnelSalesDealById(tenantId, id);
  if (!existing) throw new Error("not_found");
  if (existing.archivedAt) throw new Error("archived");

  if (patch.stageKey) await validateSalesStageKey(tenantId, patch.stageKey);
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
  if (patch.expectedValueMinor !== undefined) {
    set.expectedValueMinor = patch.expectedValueMinor;
    set.expectedValueCurrency = patch.expectedValueCurrency;
  }
  if (patch.archived === true) {
    set.archivedAt = now;
    set.active = false;
    set.outcomeBucket = null;
    if (existing.active) {
      const st = await getSalesFunnelStageByKey(tenantId, "sales", existing.stageKey);
      set.inactiveStageLabel = (st?.name ?? "").trim() || existing.stageKey;
    }
  }
  if (patch.archived === false) set.archivedAt = null;

  let stageMoved = false;
  if (patch.stageKey && patch.stageKey !== existing.stageKey) {
    set.stageKey = patch.stageKey;
    set.stageEnteredAt = now;
    set.outcomeBucket = null;
    set.active = true;
    set.inactiveStageLabel = null;
    stageMoved = true;
    await insertSalesFunnelActivity({
      tenantId,
      entityType: "sales_deal",
      entityId: id,
      activityType: "stage_change",
      summary: `Moved from ${existing.stageKey} to ${patch.stageKey}`,
      payload: { fromStageKey: existing.stageKey, toStageKey: patch.stageKey },
      actorUserId
    });
  }

  if (
    !stageMoved &&
    existing.active &&
    (patch.outcomeBucket === "won" || patch.outcomeBucket === "lost") &&
    patch.outcomeBucket !== existing.outcomeBucket
  ) {
    const st = await getSalesFunnelStageByKey(tenantId, "sales", existing.stageKey);
    set.outcomeBucket = patch.outcomeBucket;
    set.active = false;
    set.archivedAt = now;
    set.inactiveStageLabel = (st?.name ?? "").trim() || existing.stageKey;
    await insertSalesFunnelActivity({
      tenantId,
      entityType: "sales_deal",
      entityId: id,
      activityType: "outcome",
      summary: patch.outcomeBucket === "won" ? "Marked as Won" : "Marked as Lost",
      payload: { outcome: patch.outcomeBucket },
      actorUserId
    });
  }

  if (patch.ownerUserId !== undefined && patch.ownerUserId !== existing.ownerUserId) {
    await insertSalesFunnelActivity({
      tenantId,
      entityType: "sales_deal",
      entityId: id,
      activityType: "assignment",
      summary: patch.ownerUserId ? "Owner assigned" : "Owner cleared",
      payload: { ownerUserId: patch.ownerUserId },
      actorUserId
    });
  }

  if (changedSensitive.size > 0) {
    const sealed = await sealSalesFunnelRow(
      SALES_FUNNEL_SALES_DEALS_TABLE_KEY,
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
      .update(mysql.salesFunnelSalesDeals)
      .set(set)
      .where(and(eq(mysql.salesFunnelSalesDeals.tenantId, tenantId), eq(mysql.salesFunnelSalesDeals.id, id)));
  } else {
    const db = pgDb();
    await db
      .update(pg.salesFunnelSalesDeals)
      .set(set)
      .where(and(eq(pg.salesFunnelSalesDeals.tenantId, tenantId), eq(pg.salesFunnelSalesDeals.id, id)));
  }

  if (changedSensitive.size > 0) {
    await syncSalesFunnelSearchTokens(
      SALES_FUNNEL_SALES_DEALS_TABLE_KEY,
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
  if (patchContacts !== undefined) await replaceDealContacts(tenantId, id, patchContacts);

  return (await getSalesFunnelSalesDealById(tenantId, id))!;
};

export const moveSalesFunnelSalesDealStage = async (
  tenantId: string,
  id: string,
  stageKey: string,
  actorUserId: string | null
): Promise<SalesFunnelSalesDealRow> => {
  return updateSalesFunnelSalesDeal(tenantId, id, { stageKey }, actorUserId);
};

/** Restore an inactive deal to the first Sales lane and clear won/lost/archive state. */
export const reactivateSalesFunnelSalesDeal = async (
  tenantId: string,
  id: string,
  actorUserId: string | null
): Promise<SalesFunnelSalesDealRow> => {
  const existing = await getSalesFunnelSalesDealById(tenantId, id);
  if (!existing) throw new Error("not_found");
  if (existing.active && !existing.archivedAt) throw new Error("already_active");

  const stageKey = await getFirstPipelineBoardStageKey(tenantId, "sales");
  const stage = await getSalesFunnelStageByKey(tenantId, "sales", stageKey);
  const stageName = (stage?.name ?? "").trim() || stageKey;
  const now = new Date();
  const set = {
    updatedAt: now,
    stageKey,
    stageEnteredAt: now,
    active: true,
    archivedAt: null as Date | null,
    outcomeBucket: null as string | null,
    inactiveStageLabel: null as string | null
  };

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db
      .update(mysql.salesFunnelSalesDeals)
      .set(set)
      .where(and(eq(mysql.salesFunnelSalesDeals.tenantId, tenantId), eq(mysql.salesFunnelSalesDeals.id, id)));
  } else {
    const db = pgDb();
    await db
      .update(pg.salesFunnelSalesDeals)
      .set(set)
      .where(and(eq(pg.salesFunnelSalesDeals.tenantId, tenantId), eq(pg.salesFunnelSalesDeals.id, id)));
  }

  await insertSalesFunnelActivity({
    tenantId,
    entityType: "sales_deal",
    entityId: id,
    activityType: "reactivated",
    summary: `Reactivated and moved to ${stageName}`,
    payload: { stageKey },
    actorUserId
  });

  return (await getSalesFunnelSalesDealById(tenantId, id))!;
};

export const addSalesFunnelSalesDealNote = async (
  tenantId: string,
  dealId: string,
  body: string,
  actorUserId: string | null
): Promise<SalesFunnelActivityRow> => {
  const deal = await getSalesFunnelSalesDealById(tenantId, dealId);
  if (!deal) throw new Error("not_found");
  return addSalesFunnelManualActivity({
    tenantId,
    entityType: "sales_deal",
    entityId: dealId,
    activityType: "note",
    body,
    actorUserId
  });
};

/** Map BDR lead id → Sales deal id for leads already promoted in this tenant. */
export const listSalesFunnelPromotedDealIdsByLead = async (
  tenantId: string
): Promise<Map<string, string>> => {
  const map = new Map<string, string>();
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select({
        id: mysql.salesFunnelSalesDeals.id,
        promotedFromLeadId: mysql.salesFunnelSalesDeals.promotedFromLeadId
      })
      .from(mysql.salesFunnelSalesDeals)
      .where(eq(mysql.salesFunnelSalesDeals.tenantId, tenantId));
    for (const row of rows) {
      if (row.promotedFromLeadId) map.set(row.promotedFromLeadId, row.id);
    }
    return map;
  }
  const db = pgDb();
  const rows = await db
    .select({
      id: pg.salesFunnelSalesDeals.id,
      promotedFromLeadId: pg.salesFunnelSalesDeals.promotedFromLeadId
    })
    .from(pg.salesFunnelSalesDeals)
    .where(eq(pg.salesFunnelSalesDeals.tenantId, tenantId));
  for (const row of rows) {
    if (row.promotedFromLeadId) map.set(row.promotedFromLeadId, row.id);
  }
  return map;
};

export const getSalesFunnelSalesDealByPromotedLeadId = async (
  tenantId: string,
  leadId: string
): Promise<SalesFunnelSalesDealRow | undefined> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select()
      .from(mysql.salesFunnelSalesDeals)
      .where(
        and(
          eq(mysql.salesFunnelSalesDeals.tenantId, tenantId),
          eq(mysql.salesFunnelSalesDeals.promotedFromLeadId, leadId)
        )
      )
      .limit(1);
    return rows[0] ? mapDealMysql(rows[0]) : undefined;
  }
  const db = pgDb();
  const rows = await db
    .select()
    .from(pg.salesFunnelSalesDeals)
    .where(
      and(
        eq(pg.salesFunnelSalesDeals.tenantId, tenantId),
        eq(pg.salesFunnelSalesDeals.promotedFromLeadId, leadId)
      )
    )
    .limit(1);
  return rows[0] ? mapDealPg(rows[0]) : undefined;
};

/** Copy a BDR lead into the Sales pipeline (one deal per lead). */
export const promoteSalesFunnelBdrLeadToDeal = async (
  tenantId: string,
  leadId: string,
  input: SalesFunnelBdrLeadPromoteInput,
  actorUserId: string | null
): Promise<SalesFunnelSalesDealRow> => {
  const lead = await getSalesFunnelBdrLeadById(tenantId, leadId);
  if (!lead) throw new Error("not_found");
  if (lead.archivedAt) throw new Error("archived");
  if (!lead.active) throw new Error("inactive");

  const existing = await getSalesFunnelSalesDealByPromotedLeadId(tenantId, leadId);
  if (existing) throw new Error("already_promoted");

  const leadStage = await getSalesFunnelStageByKey(tenantId, "bdr", lead.stageKey);
  if (!leadStage?.readyForSales) throw new Error("not_ready_for_sales");

  const leadContacts = await getSalesFunnelBdrLeadContacts(tenantId, leadId);
  const stageKey = input.stageKey ?? (await getDefaultSalesFunnelStageKey(tenantId, "sales"));

  const deal = await insertSalesFunnelSalesDeal(
    tenantId,
    {
      title: lead.title,
      description: lead.description,
      stageKey,
      tags: lead.tags,
      ownerUserId: lead.ownerUserId,
      crmOrganizationId: lead.crmOrganizationId,
      promotedFromLeadId: leadId,
      contacts: leadContacts.map((c) => ({ contactId: c.contactId, role: c.role }))
    },
    actorUserId
  );

  const ownerId = lead.ownerUserId?.trim() ?? "";
  const ownerLabel = ownerId !== "" ? (await getUserDisplayLabelById(ownerId)) ?? "Unknown user" : "Unassigned";

  await insertSalesFunnelActivity({
    tenantId,
    entityType: "bdr_lead",
    entityId: leadId,
    activityType: "promoted",
    summary: `Lead Promoted by ${ownerLabel}`,
    payload: { dealId: deal.id, stageKey: deal.stageKey },
    actorUserId
  });

  const promotedAt = new Date();
  const inactiveLabel = (leadStage.name ?? "").trim() || lead.stageKey;
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db
      .update(mysql.salesFunnelBdrLeads)
      .set({
        active: false,
        archivedAt: promotedAt,
        inactiveStageLabel: inactiveLabel,
        updatedAt: promotedAt
      })
      .where(and(eq(mysql.salesFunnelBdrLeads.tenantId, tenantId), eq(mysql.salesFunnelBdrLeads.id, leadId)));
  } else {
    const db = pgDb();
    await db
      .update(pg.salesFunnelBdrLeads)
      .set({
        active: false,
        archivedAt: promotedAt,
        inactiveStageLabel: inactiveLabel,
        updatedAt: promotedAt
      })
      .where(and(eq(pg.salesFunnelBdrLeads.tenantId, tenantId), eq(pg.salesFunnelBdrLeads.id, leadId)));
  }

  return deal;
};

/** Hard-delete an archived deal and its funnel activities (contacts cascade). */
export const deleteSalesFunnelSalesDealPermanently = async (tenantId: string, id: string): Promise<void> => {
  const existing = await getSalesFunnelSalesDealById(tenantId, id);
  if (!existing) throw new Error("not_found");
  if (!existing.archivedAt) throw new Error("not_archived");

  const entityType = "sales_deal";
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
      .delete(mysql.salesFunnelSalesDeals)
      .where(and(eq(mysql.salesFunnelSalesDeals.tenantId, tenantId), eq(mysql.salesFunnelSalesDeals.id, id)));
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
    .delete(pg.salesFunnelSalesDeals)
    .where(and(eq(pg.salesFunnelSalesDeals.tenantId, tenantId), eq(pg.salesFunnelSalesDeals.id, id)));
};
