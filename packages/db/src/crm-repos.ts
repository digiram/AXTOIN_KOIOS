/**
 * Tenant-scoped CRM repositories — organizations, contacts, relationships, activities.
 */

import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, gte, ilike, lt, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { alias as mysqlTableAlias } from "drizzle-orm/mysql-core";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { alias as pgTableAlias } from "drizzle-orm/pg-core";

import type { CrmEntityKind } from "@starter/shared";
import { CRM_SYSTEM_RELATIONSHIP_TYPE_DEFINITIONS } from "@starter/shared";

import * as mysql from "./mysql-schema.js";
import * as pg from "./pg-schema.js";
import { dialectFromEnv } from "./schema.js";
import { escapeLike, utcDayAfterInclusiveEnd, utcDayStart } from "./crm-repos-query-helpers.js";
import { mysqlDb, pgDb } from "./crm-repos-db.js";
import { entityExists } from "./crm-repos-entities.js";
import { parseAddressesJson, parseChannelsJson } from "./crm-repos-field-helpers.js";
import { adjustRelationshipTypeUsageCountBy } from "./crm-repos-relationship-type-usage.js";

export { entityExists };
export { parseAddressesJson, parseChannelsJson } from "./crm-repos-field-helpers.js";
export type { CrmOrganizationListFilters, CrmOrganizationRow } from "./crm-repos-organizations.js";
import { getOrganizationById } from "./crm-repos-organizations.js";
export {
  deleteOrganization,
  getOrganizationById,
  insertOrganization,
  listOrganizations,
  updateOrganization
} from "./crm-repos-organizations.js";
export type { CrmOrganizationMarketSegmentRow } from "./crm-repos-organization-segments.js";
export {
  assertValidOrganizationMarketSegmentAssignment,
  deleteOrganizationMarketSegment,
  getOrganizationMarketSegmentById,
  getOrganizationMarketSegmentsByIds,
  insertOrganizationMarketSegment,
  listOrganizationMarketSegments,
  normalizeOrganizationMarketSegmentIds
} from "./crm-repos-organization-segments.js";
export type { CrmOrganizationMarketingTagRow } from "./crm-repos-organization-marketing-tags.js";
export {
  deleteOrganizationMarketingTag,
  insertOrganizationMarketingTag,
  listOrganizationMarketingTags,
  listOrganizationMarketingTagsForOrganization,
  listOrganizationMarketingTagsForOrganizations,
  setOrganizationMarketingTags
} from "./crm-repos-organization-marketing-tags.js";

export type { CrmContactRow } from "./crm-repos-contacts.js";
import { getContactById } from "./crm-repos-contacts.js";
export {
  deleteContact,
  getContactById,
  insertContact,
  listContacts,
  setContactPhotoRelPath,
  updateContact
} from "./crm-repos-contacts.js";

/**
 * Postgres relationship types use composite uniqueness on tenant + name + entity kinds.
 */
export type CrmRelationshipTypeRow = {
  id: string;
  tenantId: string;
  name: string;
  reverseName: string;
  sourceEntityKind: string;
  targetEntityKind: string;
  isSystem: boolean;
  createdByUserId: string | null;
  createdAt: Date;
  relationshipUsageCount: number;
};

export type CrmRelationshipRow = {
  id: string;
  tenantId: string;
  relationshipTypeId: string;
  relationshipTypeName: string;
  relationshipTypeReverseName: string;
  sourceId: string;
  sourceEntityKind: string;
  targetId: string;
  targetEntityKind: string;
  createdAt: Date;
  /** Set by `listRelationshipsForEntity` — display name of the entity at the non-anchor end. */
  linkedEntityDisplayName?: string;
};

const formatLinkedContactDisplayName = (
  first: string | null | undefined,
  last: string | null | undefined,
  salutation: string | null | undefined,
  email: string | null | undefined,
  phone: string | null | undefined
): string => {
  const n = `${(first ?? "").trim()} ${(last ?? "").trim()}`.trim();
  const sal = salutation?.trim();
  const withSal = sal && n ? `${sal} ${n}`.trim() : n;
  return withSal || (email ?? "").trim() || (phone ?? "").trim() || "Contact";
};

type LinkedJoinRow = {
  sourceId: string;
  sourceEntityKind: string;
  targetId: string;
  targetEntityKind: string;
  srcOrgName: string | null;
  tgtOrgName: string | null;
  srcConSal: string | null;
  srcConFirst: string | null;
  srcConLast: string | null;
  srcConEmail: string | null;
  srcConPhone: string | null;
  tgtConSal: string | null;
  tgtConFirst: string | null;
  tgtConLast: string | null;
  tgtConEmail: string | null;
  tgtConPhone: string | null;
};

