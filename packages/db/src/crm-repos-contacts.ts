/**
 * CRM contacts — list, read, insert, update, delete.
 */

import { randomUUID } from "node:crypto";
import { and, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";

import type { CrmAddressEntry, CrmChannelEntry } from "@starter/shared";

import {
  deleteSearchTokensForEntity,
  findEntityIdsByMultiFieldContains,
  getFieldEncryptionMiddleware
} from "./field-encryption/index.js";
import * as mysql from "./mysql-schema.js";
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
import { adjustRelationshipTypeUsageCountBy } from "./crm-repos-relationship-type-usage.js";
import { escapeLike } from "./crm-repos-query-helpers.js";

const TABLE_KEY = "crm_contacts";

export type CrmContactRow = {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  salutation: string | null;
  title: string | null;
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
  photoRelPath: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type ContactDbRow =
  | typeof pg.crmContacts.$inferSelect
  | typeof mysql.crmContacts.$inferSelect;

const mapPlainContactRow = (row: ContactDbRow): CrmContactRow => ({
  id: row.id,
  tenantId: row.tenantId,
  firstName: row.firstName,
  lastName: row.lastName,
  salutation: row.salutation,
  title: row.title,
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
  photoRelPath: row.photoRelPath ?? null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
});

const decryptContactRow = async (tenantId: string, row: ContactDbRow): Promise<CrmContactRow> => {
  const middleware = getFieldEncryptionMiddleware();
  if (!middleware) return mapPlainContactRow(row);
  const plain = await middleware.decryptForRead({
    tableKey: TABLE_KEY,
    tenantId,
    row: row as unknown as Record<string, unknown>
  });
  return mapPlainContactRow(plain as ContactDbRow);
};

const encryptContactFields = async (
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

export const listContacts = async (
  tenantId: string,
  opts: { q?: string; page: number; pageSize: number }
): Promise<{ rows: CrmContactRow[]; total: number }> => {
  const q = opts.q?.trim() ?? "";
  const offset = (opts.page - 1) * opts.pageSize;
  const middleware = getFieldEncryptionMiddleware();

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const base = eq(mysql.crmContacts.tenantId, tenantId);
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
        whereClause = and(base, inArray(mysql.crmContacts.id, ids))!;
      } else {
        const pat = "%" + escapeLike(q) + "%";
        whereClause = and(
          base,
          or(
            sql`LOWER(CONCAT(${mysql.crmContacts.firstName},' ',${mysql.crmContacts.lastName})) LIKE LOWER(${pat})`,
            sql`LOWER(${mysql.crmContacts.firstName}) LIKE LOWER(${pat})`,
            sql`LOWER(${mysql.crmContacts.lastName}) LIKE LOWER(${pat})`,
            sql`LOWER(COALESCE(${mysql.crmContacts.email},'')) LIKE LOWER(${pat})`,
            sql`LOWER(COALESCE(${mysql.crmContacts.phone},'')) LIKE LOWER(${pat})`,
            sql`LOWER(COALESCE(${mysql.crmContacts.city},'')) LIKE LOWER(${pat})`,
            sql`LOWER(COALESCE(${mysql.crmContacts.country},'')) LIKE LOWER(${pat})`,
            sql`LOWER(COALESCE(${mysql.crmContacts.salutation},'')) LIKE LOWER(${pat})`,
            sql`LOWER(COALESCE(${mysql.crmContacts.title},'')) LIKE LOWER(${pat})`
          )!
        )!;
      }
    }

    const totalRows = await db.select({ n: count() }).from(mysql.crmContacts).where(whereClause);
    const total = Number(totalRows[0]?.n ?? 0);
    const rows = await db
      .select()
      .from(mysql.crmContacts)
      .where(whereClause)
      .orderBy(desc(mysql.crmContacts.updatedAt))
      .limit(opts.pageSize)
      .offset(offset);
    return { rows: await Promise.all(rows.map((r) => decryptContactRow(tenantId, r))), total };
  }

  const db = pgDb();
  const base = eq(pg.crmContacts.tenantId, tenantId);
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
      whereClause = and(base, inArray(pg.crmContacts.id, ids))!;
    } else {
      const t = `%${escapeLike(q)}%`;
      whereClause = and(
        base,
        or(
          ilike(pg.crmContacts.firstName, t),
          ilike(pg.crmContacts.lastName, t),
          ilike(pg.crmContacts.email, t),
          ilike(pg.crmContacts.phone, t),
          ilike(pg.crmContacts.city, t),
          ilike(pg.crmContacts.country, t),
          ilike(pg.crmContacts.salutation, t),
          ilike(pg.crmContacts.title, t),
          sql`${pg.crmContacts.firstName} || ' ' || ${pg.crmContacts.lastName} ILIKE ${t}`
        )!
      )!;
    }
  }

  const totalRows = await db.select({ n: count() }).from(pg.crmContacts).where(whereClause);
  const total = Number(totalRows[0]?.n ?? 0);
  const rows = await db
    .select()
    .from(pg.crmContacts)
    .where(whereClause)
    .orderBy(desc(pg.crmContacts.updatedAt))
    .limit(opts.pageSize)
    .offset(offset);
  return { rows: await Promise.all(rows.map((r) => decryptContactRow(tenantId, r))), total };
};

