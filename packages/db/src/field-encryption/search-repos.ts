/**
 * Blind search token persistence and entity lookup queries.
 */

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  buildContainsQueryHashes,
  buildEqualityQueryHash,
  buildPrefixQueryHashes,
  buildSearchTokenSet,
  fuzzyMatchScore,
  type BlindIndexContext
} from "@starter/crypto";

import { getDb } from "../client.js";
import * as mysql from "../mysql-schema.js";
import * as pg from "../pg-schema.js";
import { dialectFromEnv } from "../schema.js";
import { searchableFieldsForTable } from "./registry.js";

const mysqlDb = (): MySql2Database<typeof mysql> => getDb() as MySql2Database<typeof mysql>;
const pgDb = (): NodePgDatabase<typeof pg> => getDb() as NodePgDatabase<typeof pg>;

export type SyncSearchTokensArgs = {
  /** DB `field_search_tokens.tenant_id` — null for platform-scoped rows. */
  tokenTenantId: string | null;
  /** HMAC scope (`tenantId` or `platform`). */
  blindIndexScopeId: string;
  entityTable: string;
  entityId: string;
  fieldName: string;
  plaintext: string;
  searchKeyB64: string;
  ngramSize: number;
};

const tokenTenantWhere = (tokenTenantId: string | null) => {
  if (dialectFromEnv() === "mysql") {
    return tokenTenantId
      ? eq(mysql.fieldSearchTokens.tenantId, tokenTenantId)
      : isNull(mysql.fieldSearchTokens.tenantId);
  }
  return tokenTenantId ? eq(pg.fieldSearchTokens.tenantId, tokenTenantId) : isNull(pg.fieldSearchTokens.tenantId);
};

/** Removes all search tokens for one entity field. */
export const deleteSearchTokensForField = async (
  tokenTenantId: string | null,
  entityTable: string,
  entityId: string,
  fieldName: string
): Promise<void> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db
      .delete(mysql.fieldSearchTokens)
      .where(
        and(
          tokenTenantWhere(tokenTenantId),
          eq(mysql.fieldSearchTokens.entityTable, entityTable),
          eq(mysql.fieldSearchTokens.entityId, entityId),
          eq(mysql.fieldSearchTokens.fieldName, fieldName)
        )
      );
    return;
  }
  const db = pgDb();
  await db
    .delete(pg.fieldSearchTokens)
    .where(
      and(
        tokenTenantWhere(tokenTenantId),
        eq(pg.fieldSearchTokens.entityTable, entityTable),
        eq(pg.fieldSearchTokens.entityId, entityId),
        eq(pg.fieldSearchTokens.fieldName, fieldName)
      )
    );
};

/** Replaces search tokens for a field value (delete + insert). */
export const syncSearchTokensForField = async (args: SyncSearchTokensArgs): Promise<void> => {
  const {
    tokenTenantId,
    blindIndexScopeId,
    entityTable,
    entityId,
    fieldName,
    plaintext,
    searchKeyB64,
    ngramSize
  } = args;

  await deleteSearchTokensForField(tokenTenantId, entityTable, entityId, fieldName);
  const ctx: BlindIndexContext = { tenantId: blindIndexScopeId, table: entityTable, field: fieldName };
  const tokenSet = buildSearchTokenSet(plaintext, ctx, searchKeyB64, ngramSize);
  const allHashes = [...new Set([...tokenSet.ngramHashes, ...tokenSet.prefixHashes])];
  if (tokenSet.equalityHash) allHashes.push(tokenSet.equalityHash);
  if (allHashes.length === 0) return;

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db.insert(mysql.fieldSearchTokens).values(
      allHashes.map((tokenHash) => ({
        tenantId: tokenTenantId,
        entityTable,
        entityId,
        fieldName,
        tokenHash
      }))
    );
    return;
  }
  const db = pgDb();
  await db.insert(pg.fieldSearchTokens).values(
    allHashes.map((tokenHash) => ({
      tenantId: tokenTenantId,
      entityTable,
      entityId,
      fieldName,
      tokenHash
    }))
  );
};