const resolveLinkedEntityDisplayName = async (
  tenantId: string,
  entityKind: CrmEntityKind,
  entityId: string,
  r: LinkedJoinRow,
  cache: {
    contacts: Map<string, Awaited<ReturnType<typeof getContactById>>>;
    orgs: Map<string, Awaited<ReturnType<typeof getOrganizationById>>>;
  }
): Promise<string> => {
  const anchorIsSource = r.sourceId === entityId && r.sourceEntityKind === entityKind;
  if (anchorIsSource) {
    if (r.targetEntityKind === "ORGANIZATION") {
      let org = cache.orgs.get(r.targetId);
      if (org === undefined) {
        org = await getOrganizationById(tenantId, r.targetId);
        cache.orgs.set(r.targetId, org);
      }
      return (org?.name ?? "").trim() || r.targetId;
    }
    let contact = cache.contacts.get(r.targetId);
    if (contact === undefined) {
      contact = await getContactById(tenantId, r.targetId);
      cache.contacts.set(r.targetId, contact);
    }
    if (!contact) return r.targetId;
    return formatLinkedContactDisplayName(
      contact.firstName,
      contact.lastName,
      contact.salutation,
      contact.email,
      contact.phone
    );
  }
  if (r.sourceEntityKind === "ORGANIZATION") {
    let org = cache.orgs.get(r.sourceId);
    if (org === undefined) {
      org = await getOrganizationById(tenantId, r.sourceId);
      cache.orgs.set(r.sourceId, org);
    }
    return (org?.name ?? "").trim() || r.sourceId;
  }
  let contact = cache.contacts.get(r.sourceId);
  if (contact === undefined) {
    contact = await getContactById(tenantId, r.sourceId);
    cache.contacts.set(r.sourceId, contact);
  }
  if (!contact) return r.sourceId;
  return formatLinkedContactDisplayName(
    contact.firstName,
    contact.lastName,
    contact.salutation,
    contact.email,
    contact.phone
  );
};

/** Resolves the tenant's `Employee` (CONTACT → ORGANIZATION) relationship type id after ensuring system types exist. */
export const getEmployeeRelationshipTypeId = async (tenantId: string): Promise<string | undefined> => {
  const employeeSystemDef = CRM_SYSTEM_RELATIONSHIP_TYPE_DEFINITIONS.find((d) => d.name === "Employee");
  if (!employeeSystemDef) return undefined;
  await ensureSystemRelationshipTypesForTenant(tenantId);
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select({ id: mysql.crmRelationshipTypes.id })
      .from(mysql.crmRelationshipTypes)
      .where(
        and(
          eq(mysql.crmRelationshipTypes.tenantId, tenantId),
          eq(mysql.crmRelationshipTypes.name, employeeSystemDef.name),
          eq(mysql.crmRelationshipTypes.sourceEntityKind, employeeSystemDef.sourceEntityKind),
          eq(mysql.crmRelationshipTypes.targetEntityKind, employeeSystemDef.targetEntityKind)
        )
      )
      .limit(1);
    return rows[0]?.id;
  }
  const db = pgDb();
  const rows = await db
    .select({ id: pg.crmRelationshipTypes.id })
    .from(pg.crmRelationshipTypes)
    .where(
      and(
        eq(pg.crmRelationshipTypes.tenantId, tenantId),
        eq(pg.crmRelationshipTypes.name, employeeSystemDef.name),
        eq(pg.crmRelationshipTypes.sourceEntityKind, employeeSystemDef.sourceEntityKind),
        eq(pg.crmRelationshipTypes.targetEntityKind, employeeSystemDef.targetEntityKind)
      )
    )
    .limit(1);
  return rows[0]?.id;
};

/** Canonical `Employee` edge: CONTACT (employee) → ORGANIZATION (employer). */
export const getContactEmployerOrganizationId = async (
  tenantId: string,
  contactId: string
): Promise<string | null> => {
  const typeId = await getEmployeeRelationshipTypeId(tenantId);
  if (!typeId) return null;
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select({ targetId: mysql.crmRelationships.targetId })
      .from(mysql.crmRelationships)
      .where(
        and(
          eq(mysql.crmRelationships.tenantId, tenantId),
          eq(mysql.crmRelationships.relationshipTypeId, typeId),
          eq(mysql.crmRelationships.sourceEntityKind, "CONTACT"),
          eq(mysql.crmRelationships.sourceId, contactId),
          eq(mysql.crmRelationships.targetEntityKind, "ORGANIZATION")
        )
      )
      .orderBy(desc(mysql.crmRelationships.createdAt))
      .limit(1);
    return rows[0]?.targetId ?? null;
  }
  const db = pgDb();
  const rows = await db
    .select({ targetId: pg.crmRelationships.targetId })
    .from(pg.crmRelationships)
    .where(
      and(
        eq(pg.crmRelationships.tenantId, tenantId),
        eq(pg.crmRelationships.relationshipTypeId, typeId),
        eq(pg.crmRelationships.sourceEntityKind, "CONTACT"),
        eq(pg.crmRelationships.sourceId, contactId),
        eq(pg.crmRelationships.targetEntityKind, "ORGANIZATION")
      )
    )
    .orderBy(desc(pg.crmRelationships.createdAt))
    .limit(1);
  return rows[0]?.targetId ?? null;
};

