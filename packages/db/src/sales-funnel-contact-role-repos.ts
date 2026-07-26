/**
 * Sales funnel — tenant contact role labels for lead/deal contact links.
 */

import { randomUUID } from "node:crypto";
import { and, asc, count, eq, isNull, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { SalesFunnelContactLink, SalesFunnelContactRoleCreateInput } from "@starter/shared";

import { getDb } from "./client.js";
import * as mysql from "./mysql-schema.js";
import * as pg from "./pg-schema.js";
import { dialectFromEnv } from "./schema.js";

const mysqlDb = (): MySql2Database<typeof mysql> => getDb() as MySql2Database<typeof mysql>;
const pgDb = (): NodePgDatabase<typeof pg> => getDb() as NodePgDatabase<typeof pg>;

const newId = () => randomUUID();

export type SalesFunnelContactRoleRow = {
  id: string;
  tenantId: string;
  label: string;
  sortOrder: number;
  createdAt: Date;
  usageCount: number;
};

const mapPg = (
  row: typeof pg.salesFunnelContactRoles.$inferSelect,
  usageCount: number
): SalesFunnelContactRoleRow => ({
  id: row.id,
  tenantId: row.tenantId,
  label: row.label,
  sortOrder: row.sortOrder,
  createdAt: row.createdAt,
  usageCount
});

const mapMysql = (
  row: typeof mysql.salesFunnelContactRoles.$inferSelect,
  usageCount: number
): SalesFunnelContactRoleRow => ({
  id: row.id,
  tenantId: row.tenantId,
  label: row.label,
  sortOrder: row.sortOrder,
  createdAt: row.createdAt,
  usageCount
});

const countRoleUsage = async (tenantId: string, label: string): Promise<number> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const leadRows = await db
      .select({ n: count() })
      .from(mysql.salesFunnelLeadContacts)
      .innerJoin(
        mysql.salesFunnelBdrLeads,
        eq(mysql.salesFunnelLeadContacts.leadId, mysql.salesFunnelBdrLeads.id)
      )
      .where(
        and(
          eq(mysql.salesFunnelLeadContacts.tenantId, tenantId),
          eq(mysql.salesFunnelBdrLeads.tenantId, tenantId),
          eq(mysql.salesFunnelLeadContacts.roleLabel, label),
          isNull(mysql.salesFunnelBdrLeads.archivedAt)
        )
      );
    const dealRows = await db
      .select({ n: count() })
      .from(mysql.salesFunnelDealContacts)
      .innerJoin(
        mysql.salesFunnelSalesDeals,
        eq(mysql.salesFunnelDealContacts.dealId, mysql.salesFunnelSalesDeals.id)
      )
      .where(
        and(
          eq(mysql.salesFunnelDealContacts.tenantId, tenantId),
          eq(mysql.salesFunnelSalesDeals.tenantId, tenantId),
          eq(mysql.salesFunnelDealContacts.roleLabel, label),
          isNull(mysql.salesFunnelSalesDeals.archivedAt)
        )
      );
    return Number(leadRows[0]?.n ?? 0) + Number(dealRows[0]?.n ?? 0);
  }
  const db = pgDb();
  const leadRows = await db
    .select({ n: count() })
    .from(pg.salesFunnelLeadContacts)
    .innerJoin(pg.salesFunnelBdrLeads, eq(pg.salesFunnelLeadContacts.leadId, pg.salesFunnelBdrLeads.id))
    .where(
      and(
        eq(pg.salesFunnelLeadContacts.tenantId, tenantId),
        eq(pg.salesFunnelBdrLeads.tenantId, tenantId),
        eq(pg.salesFunnelLeadContacts.roleLabel, label),
        isNull(pg.salesFunnelBdrLeads.archivedAt)
      )
    );
  const dealRows = await db
    .select({ n: count() })
    .from(pg.salesFunnelDealContacts)
    .innerJoin(pg.salesFunnelSalesDeals, eq(pg.salesFunnelDealContacts.dealId, pg.salesFunnelSalesDeals.id))
    .where(
      and(
        eq(pg.salesFunnelDealContacts.tenantId, tenantId),
        eq(pg.salesFunnelSalesDeals.tenantId, tenantId),
        eq(pg.salesFunnelDealContacts.roleLabel, label),
        isNull(pg.salesFunnelSalesDeals.archivedAt)
      )
    );
  return Number(leadRows[0]?.n ?? 0) + Number(dealRows[0]?.n ?? 0);
};