export const getContactById = async (tenantId: string, id: string): Promise<CrmContactRow | undefined> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select()
      .from(mysql.crmContacts)
      .where(and(eq(mysql.crmContacts.tenantId, tenantId), eq(mysql.crmContacts.id, id)))
      .limit(1);
    return rows[0] ? decryptContactRow(tenantId, rows[0]) : undefined;
  }
  const db = pgDb();
  const rows = await db
    .select()
    .from(pg.crmContacts)
    .where(and(eq(pg.crmContacts.tenantId, tenantId), eq(pg.crmContacts.id, id)))
    .limit(1);
  return rows[0] ? decryptContactRow(tenantId, rows[0]) : undefined;
};

export const insertContact = async (
  tenantId: string,
  input: {
    firstName: string;
    lastName: string;
    salutation?: string | null;
    title?: string | null;
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
  }
): Promise<CrmContactRow> => {
  const now = new Date();
  const ch = resolveOrgChannelsInsert(input);
  const addr = resolveAddressesInsert(input);
  const plainRow: Record<string, unknown> = {
    firstName: input.firstName,
    lastName: input.lastName,
    salutation: input.salutation ?? null,
    title: input.title ?? null,
    email: ch.email,
    phone: ch.phone,
    addressLine1: addr.addressLine1,
    addressLine2: addr.addressLine2,
    postalCode: addr.postalCode,
    city: addr.city,
    state: addr.state,
    country: addr.country
  };

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const id = randomUUID();
    const encrypted = await encryptContactFields(tenantId, plainRow, { entityId: id });
    await db.insert(mysql.crmContacts).values({
      id,
      tenantId,
      firstName: String(encrypted.firstName ?? input.firstName),
      lastName: String(encrypted.lastName ?? input.lastName),
      salutation: (encrypted.salutation as string | null) ?? null,
      title: (encrypted.title as string | null) ?? null,
      email: (encrypted.email as string | null) ?? null,
      phone: (encrypted.phone as string | null) ?? null,
      emailsJson: ch.emailsJson,
      phonesJson: ch.phonesJson,
      addressesJson: addr.addressesJson,
      addressLine1: (encrypted.addressLine1 as string | null) ?? null,
      addressLine2: (encrypted.addressLine2 as string | null) ?? null,
      postalCode: (encrypted.postalCode as string | null) ?? null,
      city: (encrypted.city as string | null) ?? null,
      state: (encrypted.state as string | null) ?? null,
      country: (encrypted.country as string | null) ?? null,
      createdAt: now,
      updatedAt: now
    });
    const row = await getContactById(tenantId, id);
    if (!row) throw new Error("insertContact failed");
    return row;
  }

  const db = pgDb();
  const encrypted = await encryptContactFields(tenantId, plainRow);
  const inserted = await db
    .insert(pg.crmContacts)
    .values({
      tenantId,
      firstName: String(encrypted.firstName ?? input.firstName),
      lastName: String(encrypted.lastName ?? input.lastName),
      salutation: (encrypted.salutation as string | null) ?? null,
      title: (encrypted.title as string | null) ?? null,
      email: (encrypted.email as string | null) ?? null,
      phone: (encrypted.phone as string | null) ?? null,
      emailsJson: ch.emailsJson,
      phonesJson: ch.phonesJson,
      addressesJson: addr.addressesJson,
      addressLine1: (encrypted.addressLine1 as string | null) ?? null,
      addressLine2: (encrypted.addressLine2 as string | null) ?? null,
      postalCode: (encrypted.postalCode as string | null) ?? null,
      city: (encrypted.city as string | null) ?? null,
      state: (encrypted.state as string | null) ?? null,
      country: (encrypted.country as string | null) ?? null,
      createdAt: now,
      updatedAt: now
    })
    .returning({ id: pg.crmContacts.id });
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
  const row = await getContactById(tenantId, newId);
  if (!row) throw new Error("insertContact failed");
  return row;
};

