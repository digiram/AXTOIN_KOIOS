/**
 * CRM activities — list and insert against `crm_activities`.
 */

import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, ilike, inArray, isNotNull, lt, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

import type { CrmEntityKind } from "@starter/shared";

import {
  findEntityIdsByMultiFieldContains,
  getFieldEncryptionMiddleware
} from "./field-encryption/index.js";
import * as pg from "./pg-schema.js";
import { dialectFromEnv, mysqlDb, pgDb } from "./crm-repos-db.js";
import { entityExists } from "./crm-repos-entities.js";
import { escapeLike, utcDayAfterInclusiveEnd, utcDayStart } from "./crm-repos-query-helpers.js";
import * as mysql from "./mysql-schema.js";

export type ListActivitiesFilters = {
  activityType?: string;
  datePreset?: "between" | "before" | "after";
  dateField?: "createdAt" | "scheduledAt";
  dateFrom?: string;
  dateTo?: string;
  q?: string;
};

export type CrmActivityRow = {
  id: string;
  tenantId: string;
  activityType: string;
  title: string;
  description: string | null;
  relatedEntityId: string;
  relatedEntityKind: string;
  scheduledAt: Date | null;
  direction: string | null;
  createdAt: Date;
};

const TABLE_KEY = "crm_activities";

type ActivityDbRow = {
  id: string;
  tenantId: string;
  activityType: string;
  title: string;
  description: string | null;
  relatedEntityId: string;
  relatedEntityKind: string;
  scheduledAt: Date | null;
  createdAt: Date;
  direction?: string | null;
};

const mapActivityRow = (r: ActivityDbRow): CrmActivityRow => ({
  id: r.id,
  tenantId: r.tenantId,
  activityType: r.activityType,
  title: r.title,
  description: r.description,
  relatedEntityId: r.relatedEntityId,
  relatedEntityKind: r.relatedEntityKind,
  scheduledAt: r.scheduledAt,
  direction: r.direction ?? null,
  createdAt: r.createdAt
});

const decryptActivityRow = async (tenantId: string, row: ActivityDbRow): Promise<CrmActivityRow> => {
  const middleware = getFieldEncryptionMiddleware();
  if (!middleware) return mapActivityRow(row);
  const plain = await middleware.decryptForRead({
    tableKey: TABLE_KEY,
    tenantId,
    row: row as unknown as Record<string, unknown>
  });
  return mapActivityRow(plain as ActivityDbRow);
};

const encryptActivityFields = async (
  tenantId: string,
  row: Record<string, unknown>,
  opts?: { entityId?: string }
): Promise<Record<string, unknown>> => {
  const middleware = getFieldEncryptionMiddleware();
  if (!middleware) return row;
  return middleware.encryptForWrite({
    tableKey: TABLE_KEY,
    tenantId,
    row,
    entityId: opts?.entityId
  });
};

const buildMysqlActivityListExtras = (opts: ListActivitiesFilters, searchIds: string[] | null): SQL[] => {
  const parts: SQL[] = [];
  const ft = opts.activityType?.trim();
  if (ft && ft.length > 0) parts.push(eq(mysql.crmActivities.activityType, ft));
  const preset = opts.datePreset;
  if (preset && opts.dateFrom) {
    const field = opts.dateField ?? "createdAt";
    const dateCol = field === "scheduledAt" ? mysql.crmActivities.scheduledAt : mysql.crmActivities.createdAt;
    if (field === "scheduledAt") parts.push(isNotNull(mysql.crmActivities.scheduledAt));
    if (preset === "after") parts.push(gte(dateCol, utcDayStart(opts.dateFrom)));
    else if (preset === "before") parts.push(lt(dateCol, utcDayStart(opts.dateFrom)));
    else if (preset === "between" && opts.dateTo) {
      parts.push(gte(dateCol, utcDayStart(opts.dateFrom)));
      parts.push(lt(dateCol, utcDayAfterInclusiveEnd(opts.dateTo)));
    }
  }
  const q = opts.q?.trim() ?? "";
  if (q.length > 0) {
    if (searchIds) {
      if (searchIds.length === 0) parts.push(sql`1 = 0`);
      else parts.push(inArray(mysql.crmActivities.id, searchIds));
    } else {
      const pat = `%${escapeLike(q)}%`;
      parts.push(
        or(
          sql`LOWER(${mysql.crmActivities.title}) LIKE LOWER(${pat})`,
          sql`LOWER(COALESCE(${mysql.crmActivities.description},'')) LIKE LOWER(${pat})`
        )!
      );
    }
  }
  return parts;
};

const buildPgActivityListExtras = (opts: ListActivitiesFilters, searchIds: string[] | null): SQL[] => {
  const parts: SQL[] = [];
  const ft = opts.activityType?.trim();
  if (ft && ft.length > 0) parts.push(eq(pg.crmActivities.activityType, ft));
  const preset = opts.datePreset;
  if (preset && opts.dateFrom) {
    const field = opts.dateField ?? "createdAt";
    const dateCol = field === "scheduledAt" ? pg.crmActivities.scheduledAt : pg.crmActivities.createdAt;
    if (field === "scheduledAt") parts.push(isNotNull(pg.crmActivities.scheduledAt));
    if (preset === "after") parts.push(gte(dateCol, utcDayStart(opts.dateFrom)));
    else if (preset === "before") parts.push(lt(dateCol, utcDayStart(opts.dateFrom)));
    else if (preset === "between" && opts.dateTo) {
      parts.push(gte(dateCol, utcDayStart(opts.dateFrom)));
      parts.push(lt(dateCol, utcDayAfterInclusiveEnd(opts.dateTo)));
    }
  }
  const q = opts.q?.trim() ?? "";
  if (q.length > 0) {
    if (searchIds) {
      if (searchIds.length === 0) parts.push(sql`1 = 0`);
      else parts.push(inArray(pg.crmActivities.id, searchIds));
    } else {
      const pat = `%${escapeLike(q)}%`;
      parts.push(
        or(
          ilike(pg.crmActivities.title, pat),
          ilike(sql<string>`COALESCE(${pg.crmActivities.description}, '')`, pat)
        )!
      );
    }
  }
  return parts;
};

