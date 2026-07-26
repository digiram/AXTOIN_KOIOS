/**
 * CRM organization market segments — tenant hierarchical picklists (3 layers).
 */

import { randomUUID } from "node:crypto";
import { and, asc, count, eq, inArray, sql } from "drizzle-orm";

import * as mysql from "./mysql-schema.js";
import * as pg from "./pg-schema.js";
import { dialectFromEnv, mysqlDb, pgDb } from "./crm-repos-db.js";

export type CrmOrganizationMarketSegmentRow = {
  id: string;
  tenantId: string;
  layer: 1 | 2 | 3;
  parentId: string | null;
  name: string;
  sortOrder: number;
  createdAt: Date;
};

const mapPg = (row: typeof pg.crmOrganizationMarketSegments.$inferSelect): CrmOrganizationMarketSegmentRow => ({
  id: row.id,
  tenantId: row.tenantId,
  layer: row.layer as 1 | 2 | 3,
  parentId: row.parentId,
  name: row.name,
  sortOrder: row.sortOrder,
  createdAt: row.createdAt
});

const mapMysql = (row: typeof mysql.crmOrganizationMarketSegments.$inferSelect): CrmOrganizationMarketSegmentRow => ({
  id: row.id,
  tenantId: row.tenantId,
  layer: row.layer as 1 | 2 | 3,
  parentId: row.parentId,
  name: row.name,
  sortOrder: row.sortOrder,
  createdAt: row.createdAt
});

export const listOrganizationMarketSegments = async (
  tenantId: string
): Promise<CrmOrganizationMarketSegmentRow[]> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select()
      .from(mysql.crmOrganizationMarketSegments)
      .where(eq(mysql.crmOrganizationMarketSegments.tenantId, tenantId))
      .orderBy(
        asc(mysql.crmOrganizationMarketSegments.layer),
        asc(mysql.crmOrganizationMarketSegments.sortOrder),
        asc(mysql.crmOrganizationMarketSegments.name)
      );
    return rows.map(mapMysql);
  }
  const db = pgDb();
  const rows = await db
    .select()
    .from(pg.crmOrganizationMarketSegments)
    .where(eq(pg.crmOrganizationMarketSegments.tenantId, tenantId))
    .orderBy(
      asc(pg.crmOrganizationMarketSegments.layer),
      asc(pg.crmOrganizationMarketSegments.sortOrder),
      asc(pg.crmOrganizationMarketSegments.name)
    );
  return rows.map(mapPg);
};

export const getOrganizationMarketSegmentById = async (
  tenantId: string,
  id: string
): Promise<CrmOrganizationMarketSegmentRow | undefined> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select()
      .from(mysql.crmOrganizationMarketSegments)
      .where(
        and(eq(mysql.crmOrganizationMarketSegments.tenantId, tenantId), eq(mysql.crmOrganizationMarketSegments.id, id))
      )
      .limit(1);
    return rows[0] ? mapMysql(rows[0]) : undefined;
  }
  const db = pgDb();
  const rows = await db
    .select()
    .from(pg.crmOrganizationMarketSegments)
    .where(and(eq(pg.crmOrganizationMarketSegments.tenantId, tenantId), eq(pg.crmOrganizationMarketSegments.id, id)))
    .limit(1);
  return rows[0] ? mapPg(rows[0]) : undefined;
};

export const getOrganizationMarketSegmentsByIds = async (
  tenantId: string,
  ids: readonly string[]
): Promise<Map<string, CrmOrganizationMarketSegmentRow>> => {
  const unique = [...new Set(ids.filter((id) => id.trim().length > 0))];
  if (unique.length === 0) return new Map();
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select()
      .from(mysql.crmOrganizationMarketSegments)
      .where(
        and(
          eq(mysql.crmOrganizationMarketSegments.tenantId, tenantId),
          inArray(mysql.crmOrganizationMarketSegments.id, unique)
        )
      );
    return new Map(rows.map((r) => [r.id, mapMysql(r)]));
  }
  const db = pgDb();
  const rows = await db
    .select()
    .from(pg.crmOrganizationMarketSegments)
    .where(
      and(eq(pg.crmOrganizationMarketSegments.tenantId, tenantId), inArray(pg.crmOrganizationMarketSegments.id, unique))
    );
  return new Map(rows.map((r) => [r.id, mapPg(r)]));
};

const countChildSegments = async (tenantId: string, parentId: string): Promise<number> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select({ n: count() })
      .from(mysql.crmOrganizationMarketSegments)
      .where(
        and(
          eq(mysql.crmOrganizationMarketSegments.tenantId, tenantId),
          eq(mysql.crmOrganizationMarketSegments.parentId, parentId)
        )
      );
    return Number(rows[0]?.n ?? 0);
  }
  const db = pgDb();
  const rows = await db
    .select({ n: count() })
    .from(pg.crmOrganizationMarketSegments)
    .where(
      and(
        eq(pg.crmOrganizationMarketSegments.tenantId, tenantId),
        eq(pg.crmOrganizationMarketSegments.parentId, parentId)
      )
    );
  return Number(rows[0]?.n ?? 0);
};

const countOrganizationSegmentUsage = async (tenantId: string, segmentId: string): Promise<number> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select({ n: count() })
      .from(mysql.crmOrganizations)
      .where(
        and(
          eq(mysql.crmOrganizations.tenantId, tenantId),
          sql`(${mysql.crmOrganizations.marketSegmentLayer1Id} = ${segmentId} OR ${mysql.crmOrganizations.marketSegmentLayer2Id} = ${segmentId} OR ${mysql.crmOrganizations.marketSegmentLayer3Id} = ${segmentId})`
        )
      );
    return Number(rows[0]?.n ?? 0);
  }
  const db = pgDb();
  const rows = await db
    .select({ n: count() })
    .from(pg.crmOrganizations)
    .where(
      and(
        eq(pg.crmOrganizations.tenantId, tenantId),
        sql`(${pg.crmOrganizations.marketSegmentLayer1Id} = ${segmentId}::uuid OR ${pg.crmOrganizations.marketSegmentLayer2Id} = ${segmentId}::uuid OR ${pg.crmOrganizations.marketSegmentLayer3Id} = ${segmentId}::uuid)`
      )
    );
  return Number(rows[0]?.n ?? 0);
};

