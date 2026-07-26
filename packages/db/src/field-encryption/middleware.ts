/**
 * Transparent field encryption middleware — encrypt on write, decrypt on read.
 *
 * Business/repos pass plaintext objects; middleware transforms registered sensitive fields only.
 */

import {
  createWrappedTenantDek,
  decryptField,
  DekCache,
  encryptField,
  EnvKeyProvider,
  isFieldCipherEnvelope,
  kekFromEnv,
  logFieldDecrypt,
  ngramSizeFromEnv,
  noopFieldDecryptAuditLogger,
  searchIndexKeyFromEnv,
  storeWrappedDek,
  unwrapFieldCipherEnvelope,
  unwrapTenantDek,
  type FieldDecryptAuditLogger,
  type KeyProvider
} from "@starter/crypto";

import { and, eq, isNull } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { getDb } from "../client.js";
import * as mysql from "../mysql-schema.js";
import * as pg from "../pg-schema.js";
import { dialectFromEnv } from "../schema.js";
import { getFieldCryptoAuditContext } from "./context.js";
import { FIELD_ENCRYPTION_REGISTRY, type TableEncryptionConfig } from "./registry.js";
import { platformFieldCryptoScope, realmFieldCryptoScope, type FieldCryptoScope } from "./scope.js";
import { syncSearchTokensForField } from "./search-repos.js";

const mysqlDb = (): MySql2Database<typeof mysql> => getDb() as MySql2Database<typeof mysql>;
const pgDb = (): NodePgDatabase<typeof pg> => getDb() as NodePgDatabase<typeof pg>;

export type FieldEncryptionMiddlewareDeps = {
  keyProvider: KeyProvider;
  dekCache: DekCache;
  searchKeyB64: string | null;
  auditLogger?: FieldDecryptAuditLogger;
  ngramSize?: number;
};

export class FieldEncryptionMiddleware {
  private readonly keyProvider: KeyProvider;
  private readonly dekCache: DekCache;
  private readonly searchKeyB64: string | null;
  private readonly auditLogger: FieldDecryptAuditLogger;
  private readonly ngramSize: number;

  constructor(deps: FieldEncryptionMiddlewareDeps) {
    this.keyProvider = deps.keyProvider;
    this.dekCache = deps.dekCache;
    this.searchKeyB64 = deps.searchKeyB64;
    this.auditLogger = deps.auditLogger ?? noopFieldDecryptAuditLogger;
    this.ngramSize = deps.ngramSize ?? ngramSizeFromEnv();
  }

  /** True when FIELD_ENCRYPTION_KEY is configured. */
  isEnabled(): boolean {
    return true;
  }

  hasSearchIndex(): boolean {
    return this.searchKeyB64 != null;
  }

  getNgramSize(): number {
    return this.ngramSize;
  }

  getSearchKeyB64(): string | null {
    return this.searchKeyB64;
  }

  /** Loads or creates tenant DEK (cached). */
  async resolveTenantDek(tenantId: string): Promise<{ dek: Buffer; kv: number }> {
    const cached = this.dekCache.get(tenantId);
    if (cached) {
      return { dek: cached.dek, kv: cached.dekKeyVersion };
    }

    const row = await this.loadTenantCryptoRow(tenantId);
    if (!row?.encryptedDek) {
      await this.provisionTenantDek(tenantId);
      const refreshed = await this.loadTenantCryptoRow(tenantId);
      if (!refreshed?.encryptedDek) {
        throw new Error("Failed to provision tenant DEK");
      }
      const bundle = unwrapTenantDek(refreshed.encryptedDek, this.keyProvider);
      this.dekCache.set(tenantId, bundle.dek, bundle.dekKeyVersion);
      return { dek: bundle.dek, kv: bundle.dekKeyVersion };
    }

    const bundle = unwrapTenantDek(row.encryptedDek, this.keyProvider);
    this.dekCache.set(tenantId, bundle.dek, bundle.dekKeyVersion);
    return { dek: bundle.dek, kv: bundle.dekKeyVersion };
  }

  /** Loads realm tenant DEK (cached) or platform KEK scope when `tenantId` is null. */
  async resolveFieldCryptoScope(tenantId: string | null): Promise<FieldCryptoScope> {
    if (!tenantId) {
      const kek = kekFromEnv();
      if (!kek) throw new Error("FIELD_ENCRYPTION_KEY is not set");
      return platformFieldCryptoScope(this.keyProvider, kek);
    }
    const { dek, kv } = await this.resolveTenantDek(tenantId);
    return realmFieldCryptoScope(tenantId, dek, kv);
  }

  /**
   * Encrypts registered sensitive fields before INSERT/UPDATE.
   * When `changedFields` is set, only those fields are encrypted (others pass through).
   */
  async encryptForWrite(args: {
    tableKey: string;
    tenantId: string | null;
    row: Record<string, unknown>;
    changedFields?: Set<string>;
    entityId?: string;
  }): Promise<Record<string, unknown>> {
    const cfg = FIELD_ENCRYPTION_REGISTRY[args.tableKey];
    if (!cfg) return { ...args.row };

    const scope = await this.resolveFieldCryptoScope(args.tenantId);
    const out: Record<string, unknown> = { ...args.row };

    for (const [fieldName, def] of Object.entries(cfg.fields)) {
      if (!def.sensitive) continue;
      if (args.changedFields && !args.changedFields.has(fieldName)) continue;
      if (!(fieldName in args.row)) continue;

      const raw = args.row[fieldName];
      if (raw == null) {
        out[fieldName] = null;
        continue;
      }
      const plaintext = String(raw);
      out[fieldName] = encryptField(
        plaintext,
        scope.dek,
        { scopeId: scope.scopeId, table: cfg.tableName, field: fieldName },
        scope.kv
      );
    }

    if (args.entityId && this.searchKeyB64) {
      await this.syncSearchTokensForRow({
        tableKey: args.tableKey,
        tenantId: args.tenantId,
        entityId: args.entityId,
        row: out,
        plainRow: args.row,
        changedFields: args.changedFields,
        scope
      });
    }

    return out;
  }

