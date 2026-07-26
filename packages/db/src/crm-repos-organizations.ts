/**
 * CRM organizations — list, read, insert, update, delete.
 */

import { randomUUID } from "node:crypto";
import { and, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";

import type { CrmAddressEntry, CrmChannelEntry } from "@starter/shared";

import {
  deleteSearchTokensForEntity,
  findEntityIdsByMultiFieldContains,
  getFieldEncryptionMiddleware
} from "./field-encryption/index.js";
import * as pg from "./pg-schema.js";
import { dialectFromEnv, mysqlDb, pgDb } from "./crm-repos-db.js";
import {
  mergeAddressesForPatch,
  mergeOrgChannelsForPatch,
  parseAddressesJson,
  parseChannelsJson,
  resolveAddressesInsert,
  resolveOrgChannelsInsert
} from "./crm-repos-field-helpers.js";
import {
  assertValidOrganizationMarketSegmentAssignment,
  normalizeOrganizationMarketSegmentIds
} from "./crm-repos-organization-segments.js";
import {
  assertValidOrganizationMarketingTagIds,
  setOrganizationMarketingTags
} from "./crm-repos-organization-marketing-tags.js";
import { adjustRelationshipTypeUsageCountBy } from "./crm-repos-relationship-type-usage.js";
import { escapeLike } from "./crm-repos-query-helpers.js";
import * as mysql from "./mysql-schema.js";

export type CrmOrganizationRow = {
  id: string;
  tenantId: string;
  name: string;
  email: string | null;
  phone: string | null;
  emails: CrmChannelEntry[];
  phones: CrmChannelEntry[];
  addresses: CrmAddressEntry[];
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  marketSegmentLayer1Id: string | null;
  marketSegmentLayer2Id: string | null;
  marketSegmentLayer3Id: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CrmOrganizationListFilters = {
  q?: string;
  page: number;
  pageSize: number;
  marketSegmentLayer1Id?: string;
  marketSegmentLayer2Id?: string;
  marketSegmentLayer3Id?: string;
  marketingTagIds?: string[];
};

const TABLE_KEY = "crm_organizations";

type OrgDbRow = typeof pg.crmOrganizations.$inferSelect | typeof mysql.crmOrganizations.$inferSelect;

const mapPlainOrgRow = (row: {
  id: string;
  tenantId: string;
  name: string;
  email: string | null;
  phone: string | null;
  emailsJson: string;
  phonesJson: string;
  addressesJson: string;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  marketSegmentLayer1Id: string | null;
  marketSegmentLayer2Id: string | null;
  marketSegmentLayer3Id: string | null;
  createdAt: Date;
  updatedAt: Date;
}): CrmOrganizationRow => ({
  id: row.id,
  tenantId: row.tenantId,
  name: row.name,
  email: row.email,
  phone: row.phone,
  emails: parseChannelsJson(row.emailsJson),
  phones: parseChannelsJson(row.phonesJson),
  addresses: parseAddressesJson(row.addressesJson),
  addressLine1: row.addressLine1,
  addressLine2: row.addressLine2,
  postalCode: row.postalCode,
  city: row.city,
  state: row.state,
  country: row.country,
  marketSegmentLayer1Id: row.marketSegmentLayer1Id,
  marketSegmentLayer2Id: row.marketSegmentLayer2Id,
  marketSegmentLayer3Id: row.marketSegmentLayer3Id,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
});

const decryptOrgRow = async (tenantId: string, row: OrgDbRow): Promise<CrmOrganizationRow> => {
  const middleware = getFieldEncryptionMiddleware();
  if (!middleware) return mapPlainOrgRow(row);
  const plain = await middleware.decryptForRead({
    tableKey: TABLE_KEY,
    tenantId,
    row: row as unknown as Record<string, unknown>
  });
  return mapPlainOrgRow(plain as OrgDbRow);
};

const encryptOrgFields = async (
  tenantId: string,
  row: Record<string, unknown>,
  opts?: { changedFields?: Set<string>; entityId?: string }
): Promise<Record<string, unknown>> => {
  const middleware = getFieldEncryptionMiddleware();
  if (!middleware) return row;
  return middleware.encryptForWrite({
    tableKey: TABLE_KEY,
    tenantId,
    row,
    changedFields: opts?.changedFields,
    entityId: opts?.entityId
  });
};

const buildOrgListFilters = (tenantId: string, opts: CrmOrganizationListFilters) => {
  const q = opts.q?.trim() ?? "";
  const seg1 = opts.marketSegmentLayer1Id?.trim() || null;
  const seg2 = opts.marketSegmentLayer2Id?.trim() || null;
  const seg3 = opts.marketSegmentLayer3Id?.trim() || null;
  const tagIds = [...new Set((opts.marketingTagIds ?? []).map((id) => id.trim()).filter(Boolean))];
  return { q, seg1, seg2, seg3, tagIds, tenantId };
};

export const listOrganizations = async (
  tenantId: string,
  opts: CrmOrganizationListFilters
): Promise<{ rows: CrmOrganizationRow[]; total: number }> => {
  const { q, seg1, seg2, seg3, tagIds } = buildOrgListFilters(tenantId, opts);
  const offset = (opts.page - 1) * opts.pageSize;
  const middleware = getFieldEncryptionMiddleware();

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    let base = eq(mysql.crmOrganizations.tenantId, tenantId);
    if (seg1) base = and(base, eq(mysql.crmOrganizations.marketSegmentLayer1Id, seg1))!;
    if (seg2) base = and(base, eq(mysql.crmOrganizations.marketSegmentLayer2Id, seg2))!;
    if (seg3) base = and(base, eq(mysql.crmOrganizations.marketSegmentLayer3Id, seg3))!;
    for (const tagId of tagIds) {
      base = and(
        base,
        sql`EXISTS (SELECT 1 FROM crm_organization_marketing_tag_links l WHERE l.organization_id = ${mysql.crmOrganizations.id} AND l.tag_id = ${tagId})`
      )!;
    }
    let whereClause = base;
    if (q.length > 0) {
      if (middleware?.hasSearchIndex()) {
        const ids = await findEntityIdsByMultiFieldContains(
          tenantId,
          tenantId,
          TABLE_KEY,
          q,
          middleware.getSearchKeyB64()!,
          middleware.getNgramSize()
        );
        if (ids.length === 0) return { rows: [], total: 0 };
        whereClause = and(base, inArray(mysql.crmOrganizations.id, ids))!;
      } else {
        whereClause = and(
          base,
          or(
            sql`LOWER(${mysql.crmOrganizations.name}) LIKE LOWER(${"%" + escapeLike(q) + "%"})`,
            sql`LOWER(COALESCE(${mysql.crmOrganizations.email},'')) LIKE LOWER(${"%" + escapeLike(q) + "%"})`,
            sql`LOWER(COALESCE(${mysql.crmOrganizations.phone},'')) LIKE LOWER(${"%" + escapeLike(q) + "%"})`,
            sql`LOWER(COALESCE(${mysql.crmOrganizations.city},'')) LIKE LOWER(${"%" + escapeLike(q) + "%"})`,
            sql`LOWER(COALESCE(${mysql.crmOrganizations.country},'')) LIKE LOWER(${"%" + escapeLike(q) + "%"})`
          )!
        )!;
      }
    }
    const totalRows = await db.select({ n: count() }).from(mysql.crmOrganizations).where(whereClause);
    const total = Number(totalRows[0]?.n ?? 0);
    const rows = await db
      .select()
      .from(mysql.crmOrganizations)
      .where(whereClause)
      .orderBy(desc(mysql.crmOrganizations.updatedAt))
      .limit(opts.pageSize)
      .offset(offset);
    return { rows: await Promise.all(rows.map((r) => decryptOrgRow(tenantId, r))), total };
  }

  const db = pgDb();
  let base = eq(pg.crmOrganizations.tenantId, tenantId);
  if (seg1) base = and(base, eq(pg.crmOrganizations.marketSegmentLayer1Id, seg1))!;
  if (seg2) base = and(base, eq(pg.crmOrganizations.marketSegmentLayer2Id, seg2))!;
  if (seg3) base = and(base, eq(pg.crmOrganizations.marketSegmentLayer3Id, seg3))!;
  for (const tagId of tagIds) {
    base = and(
      base,
      sql`EXISTS (SELECT 1 FROM crm_organization_marketing_tag_links l WHERE l.organization_id = ${pg.crmOrganizations.id} AND l.tag_id = ${tagId}::uuid)`
    )!;
  }
  let whereClause = base;
  if (q.length > 0) {
    if (middleware?.hasSearchIndex()) {
      const ids = await findEntityIdsByMultiFieldContains(
        tenantId,
        tenantId,
        TABLE_KEY,
        q,
        middleware.getSearchKeyB64()!,
        middleware.getNgramSize()
      );
      if (ids.length === 0) return { rows: [], total: 0 };
      whereClause = and(base, inArray(pg.crmOrganizations.id, ids))!;
    } else {
      const t = `%${escapeLike(q)}%`;
      whereClause = and(
        base,
        or(
          ilike(pg.crmOrganizations.name, t),
          ilike(pg.crmOrganizations.email, t),
          ilike(pg.crmOrganizations.phone, t),
          ilike(pg.crmOrganizations.city, t),
          ilike(pg.crmOrganizations.country, t)
        )!
      )!;
    }
  }
  const totalRows = await db.select({ n: count() }).from(pg.crmOrganizations).where(whereClause);
  const total = Number(totalRows[0]?.n ?? 0);
  const rows = await db
    .select()
    .from(pg.crmOrganizations)
    .where(whereClause)
    .orderBy(desc(pg.crmOrganizations.updatedAt))
    .limit(opts.pageSize)
    .offset(offset);
  return { rows: await Promise.all(rows.map((r) => decryptOrgRow(tenantId, r))), total };
};

export const getOrganizationById = async (
  tenantId: string,
  id: string
): Promise<CrmOrganizationRow | undefined> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select()
      .from(mysql.crmOrganizations)
      .where(and(eq(mysql.crmOrganizations.tenantId, tenantId), eq(mysql.crmOrganizations.id, id)))
      .limit(1);
    return rows[0] ? decryptOrgRow(tenantId, rows[0]) : undefined;
  }
  const db = pgDb();
  const rows = await db
    .select()
    .from(pg.crmOrganizations)
    .where(and(eq(pg.crmOrganizations.tenantId, tenantId), eq(pg.crmOrganizations.id, id)))
    .limit(1);
  return rows[0] ? decryptOrgRow(tenantId, rows[0]) : undefined;
};