export const updateContact = async (
  tenantId: string,
  id: string,
  patch: Partial<{
    firstName: string;
    lastName: string;
    salutation: string | null;
    title: string | null;
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
  }>
): Promise<CrmContactRow | undefined> => {
  const now = new Date();
  const existing = await getContactById(tenantId, id);
  const channelMerge = mergeOrgChannelsForPatch(existing, patch);
  const addrMerge = mergeAddressesForPatch(existing, patch);

  const setPayload: Record<string, unknown> = { updatedAt: now };
  const changedFields = new Set<string>();

  if (patch.firstName !== undefined) {
    setPayload.firstName = patch.firstName;
    changedFields.add("firstName");
  }
  if (patch.lastName !== undefined) {
    setPayload.lastName = patch.lastName;
    changedFields.add("lastName");
  }
  if (patch.salutation !== undefined) {
    setPayload.salutation = patch.salutation;
    changedFields.add("salutation");
  }
  if (patch.title !== undefined) {
    setPayload.title = patch.title;
    changedFields.add("title");
  }
  if (!addrMerge) {
    if (patch.addressLine1 !== undefined) {
      setPayload.addressLine1 = patch.addressLine1;
      changedFields.add("addressLine1");
    }
    if (patch.addressLine2 !== undefined) {
      setPayload.addressLine2 = patch.addressLine2;
      changedFields.add("addressLine2");
    }
    if (patch.postalCode !== undefined) {
      setPayload.postalCode = patch.postalCode;
      changedFields.add("postalCode");
    }
    if (patch.city !== undefined) {
      setPayload.city = patch.city;
      changedFields.add("city");
    }
    if (patch.state !== undefined) {
      setPayload.state = patch.state;
      changedFields.add("state");
    }
    if (patch.country !== undefined) {
      setPayload.country = patch.country;
      changedFields.add("country");
    }
  }
  if (channelMerge) {
    setPayload.emailsJson = channelMerge.emailsJson;
    setPayload.phonesJson = channelMerge.phonesJson;
    setPayload.email = channelMerge.email;
    setPayload.phone = channelMerge.phone;
    changedFields.add("email");
    changedFields.add("phone");
  }
  if (addrMerge) {
    setPayload.addressesJson = addrMerge.addressesJson;
    setPayload.addressLine1 = addrMerge.addressLine1;
    setPayload.addressLine2 = addrMerge.addressLine2;
    setPayload.postalCode = addrMerge.postalCode;
    setPayload.city = addrMerge.city;
    setPayload.state = addrMerge.state;
    setPayload.country = addrMerge.country;
    changedFields.add("addressLine1");
    changedFields.add("addressLine2");
    changedFields.add("postalCode");
    changedFields.add("city");
    changedFields.add("state");
    changedFields.add("country");
  }

  const plainPatch = { ...setPayload };
  delete plainPatch.updatedAt;
  const encryptedPatch =
    changedFields.size > 0
      ? await encryptContactFields(tenantId, plainPatch, { changedFields, entityId: id })
      : {};

  const dbPayload: Record<string, unknown> = { updatedAt: now };
  for (const key of Object.keys(plainPatch)) {
    dbPayload[key] = key in encryptedPatch ? encryptedPatch[key] : plainPatch[key];
  }

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db
      .update(mysql.crmContacts)
      .set(dbPayload as Record<string, unknown> & { updatedAt: Date })
      .where(and(eq(mysql.crmContacts.tenantId, tenantId), eq(mysql.crmContacts.id, id)));
    return getContactById(tenantId, id);
  }
  const db = pgDb();
  await db
    .update(pg.crmContacts)
    .set(dbPayload as Record<string, unknown> & { updatedAt: Date })
    .where(and(eq(pg.crmContacts.tenantId, tenantId), eq(pg.crmContacts.id, id)));
  return getContactById(tenantId, id);
};