/** Replaces any `Employee` employer for this contact; `null` removes the link. */
export const setContactEmployerOrganization = async (
  tenantId: string,
  contactId: string,
  organizationId: string | null
): Promise<void> => {
  const typeId = await getEmployeeRelationshipTypeId(tenantId);
  if (!typeId) return;
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const empDelWhere = and(
      eq(mysql.crmRelationships.tenantId, tenantId),
      eq(mysql.crmRelationships.relationshipTypeId, typeId),
      eq(mysql.crmRelationships.sourceEntityKind, "CONTACT"),
      eq(mysql.crmRelationships.sourceId, contactId)
    );
    const empRows = await db
      .select({ tid: mysql.crmRelationships.relationshipTypeId })
      .from(mysql.crmRelationships)
      .where(empDelWhere);
    const empN = empRows.length;
    await db.delete(mysql.crmRelationships).where(empDelWhere);
    if (empN > 0) await adjustRelationshipTypeUsageCountBy(tenantId, typeId, -empN);
  } else {
    const db = pgDb();
    const empDelWherePg = and(
      eq(pg.crmRelationships.tenantId, tenantId),
      eq(pg.crmRelationships.relationshipTypeId, typeId),
      eq(pg.crmRelationships.sourceEntityKind, "CONTACT"),
      eq(pg.crmRelationships.sourceId, contactId)
    );
    const empRowsPg = await db
      .select({ tid: pg.crmRelationships.relationshipTypeId })
      .from(pg.crmRelationships)
      .where(empDelWherePg);
    const empNPg = empRowsPg.length;
    await db.delete(pg.crmRelationships).where(empDelWherePg);
    if (empNPg > 0) await adjustRelationshipTypeUsageCountBy(tenantId, typeId, -empNPg);
  }
  if (!organizationId) return;
  const orgOk = await entityExists(tenantId, "ORGANIZATION", organizationId);
  if (!orgOk) return;
  await insertRelationship(tenantId, {
    relationshipTypeId: typeId,
    sourceId: contactId,
    sourceEntityKind: "CONTACT",
    targetId: organizationId,
    targetEntityKind: "ORGANIZATION"
  });
};

/** Resolves the tenant's `Subsidiary` (ORGANIZATION → ORGANIZATION) relationship type id after ensuring system types exist. */
export const getSubsidiaryOrganizationRelationshipTypeId = async (tenantId: string): Promise<string | undefined> => {
  const def = CRM_SYSTEM_RELATIONSHIP_TYPE_DEFINITIONS.find((d) => d.name === "Subsidiary");
  if (!def) return undefined;
  await ensureSystemRelationshipTypesForTenant(tenantId);
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select({ id: mysql.crmRelationshipTypes.id })
      .from(mysql.crmRelationshipTypes)
      .where(
        and(
          eq(mysql.crmRelationshipTypes.tenantId, tenantId),
          eq(mysql.crmRelationshipTypes.name, def.name),
          eq(mysql.crmRelationshipTypes.sourceEntityKind, def.sourceEntityKind),
          eq(mysql.crmRelationshipTypes.targetEntityKind, def.targetEntityKind)
        )
      )
      .limit(1);
    return rows[0]?.id;
  }
  const db = pgDb();
  const rows = await db
    .select({ id: pg.crmRelationshipTypes.id })
    .from(pg.crmRelationshipTypes)
    .where(
      and(
        eq(pg.crmRelationshipTypes.tenantId, tenantId),
        eq(pg.crmRelationshipTypes.name, def.name),
        eq(pg.crmRelationshipTypes.sourceEntityKind, def.sourceEntityKind),
        eq(pg.crmRelationshipTypes.targetEntityKind, def.targetEntityKind)
      )
    )
    .limit(1);
  return rows[0]?.id;
};

/** Canonical `Subsidiary` edge: ORGANIZATION (subsidiary) → ORGANIZATION (holding). */
export const getOrganizationHoldingOrganizationId = async (
  tenantId: string,
  organizationId: string
): Promise<string | null> => {
  const typeId = await getSubsidiaryOrganizationRelationshipTypeId(tenantId);
  if (!typeId) return null;
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select({ targetId: mysql.crmRelationships.targetId })
      .from(mysql.crmRelationships)
      .where(
        and(
          eq(mysql.crmRelationships.tenantId, tenantId),
          eq(mysql.crmRelationships.relationshipTypeId, typeId),
          eq(mysql.crmRelationships.sourceEntityKind, "ORGANIZATION"),
          eq(mysql.crmRelationships.sourceId, organizationId),
          eq(mysql.crmRelationships.targetEntityKind, "ORGANIZATION")
        )
      )
      .orderBy(desc(mysql.crmRelationships.createdAt))
      .limit(1);
    return rows[0]?.targetId ?? null;
  }
  const db = pgDb();
  const rows = await db
    .select({ targetId: pg.crmRelationships.targetId })
    .from(pg.crmRelationships)
    .where(
      and(
        eq(pg.crmRelationships.tenantId, tenantId),
        eq(pg.crmRelationships.relationshipTypeId, typeId),
        eq(pg.crmRelationships.sourceEntityKind, "ORGANIZATION"),
        eq(pg.crmRelationships.sourceId, organizationId),
        eq(pg.crmRelationships.targetEntityKind, "ORGANIZATION")
      )
    )
    .orderBy(desc(pg.crmRelationships.createdAt))
    .limit(1);
  return rows[0]?.targetId ?? null;
};