export const listSalesFunnelContactRoles = async (tenantId: string): Promise<SalesFunnelContactRoleRow[]> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select()
      .from(mysql.salesFunnelContactRoles)
      .where(eq(mysql.salesFunnelContactRoles.tenantId, tenantId))
      .orderBy(asc(mysql.salesFunnelContactRoles.sortOrder), asc(mysql.salesFunnelContactRoles.label));
    return Promise.all(rows.map(async (r) => mapMysql(r, await countRoleUsage(tenantId, r.label))));
  }
  const db = pgDb();
  const rows = await db
    .select()
    .from(pg.salesFunnelContactRoles)
    .where(eq(pg.salesFunnelContactRoles.tenantId, tenantId))
    .orderBy(asc(pg.salesFunnelContactRoles.sortOrder), asc(pg.salesFunnelContactRoles.label));
  return Promise.all(rows.map(async (r) => mapPg(r, await countRoleUsage(tenantId, r.label))));
};

export const listSalesFunnelContactRoleLabels = async (tenantId: string): Promise<string[]> => {
  const rows = await listSalesFunnelContactRoles(tenantId);
  return rows.map((r) => r.label);
};

export const validateSalesFunnelContactRoles = async (
  tenantId: string,
  contacts: SalesFunnelContactLink[]
): Promise<void> => {
  const allowed = new Set(await listSalesFunnelContactRoleLabels(tenantId));
  for (const link of contacts) {
    const role = (link.role ?? "").trim();
    if (role === "") continue;
    if (!allowed.has(role)) throw new Error("invalid_contact_role");
  }
};

export const insertSalesFunnelContactRole = async (
  tenantId: string,
  input: SalesFunnelContactRoleCreateInput
): Promise<SalesFunnelContactRoleRow> => {
  const label = input.label.trim();
  const id = newId();
  const now = new Date();
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const existing = await db
      .select({ id: mysql.salesFunnelContactRoles.id })
      .from(mysql.salesFunnelContactRoles)
      .where(
        and(eq(mysql.salesFunnelContactRoles.tenantId, tenantId), eq(mysql.salesFunnelContactRoles.label, label))
      )
      .limit(1);
    if (existing[0]) throw new Error("contact_role_exists");
    const maxSort = await db
      .select({ m: sql<number>`COALESCE(MAX(${mysql.salesFunnelContactRoles.sortOrder}), -1)` })
      .from(mysql.salesFunnelContactRoles)
      .where(eq(mysql.salesFunnelContactRoles.tenantId, tenantId));
    const sortOrder = Number(maxSort[0]?.m ?? -1) + 1;
    await db.insert(mysql.salesFunnelContactRoles).values({
      id,
      tenantId,
      label,
      sortOrder,
      createdAt: now
    });
    return mapMysql(
      { id, tenantId, label, sortOrder, createdAt: now },
      0
    );
  }
  const db = pgDb();
  const existing = await db
    .select({ id: pg.salesFunnelContactRoles.id })
    .from(pg.salesFunnelContactRoles)
    .where(and(eq(pg.salesFunnelContactRoles.tenantId, tenantId), eq(pg.salesFunnelContactRoles.label, label)))
    .limit(1);
  if (existing[0]) throw new Error("contact_role_exists");
  const maxSort = await db
    .select({ m: sql<number>`COALESCE(MAX(${pg.salesFunnelContactRoles.sortOrder}), -1)` })
    .from(pg.salesFunnelContactRoles)
    .where(eq(pg.salesFunnelContactRoles.tenantId, tenantId));
  const sortOrder = Number(maxSort[0]?.m ?? -1) + 1;
  await db.insert(pg.salesFunnelContactRoles).values({
    id,
    tenantId,
    label,
    sortOrder,
    createdAt: now
  });
  return mapPg({ id, tenantId, label, sortOrder, createdAt: now }, 0);
};

export const deleteSalesFunnelContactRole = async (tenantId: string, id: string): Promise<boolean> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select()
      .from(mysql.salesFunnelContactRoles)
      .where(and(eq(mysql.salesFunnelContactRoles.tenantId, tenantId), eq(mysql.salesFunnelContactRoles.id, id)))
      .limit(1);
    const row = rows[0];
    if (!row) return false;
    const usage = await countRoleUsage(tenantId, row.label);
    if (usage > 0) throw new Error("contact_role_in_use");
    await db
      .delete(mysql.salesFunnelContactRoles)
      .where(and(eq(mysql.salesFunnelContactRoles.tenantId, tenantId), eq(mysql.salesFunnelContactRoles.id, id)));
    return true;
  }
  const db = pgDb();
  const rows = await db
    .select()
    .from(pg.salesFunnelContactRoles)
    .where(and(eq(pg.salesFunnelContactRoles.tenantId, tenantId), eq(pg.salesFunnelContactRoles.id, id)))
    .limit(1);
  const row = rows[0];
  if (!row) return false;
  const usage = await countRoleUsage(tenantId, row.label);
  if (usage > 0) throw new Error("contact_role_in_use");
  await db
    .delete(pg.salesFunnelContactRoles)
    .where(and(eq(pg.salesFunnelContactRoles.tenantId, tenantId), eq(pg.salesFunnelContactRoles.id, id)));
  return true;
};