const findEntityIdsByFieldContains = async (
  tokenTenantId: string | null,
  entityTable: string,
  fieldName: string,
  queryHashes: string[]
): Promise<string[]> => {
  if (queryHashes.length === 0) return [];

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select({
        entityId: mysql.fieldSearchTokens.entityId,
        matched: sql<number>`COUNT(DISTINCT ${mysql.fieldSearchTokens.tokenHash})`.as("matched")
      })
      .from(mysql.fieldSearchTokens)
      .where(
        and(
          tokenTenantWhere(tokenTenantId),
          eq(mysql.fieldSearchTokens.entityTable, entityTable),
          eq(mysql.fieldSearchTokens.fieldName, fieldName),
          inArray(mysql.fieldSearchTokens.tokenHash, queryHashes)
        )
      )
      .groupBy(mysql.fieldSearchTokens.entityId)
      .having(sql`matched >= ${queryHashes.length}`);
    return rows.map((r) => r.entityId);
  }

  const db = pgDb();
  const rows = await db
    .select({
      entityId: pg.fieldSearchTokens.entityId,
      matched: sql<number>`COUNT(DISTINCT ${pg.fieldSearchTokens.tokenHash})`.as("matched")
    })
    .from(pg.fieldSearchTokens)
    .where(
      and(
        tokenTenantWhere(tokenTenantId),
        eq(pg.fieldSearchTokens.entityTable, entityTable),
        eq(pg.fieldSearchTokens.fieldName, fieldName),
        inArray(pg.fieldSearchTokens.tokenHash, queryHashes)
      )
    )
    .groupBy(pg.fieldSearchTokens.entityId)
    .having(sql`COUNT(DISTINCT ${pg.fieldSearchTokens.tokenHash}) >= ${queryHashes.length}`);
  return rows.map((r) => r.entityId);
};

/** Contains search across one field using blind index n-grams. */
export const findEntityIdsByContains = async (
  tokenTenantId: string | null,
  blindIndexScopeId: string,
  entityTable: string,
  fieldName: string,
  query: string,
  searchKeyB64: string,
  ngramSize: number
): Promise<string[]> => {
  const ctx: BlindIndexContext = { tenantId: blindIndexScopeId, table: entityTable, field: fieldName };
  const queryHashes = buildContainsQueryHashes(query, ctx, searchKeyB64, ngramSize);
  return findEntityIdsByFieldContains(tokenTenantId, entityTable, fieldName, queryHashes);
};

/** Exact equality search for one field (uses full-value blind-index token). */
export const findEntityIdsByExactFieldValue = async (
  tokenTenantId: string | null,
  blindIndexScopeId: string,
  entityTable: string,
  fieldName: string,
  plaintext: string,
  searchKeyB64: string
): Promise<string[]> => {
  const ctx: BlindIndexContext = { tenantId: blindIndexScopeId, table: entityTable, field: fieldName };
  const hash = buildEqualityQueryHash(plaintext, ctx, searchKeyB64);
  if (!hash) return [];
  return findEntityIdsByFieldContains(tokenTenantId, entityTable, fieldName, [hash]);
};

/** OR search across multiple searchable fields within one tenant (or platform scope). */
export const findEntityIdsByMultiFieldContains = async (
  tokenTenantId: string | null,
  blindIndexScopeId: string,
  tableKey: string,
  query: string,
  searchKeyB64: string,
  ngramSize: number
): Promise<string[]> => {
  const entityTable = tableKey;
  const fields = searchableFieldsForTable(tableKey);
  const ids = new Set<string>();
  for (const fieldName of fields) {
    const fieldIds = await findEntityIdsByContains(
      tokenTenantId,
      blindIndexScopeId,
      entityTable,
      fieldName,
      query,
      searchKeyB64,
      ngramSize
    );
    for (const id of fieldIds) ids.add(id);
  }
  return [...ids];
};

/**
 * Cross-tenant user search for super-admin lists.
 * Blind-index hashes are scope-specific — scans each distinct token tenant (including platform null).
 */
export const findUserIdsByGlobalSearch = async (
  query: string,
  searchKeyB64: string,
  ngramSize: number
): Promise<string[]> => {
  const fields = searchableFieldsForTable("users");
  const tenantIds = await listDistinctUserTokenTenantIds();
  const ids = new Set<string>();

  for (const fieldName of fields) {
    for (const tokenTenantId of tenantIds) {
      const blindIndexScopeId = tokenTenantId ?? "platform";
      const fieldIds = await findEntityIdsByContains(
        tokenTenantId,
        blindIndexScopeId,
        "users",
        fieldName,
        query,
        searchKeyB64,
        ngramSize
      );
      for (const id of fieldIds) ids.add(id);
    }
  }
  return [...ids];
};

const listDistinctUserTokenTenantIds = async (): Promise<(string | null)[]> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .selectDistinct({ tenantId: mysql.fieldSearchTokens.tenantId })
      .from(mysql.fieldSearchTokens)
      .where(eq(mysql.fieldSearchTokens.entityTable, "users"));
    return rows.map((r) => r.tenantId ?? null);
  }
  const db = pgDb();
  const rows = await db
    .selectDistinct({ tenantId: pg.fieldSearchTokens.tenantId })
    .from(pg.fieldSearchTokens)
    .where(eq(pg.fieldSearchTokens.entityTable, "users"));
  return rows.map((r) => r.tenantId ?? null);
};