/** Replaces any `Subsidiary` holding for this organization; `null` removes the link. */
export const setOrganizationHoldingOrganization = async (
  tenantId: string,
  organizationId: string,
  holdingOrganizationId: string | null
): Promise<void> => {
  const typeId = await getSubsidiaryOrganizationRelationshipTypeId(tenantId);
  if (!typeId) return;
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const subDelWhere = and(
      eq(mysql.crmRelationships.tenantId, tenantId),
      eq(mysql.crmRelationships.relationshipTypeId, typeId),
      eq(mysql.crmRelationships.sourceEntityKind, "ORGANIZATION"),
      eq(mysql.crmRelationships.sourceId, organizationId)
    );
    const subRows = await db
      .select({ tid: mysql.crmRelationships.relationshipTypeId })
      .from(mysql.crmRelationships)
      .where(subDelWhere);
    const subN = subRows.length;
    await db.delete(mysql.crmRelationships).where(subDelWhere);
    if (subN > 0) await adjustRelationshipTypeUsageCountBy(tenantId, typeId, -subN);
  } else {
    const db = pgDb();
    const subDelWherePg = and(
      eq(pg.crmRelationships.tenantId, tenantId),
      eq(pg.crmRelationships.relationshipTypeId, typeId),
      eq(pg.crmRelationships.sourceEntityKind, "ORGANIZATION"),
      eq(pg.crmRelationships.sourceId, organizationId)
    );
    const subRowsPg = await db
      .select({ tid: pg.crmRelationships.relationshipTypeId })
      .from(pg.crmRelationships)
      .where(subDelWherePg);
    const subNPg = subRowsPg.length;
    await db.delete(pg.crmRelationships).where(subDelWherePg);
    if (subNPg > 0) await adjustRelationshipTypeUsageCountBy(tenantId, typeId, -subNPg);
  }
  if (!holdingOrganizationId) return;
  if (holdingOrganizationId === organizationId) return;
  const orgOk = await entityExists(tenantId, "ORGANIZATION", holdingOrganizationId);
  if (!orgOk) return;
  await insertRelationship(tenantId, {
    relationshipTypeId: typeId,
    sourceId: organizationId,
    sourceEntityKind: "ORGANIZATION",
    targetId: holdingOrganizationId,
    targetEntityKind: "ORGANIZATION"
  });
};

export const listRelationshipTypes = async (tenantId: string): Promise<CrmRelationshipTypeRow[]> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select()
      .from(mysql.crmRelationshipTypes)
      .where(eq(mysql.crmRelationshipTypes.tenantId, tenantId))
      .orderBy(asc(mysql.crmRelationshipTypes.name));
    return rows.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      name: r.name,
      reverseName: r.reverseName,
      sourceEntityKind: r.sourceEntityKind,
      targetEntityKind: r.targetEntityKind,
      isSystem: r.isSystem,
      createdByUserId: r.createdByUserId,
      createdAt: r.createdAt,
      relationshipUsageCount: Number(r.relationshipUsageCount ?? 0)
    }));
  }
  const db = pgDb();
  const rows = await db
    .select()
    .from(pg.crmRelationshipTypes)
    .where(eq(pg.crmRelationshipTypes.tenantId, tenantId))
    .orderBy(asc(pg.crmRelationshipTypes.name));
  return rows.map((r) => ({
    id: r.id,
    tenantId: r.tenantId,
    name: r.name,
    reverseName: r.reverseName,
    sourceEntityKind: r.sourceEntityKind,
    targetEntityKind: r.targetEntityKind,
    isSystem: r.isSystem,
    createdByUserId: r.createdByUserId,
    createdAt: r.createdAt,
    relationshipUsageCount: Number(r.relationshipUsageCount ?? 0)
  }));
};

export const getRelationshipTypeById = async (
  tenantId: string,
  id: string
): Promise<CrmRelationshipTypeRow | undefined> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select()
      .from(mysql.crmRelationshipTypes)
      .where(and(eq(mysql.crmRelationshipTypes.tenantId, tenantId), eq(mysql.crmRelationshipTypes.id, id)))
      .limit(1);
    const r = rows[0];
    if (!r) return undefined;
    return {
      id: r.id,
      tenantId: r.tenantId,
      name: r.name,
      reverseName: r.reverseName,
      sourceEntityKind: r.sourceEntityKind,
      targetEntityKind: r.targetEntityKind,
      isSystem: r.isSystem,
      createdByUserId: r.createdByUserId,
      createdAt: r.createdAt,
      relationshipUsageCount: Number(r.relationshipUsageCount ?? 0)
    };
  }
  const db = pgDb();
  const rows = await db
    .select()
    .from(pg.crmRelationshipTypes)
    .where(and(eq(pg.crmRelationshipTypes.tenantId, tenantId), eq(pg.crmRelationshipTypes.id, id)))
    .limit(1);
  const r = rows[0];
  if (!r) return undefined;
  return {
    id: r.id,
    tenantId: r.tenantId,
    name: r.name,
    reverseName: r.reverseName,
    sourceEntityKind: r.sourceEntityKind,
    targetEntityKind: r.targetEntityKind,
    isSystem: r.isSystem,
    createdByUserId: r.createdByUserId,
    createdAt: r.createdAt,
    relationshipUsageCount: Number(r.relationshipUsageCount ?? 0)
  };
};

/** Idempotent: inserts built-in relationship types for a tenant (system rows, not user-owned). */
export const ensureSystemRelationshipTypesForTenant = async (tenantId: string): Promise<void> => {
  const now = new Date();
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    for (const def of CRM_SYSTEM_RELATIONSHIP_TYPE_DEFINITIONS) {
      const existing = await db
        .select({ id: mysql.crmRelationshipTypes.id })
        .from(mysql.crmRelationshipTypes)
        .where(
          and(
            eq(mysql.crmRelationshipTypes.tenantId, tenantId),
            eq(mysql.crmRelationshipTypes.name, def.name),
            eq(mysql.crmRelationshipTypes.sourceEntityKind, def.sourceEntityKind),
            eq(mysql.crmRelationshipTypes.targetEntityKind, def.targetEntityKind)
          )
        )
        .limit(1);
      if (existing.length > 0) continue;
      await db.insert(mysql.crmRelationshipTypes).values({
        id: randomUUID(),
        tenantId,
        name: def.name,
        reverseName: def.reverseName,
        sourceEntityKind: def.sourceEntityKind,
        targetEntityKind: def.targetEntityKind,
        isSystem: true,
        createdByUserId: null,
        createdAt: now,
        relationshipUsageCount: 0
      });
    }
    return;
  }
  const db = pgDb();
  for (const def of CRM_SYSTEM_RELATIONSHIP_TYPE_DEFINITIONS) {
    const existing = await db
      .select({ id: pg.crmRelationshipTypes.id })
      .from(pg.crmRelationshipTypes)
      .where(
        and(
          eq(pg.crmRelationshipTypes.tenantId, tenantId),
          eq(pg.crmRelationshipTypes.name, def.name),
          eq(pg.crmRelationshipTypes.sourceEntityKind, def.sourceEntityKind),
          eq(pg.crmRelationshipTypes.targetEntityKind, def.targetEntityKind)
        )
      )
      .limit(1);
    if (existing.length > 0) continue;
    await db.insert(pg.crmRelationshipTypes).values({
      tenantId,
      name: def.name,
      reverseName: def.reverseName,
      sourceEntityKind: def.sourceEntityKind,
      targetEntityKind: def.targetEntityKind,
      isSystem: true,
      createdByUserId: null,
      createdAt: now,
      relationshipUsageCount: 0
    });
  }
};