export const setContactPhotoRelPath = async (
  tenantId: string,
  id: string,
  photoRelPath: string | null
): Promise<CrmContactRow | undefined> => {
  const now = new Date();
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db
      .update(mysql.crmContacts)
      .set({ photoRelPath, updatedAt: now })
      .where(and(eq(mysql.crmContacts.tenantId, tenantId), eq(mysql.crmContacts.id, id)));
    return getContactById(tenantId, id);
  }
  const db = pgDb();
  await db
    .update(pg.crmContacts)
    .set({ photoRelPath, updatedAt: now })
    .where(and(eq(pg.crmContacts.tenantId, tenantId), eq(pg.crmContacts.id, id)));
  return getContactById(tenantId, id);
};

export const deleteContact = async (tenantId: string, id: string): Promise<boolean> => {
  const existing = await getContactById(tenantId, id);
  if (!existing) return false;

  await deleteSearchTokensForEntity(tenantId, TABLE_KEY, id);

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db
      .delete(mysql.crmActivities)
      .where(
        and(
          eq(mysql.crmActivities.tenantId, tenantId),
          eq(mysql.crmActivities.relatedEntityKind, "CONTACT"),
          eq(mysql.crmActivities.relatedEntityId, id)
        )
      );
    const contactRelWhere = and(
      eq(mysql.crmRelationships.tenantId, tenantId),
      or(
        and(eq(mysql.crmRelationships.sourceEntityKind, "CONTACT"), eq(mysql.crmRelationships.sourceId, id)),
        and(eq(mysql.crmRelationships.targetEntityKind, "CONTACT"), eq(mysql.crmRelationships.targetId, id))
      )!
    );
    const contactRelRows = await db
      .select({ tid: mysql.crmRelationships.relationshipTypeId })
      .from(mysql.crmRelationships)
      .where(contactRelWhere);
    const contactRelDec = new Map<string, number>();
    for (const r of contactRelRows) contactRelDec.set(r.tid, (contactRelDec.get(r.tid) ?? 0) + 1);
    await db.delete(mysql.crmRelationships).where(contactRelWhere);
    for (const [tid, n] of contactRelDec) await adjustRelationshipTypeUsageCountBy(tenantId, tid, -n);
    await db
      .delete(mysql.crmContacts)
      .where(and(eq(mysql.crmContacts.tenantId, tenantId), eq(mysql.crmContacts.id, id)));
    return true;
  }

  const db = pgDb();
  await db
    .delete(pg.crmActivities)
    .where(
      and(
        eq(pg.crmActivities.tenantId, tenantId),
        eq(pg.crmActivities.relatedEntityKind, "CONTACT"),
        eq(pg.crmActivities.relatedEntityId, id)
      )
    );
  const contactRelWherePg = and(
    eq(pg.crmRelationships.tenantId, tenantId),
    or(
      and(eq(pg.crmRelationships.sourceEntityKind, "CONTACT"), eq(pg.crmRelationships.sourceId, id)),
      and(eq(pg.crmRelationships.targetEntityKind, "CONTACT"), eq(pg.crmRelationships.targetId, id))
    )!
  );
  const contactRelRowsPg = await db
    .select({ tid: pg.crmRelationships.relationshipTypeId })
    .from(pg.crmRelationships)
    .where(contactRelWherePg);
  const contactRelDecPg = new Map<string, number>();
  for (const r of contactRelRowsPg) contactRelDecPg.set(r.tid, (contactRelDecPg.get(r.tid) ?? 0) + 1);
  await db.delete(pg.crmRelationships).where(contactRelWherePg);
  for (const [tid, n] of contactRelDecPg) await adjustRelationshipTypeUsageCountBy(tenantId, tid, -n);
  await db.delete(pg.crmContacts).where(and(eq(pg.crmContacts.tenantId, tenantId), eq(pg.crmContacts.id, id)));
  return true;
};
