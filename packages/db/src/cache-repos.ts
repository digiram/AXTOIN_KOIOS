/**
 * Database-backed KV cache (`app_cache_entries`) for Nominatim geocode and WS tickets.
 */

import { and, eq, lte, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { getDb } from "./client.js";
import * as mysql from "./mysql-schema.js";
import * as pg from "./pg-schema.js";
import { isMysqlDialect } from "./schema.js";

const mysqlDb = (): MySql2Database<typeof mysql> => getDb() as MySql2Database<typeof mysql>;
const pgDb = (): NodePgDatabase<typeof pg> => getDb() as NodePgDatabase<typeof pg>;

export const getCacheEntry = async (namespace: string, cacheKey: string): Promise<string | null> => {
  const now = new Date();
  if (isMysqlDialect()) {
    const db = mysqlDb();
    const rows = await db
      .select({ payload: mysql.appCacheEntries.payload, expiresAt: mysql.appCacheEntries.expiresAt })
      .from(mysql.appCacheEntries)
      .where(and(eq(mysql.appCacheEntries.namespace, namespace), eq(mysql.appCacheEntries.cacheKey, cacheKey)))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    if (row.expiresAt <= now) {
      await db
        .delete(mysql.appCacheEntries)
        .where(and(eq(mysql.appCacheEntries.namespace, namespace), eq(mysql.appCacheEntries.cacheKey, cacheKey)));
      return null;
    }
    return row.payload;
  }
  const db = pgDb();
  const rows = await db
    .select({ payload: pg.appCacheEntries.payload, expiresAt: pg.appCacheEntries.expiresAt })
    .from(pg.appCacheEntries)
    .where(and(eq(pg.appCacheEntries.namespace, namespace), eq(pg.appCacheEntries.cacheKey, cacheKey)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.expiresAt <= now) {
    await db
      .delete(pg.appCacheEntries)
      .where(and(eq(pg.appCacheEntries.namespace, namespace), eq(pg.appCacheEntries.cacheKey, cacheKey)));
    return null;
  }
  return row.payload;
};

export const setCacheEntry = async (input: {
  namespace: string;
  cacheKey: string;
  payload: string;
  expiresAt: Date;
}): Promise<void> => {
  const now = new Date();
  if (isMysqlDialect()) {
    const db = mysqlDb();
    await db
      .insert(mysql.appCacheEntries)
      .values({
        namespace: input.namespace,
        cacheKey: input.cacheKey,
        payload: input.payload,
        expiresAt: input.expiresAt,
        createdAt: now
      })
      .onDuplicateKeyUpdate({
        set: {
          payload: input.payload,
          expiresAt: input.expiresAt
        }
      });
    return;
  }
  const db = pgDb();
  await db
    .insert(pg.appCacheEntries)
    .values({
      namespace: input.namespace,
      cacheKey: input.cacheKey,
      payload: input.payload,
      expiresAt: input.expiresAt,
      createdAt: now
    })
    .onConflictDoUpdate({
      target: [pg.appCacheEntries.namespace, pg.appCacheEntries.cacheKey],
      set: {
        payload: input.payload,
        expiresAt: input.expiresAt
      }
    });
};

export const deleteCacheEntry = async (namespace: string, cacheKey: string): Promise<void> => {
  if (isMysqlDialect()) {
    const db = mysqlDb();
    await db
      .delete(mysql.appCacheEntries)
      .where(and(eq(mysql.appCacheEntries.namespace, namespace), eq(mysql.appCacheEntries.cacheKey, cacheKey)));
    return;
  }
  const db = pgDb();
  await db
    .delete(pg.appCacheEntries)
    .where(and(eq(pg.appCacheEntries.namespace, namespace), eq(pg.appCacheEntries.cacheKey, cacheKey)));
};

/** Batch-delete expired rows (worker GC). Returns rows removed. */
export const deleteExpiredCacheEntries = async (limit: number): Promise<number> => {
  const batch = Math.max(1, Math.min(limit, 5000));
  const now = new Date();
  if (isMysqlDialect()) {
    const db = mysqlDb();
    const result = await db.execute(
      sql`DELETE FROM app_cache_entries WHERE expires_at <= ${now} LIMIT ${batch}`
    );
    return Number((result as { affectedRows?: number }).affectedRows ?? 0);
  }
  const db = pgDb();
  const deleted = await db.execute(
    sql`DELETE FROM app_cache_entries WHERE ctid IN (
      SELECT ctid FROM app_cache_entries WHERE expires_at <= ${now} LIMIT ${batch}
    )`
  );
  return Number((deleted as { rowCount?: number }).rowCount ?? 0);
};