export const insertRelationshipType = async (
  tenantId: string,
  userId: string,
  input: { name: string; reverseName: string; sourceEntityKind: CrmEntityKind; targetEntityKind: CrmEntityKind }
): Promise<CrmRelationshipTypeRow> => {
  const now = new Date();
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const id = randomUUID();
    await db.insert(mysql.crmRelationshipTypes).values({
      id,
      tenantId,
      name: input.name,
      reverseName: input.reverseName,
      sourceEntityKind: input.sourceEntityKind,
      targetEntityKind: input.targetEntityKind,
      isSystem: false,
      createdByUserId: userId,
      createdAt: now,
      relationshipUsageCount: 0
    });
    const row = await getRelationshipTypeById(tenantId, id);
    if (!row) throw new Error("insertRelationshipType failed");
    return row;
  }
  const db = pgDb();
  const inserted = await db
    .insert(pg.crmRelationshipTypes)
    .values({
      tenantId,
      name: input.name,
      reverseName: input.reverseName,
      sourceEntityKind: input.sourceEntityKind,
      targetEntityKind: input.targetEntityKind,
      isSystem: false,
      createdByUserId: userId,
      createdAt: now,
      relationshipUsageCount: 0
    })
    .returning({ id: pg.crmRelationshipTypes.id });
  const row = await getRelationshipTypeById(tenantId, inserted[0]!.id);
  if (!row) throw new Error("insertRelationshipType failed");
  return row;
};