export const insertOrganizationMarketSegment = async (
  tenantId: string,
  input: { name: string; parentId?: string | null }
): Promise<CrmOrganizationMarketSegmentRow> => {
  const name = input.name.trim();
  const parentId = input.parentId?.trim() || null;
  let layer: 1 | 2 | 3;
  if (!parentId) {
    layer = 1;
  } else {
    const parent = await getOrganizationMarketSegmentById(tenantId, parentId);
    if (!parent) throw new Error("segment_parent_not_found");
    if (parent.layer >= 3) throw new Error("segment_max_depth");
    layer = (parent.layer + 1) as 2 | 3;
  }

  const now = new Date();
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const id = randomUUID();
    const maxSort = await db
      .select({ m: sql<number>`COALESCE(MAX(${mysql.crmOrganizationMarketSegments.sortOrder}), -1)` })
      .from(mysql.crmOrganizationMarketSegments)
      .where(
        and(
          eq(mysql.crmOrganizationMarketSegments.tenantId, tenantId),
          parentId
            ? eq(mysql.crmOrganizationMarketSegments.parentId, parentId)
            : sql`${mysql.crmOrganizationMarketSegments.parentId} IS NULL`
        )
      );
    const sortOrder = Number(maxSort[0]?.m ?? -1) + 1;
    try {
      await db.insert(mysql.crmOrganizationMarketSegments).values({
        id,
        tenantId,
        layer,
        parentId,
        name,
        sortOrder,
        createdAt: now
      });
    } catch {
      throw new Error("segment_exists");
    }
    return { id, tenantId, layer, parentId, name, sortOrder, createdAt: now };
  }

  const db = pgDb();
  const maxSort = await db
    .select({ m: sql<number>`COALESCE(MAX(${pg.crmOrganizationMarketSegments.sortOrder}), -1)` })
    .from(pg.crmOrganizationMarketSegments)
    .where(
      and(
        eq(pg.crmOrganizationMarketSegments.tenantId, tenantId),
        parentId
          ? eq(pg.crmOrganizationMarketSegments.parentId, parentId)
          : sql`${pg.crmOrganizationMarketSegments.parentId} IS NULL`
      )
    );
  const sortOrder = Number(maxSort[0]?.m ?? -1) + 1;
  try {
    const inserted = await db
      .insert(pg.crmOrganizationMarketSegments)
      .values({ tenantId, layer, parentId, name, sortOrder, createdAt: now })
      .returning();
    return mapPg(inserted[0]!);
  } catch {
    throw new Error("segment_exists");
  }
};

export const deleteOrganizationMarketSegment = async (tenantId: string, id: string): Promise<boolean> => {
  const row = await getOrganizationMarketSegmentById(tenantId, id);
  if (!row) return false;
  const children = await countChildSegments(tenantId, id);
  if (children > 0) throw new Error("segment_has_children");
  const usage = await countOrganizationSegmentUsage(tenantId, id);
  if (usage > 0) throw new Error("segment_in_use");

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db
      .delete(mysql.crmOrganizationMarketSegments)
      .where(
        and(eq(mysql.crmOrganizationMarketSegments.tenantId, tenantId), eq(mysql.crmOrganizationMarketSegments.id, id))
      );
    return true;
  }
  const db = pgDb();
  await db
    .delete(pg.crmOrganizationMarketSegments)
    .where(and(eq(pg.crmOrganizationMarketSegments.tenantId, tenantId), eq(pg.crmOrganizationMarketSegments.id, id)));
  return true;
};

export const normalizeOrganizationMarketSegmentIds = (
  layer1Id?: string | null,
  layer2Id?: string | null,
  layer3Id?: string | null
): { layer1Id: string | null; layer2Id: string | null; layer3Id: string | null } => {
  const l1 = layer1Id?.trim() || null;
  let l2 = layer2Id?.trim() || null;
  let l3 = layer3Id?.trim() || null;
  if (!l1) {
    l2 = null;
    l3 = null;
  } else if (!l2) {
    l3 = null;
  }
  return { layer1Id: l1, layer2Id: l2, layer3Id: l3 };
};

export const assertValidOrganizationMarketSegmentAssignment = async (
  tenantId: string,
  layer1Id: string | null,
  layer2Id: string | null,
  layer3Id: string | null
): Promise<void> => {
  if (!layer1Id && !layer2Id && !layer3Id) return;
  if (!layer1Id) throw new Error("invalid_market_segment");
  const l1 = await getOrganizationMarketSegmentById(tenantId, layer1Id);
  if (!l1 || l1.layer !== 1) throw new Error("invalid_market_segment");
  if (!layer2Id && layer3Id) throw new Error("invalid_market_segment");
  if (layer2Id) {
    const l2 = await getOrganizationMarketSegmentById(tenantId, layer2Id);
    if (!l2 || l2.layer !== 2 || l2.parentId !== layer1Id) throw new Error("invalid_market_segment");
    if (layer3Id) {
      const l3 = await getOrganizationMarketSegmentById(tenantId, layer3Id);
      if (!l3 || l3.layer !== 3 || l3.parentId !== layer2Id) throw new Error("invalid_market_segment");
    }
  }
};
