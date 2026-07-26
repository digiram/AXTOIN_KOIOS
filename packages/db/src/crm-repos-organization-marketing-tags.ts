/**
 * CRM organization marketing tags — tenant tag library and org assignments.
 */

import { randomUUID } from "node:crypto";
import { and, asc, count, eq, inArray, sql } from "drizzle-orm";

import * as mysql from "./mysql-schema.js";
import * as pg from "./pg-schema.js";
import { dialectFromEnv, mysqlDb, pgDb } from "./crm-repos-db.js";

export type CrmOrganizationMarketingTagRow = {
  id: string;
  tenantId: string;
  name: string;
  sortOrder: number;
  createdAt: Date;
  usageCount: number;
};

const mapPg = (row: typeof pg.crmOrganizationMarketingTags.$inferSelect, usageCount: number): CrmOrganizationMarketingTagRow => ({
  id: row.id,
  tenantId: row.tenantId,
  name: row.name,
  sortOrder: row.sortOrder,
  createdAt: row.createdAt,
  usageCount
});

const mapMysql = (
  row: typeof mysql.crmOrganizationMarketingTags.$inferSelect,
  usageCount: number
): CrmOrganizationMarketingTagRow => ({
  id: row.id,
  tenantId: row.tenantId,
  name: row.name,
  sortOrder: row.sortOrder,
  createdAt: row.createdAt,
  usageCount
});

const countTagUsage = async (tenantId: string, tagId: string): Promise<number> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select({ n: count() })
      .from(mysql.crmOrganizationMarketingTagLinks)
      .innerJoin(
        mysql.crmOrganizations,
        eq(mysql.crmOrganizationMarketingTagLinks.organizationId, mysql.crmOrganizations.id)
      )
      .where(
        and(
          eq(mysql.crmOrganizations.tenantId, tenantId),
          eq(mysql.crmOrganizationMarketingTagLinks.tagId, tagId)
        )
      );
    return Number(rows[0]?.n ?? 0);
  }
  const db = pgDb();
  const rows = await db
    .select({ n: count() })
    .from(pg.crmOrganizationMarketingTagLinks)
    .innerJoin(pg.crmOrganizations, eq(pg.crmOrganizationMarketingTagLinks.organizationId, pg.crmOrganizations.id))
    .where(and(eq(pg.crmOrganizations.tenantId, tenantId), eq(pg.crmOrganizationMarketingTagLinks.tagId, tagId)));
  return Number(rows[0]?.n ?? 0);
};

export const listOrganizationMarketingTags = async (tenantId: string): Promise<CrmOrganizationMarketingTagRow[]> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select()
      .from(mysql.crmOrganizationMarketingTags)
      .where(eq(mysql.crmOrganizationMarketingTags.tenantId, tenantId))
      .orderBy(
        asc(mysql.crmOrganizationMarketingTags.sortOrder),
        asc(mysql.crmOrganizationMarketingTags.name)
      );
    return Promise.all(rows.map(async (r) => mapMysql(r, await countTagUsage(tenantId, r.id))));
  }
  const db = pgDb();
  const rows = await db
    .select()
    .from(pg.crmOrganizationMarketingTags)
    .where(eq(pg.crmOrganizationMarketingTags.tenantId, tenantId))
    .orderBy(asc(pg.crmOrganizationMarketingTags.sortOrder), asc(pg.crmOrganizationMarketingTags.name));
  return Promise.all(rows.map(async (r) => mapPg(r, await countTagUsage(tenantId, r.id))));
};

export const getOrganizationMarketingTagsByIds = async (
  tenantId: string,
  ids: readonly string[]
): Promise<Map<string, CrmOrganizationMarketingTagRow>> => {
  const unique = [...new Set(ids.filter((id) => id.trim().length > 0))];
  if (unique.length === 0) return new Map();
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select()
      .from(mysql.crmOrganizationMarketingTags)
      .where(
        and(eq(mysql.crmOrganizationMarketingTags.tenantId, tenantId), inArray(mysql.crmOrganizationMarketingTags.id, unique))
      );
    return new Map(
      await Promise.all(
        rows.map(async (r) => [r.id, mapMysql(r, await countTagUsage(tenantId, r.id))] as const)
      )
    );
  }
  const db = pgDb();
  const rows = await db
    .select()
    .from(pg.crmOrganizationMarketingTags)
    .where(
      and(eq(pg.crmOrganizationMarketingTags.tenantId, tenantId), inArray(pg.crmOrganizationMarketingTags.id, unique))
    );
  return new Map(
    await Promise.all(rows.map(async (r) => [r.id, mapPg(r, await countTagUsage(tenantId, r.id))] as const))
  );
};