export const listRelationshipsForEntity = async (
  tenantId: string,
  entityKind: CrmEntityKind,
  entityId: string
): Promise<CrmRelationshipRow[]> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const srcOrg = mysqlTableAlias(mysql.crmOrganizations, "rel_src_org");
    const tgtOrg = mysqlTableAlias(mysql.crmOrganizations, "rel_tgt_org");
    const srcCon = mysqlTableAlias(mysql.crmContacts, "rel_src_con");
    const tgtCon = mysqlTableAlias(mysql.crmContacts, "rel_tgt_con");
    const rows = await db
      .select({
        id: mysql.crmRelationships.id,
        tenantId: mysql.crmRelationships.tenantId,
        relationshipTypeId: mysql.crmRelationships.relationshipTypeId,
        typeName: mysql.crmRelationshipTypes.name,
        typeReverseName: mysql.crmRelationshipTypes.reverseName,
        sourceId: mysql.crmRelationships.sourceId,
        sourceEntityKind: mysql.crmRelationships.sourceEntityKind,
        targetId: mysql.crmRelationships.targetId,
        targetEntityKind: mysql.crmRelationships.targetEntityKind,
        createdAt: mysql.crmRelationships.createdAt,
        srcOrgName: srcOrg.name,
        tgtOrgName: tgtOrg.name,
        srcConSal: srcCon.salutation,
        srcConFirst: srcCon.firstName,
        srcConLast: srcCon.lastName,
        srcConEmail: srcCon.email,
        srcConPhone: srcCon.phone,
        tgtConSal: tgtCon.salutation,
        tgtConFirst: tgtCon.firstName,
        tgtConLast: tgtCon.lastName,
        tgtConEmail: tgtCon.email,
        tgtConPhone: tgtCon.phone
      })
      .from(mysql.crmRelationships)
      .innerJoin(
        mysql.crmRelationshipTypes,
        eq(mysql.crmRelationships.relationshipTypeId, mysql.crmRelationshipTypes.id)
      )
      .leftJoin(
        srcOrg,
        and(
          eq(mysql.crmRelationships.sourceEntityKind, "ORGANIZATION"),
          eq(mysql.crmRelationships.sourceId, srcOrg.id),
          eq(srcOrg.tenantId, mysql.crmRelationships.tenantId)
        )
      )
      .leftJoin(
        tgtOrg,
        and(
          eq(mysql.crmRelationships.targetEntityKind, "ORGANIZATION"),
          eq(mysql.crmRelationships.targetId, tgtOrg.id),
          eq(tgtOrg.tenantId, mysql.crmRelationships.tenantId)
        )
      )
      .leftJoin(
        srcCon,
        and(
          eq(mysql.crmRelationships.sourceEntityKind, "CONTACT"),
          eq(mysql.crmRelationships.sourceId, srcCon.id),
          eq(srcCon.tenantId, mysql.crmRelationships.tenantId)
        )
      )
      .leftJoin(
        tgtCon,
        and(
          eq(mysql.crmRelationships.targetEntityKind, "CONTACT"),
          eq(mysql.crmRelationships.targetId, tgtCon.id),
          eq(tgtCon.tenantId, mysql.crmRelationships.tenantId)
        )
      )
      .where(
        and(
          eq(mysql.crmRelationships.tenantId, tenantId),
          or(
            and(eq(mysql.crmRelationships.sourceEntityKind, entityKind), eq(mysql.crmRelationships.sourceId, entityId)),
            and(eq(mysql.crmRelationships.targetEntityKind, entityKind), eq(mysql.crmRelationships.targetId, entityId))
          )!
        )
      )
      .orderBy(desc(mysql.crmRelationships.createdAt));
    const cache = {
      contacts: new Map<string, Awaited<ReturnType<typeof getContactById>>>(),
      orgs: new Map<string, Awaited<ReturnType<typeof getOrganizationById>>>()
    };
    return Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        tenantId: r.tenantId,
        relationshipTypeId: r.relationshipTypeId,
        relationshipTypeName: r.typeName,
        relationshipTypeReverseName: r.typeReverseName,
        sourceId: r.sourceId,
        sourceEntityKind: r.sourceEntityKind,
        targetId: r.targetId,
        targetEntityKind: r.targetEntityKind,
        createdAt: r.createdAt,
        linkedEntityDisplayName: await resolveLinkedEntityDisplayName(
          tenantId,
          entityKind,
          entityId,
          r,
          cache
        )
      }))
    );
  }
  const db = pgDb();
  const srcOrg = pgTableAlias(pg.crmOrganizations, "rel_src_org");
  const tgtOrg = pgTableAlias(pg.crmOrganizations, "rel_tgt_org");
  const srcCon = pgTableAlias(pg.crmContacts, "rel_src_con");
  const tgtCon = pgTableAlias(pg.crmContacts, "rel_tgt_con");
  const rows = await db
    .select({
      id: pg.crmRelationships.id,
      tenantId: pg.crmRelationships.tenantId,
      relationshipTypeId: pg.crmRelationships.relationshipTypeId,
      typeName: pg.crmRelationshipTypes.name,
      typeReverseName: pg.crmRelationshipTypes.reverseName,
      sourceId: pg.crmRelationships.sourceId,
      sourceEntityKind: pg.crmRelationships.sourceEntityKind,
      targetId: pg.crmRelationships.targetId,
      targetEntityKind: pg.crmRelationships.targetEntityKind,
      createdAt: pg.crmRelationships.createdAt,
      srcOrgName: srcOrg.name,
      tgtOrgName: tgtOrg.name,
      srcConSal: srcCon.salutation,
      srcConFirst: srcCon.firstName,
      srcConLast: srcCon.lastName,
      srcConEmail: srcCon.email,
      srcConPhone: srcCon.phone,
      tgtConSal: tgtCon.salutation,
      tgtConFirst: tgtCon.firstName,
      tgtConLast: tgtCon.lastName,
      tgtConEmail: tgtCon.email,
      tgtConPhone: tgtCon.phone
    })
    .from(pg.crmRelationships)
    .innerJoin(pg.crmRelationshipTypes, eq(pg.crmRelationships.relationshipTypeId, pg.crmRelationshipTypes.id))
    .leftJoin(
      srcOrg,
      and(
        eq(pg.crmRelationships.sourceEntityKind, "ORGANIZATION"),
        eq(pg.crmRelationships.sourceId, srcOrg.id),
        eq(srcOrg.tenantId, pg.crmRelationships.tenantId)
      )
    )
    .leftJoin(
      tgtOrg,
      and(
        eq(pg.crmRelationships.targetEntityKind, "ORGANIZATION"),
        eq(pg.crmRelationships.targetId, tgtOrg.id),
        eq(tgtOrg.tenantId, pg.crmRelationships.tenantId)
      )
    )
    .leftJoin(
      srcCon,
      and(
        eq(pg.crmRelationships.sourceEntityKind, "CONTACT"),
        eq(pg.crmRelationships.sourceId, srcCon.id),
        eq(srcCon.tenantId, pg.crmRelationships.tenantId)
      )
    )
    .leftJoin(
      tgtCon,
      and(
        eq(pg.crmRelationships.targetEntityKind, "CONTACT"),
        eq(pg.crmRelationships.targetId, tgtCon.id),
        eq(tgtCon.tenantId, pg.crmRelationships.tenantId)
      )
    )
    .where(
      and(
        eq(pg.crmRelationships.tenantId, tenantId),
        or(
          and(eq(pg.crmRelationships.sourceEntityKind, entityKind), eq(pg.crmRelationships.sourceId, entityId)),
          and(eq(pg.crmRelationships.targetEntityKind, entityKind), eq(pg.crmRelationships.targetId, entityId))
        )!
      )
    )
    .orderBy(desc(pg.crmRelationships.createdAt));
  const cache = {
    contacts: new Map<string, Awaited<ReturnType<typeof getContactById>>>(),
    orgs: new Map<string, Awaited<ReturnType<typeof getOrganizationById>>>()
  };
  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      tenantId: r.tenantId,
      relationshipTypeId: r.relationshipTypeId,
      relationshipTypeName: r.typeName,
      relationshipTypeReverseName: r.typeReverseName,
      sourceId: r.sourceId,
      sourceEntityKind: r.sourceEntityKind,
      targetId: r.targetId,
      targetEntityKind: r.targetEntityKind,
      createdAt: r.createdAt,
      linkedEntityDisplayName: await resolveLinkedEntityDisplayName(
        tenantId,
        entityKind,
        entityId,
        r,
        cache
      )
    }))
  );
};