  /** Decrypts registered sensitive fields after SELECT. */
  async decryptForRead(args: {
    tableKey: string;
    tenantId: string | null;
    row: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    const cfg = FIELD_ENCRYPTION_REGISTRY[args.tableKey];
    if (!cfg) return { ...args.row };

    let scope: FieldCryptoScope | null = null;

    const out: Record<string, unknown> = { ...args.row };
    const entityId = String(args.row[cfg.entityIdColumn] ?? "");
    const audit = getFieldCryptoAuditContext();

    for (const [fieldName, def] of Object.entries(cfg.fields)) {
      if (!def.sensitive) continue;
      const stored = args.row[fieldName];
      if (stored == null) continue;
      const storedStr = String(stored);

      if (isFieldCipherEnvelope(storedStr)) {
        if (!scope) {
          scope = await this.resolveFieldCryptoScope(args.tenantId);
        }
        out[fieldName] = unwrapFieldCipherEnvelope(storedStr, scope.dek, {
          scopeId: scope.scopeId,
          table: cfg.tableName,
          field: fieldName
        });
        logFieldDecrypt(this.auditLogger, {
          tenantId: args.tenantId ?? "platform",
          entityTable: cfg.tableName,
          entityId,
          field: fieldName,
          userId: audit?.userId,
          traceId: audit?.traceId
        });
        continue;
      }

      out[fieldName] = storedStr;
    }

    return out;
  }

  /** Syncs blind-index tokens after a row is persisted. */
  async syncSearchTokensForRow(args: {
    tableKey: string;
    tenantId: string | null;
    entityId: string;
    row: Record<string, unknown>;
    plainRow: Record<string, unknown>;
    changedFields?: Set<string>;
    scope?: FieldCryptoScope;
  }): Promise<void> {
    if (!this.searchKeyB64) return;
    const cfg = FIELD_ENCRYPTION_REGISTRY[args.tableKey];
    if (!cfg) return;

    const scope = args.scope ?? (await this.resolveFieldCryptoScope(args.tenantId));

    for (const [fieldName, def] of Object.entries(cfg.fields)) {
      if (!def.searchable) continue;
      if (args.changedFields && !args.changedFields.has(fieldName)) continue;

      const plainSource = args.plainRow[fieldName] ?? args.row[fieldName];
      const plaintext = plainSource == null ? "" : String(plainSource);
      await syncSearchTokensForField({
        tokenTenantId: scope.tokenTenantId,
        blindIndexScopeId: scope.blindIndexScopeId,
        entityTable: cfg.tableName,
        entityId: args.entityId,
        fieldName,
        plaintext,
        searchKeyB64: this.searchKeyB64,
        ngramSize: def.ngramSize ?? this.ngramSize
      });
    }
  }

  private async loadTenantCryptoRow(
    tenantId: string
  ): Promise<{ encryptedDek: string | null; dekKeyVersion: number } | undefined> {
    if (dialectFromEnv() === "mysql") {
      const db = mysqlDb();
      const rows = await db
        .select({
          encryptedDek: mysql.tenants.encryptedDek,
          dekKeyVersion: mysql.tenants.dekKeyVersion
        })
        .from(mysql.tenants)
        .where(eq(mysql.tenants.id, tenantId))
        .limit(1);
      return rows[0];
    }
    const db = pgDb();
    const rows = await db
      .select({
        encryptedDek: pg.tenants.encryptedDek,
        dekKeyVersion: pg.tenants.dekKeyVersion
      })
      .from(pg.tenants)
      .where(eq(pg.tenants.id, tenantId))
      .limit(1);
    return rows[0];
  }

  private async provisionTenantDek(tenantId: string): Promise<void> {
    const { plainDek, wrapped } = createWrappedTenantDek(this.keyProvider);
    const stored = storeWrappedDek(wrapped);
    try {
      if (dialectFromEnv() === "mysql") {
        const db = mysqlDb();
        await db
          .update(mysql.tenants)
          .set({ encryptedDek: stored, dekKeyVersion: wrapped.keyVersion })
          .where(and(eq(mysql.tenants.id, tenantId), isNull(mysql.tenants.encryptedDek)));
      } else {
        const db = pgDb();
        await db
          .update(pg.tenants)
          .set({ encryptedDek: stored, dekKeyVersion: wrapped.keyVersion })
          .where(and(eq(pg.tenants.id, tenantId), isNull(pg.tenants.encryptedDek)));
      }
    } finally {
      plainDek.fill(0);
    }
  }
}

let singleton: FieldEncryptionMiddleware | null = null;

/** Returns shared middleware when FIELD_ENCRYPTION_KEY is set; otherwise null. */
export const getFieldEncryptionMiddleware = (): FieldEncryptionMiddleware | null => {
  const kek = kekFromEnv();
  if (!kek) return null;
  if (!singleton) {
    singleton = new FieldEncryptionMiddleware({
      keyProvider: new EnvKeyProvider({ kekBase64: kek }),
      dekCache: new DekCache(),
      searchKeyB64: searchIndexKeyFromEnv()
    });
  }
  return singleton;
};

/** Resets singleton (tests). */
export const resetFieldEncryptionMiddlewareForTests = (): void => {
  singleton = null;
};

export const getTableConfig = (tableKey: string): TableEncryptionConfig | undefined =>
  FIELD_ENCRYPTION_REGISTRY[tableKey];
