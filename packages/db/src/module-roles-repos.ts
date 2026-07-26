/**
 * Tenant optional-module role assignments.
 *
 * Reads and writes `tenant_user_module_roles` rows that gate CRM, invoicing, mailbox, and other
 * optional modules per realm user.
 *
 * Responsibilities:
 * - List module roles for one or many users within a tenant
 * - Upsert or clear a user's role for a module key
 * - Map flat rows to `TenantModuleRolesMap` for API responses
 *
 * Depends on:
 * - `pg-schema` / `mysql-schema` `tenant_user_module_roles`
 * - `@starter/shared` module keys and role schema
 *
 * Security:
 * - Every query filters by caller-supplied `tenant_id`; never authorize from client tenant ids alone.
 * - Role values are validated against `moduleRoleSchema` before mapping.
 */

import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  moduleRoleSchema,
  TENANT_MODULE_KEYS,
  type ModuleRole,
  type TenantModuleKey,
  type TenantModuleRolesMap
} from "@starter/shared";

import { getDb } from "./client.js";
import * as mysql from "./mysql-schema.js";
import * as pg from "./pg-schema.js";
import { dialectFromEnv } from "./schema.js";

const mysqlDb = (): MySql2Database<typeof mysql> => getDb() as MySql2Database<typeof mysql>;
const pgDb = (): NodePgDatabase<typeof pg> => getDb() as NodePgDatabase<typeof pg>;

const isTenantModuleKey = (value: string): value is TenantModuleKey =>
  (TENANT_MODULE_KEYS as readonly string[]).includes(value);

export type TenantUserModuleRoleRow = {
  module: TenantModuleKey;
  role: ModuleRole;
};

/** Lists optional-module role rows for a tenant user. */
export const listModuleRolesForUser = async (
  tenantId: string,
  userId: string
): Promise<TenantUserModuleRoleRow[]> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select({ module: mysql.tenantUserModuleRoles.module, role: mysql.tenantUserModuleRoles.role })
      .from(mysql.tenantUserModuleRoles)
      .where(
        and(eq(mysql.tenantUserModuleRoles.tenantId, tenantId), eq(mysql.tenantUserModuleRoles.userId, userId))
      );
    return rows.filter((r): r is TenantUserModuleRoleRow => isTenantModuleKey(r.module)) as TenantUserModuleRoleRow[];
  }
  const db = pgDb();
  const rows = await db
    .select({ module: pg.tenantUserModuleRoles.module, role: pg.tenantUserModuleRoles.role })
    .from(pg.tenantUserModuleRoles)
    .where(and(eq(pg.tenantUserModuleRoles.tenantId, tenantId), eq(pg.tenantUserModuleRoles.userId, userId)));
  return rows.filter((r): r is TenantUserModuleRoleRow => isTenantModuleKey(r.module)) as TenantUserModuleRoleRow[];
};

const applyRowToMap = (map: TenantModuleRolesMap, module: string, role: string) => {
  if (!isTenantModuleKey(module)) return;
  const parsed = moduleRoleSchema.safeParse(role);
  if (parsed.success) map[module] = parsed.data;
};

/** Batch-loads module role maps keyed by user id within a tenant. */
export const listModuleRolesForUsers = async (
  tenantId: string,
  userIds: string[]
): Promise<Map<string, TenantModuleRolesMap>> => {
  const out = new Map<string, TenantModuleRolesMap>();
  if (userIds.length === 0) return out;
  for (const id of userIds) out.set(id, {});

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select({
        userId: mysql.tenantUserModuleRoles.userId,
        module: mysql.tenantUserModuleRoles.module,
        role: mysql.tenantUserModuleRoles.role
      })
      .from(mysql.tenantUserModuleRoles)
      .where(
        and(eq(mysql.tenantUserModuleRoles.tenantId, tenantId), inArray(mysql.tenantUserModuleRoles.userId, userIds))
      );
    for (const row of rows) {
      const map = out.get(row.userId) ?? {};
      applyRowToMap(map, row.module, row.role);
      out.set(row.userId, map);
    }
    return out;
  }

  const db = pgDb();
  const rows = await db
    .select({
      userId: pg.tenantUserModuleRoles.userId,
      module: pg.tenantUserModuleRoles.module,
      role: pg.tenantUserModuleRoles.role
    })
    .from(pg.tenantUserModuleRoles)
    .where(and(eq(pg.tenantUserModuleRoles.tenantId, tenantId), inArray(pg.tenantUserModuleRoles.userId, userIds)));
  for (const row of rows) {
    const map = out.get(row.userId) ?? {};
    applyRowToMap(map, row.module, row.role);
    out.set(row.userId, map);
  }
  return out;
};

export const moduleRolesRowsToMap = (rows: TenantUserModuleRoleRow[]): TenantModuleRolesMap => {
  const out: TenantModuleRolesMap = {};
  for (const row of rows) {
    out[row.module] = row.role;
  }
  return out;
};

/** Upserts a user's role for one optional module key. */
export const setUserModuleRole = async (input: {
  tenantId: string;
  userId: string;
  module: TenantModuleKey;
  role: ModuleRole;
}): Promise<void> => {
  const now = new Date();
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db
      .insert(mysql.tenantUserModuleRoles)
      .values({
        id: randomUUID(),
        tenantId: input.tenantId,
        userId: input.userId,
        module: input.module,
        role: input.role,
        createdAt: now,
        updatedAt: now
      })
      .onDuplicateKeyUpdate({
        set: { role: input.role, updatedAt: now }
      });
    return;
  }
  const db = pgDb();
  await db
    .insert(pg.tenantUserModuleRoles)
    .values({
      tenantId: input.tenantId,
      userId: input.userId,
      module: input.module,
      role: input.role,
      updatedAt: now
    })
    .onConflictDoUpdate({
      target: [
        pg.tenantUserModuleRoles.tenantId,
        pg.tenantUserModuleRoles.userId,
        pg.tenantUserModuleRoles.module
      ],
      set: { role: input.role, updatedAt: now }
    });
};

/** Removes a user's role assignment for one module (reverts to platform default deny). */
export const clearUserModuleRole = async (input: {
  tenantId: string;
  userId: string;
  module: TenantModuleKey;
}): Promise<void> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db
      .delete(mysql.tenantUserModuleRoles)
      .where(
        and(
          eq(mysql.tenantUserModuleRoles.tenantId, input.tenantId),
          eq(mysql.tenantUserModuleRoles.userId, input.userId),
          eq(mysql.tenantUserModuleRoles.module, input.module)
        )
      );
    return;
  }
  const db = pgDb();
  await db
    .delete(pg.tenantUserModuleRoles)
    .where(
      and(
        eq(pg.tenantUserModuleRoles.tenantId, input.tenantId),
        eq(pg.tenantUserModuleRoles.userId, input.userId),
        eq(pg.tenantUserModuleRoles.module, input.module)
      )
    );
};