/** System "Other" row for this tenant and directed pair (seeded by `ensureSystemRelationshipTypesForTenant`). */
const getSystemOtherRelationshipTypeIdForDirection = async (
  tenantId: string,
  sourceEntityKind: CrmEntityKind,
  targetEntityKind: CrmEntityKind
): Promise<string | undefined> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select({ id: mysql.crmRelationshipTypes.id })
      .from(mysql.crmRelationshipTypes)
      .where(
        and(
          eq(mysql.crmRelationshipTypes.tenantId, tenantId),
          eq(mysql.crmRelationshipTypes.name, "Other"),
          eq(mysql.crmRelationshipTypes.isSystem, true),
          eq(mysql.crmRelationshipTypes.sourceEntityKind, sourceEntityKind),
          eq(mysql.crmRelationshipTypes.targetEntityKind, targetEntityKind)
        )
      )
      .limit(1);
    return rows[0]?.id;
  }
  const db = pgDb();
  const rows = await db
    .select({ id: pg.crmRelationshipTypes.id })
    .from(pg.crmRelationshipTypes)
    .where(
      and(
        eq(pg.crmRelationshipTypes.tenantId, tenantId),
        eq(pg.crmRelationshipTypes.name, "Other"),
        eq(pg.crmRelationshipTypes.isSystem, true),
        eq(pg.crmRelationshipTypes.sourceEntityKind, sourceEntityKind),
        eq(pg.crmRelationshipTypes.targetEntityKind, targetEntityKind)
      )
    )
    .limit(1);
  return rows[0]?.id;
};

export const deleteRelationshipType = async (
  tenantId: string,
  relationshipTypeId: string
): Promise<{ ok: true } | { ok: false; reason: "not_found" | "system_type" | "missing_other_fallback" }> => {
  await ensureSystemRelationshipTypesForTenant(tenantId);
  const row = await getRelationshipTypeById(tenantId, relationshipTypeId);
  if (!row) return { ok: false, reason: "not_found" };
  if (row.isSystem) return { ok: false, reason: "system_type" };

  const n = row.relationshipUsageCount;
  if (n > 0) {
    const otherId = await getSystemOtherRelationshipTypeIdForDirection(
      tenantId,
      row.sourceEntityKind as CrmEntityKind,
      row.targetEntityKind as CrmEntityKind
    );
    if (!otherId || otherId === relationshipTypeId) {
      return { ok: false, reason: "missing_other_fallback" };
    }
    if (dialectFromEnv() === "mysql") {
      const db = mysqlDb();
      await db
        .update(mysql.crmRelationships)
        .set({ relationshipTypeId: otherId })
        .where(
          and(
            eq(mysql.crmRelationships.tenantId, tenantId),
            eq(mysql.crmRelationships.relationshipTypeId, relationshipTypeId)
          )
        );
    } else {
      const db = pgDb();
      await db
        .update(pg.crmRelationships)
        .set({ relationshipTypeId: otherId })
        .where(
          and(
            eq(pg.crmRelationships.tenantId, tenantId),
            eq(pg.crmRelationships.relationshipTypeId, relationshipTypeId)
          )
        );
    }
    await adjustRelationshipTypeUsageCountBy(tenantId, otherId, n);
  }

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const res = await db
      .delete(mysql.crmRelationshipTypes)
      .where(and(eq(mysql.crmRelationshipTypes.tenantId, tenantId), eq(mysql.crmRelationshipTypes.id, relationshipTypeId)));
    const header = Array.isArray(res) ? res[0] : res;
    const affected = typeof header === "object" && header !== null && "affectedRows" in header ? Number(header.affectedRows) : 0;
    return affected > 0 ? { ok: true } : { ok: false, reason: "not_found" };
  }
  const db = pgDb();
  const res = await db
    .delete(pg.crmRelationshipTypes)
    .where(and(eq(pg.crmRelationshipTypes.tenantId, tenantId), eq(pg.crmRelationshipTypes.id, relationshipTypeId)))
    .returning({ id: pg.crmRelationshipTypes.id });
  return res.length > 0 ? { ok: true } : { ok: false, reason: "not_found" };
};