export const insertOrganization = async (
  tenantId: string,
  input: {
    name: string;
    email?: string | null;
    phone?: string | null;
    emails?: CrmChannelEntry[];
    phones?: CrmChannelEntry[];
    addresses?: CrmAddressEntry[];
    addressLine1?: string | null;
    addressLine2?: string | null;
    postalCode?: string | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
    marketSegmentLayer1Id?: string | null;
    marketSegmentLayer2Id?: string | null;
    marketSegmentLayer3Id?: string | null;
    marketingTagIds?: string[];
  }
): Promise<CrmOrganizationRow> => {
  const now = new Date();
  const ch = resolveOrgChannelsInsert(input);
  const addr = resolveAddressesInsert(input);
  const segments = normalizeOrganizationMarketSegmentIds(
    input.marketSegmentLayer1Id,
    input.marketSegmentLayer2Id,
    input.marketSegmentLayer3Id
  );
  await assertValidOrganizationMarketSegmentAssignment(
    tenantId,
    segments.layer1Id,
    segments.layer2Id,
    segments.layer3Id
  );
  const marketingTagIds = input.marketingTagIds ?? [];
  await assertValidOrganizationMarketingTagIds(tenantId, marketingTagIds);
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const id = randomUUID();
    const plainRow = {
      tenantId,
      name: input.name,
      email: ch.email,
      phone: ch.phone,
      emailsJson: ch.emailsJson,
      phonesJson: ch.phonesJson,
      addressesJson: addr.addressesJson,
      addressLine1: addr.addressLine1,
      addressLine2: addr.addressLine2,
      postalCode: addr.postalCode,
      city: addr.city,
      state: addr.state,
      country: addr.country
    };
    const encrypted = await encryptOrgFields(tenantId, plainRow, { entityId: id });
    await db.insert(mysql.crmOrganizations).values({
      id,
      tenantId,
      name: String(encrypted.name ?? input.name),
      email: (encrypted.email as string | null) ?? null,
      phone: (encrypted.phone as string | null) ?? null,
      emailsJson: String(encrypted.emailsJson ?? ch.emailsJson),
      phonesJson: String(encrypted.phonesJson ?? ch.phonesJson),
      addressesJson: String(encrypted.addressesJson ?? addr.addressesJson),
      addressLine1: (encrypted.addressLine1 as string | null) ?? null,
      addressLine2: (encrypted.addressLine2 as string | null) ?? null,
      postalCode: (encrypted.postalCode as string | null) ?? null,
      city: (encrypted.city as string | null) ?? null,
      state: (encrypted.state as string | null) ?? null,
      country: (encrypted.country as string | null) ?? null,
      marketSegmentLayer1Id: segments.layer1Id,
      marketSegmentLayer2Id: segments.layer2Id,
      marketSegmentLayer3Id: segments.layer3Id,
      createdAt: now,
      updatedAt: now
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
    await setOrganizationMarketingTags(tenantId, id, marketingTagIds);
    const row = await getOrganizationById(tenantId, id);
    if (!row) throw new Error("insertOrganization failed");
    return row;
  }
  const db = pgDb();
  const plainRow = {
    tenantId,
    name: input.name,
    email: ch.email,
    phone: ch.phone,
    emailsJson: ch.emailsJson,
    phonesJson: ch.phonesJson,
    addressesJson: addr.addressesJson,
    addressLine1: addr.addressLine1,
    addressLine2: addr.addressLine2,
    postalCode: addr.postalCode,
    city: addr.city,
    state: addr.state,
    country: addr.country
  };
  const encrypted = await encryptOrgFields(tenantId, plainRow);
  const inserted = await db
    .insert(pg.crmOrganizations)
    .values({
      tenantId,
      name: String(encrypted.name ?? input.name),
      email: (encrypted.email as string | null) ?? null,
      phone: (encrypted.phone as string | null) ?? null,
      emailsJson: String(encrypted.emailsJson ?? ch.emailsJson),
      phonesJson: String(encrypted.phonesJson ?? ch.phonesJson),
      addressesJson: String(encrypted.addressesJson ?? addr.addressesJson),
      addressLine1: (encrypted.addressLine1 as string | null) ?? null,
      addressLine2: (encrypted.addressLine2 as string | null) ?? null,
      postalCode: (encrypted.postalCode as string | null) ?? null,
      city: (encrypted.city as string | null) ?? null,
      state: (encrypted.state as string | null) ?? null,
      country: (encrypted.country as string | null) ?? null,
      marketSegmentLayer1Id: segments.layer1Id,
      marketSegmentLayer2Id: segments.layer2Id,
      marketSegmentLayer3Id: segments.layer3Id,
      createdAt: now,
      updatedAt: now
    })
    .returning({ id: pg.crmOrganizations.id });
  const newId = inserted[0]!.id;
  const middleware = getFieldEncryptionMiddleware();
  if (middleware?.hasSearchIndex()) {
    await middleware.syncSearchTokensForRow({
      tableKey: TABLE_KEY,
      tenantId,
      entityId: newId,
      row: encrypted,
      plainRow
    });
  }
  await setOrganizationMarketingTags(tenantId, inserted[0]!.id, marketingTagIds);
  const row = await getOrganizationById(tenantId, newId);
  if (!row) throw new Error("insertOrganization failed");
  return row;
};

export const updateOrganization = async (
  tenantId: string,
  id: string,
  patch: Partial<{
    name: string;
    email: string | null;
    phone: string | null;
    emails?: CrmChannelEntry[];
    phones?: CrmChannelEntry[];
    addresses?: CrmAddressEntry[];
    addressLine1: string | null;
    addressLine2: string | null;
    postalCode: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    marketSegmentLayer1Id: string | null;
    marketSegmentLayer2Id: string | null;
    marketSegmentLayer3Id: string | null;
    marketingTagIds: string[];
  }>
): Promise<CrmOrganizationRow | undefined> => {
  const now = new Date();
  const existing = await getOrganizationById(tenantId, id);
  const channelMerge = mergeOrgChannelsForPatch(existing, patch);
  const addrMerge = mergeAddressesForPatch(existing, patch);

  const segmentTouched =
    patch.marketSegmentLayer1Id !== undefined ||
    patch.marketSegmentLayer2Id !== undefined ||
    patch.marketSegmentLayer3Id !== undefined;
  let nextSegments = {
    layer1Id: existing?.marketSegmentLayer1Id ?? null,
    layer2Id: existing?.marketSegmentLayer2Id ?? null,
    layer3Id: existing?.marketSegmentLayer3Id ?? null
  };
  if (segmentTouched) {
    nextSegments = normalizeOrganizationMarketSegmentIds(
      patch.marketSegmentLayer1Id !== undefined ? patch.marketSegmentLayer1Id : existing?.marketSegmentLayer1Id,
      patch.marketSegmentLayer2Id !== undefined ? patch.marketSegmentLayer2Id : existing?.marketSegmentLayer2Id,
      patch.marketSegmentLayer3Id !== undefined ? patch.marketSegmentLayer3Id : existing?.marketSegmentLayer3Id
    );
    await assertValidOrganizationMarketSegmentAssignment(
      tenantId,
      nextSegments.layer1Id,
      nextSegments.layer2Id,
      nextSegments.layer3Id
    );
  }

  const setPayload: Record<string, unknown> = { updatedAt: now };
  if (patch.name !== undefined) setPayload.name = patch.name;
  if (segmentTouched) {
    setPayload.marketSegmentLayer1Id = nextSegments.layer1Id;
    setPayload.marketSegmentLayer2Id = nextSegments.layer2Id;
    setPayload.marketSegmentLayer3Id = nextSegments.layer3Id;
  }
  if (!addrMerge) {
    if (patch.addressLine1 !== undefined) setPayload.addressLine1 = patch.addressLine1;
    if (patch.addressLine2 !== undefined) setPayload.addressLine2 = patch.addressLine2;
    if (patch.postalCode !== undefined) setPayload.postalCode = patch.postalCode;
    if (patch.city !== undefined) setPayload.city = patch.city;
    if (patch.state !== undefined) setPayload.state = patch.state;
    if (patch.country !== undefined) setPayload.country = patch.country;
  }
  if (channelMerge) {
    setPayload.emailsJson = channelMerge.emailsJson;
    setPayload.phonesJson = channelMerge.phonesJson;
    setPayload.email = channelMerge.email;
    setPayload.phone = channelMerge.phone;
  }
  if (addrMerge) {
    setPayload.addressesJson = addrMerge.addressesJson;
    setPayload.addressLine1 = addrMerge.addressLine1;
    setPayload.addressLine2 = addrMerge.addressLine2;
    setPayload.postalCode = addrMerge.postalCode;
    setPayload.city = addrMerge.city;
    setPayload.state = addrMerge.state;
    setPayload.country = addrMerge.country;
  }

  if (patch.marketingTagIds !== undefined) {
    await assertValidOrganizationMarketingTagIds(tenantId, patch.marketingTagIds);
  }

  const changedFields = new Set(
    Object.keys(setPayload).filter((k) => k !== "updatedAt" && !k.startsWith("marketSegmentLayer"))
  );
  if (changedFields.size > 0) {
    const encrypted = await encryptOrgFields(tenantId, setPayload, { changedFields, entityId: id });
    for (const key of changedFields) {
      if (key in encrypted) setPayload[key] = encrypted[key];
    }
    const middleware = getFieldEncryptionMiddleware();
    if (middleware?.hasSearchIndex()) {
      await middleware.syncSearchTokensForRow({
        tableKey: TABLE_KEY,
        tenantId,
        entityId: id,
        row: setPayload,
        plainRow: setPayload,
        changedFields
      });
    }
  }

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db
      .update(mysql.crmOrganizations)
      .set(setPayload as Record<string, unknown> & { updatedAt: Date })
      .where(and(eq(mysql.crmOrganizations.tenantId, tenantId), eq(mysql.crmOrganizations.id, id)));
    if (patch.marketingTagIds !== undefined) {
      await setOrganizationMarketingTags(tenantId, id, patch.marketingTagIds);
    }
    return getOrganizationById(tenantId, id);
  }
  const db = pgDb();
  await db
    .update(pg.crmOrganizations)
    .set(setPayload as Record<string, unknown> & { updatedAt: Date })
    .where(and(eq(pg.crmOrganizations.tenantId, tenantId), eq(pg.crmOrganizations.id, id)));
  if (patch.marketingTagIds !== undefined) {
    await setOrganizationMarketingTags(tenantId, id, patch.marketingTagIds);
  }
  return getOrganizationById(tenantId, id);
};