export const listOrganizationMarketingTagsForOrganization = async (
  tenantId: string,
  organizationId: string
): Promise<CrmOrganizationMarketingTagRow[]> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select({
        id: mysql.crmOrganizationMarketingTags.id,
        tenantId: mysql.crmOrganizationMarketingTags.tenantId,
        name: mysql.crmOrganizationMarketingTags.name,
        sortOrder: mysql.crmOrganizationMarketingTags.sortOrder,
        createdAt: mysql.crmOrganizationMarketingTags.createdAt
      })
      .from(mysql.crmOrganizationMarketingTagLinks)
      .innerJoin(
        mysql.crmOrganizationMarketingTags,
        eq(mysql.crmOrganizationMarketingTagLinks.tagId, mysql.crmOrganizationMarketingTags.id)
      )
      .innerJoin(
        mysql.crmOrganizations,
        eq(mysql.crmOrganizationMarketingTagLinks.organizationId, mysql.crmOrganizations.id)
      )
      .where(
        and(
          eq(mysql.crmOrganizations.tenantId, tenantId),
          eq(mysql.crmOrganizationMarketingTagLinks.organizationId, organizationId)
        )
      )
      .orderBy(asc(mysql.crmOrganizationMarketingTags.sortOrder), asc(mysql.crmOrganizationMarketingTags.name));
    return rows.map((r) => mapMysql(r, 0));
  }
  const db = pgDb();
  const rows = await db
    .select({
      id: pg.crmOrganizationMarketingTags.id,
      tenantId: pg.crmOrganizationMarketingTags.tenantId,
      name: pg.crmOrganizationMarketingTags.name,
      sortOrder: pg.crmOrganizationMarketingTags.sortOrder,
      createdAt: pg.crmOrganizationMarketingTags.createdAt
    })
    .from(pg.crmOrganizationMarketingTagLinks)
    .innerJoin(
      pg.crmOrganizationMarketingTags,
      eq(pg.crmOrganizationMarketingTagLinks.tagId, pg.crmOrganizationMarketingTags.id)
    )
    .innerJoin(pg.crmOrganizations, eq(pg.crmOrganizationMarketingTagLinks.organizationId, pg.crmOrganizations.id))
    .where(
      and(
        eq(pg.crmOrganizations.tenantId, tenantId),
        eq(pg.crmOrganizationMarketingTagLinks.organizationId, organizationId)
      )
    )
    .orderBy(asc(pg.crmOrganizationMarketingTags.sortOrder), asc(pg.crmOrganizationMarketingTags.name));
  return rows.map((r) => mapPg(r, 0));
};

export const listOrganizationMarketingTagsForOrganizations = async (
  tenantId: string,
  organizationIds: readonly string[]
): Promise<Map<string, CrmOrganizationMarketingTagRow[]>> => {
  const uniqueOrgIds = [...new Set(organizationIds.filter((id) => id.trim().length > 0))];
  const result = new Map<string, CrmOrganizationMarketingTagRow[]>();
  for (const id of uniqueOrgIds) result.set(id, []);
  if (uniqueOrgIds.length === 0) return result;

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select({
        organizationId: mysql.crmOrganizationMarketingTagLinks.organizationId,
        id: mysql.crmOrganizationMarketingTags.id,
        tenantId: mysql.crmOrganizationMarketingTags.tenantId,
        name: mysql.crmOrganizationMarketingTags.name,
        sortOrder: mysql.crmOrganizationMarketingTags.sortOrder,
        createdAt: mysql.crmOrganizationMarketingTags.createdAt
      })
      .from(mysql.crmOrganizationMarketingTagLinks)
      .innerJoin(
        mysql.crmOrganizationMarketingTags,
        eq(mysql.crmOrganizationMarketingTagLinks.tagId, mysql.crmOrganizationMarketingTags.id)
      )
      .innerJoin(
        mysql.crmOrganizations,
        eq(mysql.crmOrganizationMarketingTagLinks.organizationId, mysql.crmOrganizations.id)
      )
      .where(
        and(
          eq(mysql.crmOrganizations.tenantId, tenantId),
          inArray(mysql.crmOrganizationMarketingTagLinks.organizationId, uniqueOrgIds)
        )
      )
      .orderBy(asc(mysql.crmOrganizationMarketingTags.sortOrder), asc(mysql.crmOrganizationMarketingTags.name));
    for (const row of rows) {
      const list = result.get(row.organizationId) ?? [];
      list.push(mapMysql(row, 0));
      result.set(row.organizationId, list);
    }
    return result;
  }

  const db = pgDb();
  const rows = await db
    .select({
      organizationId: pg.crmOrganizationMarketingTagLinks.organizationId,
      id: pg.crmOrganizationMarketingTags.id,
      tenantId: pg.crmOrganizationMarketingTags.tenantId,
      name: pg.crmOrganizationMarketingTags.name,
      sortOrder: pg.crmOrganizationMarketingTags.sortOrder,
      createdAt: pg.crmOrganizationMarketingTags.createdAt
    })
    .from(pg.crmOrganizationMarketingTagLinks)
    .innerJoin(
      pg.crmOrganizationMarketingTags,
      eq(pg.crmOrganizationMarketingTagLinks.tagId, pg.crmOrganizationMarketingTags.id)
    )
    .innerJoin(pg.crmOrganizations, eq(pg.crmOrganizationMarketingTagLinks.organizationId, pg.crmOrganizations.id))
    .where(
      and(
        eq(pg.crmOrganizations.tenantId, tenantId),
        inArray(pg.crmOrganizationMarketingTagLinks.organizationId, uniqueOrgIds)
      )
    )
    .orderBy(asc(pg.crmOrganizationMarketingTags.sortOrder), asc(pg.crmOrganizationMarketingTags.name));
  for (const row of rows) {
    const list = result.get(row.organizationId) ?? [];
    list.push(mapPg(row, 0));
    result.set(row.organizationId, list);
  }
  return result;
};