const getRelationshipRowById = async (
  tenantId: string,
  id: string
): Promise<CrmRelationshipRow | undefined> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select({
        id: mysql.crmRelationships.id,
        tenantId: mysql.crmRelationships.tenantId,
        relationshipTypeId: mysql.crmRelationships.relationshipTypeId,
        typeName: mysql.crmRelationshipTypes.name,
        typeReverseName: mysql.crmRelationshipTypes.reverseName,
        sourceId: mysql.crmRelationships.sourceId,
        sourceEntityKind: mysql.crmRelationships.sourceEntityKind,
        targetId: mysql.crmRelationships.targetId,
        targetEntityKind: mysql.crmRelationships.targetEntityKind,
        createdAt: mysql.crmRelationships.createdAt
      })
      .from(mysql.crmRelationships)
      .innerJoin(
        mysql.crmRelationshipTypes,
        eq(mysql.crmRelationships.relationshipTypeId, mysql.crmRelationshipTypes.id)
      )
      .where(and(eq(mysql.crmRelationships.tenantId, tenantId), eq(mysql.crmRelationships.id, id)))
      .limit(1);
    const r = rows[0];
    if (!r) return undefined;
    return {
      id: r.id,
      tenantId: r.tenantId,
      relationshipTypeId: r.relationshipTypeId,
      relationshipTypeName: r.typeName,
      relationshipTypeReverseName: r.typeReverseName,
      sourceId: r.sourceId,
      sourceEntityKind: r.sourceEntityKind,
      targetId: r.targetId,
      targetEntityKind: r.targetEntityKind,
      createdAt: r.createdAt
    };
  }
  const db = pgDb();
  const rows = await db
    .select({
      id: pg.crmRelationships.id,
      tenantId: pg.crmRelationships.tenantId,
      relationshipTypeId: pg.crmRelationships.relationshipTypeId,
      typeName: pg.crmRelationshipTypes.name,
      typeReverseName: pg.crmRelationshipTypes.reverseName,
      sourceId: pg.crmRelationships.sourceId,
      sourceEntityKind: pg.crmRelationships.sourceEntityKind,
      targetId: pg.crmRelationships.targetId,
      targetEntityKind: pg.crmRelationships.targetEntityKind,
      createdAt: pg.crmRelationships.createdAt
    })
    .from(pg.crmRelationships)
    .innerJoin(pg.crmRelationshipTypes, eq(pg.crmRelationships.relationshipTypeId, pg.crmRelationshipTypes.id))
    .where(and(eq(pg.crmRelationships.tenantId, tenantId), eq(pg.crmRelationships.id, id)))
    .limit(1);
  const r = rows[0];
  if (!r) return undefined;
  return {
    id: r.id,
    tenantId: r.tenantId,
    relationshipTypeId: r.relationshipTypeId,
    relationshipTypeName: r.typeName,
    relationshipTypeReverseName: r.typeReverseName,
    sourceId: r.sourceId,
    sourceEntityKind: r.sourceEntityKind,
    targetId: r.targetId,
    targetEntityKind: r.targetEntityKind,
    createdAt: r.createdAt
  };
};

export const insertRelationship = async (
  tenantId: string,
  input: {
    relationshipTypeId: string;
    sourceId: string;
    sourceEntityKind: CrmEntityKind;
    targetId: string;
    targetEntityKind: CrmEntityKind;
  }
): Promise<CrmRelationshipRow | null> => {
  const rt = await getRelationshipTypeById(tenantId, input.relationshipTypeId);
  if (!rt) return null;
  let sourceId = input.sourceId;
  let sourceEntityKind = input.sourceEntityKind;
  let targetId = input.targetId;
  let targetEntityKind = input.targetEntityKind;
  if (sourceEntityKind === rt.sourceEntityKind && targetEntityKind === rt.targetEntityKind) {
    // canonical direction
  } else if (sourceEntityKind === rt.targetEntityKind && targetEntityKind === rt.sourceEntityKind) {
    sourceId = input.targetId;
    sourceEntityKind = input.targetEntityKind;
    targetId = input.sourceId;
    targetEntityKind = input.sourceEntityKind;
  } else {
    return null;
  }
  const srcOk = await entityExists(tenantId, sourceEntityKind, sourceId);
  const tgtOk = await entityExists(tenantId, targetEntityKind, targetId);
  if (!srcOk || !tgtOk) return null;

  const now = new Date();
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const id = randomUUID();
    await db.insert(mysql.crmRelationships).values({
      id,
      tenantId,
      relationshipTypeId: input.relationshipTypeId,
      sourceId,
      sourceEntityKind,
      targetId,
      targetEntityKind,
      createdAt: now
    });
    const created = (await getRelationshipRowById(tenantId, id)) ?? null;
    if (created) {
      await adjustRelationshipTypeUsageCountBy(tenantId, input.relationshipTypeId, 1);
    }
    return created;
  }
  const db = pgDb();
  const inserted = await db
    .insert(pg.crmRelationships)
    .values({
      tenantId,
      relationshipTypeId: input.relationshipTypeId,
      sourceId,
      sourceEntityKind,
      targetId,
      targetEntityKind,
      createdAt: now
    })
    .returning({ id: pg.crmRelationships.id });
  const created = (await getRelationshipRowById(tenantId, inserted[0]!.id)) ?? null;
  if (created) {
    await adjustRelationshipTypeUsageCountBy(tenantId, input.relationshipTypeId, 1);
  }
  return created;
};

export const deleteRelationship = async (tenantId: string, relationshipId: string): Promise<boolean> => {
  const existing = await getRelationshipRowById(tenantId, relationshipId);
  if (!existing) return false;
  const typeId = existing.relationshipTypeId;

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const res = await db.delete(mysql.crmRelationships).where(
      and(eq(mysql.crmRelationships.tenantId, tenantId), eq(mysql.crmRelationships.id, relationshipId))
    );
    const header = Array.isArray(res) ? res[0] : res;
    const affected = typeof header === "object" && header !== null && "affectedRows" in header ? Number(header.affectedRows) : 0;
    if (affected > 0) {
      await adjustRelationshipTypeUsageCountBy(tenantId, typeId, -1);
    }
    return affected > 0;
  }
  const db = pgDb();
  const res = await db
    .delete(pg.crmRelationships)
    .where(and(eq(pg.crmRelationships.tenantId, tenantId), eq(pg.crmRelationships.id, relationshipId)))
    .returning({ id: pg.crmRelationships.id });
  if (res.length > 0) {
    await adjustRelationshipTypeUsageCountBy(tenantId, typeId, -1);
  }
  return res.length > 0;
};

export {
  insertActivity,
  listActivitiesForEntity,
  type CrmActivityRow,
  type ListActivitiesFilters
} from "./crm-repos-activities.js";