const resolveActivitySearchIds = async (
  tenantId: string,
  q: string
): Promise<string[] | null> => {
  const middleware = getFieldEncryptionMiddleware();
  if (!middleware?.hasSearchIndex() || !q.trim()) return null;
  return findEntityIdsByMultiFieldContains(
    tenantId,
    tenantId,
    TABLE_KEY,
    q,
    middleware.getSearchKeyB64()!,
    middleware.getNgramSize()
  );
};

export const listActivitiesForEntity = async (
  tenantId: string,
  relatedKind: CrmEntityKind,
  relatedId: string,
  filters?: ListActivitiesFilters
): Promise<CrmActivityRow[]> => {
  const opts: ListActivitiesFilters = filters ?? {};
  const searchIds = await resolveActivitySearchIds(tenantId, opts.q ?? "");
  if (searchIds && searchIds.length === 0) return [];

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const base = and(
      eq(mysql.crmActivities.tenantId, tenantId),
      eq(mysql.crmActivities.relatedEntityKind, relatedKind),
      eq(mysql.crmActivities.relatedEntityId, relatedId)
    );
    const extras = buildMysqlActivityListExtras(opts, searchIds);
    const whereClause = extras.length > 0 ? and(base, ...extras)! : base;
    const rows = await db
      .select()
      .from(mysql.crmActivities)
      .where(whereClause)
      .orderBy(desc(mysql.crmActivities.createdAt));
    return Promise.all(rows.map((r) => decryptActivityRow(tenantId, r)));
  }
  const db = pgDb();
  const base = and(
    eq(pg.crmActivities.tenantId, tenantId),
    eq(pg.crmActivities.relatedEntityKind, relatedKind),
    eq(pg.crmActivities.relatedEntityId, relatedId)
  );
  const extras = buildPgActivityListExtras(opts, searchIds);
  const whereClause = extras.length > 0 ? and(base, ...extras)! : base;
  const rows = await db
    .select()
    .from(pg.crmActivities)
    .where(whereClause)
    .orderBy(desc(pg.crmActivities.createdAt));
  return Promise.all(rows.map((r) => decryptActivityRow(tenantId, r)));
};

export const insertActivity = async (
  tenantId: string,
  input: {
    activityType: string;
    /** Empty string when body lives in `description`. */
    title?: string;
    description: string;
    relatedEntityId: string;
    relatedEntityKind: CrmEntityKind;
    scheduledAt?: Date | null;
    direction?: string | null;
  }
): Promise<CrmActivityRow | undefined> => {
  const kindOk = await entityExists(tenantId, input.relatedEntityKind, input.relatedEntityId);
  if (!kindOk) return undefined;

  const now = new Date();
  const titleStored = input.title?.trim() ?? "";
  const descriptionStored = input.description.trim() || null;
  const plainRow = {
    title: titleStored,
    description: descriptionStored
  };

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const id = randomUUID();
    const encrypted = await encryptActivityFields(tenantId, plainRow, { entityId: id });
    await db.insert(mysql.crmActivities).values({
      id,
      tenantId,
      activityType: input.activityType,
      title: String(encrypted.title ?? titleStored),
      description: (encrypted.description as string | null) ?? descriptionStored,
      relatedEntityId: input.relatedEntityId,
      relatedEntityKind: input.relatedEntityKind,
      scheduledAt: input.scheduledAt ?? null,
      direction: input.direction?.trim() || null,
      createdAt: now
    });
    const middleware = getFieldEncryptionMiddleware();
    if (middleware?.hasSearchIndex()) {
      await middleware.syncSearchTokensForRow({
        tableKey: TABLE_KEY,
        tenantId,
        entityId: id,
        row: encrypted,
        plainRow
      });
    }
    const rows = await listActivitiesForEntity(tenantId, input.relatedEntityKind, input.relatedEntityId);
    return rows.find((a) => a.id === id);
  }
  const db = pgDb();
  const encrypted = await encryptActivityFields(tenantId, plainRow);
  const inserted = await db
    .insert(pg.crmActivities)
    .values({
      tenantId,
      activityType: input.activityType,
      title: String(encrypted.title ?? titleStored),
      description: (encrypted.description as string | null) ?? descriptionStored,
      relatedEntityId: input.relatedEntityId,
      relatedEntityKind: input.relatedEntityKind,
      scheduledAt: input.scheduledAt ?? null,
      direction: input.direction?.trim() || null,
      createdAt: now
    })
    .returning({ id: pg.crmActivities.id });
  const insertedId = inserted[0]!.id;
  const middleware = getFieldEncryptionMiddleware();
  if (middleware?.hasSearchIndex()) {
    await middleware.syncSearchTokensForRow({
      tableKey: TABLE_KEY,
      tenantId,
      entityId: insertedId,
      row: encrypted,
      plainRow
    });
  }
  const rows = await listActivitiesForEntity(tenantId, input.relatedEntityKind, input.relatedEntityId);
  return rows.find((a) => a.id === insertedId);
};