export const insertOrganizationMarketingTag = async (
  tenantId: string,
  input: { name: string }
): Promise<CrmOrganizationMarketingTagRow> => {
  const name = input.name.trim();
  const now = new Date();
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const existing = await db
      .select({ id: mysql.crmOrganizationMarketingTags.id })
      .from(mysql.crmOrganizationMarketingTags)
      .where(and(eq(mysql.crmOrganizationMarketingTags.tenantId, tenantId), eq(mysql.crmOrganizationMarketingTags.name, name)))
      .limit(1);
    if (existing[0]) throw new Error("marketing_tag_exists");
    const id = randomUUID();
    const maxSort = await db
      .select({ m: sql<number>`COALESCE(MAX(${mysql.crmOrganizationMarketingTags.sortOrder}), -1)` })
      .from(mysql.crmOrganizationMarketingTags)
      .where(eq(mysql.crmOrganizationMarketingTags.tenantId, tenantId));
    const sortOrder = Number(maxSort[0]?.m ?? -1) + 1;
    await db.insert(mysql.crmOrganizationMarketingTags).values({
      id,
      tenantId,
      name,
      sortOrder,
      createdAt: now
    });
    return { id, tenantId, name, sortOrder, createdAt: now, usageCount: 0 };
  }
  const db = pgDb();
  const existing = await db
    .select({ id: pg.crmOrganizationMarketingTags.id })
    .from(pg.crmOrganizationMarketingTags)
    .where(and(eq(pg.crmOrganizationMarketingTags.tenantId, tenantId), eq(pg.crmOrganizationMarketingTags.name, name)))
    .limit(1);
  if (existing[0]) throw new Error("marketing_tag_exists");
  const maxSort = await db
    .select({ m: sql<number>`COALESCE(MAX(${pg.crmOrganizationMarketingTags.sortOrder}), -1)` })
    .from(pg.crmOrganizationMarketingTags)
    .where(eq(pg.crmOrganizationMarketingTags.tenantId, tenantId));
  const sortOrder = Number(maxSort[0]?.m ?? -1) + 1;
  const inserted = await db
    .insert(pg.crmOrganizationMarketingTags)
    .values({ tenantId, name, sortOrder, createdAt: now })
    .returning();
  return mapPg(inserted[0]!, 0);
};

export const deleteOrganizationMarketingTag = async (tenantId: string, id: string): Promise<boolean> => {
  const usage = await countTagUsage(tenantId, id);
  if (usage > 0) throw new Error("marketing_tag_in_use");
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const res = await db
      .delete(mysql.crmOrganizationMarketingTags)
      .where(and(eq(mysql.crmOrganizationMarketingTags.tenantId, tenantId), eq(mysql.crmOrganizationMarketingTags.id, id)));
    const header = Array.isArray(res) ? res[0] : res;
    const affected =
      typeof header === "object" && header !== null && "affectedRows" in header ? Number(header.affectedRows) : 0;
    return affected > 0;
  }
  const db = pgDb();
  const res = await db
    .delete(pg.crmOrganizationMarketingTags)
    .where(and(eq(pg.crmOrganizationMarketingTags.tenantId, tenantId), eq(pg.crmOrganizationMarketingTags.id, id)))
    .returning({ id: pg.crmOrganizationMarketingTags.id });
  return res.length > 0;
};

export const assertValidOrganizationMarketingTagIds = async (
  tenantId: string,
  tagIds: readonly string[]
): Promise<void> => {
  const unique = [...new Set(tagIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) return;
  const found = await getOrganizationMarketingTagsByIds(tenantId, unique);
  if (found.size !== unique.length) throw new Error("invalid_marketing_tag");
};

export const setOrganizationMarketingTags = async (
  tenantId: string,
  organizationId: string,
  tagIds: readonly string[]
): Promise<void> => {
  const unique = [...new Set(tagIds.map((id) => id.trim()).filter(Boolean))];
  await assertValidOrganizationMarketingTagIds(tenantId, unique);
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db
      .delete(mysql.crmOrganizationMarketingTagLinks)
      .where(eq(mysql.crmOrganizationMarketingTagLinks.organizationId, organizationId));
    if (unique.length > 0) {
      await db.insert(mysql.crmOrganizationMarketingTagLinks).values(
        unique.map((tagId) => ({ organizationId, tagId }))
      );
    }
    return;
  }
  const db = pgDb();
  await db
    .delete(pg.crmOrganizationMarketingTagLinks)
    .where(eq(pg.crmOrganizationMarketingTagLinks.organizationId, organizationId));
  if (unique.length > 0) {
    await db
      .insert(pg.crmOrganizationMarketingTagLinks)
      .values(unique.map((tagId) => ({ organizationId, tagId })));
  }
};
