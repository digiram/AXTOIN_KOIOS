/**
 * Adjusts `crm_relationship_types.relationship_usage_count` when relationships are created or destroyed.
 */

import { and, eq, sql } from "drizzle-orm";

import * as mysql from "./mysql-schema.js";
import * as pg from "./pg-schema.js";
import { dialectFromEnv, mysqlDb, pgDb } from "./crm-repos-db.js";

export const adjustRelationshipTypeUsageCountBy = async (
  tenantId: string,
  relationshipTypeId: string,
  delta: number
): Promise<void> => {
  if (delta === 0) return;
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db
      .update(mysql.crmRelationshipTypes)
      .set({
        relationshipUsageCount: sql`GREATEST(0, ${mysql.crmRelationshipTypes.relationshipUsageCount} + ${delta})`
      })
      .where(
        and(eq(mysql.crmRelationshipTypes.tenantId, tenantId), eq(mysql.crmRelationshipTypes.id, relationshipTypeId))
      );
    return;
  }
  const db = pgDb();
  await db
    .update(pg.crmRelationshipTypes)
    .set({
      relationshipUsageCount: sql`GREATEST(0, ${pg.crmRelationshipTypes.relationshipUsageCount} + ${delta})`
    })
    .where(and(eq(pg.crmRelationshipTypes.tenantId, tenantId), eq(pg.crmRelationshipTypes.id, relationshipTypeId)));
};
