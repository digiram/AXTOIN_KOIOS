/**
 * CRM entity existence checks (used by activities, relationships, etc.).
 */

import { and, eq } from "drizzle-orm";

import type { CrmEntityKind } from "@starter/shared";

import * as mysql from "./mysql-schema.js";
import * as pg from "./pg-schema.js";
import { dialectFromEnv, mysqlDb, pgDb } from "./crm-repos-db.js";

export const entityExists = async (tenantId: string, kind: CrmEntityKind, id: string): Promise<boolean> => {
  if (kind === "ORGANIZATION") {
    if (dialectFromEnv() === "mysql") {
      const db = mysqlDb();
      const rows = await db
        .select({ one: mysql.crmOrganizations.id })
        .from(mysql.crmOrganizations)
        .where(and(eq(mysql.crmOrganizations.tenantId, tenantId), eq(mysql.crmOrganizations.id, id)))
        .limit(1);
      return rows.length > 0;
    }
    const db = pgDb();
    const rows = await db
      .select({ one: pg.crmOrganizations.id })
      .from(pg.crmOrganizations)
      .where(and(eq(pg.crmOrganizations.tenantId, tenantId), eq(pg.crmOrganizations.id, id)))
      .limit(1);
    return rows.length > 0;
  }
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select({ one: mysql.crmContacts.id })
      .from(mysql.crmContacts)
      .where(and(eq(mysql.crmContacts.tenantId, tenantId), eq(mysql.crmContacts.id, id)))
      .limit(1);
    return rows.length > 0;
  }
  const db = pgDb();
  const rows = await db
    .select({ one: pg.crmContacts.id })
    .from(pg.crmContacts)
    .where(and(eq(pg.crmContacts.tenantId, tenantId), eq(pg.crmContacts.id, id)))
    .limit(1);
  return rows.length > 0;
};