/** Prefix/autocomplete search for one field. */
export const findEntityIdsByPrefix = async (
  tokenTenantId: string | null,
  blindIndexScopeId: string,
  entityTable: string,
  fieldName: string,
  query: string,
  searchKeyB64: string,
  ngramSize: number
): Promise<string[]> => {
  const ctx: BlindIndexContext = { tenantId: blindIndexScopeId, table: entityTable, field: fieldName };
  const queryHashes = buildPrefixQueryHashes(query, ctx, searchKeyB64, ngramSize);
  if (queryHashes.length === 0) return [];

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .selectDistinct({ entityId: mysql.fieldSearchTokens.entityId })
      .from(mysql.fieldSearchTokens)
      .where(
        and(
          tokenTenantWhere(tokenTenantId),
          eq(mysql.fieldSearchTokens.entityTable, entityTable),
          eq(mysql.fieldSearchTokens.fieldName, fieldName),
          inArray(mysql.fieldSearchTokens.tokenHash, queryHashes)
        )
      );
    return rows.map((r) => r.entityId);
  }

  const db = pgDb();
  const rows = await db
    .selectDistinct({ entityId: pg.fieldSearchTokens.entityId })
    .from(pg.fieldSearchTokens)
    .where(
      and(
        tokenTenantWhere(tokenTenantId),
        eq(pg.fieldSearchTokens.entityTable, entityTable),
        eq(pg.fieldSearchTokens.fieldName, fieldName),
        inArray(pg.fieldSearchTokens.tokenHash, queryHashes)
      )
    );
  return rows.map((r) => r.entityId);
};

/**
 * Fuzzy search: ranks entities by n-gram Jaccard overlap (threshold default 0.4).
 * Returns entity ids sorted by descending score.
 */
export const findEntityIdsByFuzzy = async (
  tokenTenantId: string | null,
  blindIndexScopeId: string,
  entityTable: string,
  fieldName: string,
  query: string,
  searchKeyB64: string,
  ngramSize: number,
  minScore = 0.4
): Promise<string[]> => {
  const ctx: BlindIndexContext = { tenantId: blindIndexScopeId, table: entityTable, field: fieldName };
  const queryHashes = buildContainsQueryHashes(query, ctx, searchKeyB64, ngramSize);
  if (queryHashes.length === 0) return [];

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select({
        entityId: mysql.fieldSearchTokens.entityId,
        tokenHash: mysql.fieldSearchTokens.tokenHash
      })
      .from(mysql.fieldSearchTokens)
      .where(
        and(
          tokenTenantWhere(tokenTenantId),
          eq(mysql.fieldSearchTokens.entityTable, entityTable),
          eq(mysql.fieldSearchTokens.fieldName, fieldName)
        )
      );
    return rankFuzzyCandidates(rows, queryHashes, minScore);
  }

  const db = pgDb();
  const rows = await db
    .select({
      entityId: pg.fieldSearchTokens.entityId,
      tokenHash: pg.fieldSearchTokens.tokenHash
    })
    .from(pg.fieldSearchTokens)
    .where(
      and(
        tokenTenantWhere(tokenTenantId),
        eq(pg.fieldSearchTokens.entityTable, entityTable),
        eq(pg.fieldSearchTokens.fieldName, fieldName)
      )
    );
  return rankFuzzyCandidates(rows, queryHashes, minScore);
};

const rankFuzzyCandidates = (
  rows: { entityId: string; tokenHash: string }[],
  queryHashes: string[],
  minScore: number
): string[] => {
  const byEntity = new Map<string, string[]>();
  for (const row of rows) {
    const list = byEntity.get(row.entityId) ?? [];
    list.push(row.tokenHash);
    byEntity.set(row.entityId, list);
  }
  const scored: { id: string; score: number }[] = [];
  for (const [id, hashes] of byEntity) {
    const score = fuzzyMatchScore(queryHashes, hashes);
    if (score >= minScore) scored.push({ id, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.id);
};

/** Deletes all search tokens for an entity (e.g. on row delete). */
export const deleteSearchTokensForEntity = async (
  tokenTenantId: string | null,
  entityTable: string,
  entityId: string
): Promise<void> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db
      .delete(mysql.fieldSearchTokens)
      .where(
        and(
          tokenTenantWhere(tokenTenantId),
          eq(mysql.fieldSearchTokens.entityTable, entityTable),
          eq(mysql.fieldSearchTokens.entityId, entityId)
        )
      );
    return;
  }
  const db = pgDb();
  await db
    .delete(pg.fieldSearchTokens)
    .where(
      and(
        tokenTenantWhere(tokenTenantId),
        eq(pg.fieldSearchTokens.entityTable, entityTable),
        eq(pg.fieldSearchTokens.entityId, entityId)
      )
    );
};

export { buildSearchTokenSet };