export const deleteOrganization = async (tenantId: string, id: string): Promise<boolean> => {
  const existing = await getOrganizationById(tenantId, id);
  if (!existing) return false;

  await deleteSearchTokensForEntity(tenantId, TABLE_KEY, id);

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db
      .delete(mysql.crmActivities)
      .where(
        and(
          eq(mysql.crmActivities.tenantId, tenantId),
          eq(mysql.crmActivities.relatedEntityKind, "ORGANIZATION"),
          eq(mysql.crmActivities.relatedEntityId, id)
        )
      );
    const orgRelWhere = and(
      eq(mysql.crmRelationships.tenantId, tenantId),
      or(
        and(eq(mysql.crmRelationships.sourceEntityKind, "ORGANIZATION"), eq(mysql.crmRelationships.sourceId, id)),
        and(eq(mysql.crmRelationships.targetEntityKind, "ORGANIZATION"), eq(mysql.crmRelationships.targetId, id))
      )!
    );
    const orgRelRows = await db
      .select({ tid: mysql.crmRelationships.relationshipTypeId })
      .from(mysql.crmRelationships)
      .where(orgRelWhere);
    const orgRelDec = new Map<string, number>();
    for (const r of orgRelRows) orgRelDec.set(r.tid, (orgRelDec.get(r.tid) ?? 0) + 1);
    await db.delete(mysql.crmRelationships).where(orgRelWhere);
    for (const [tid, n] of orgRelDec) await adjustRelationshipTypeUsageCountBy(tenantId, tid, -n);
    await db
      .delete(mysql.crmOrganizations)
      .where(and(eq(mysql.crmOrganizations.tenantId, tenantId), eq(mysql.crmOrganizations.id, id)));
    return true;
  }

  const db = pgDb();
  await db
    .delete(pg.crmActivities)
    .where(
      and(
        eq(pg.crmActivities.tenantId, tenantId),
        eq(pg.crmActivities.relatedEntityKind, "ORGANIZATION"),
        eq(pg.crmActivities.relatedEntityId, id)
      )
    );
  const orgRelWherePg = and(
    eq(pg.crmRelationships.tenantId, tenantId),
    or(
      and(eq(pg.crmRelationships.sourceEntityKind, "ORGANIZATION"), eq(pg.crmRelationships.sourceId, id)),
      and(eq(pg.crmRelationships.targetEntityKind, "ORGANIZATION"), eq(pg.crmRelationships.targetId, id))
    )!
  );
  const orgRelRowsPg = await db
    .select({ tid: pg.crmRelationships.relationshipTypeId })
    .from(pg.crmRelationships)
    .where(orgRelWherePg);
  const orgRelDecPg = new Map<string, number>();
  for (const r of orgRelRowsPg) orgRelDecPg.set(r.tid, (orgRelDecPg.get(r.tid) ?? 0) + 1);
  await db.delete(pg.crmRelationships).where(orgRelWherePg);
  for (const [tid, n] of orgRelDecPg) await adjustRelationshipTypeUsageCountBy(tenantId, tid, -n);
  await db
    .delete(pg.crmOrganizations)
    .where(and(eq(pg.crmOrganizations.tenantId, tenantId), eq(pg.crmOrganizations.id, id)));
  return true;
};
