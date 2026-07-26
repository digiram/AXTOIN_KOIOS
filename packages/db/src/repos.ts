/**
 * Data-access helpers for auth + encrypted profile fields.
 *
 * Why two casts (`mysqlDb` / `pgDb`)?
 * Drizzle's MySQL and Postgres drivers expose incompatible `.insert()` / `.select()` overload typings.
 * `getDb()` returns a **union**, which TypeScript cannot call methods on — we narrow by dialect once per
 * code path using small casts. Logic stays duplicated per dialect intentionally so types stay sound.
 *
 * Conventions:
 * - Email lookups normalize to lowercase before querying.
 * - When `FIELD_ENCRYPTION_KEY` is set: `users.email` uses SFENC1 envelope encryption and
 *   `identity_key` is HMAC-based (see `user-email-at-rest.ts`). Without that key, plaintext email + composite key.
 * - Tenant-scoped queries still filter by `tenant_id` where relevant.
 */

import { randomUUID } from "node:crypto";

import { createWrappedTenantDek, kekFromEnv, keyProviderFromEnv, storeWrappedDek } from "@starter/crypto";
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, like, or, sql, type SQL } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { getDb } from "./client.js";
import {
  decryptStoredUserEmail,
  decryptUserSensitiveRow,
  encryptUserSensitiveFields,
  findEntityIdsByMultiFieldContains,
  findUserIdsByGlobalSearch,
  getFieldEncryptionMiddleware,
  openTenantRow,
  openUserTaxIdAtRest,
  PLATFORM_SCOPE_ID,
  sealTenantName,
  sealUserTaxIdAtRest,
  TENANTS_TABLE_KEY
} from "./field-encryption/index.js";
import * as mysql from "./mysql-schema.js";
import * as pg from "./pg-schema.js";
import { dialectFromEnv } from "./schema.js";
import {
  computeTenantNameLookupKey,
  plaintextTenantNameLookupKey
} from "./tenant-name-at-rest.js";
import {
  fieldEncryptionKeyFromEnv,
  identityKeyForRealmUser,
  identityKeyForSuperUser,
  plaintextIdentityKey
} from "./user-email-at-rest.js";

/** Narrow `getDb()` for MySQL-flavored Drizzle APIs. */
const mysqlDb = (): MySql2Database<typeof mysql> => getDb() as MySql2Database<typeof mysql>;

/** Narrow `getDb()` for PostgreSQL-flavored Drizzle APIs. */
const pgDb = (): NodePgDatabase<typeof pg> => getDb() as NodePgDatabase<typeof pg>;

const plaintextUserEmail = async (r: {
  id?: string;
  userId?: string;
  tenantId?: string | null;
  email: string;
}): Promise<string> =>
  decryptStoredUserEmail({
    email: r.email,
    tenantId: r.tenantId ?? null,
    userId: r.id ?? r.userId ?? ""
  });

/**
 * Stable uniqueness for inserts (`SUPER:` prefix = platform admin with no tenant row).
 * When encryption is enabled, super-admin keys incorporate `assignedUserId` (see `identityKeyForSuperUser`).
 */
export const computeIdentityKey = (
  tenantId: string | null | undefined,
  emailLower: string,
  assignedUserId: string
): string => {
  const k = fieldEncryptionKeyFromEnv();
  if (!k) return plaintextIdentityKey(tenantId, emailLower);
  if (tenantId) return identityKeyForRealmUser(tenantId, emailLower, k);
  return identityKeyForSuperUser(emailLower, assignedUserId, k);
};

/** HMAC first, then plaintext composite keys for rows created before field encryption rollout. */
const realmIdentityKeysForLogin = (tenantId: string, emailLower: string): string[] => {
  const encKey = fieldEncryptionKeyFromEnv();
  if (!encKey) return [];
  const hmacKey = identityKeyForRealmUser(tenantId, emailLower, encKey);
  const plainKey = plaintextIdentityKey(tenantId, emailLower);
  return plainKey === hmacKey ? [hmacKey] : [hmacKey, plainKey];
};

/** HMAC first, then plaintext lookup keys for tenants created before field encryption rollout. */
const tenantLookupKeysForExactName = (nameTrimmed: string): string[] => {
  const hmacKey = computeTenantNameLookupKey(nameTrimmed);
  const encKey = fieldEncryptionKeyFromEnv();
  if (!encKey) return [hmacKey];
  const plainKey = plaintextTenantNameLookupKey(nameTrimmed);
  return plainKey === hmacKey ? [hmacKey] : [hmacKey, plainKey];
};

export type AuthUserRow = {
  id: string;
  tenantId: string | null;
  email: string;
  passwordHash: string;
  role: string;
  accessTokenVersion: number;
};

/** Realm login row including MFA columns (see `findUserByTenantEmail`). */
export type RealmLoginUserRow = AuthUserRow & {
  firstPasswordLoginAt: Date | null;
  mfaGraceExpiresAt: Date | null;
  mfaBlockedAt: Date | null;
  mfaTotpSecretEncrypted: string | null;
  mfaTotpEnabled: boolean;
  mfaTotpPendingSecretEncrypted: string | null;
  mfaTotpPendingExpiresAt: Date | null;
  mfaEmailEnabled: boolean;
};

/** Decrypts tenant `name` when field encryption is enabled. */
const openTenantNameRow = async (row: {
  id: string;
  name: string;
  realmSelfRegisterEnabled?: boolean;
  createdAt?: Date;
}): Promise<{ id: string; name: string; realmSelfRegisterEnabled?: boolean; createdAt?: Date }> => {
  const middleware = getFieldEncryptionMiddleware();
  if (!middleware) return row;
  const plain = await openTenantRow(row as Record<string, unknown>);
  return { ...row, name: String(plain.name ?? row.name) };
};

/** Looks up a tenant by exact realm key (`name_lookup_key`). */
export const findTenantByExactName = async (
  name: string
): Promise<{ id: string; name: string; realmSelfRegisterEnabled: boolean } | undefined> => {
  const trimmed = name.trim();
  for (const lookupKey of tenantLookupKeysForExactName(trimmed)) {
    if (dialectFromEnv() === "mysql") {
      const db = mysqlDb();
      const rows = await db
        .select({
          id: mysql.tenants.id,
          name: mysql.tenants.name,
          realmSelfRegisterEnabled: mysql.tenants.realmSelfRegisterEnabled
        })
        .from(mysql.tenants)
        .where(eq(mysql.tenants.nameLookupKey, lookupKey))
        .limit(1);
      const r = rows[0];
      if (!r) continue;
      const opened = await openTenantNameRow(r);
      return { ...opened, realmSelfRegisterEnabled: Boolean(opened.realmSelfRegisterEnabled ?? true) };
    }
    const db = pgDb();
    const rows = await db
      .select({
        id: pg.tenants.id,
        name: pg.tenants.name,
        realmSelfRegisterEnabled: pg.tenants.realmSelfRegisterEnabled
      })
      .from(pg.tenants)
      .where(eq(pg.tenants.nameLookupKey, lookupKey))
      .limit(1);
    const r = rows[0];
    if (!r) continue;
    const opened = await openTenantNameRow(r);
    return { ...opened, realmSelfRegisterEnabled: opened.realmSelfRegisterEnabled ?? true };
  }
  return undefined;
};

export type TenantGeneralSettingsRow = {
  realmSelfRegisterEnabled: boolean;
  mfaEnforced: boolean;
};

export const getTenantGeneralSettings = async (tenantId: string): Promise<TenantGeneralSettingsRow | undefined> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select({
        realmSelfRegisterEnabled: mysql.tenants.realmSelfRegisterEnabled,
        mfaEnforced: mysql.tenants.mfaEnforced
      })
      .from(mysql.tenants)
      .where(eq(mysql.tenants.id, tenantId))
      .limit(1);
    const r = rows[0];
    if (!r) return undefined;
    return {
      realmSelfRegisterEnabled: Boolean(r.realmSelfRegisterEnabled ?? true),
      mfaEnforced: Boolean(r.mfaEnforced)
    };
  }
  const db = pgDb();
  const rows = await db
    .select({
      realmSelfRegisterEnabled: pg.tenants.realmSelfRegisterEnabled,
      mfaEnforced: pg.tenants.mfaEnforced
    })
    .from(pg.tenants)
    .where(eq(pg.tenants.id, tenantId))
    .limit(1);
  const r = rows[0];
  if (!r) return undefined;
  return {
    realmSelfRegisterEnabled: r.realmSelfRegisterEnabled ?? true,
    mfaEnforced: r.mfaEnforced ?? false
  };
};

export const updateTenantRealmSelfRegisterEnabled = async (
  tenantId: string,
  realmSelfRegisterEnabled: boolean
): Promise<void> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db.update(mysql.tenants).set({ realmSelfRegisterEnabled }).where(eq(mysql.tenants.id, tenantId));
    return;
  }
  const db = pgDb();
  await db.update(pg.tenants).set({ realmSelfRegisterEnabled }).where(eq(pg.tenants.id, tenantId));
};

export const updateTenantMfaEnforced = async (tenantId: string, mfaEnforced: boolean): Promise<void> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db.update(mysql.tenants).set({ mfaEnforced }).where(eq(mysql.tenants.id, tenantId));
    return;
  }
  const db = pgDb();
  await db.update(pg.tenants).set({ mfaEnforced }).where(eq(pg.tenants.id, tenantId));
};

/**
 * SQL `LIKE` patterns for tenant `name` values created by integration/E2E fixtures
 * (`owner@<domain>` registration uses the email domain as the tenant key).
 */
export const TEST_TENANT_NAME_LIKE_PATTERNS = [
  "%.corp.test",
  "int-%.test",
  "bill-%",
  "bill2-%",
  "e2e-%.corp.test"
] as const;

/** Deletes a tenant row; child rows cascade via FK `ON DELETE CASCADE`. */
export const deleteTenantById = async (tenantId: string): Promise<boolean> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const result = await db.delete(mysql.tenants).where(eq(mysql.tenants.id, tenantId));
    const affected = (result as unknown as { affectedRows?: number }).affectedRows ?? 0;
    return affected > 0;
  }
  const db = pgDb();
  const deleted = await db
    .delete(pg.tenants)
    .where(eq(pg.tenants.id, tenantId))
    .returning({ id: pg.tenants.id });
  return deleted.length > 0;
};

export const deleteTenantsByIds = async (tenantIds: string[]): Promise<void> => {
  const unique = [...new Set(tenantIds.filter(Boolean))];
  for (const id of unique) {
    await deleteTenantById(id);
  }
};

/** Lists tenant ids whose decrypted `name` matches fixture patterns (integration/E2E leftovers). */
export const listTestFixtureTenantIds = async (): Promise<string[]> => {
  const middleware = getFieldEncryptionMiddleware();
  const matchesPattern = (plainName: string): boolean =>
    TEST_TENANT_NAME_LIKE_PATTERNS.some((pattern) => {
      const re = new RegExp(
        `^${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".")}$`,
        "i"
      );
      return re.test(plainName);
    });

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db.select({ id: mysql.tenants.id, name: mysql.tenants.name }).from(mysql.tenants);
    const out: string[] = [];
    for (const row of rows) {
      const opened = middleware ? await openTenantNameRow(row) : row;
      if (matchesPattern(opened.name)) out.push(row.id);
    }
    return out;
  }
  const db = pgDb();
  const rows = await db.select({ id: pg.tenants.id, name: pg.tenants.name }).from(pg.tenants);
  const out: string[] = [];
  for (const row of rows) {
    const opened = middleware ? await openTenantNameRow(row) : row;
    if (matchesPattern(opened.name)) out.push(row.id);
  }
  return out;
};

/** Removes tenants created by test fixtures (safe to run on dev DBs only). */
export const purgeTestFixtureTenants = async (): Promise<number> => {
  const ids = await listTestFixtureTenantIds();
  await deleteTenantsByIds(ids);
  return ids.length;
};

const isTenantNameUniqueViolation = (err: unknown): boolean => {
  if (err === null || typeof err !== "object") return false;
  const code = "code" in err ? String((err as { code: unknown }).code) : "";
  const errno = "errno" in err ? Number((err as { errno: unknown }).errno) : NaN;
  const message = "message" in err ? String((err as { message: unknown }).message) : "";
  return (
    code === "23505" ||
    errno === 1062 ||
    message.includes("tenants_name_lookup_key_unique") ||
    message.includes("tenants_name_unique")
  );
};

/** Creates a tenant row; returns generated id (explicit UUID string on MySQL, DB default on Postgres). */
export const createTenantWithName = async (name: string): Promise<{ id: string }> => {
  const trimmed = name.trim();
  const nameLookupKey = computeTenantNameLookupKey(trimmed);
  const kek = kekFromEnv();
  let encryptedDek: string | undefined;
  let dekKeyVersion: number | undefined;
  if (kek) {
    const keyProvider = keyProviderFromEnv();
    const { plainDek, wrapped } = createWrappedTenantDek(keyProvider);
    try {
      encryptedDek = storeWrappedDek(wrapped);
      dekKeyVersion = wrapped.keyVersion;
    } finally {
      plainDek.fill(0);
    }
  }

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const id = randomUUID();
    const storedName = getFieldEncryptionMiddleware()
      ? await sealTenantName(id, trimmed)
      : trimmed;
    await db.insert(mysql.tenants).values({
      id,
      name: storedName,
      nameLookupKey,
      ...(encryptedDek ? { encryptedDek, dekKeyVersion: dekKeyVersion ?? 1 } : {})
    });
    const middleware = getFieldEncryptionMiddleware();
    if (middleware?.hasSearchIndex()) {
      await middleware.syncSearchTokensForRow({
        tableKey: TENANTS_TABLE_KEY,
        tenantId: null,
        entityId: id,
        row: { name: storedName },
        plainRow: { name: trimmed },
        changedFields: new Set(["name"])
      });
    }
    return { id };
  }
  const db = pgDb();
  const inserted = await db
    .insert(pg.tenants)
    .values({
      name: trimmed,
      nameLookupKey,
      ...(encryptedDek ? { encryptedDek, dekKeyVersion: dekKeyVersion ?? 1 } : {})
    })
    .returning({ id: pg.tenants.id });
  const row = inserted[0];
  if (!row) {
    throw new Error("Failed to create tenant");
  }
  const storedName = getFieldEncryptionMiddleware()
    ? await sealTenantName(row.id, trimmed)
    : trimmed;
  if (storedName !== trimmed) {
    await db.update(pg.tenants).set({ name: storedName }).where(eq(pg.tenants.id, row.id));
  }
  const middleware = getFieldEncryptionMiddleware();
  if (middleware?.hasSearchIndex()) {
    await middleware.syncSearchTokensForRow({
      tableKey: TENANTS_TABLE_KEY,
      tenantId: null,
      entityId: row.id,
      row: { name: storedName },
      plainRow: { name: trimmed },
      changedFields: new Set(["name"])
    });
  }
  return { id: row.id };
};

/** Resolves tenant id by name, creating the row when absent (handles concurrent signup races). */
export const findOrCreateTenantByName = async (name: string): Promise<{ id: string }> => {
  const trimmed = name.trim();
  const existing = await findTenantByExactName(trimmed);
  if (existing) return { id: existing.id };
  try {
    return await createTenantWithName(trimmed);
  } catch (err) {
    if (!isTenantNameUniqueViolation(err)) throw err;
    const raced = await findTenantByExactName(trimmed);
    if (!raced) throw err;
    return { id: raced.id };
  }
};

/** Inserts a user. Omit `tenantId` (or pass null) only for `super_admin` platform accounts. */
export const insertUser = async (input: {
  tenantId?: string | null;
  email: string;
  passwordHash: string;
  displayName?: string | null;
  /** Defaults to `tenant_user`; signup passes `tenant_admin`; super-admin bootstrap passes `super_admin`. */
  role?: string;
}): Promise<{ id: string; role: string }> => {
  const email = input.email.toLowerCase();
  const role = input.role ?? "tenant_user";
  const middleware = getFieldEncryptionMiddleware();

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const id = randomUUID();
    const identityKey = computeIdentityKey(input.tenantId ?? null, email, id);
    let storedEmail = email;
    let displayNameStored: string | null = input.displayName ?? null;
    if (middleware) {
      const encrypted = await encryptUserSensitiveFields({
        tenantId: input.tenantId ?? null,
        row: {
          email,
          displayName: input.displayName ?? null,
          tenantId: input.tenantId ?? null
        },
        changedFields: new Set([
          "email",
          ...(input.displayName !== undefined ? (["displayName"] as const) : [])
        ]),
        entityId: id
      });
      storedEmail = String(encrypted.email ?? email);
      displayNameStored = (encrypted.displayName as string | null) ?? input.displayName ?? null;
      if (middleware.hasSearchIndex()) {
        await middleware.syncSearchTokensForRow({
          tableKey: "users",
          tenantId: input.tenantId ?? null,
          entityId: id,
          row: encrypted,
          plainRow: { email, displayName: input.displayName ?? null }
        });
      }
    }
    await db.insert(mysql.users).values({
      id,
      tenantId: input.tenantId ?? null,
      email: storedEmail,
      role,
      identityKey,
      passwordHash: input.passwordHash,
      displayName: displayNameStored
    });
    return { id, role };
  }
  const db = pgDb();
  const id = randomUUID();
  const identityKey = computeIdentityKey(input.tenantId ?? null, email, id);
  let storedEmail = email;
  let displayNameStored: string | null = input.displayName ?? null;
  if (middleware) {
    const encrypted = await encryptUserSensitiveFields({
      tenantId: input.tenantId ?? null,
      row: {
        email,
        displayName: input.displayName ?? null,
        tenantId: input.tenantId ?? null
      },
      changedFields: new Set([
        "email",
        ...(input.displayName !== undefined ? (["displayName"] as const) : [])
      ]),
      entityId: id
    });
    storedEmail = String(encrypted.email ?? email);
    displayNameStored = (encrypted.displayName as string | null) ?? input.displayName ?? null;
    if (middleware.hasSearchIndex()) {
      await middleware.syncSearchTokensForRow({
        tableKey: "users",
        tenantId: input.tenantId ?? null,
        entityId: id,
        row: encrypted,
        plainRow: { email, displayName: input.displayName ?? null }
      });
    }
  }
  const inserted = await db
    .insert(pg.users)
    .values({
      id,
      tenantId: input.tenantId ?? null,
      email: storedEmail,
      role,
      identityKey,
      passwordHash: input.passwordHash,
      displayName: displayNameStored
    })
    .returning({ id: pg.users.id, role: pg.users.role });
  const row = inserted[0];
  if (!row) {
    throw new Error("Failed to create user");
  }
  return { id: row.id, role: row.role };
};

/** Platform login: single global super admin row per email (`tenant_id` IS NULL). */
export const findSuperAdminByEmail = async (
  email: string
): Promise<AuthUserRow | undefined> => {
  const normalized = email.toLowerCase();
  const encKey = fieldEncryptionKeyFromEnv();
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    if (!encKey) {
      const rows = await db
        .select({
          id: mysql.users.id,
          tenantId: mysql.users.tenantId,
          email: mysql.users.email,
          passwordHash: mysql.users.passwordHash,
          role: mysql.users.role,
          accessTokenVersion: mysql.users.accessTokenVersion
        })
        .from(mysql.users)
        .where(and(isNull(mysql.users.tenantId), eq(mysql.users.email, normalized)))
        .limit(1);
      const r = rows[0];
      if (!r) return undefined;
      return {
        id: r.id,
        tenantId: r.tenantId ?? null,
        email: await plaintextUserEmail(r),
        passwordHash: r.passwordHash,
        role: r.role,
        accessTokenVersion: Number(r.accessTokenVersion ?? 0)
      };
    }
    const rows = await db
      .select({
        id: mysql.users.id,
        tenantId: mysql.users.tenantId,
        email: mysql.users.email,
        passwordHash: mysql.users.passwordHash,
        role: mysql.users.role,
        accessTokenVersion: mysql.users.accessTokenVersion
      })
      .from(mysql.users)
      .where(and(isNull(mysql.users.tenantId), eq(mysql.users.role, "super_admin")))
      .orderBy(asc(mysql.users.id));
    for (const r of rows) {
      const plain = await plaintextUserEmail(r);
      if (plain && plain.toLowerCase() === normalized) {
        return {
          id: r.id,
          tenantId: r.tenantId ?? null,
          email: plain,
          passwordHash: r.passwordHash,
          role: r.role,
          accessTokenVersion: Number(r.accessTokenVersion ?? 0)
        };
      }
    }
    return undefined;
  }

  const db = pgDb();
  if (!encKey) {
    const rows = await db
      .select({
        id: pg.users.id,
        tenantId: pg.users.tenantId,
        email: pg.users.email,
        passwordHash: pg.users.passwordHash,
        role: pg.users.role,
        accessTokenVersion: pg.users.accessTokenVersion
      })
      .from(pg.users)
      .where(and(isNull(pg.users.tenantId), eq(pg.users.email, normalized)))
      .limit(1);
    const r = rows[0];
    if (!r) return undefined;
    return {
      id: r.id,
      tenantId: r.tenantId ?? null,
      email: await plaintextUserEmail(r),
      passwordHash: r.passwordHash,
      role: r.role,
      accessTokenVersion: r.accessTokenVersion ?? 0
    };
  }

  const rows = await db
    .select({
      id: pg.users.id,
      tenantId: pg.users.tenantId,
      email: pg.users.email,
      passwordHash: pg.users.passwordHash,
      role: pg.users.role,
      accessTokenVersion: pg.users.accessTokenVersion
    })
    .from(pg.users)
    .where(and(isNull(pg.users.tenantId), eq(pg.users.role, "super_admin")))
    .orderBy(asc(pg.users.id));
  for (const r of rows) {
    const plain = await plaintextUserEmail(r);
    if (plain && plain.toLowerCase() === normalized) {
      return {
        id: r.id,
        tenantId: r.tenantId ?? null,
        email: plain,
        passwordHash: r.passwordHash,
        role: r.role,
        accessTokenVersion: r.accessTokenVersion ?? 0
      };
    }
  }
  return undefined;
};

/** Primary lookup for tenant login: composite natural key (tenant + email). */
export const findUserByTenantEmail = async (
  tenantId: string,
  email: string
): Promise<RealmLoginUserRow | undefined> => {
  const normalized = email.toLowerCase();
  const encKey = fieldEncryptionKeyFromEnv();
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const selectShape = {
      id: mysql.users.id,
      tenantId: mysql.users.tenantId,
      email: mysql.users.email,
      passwordHash: mysql.users.passwordHash,
      role: mysql.users.role,
      accessTokenVersion: mysql.users.accessTokenVersion,
      firstPasswordLoginAt: mysql.users.firstPasswordLoginAt,
      mfaGraceExpiresAt: mysql.users.mfaGraceExpiresAt,
      mfaBlockedAt: mysql.users.mfaBlockedAt,
      mfaTotpSecretEncrypted: mysql.users.mfaTotpSecretEncrypted,
      mfaTotpEnabled: mysql.users.mfaTotpEnabled,
      mfaTotpPendingSecretEncrypted: mysql.users.mfaTotpPendingSecretEncrypted,
      mfaTotpPendingExpiresAt: mysql.users.mfaTotpPendingExpiresAt,
      mfaEmailEnabled: mysql.users.mfaEmailEnabled
    } as const;
    const wheres = encKey
      ? realmIdentityKeysForLogin(tenantId, normalized).map((identityKey) =>
          and(eq(mysql.users.tenantId, tenantId), eq(mysql.users.identityKey, identityKey))
        )
      : [and(eq(mysql.users.tenantId, tenantId), eq(mysql.users.email, normalized))];
    for (const where of wheres) {
      const rows = await db.select(selectShape).from(mysql.users).where(where).limit(1);
      const r = rows[0];
      if (!r) continue;
      return {
        id: r.id,
        tenantId: r.tenantId ?? null,
        email: await plaintextUserEmail(r),
        passwordHash: r.passwordHash,
        role: r.role,
        accessTokenVersion: Number(r.accessTokenVersion ?? 0),
        firstPasswordLoginAt: r.firstPasswordLoginAt ?? null,
        mfaGraceExpiresAt: r.mfaGraceExpiresAt ?? null,
        mfaBlockedAt: r.mfaBlockedAt ?? null,
        mfaTotpSecretEncrypted: r.mfaTotpSecretEncrypted ?? null,
        mfaTotpEnabled: Boolean(r.mfaTotpEnabled),
        mfaTotpPendingSecretEncrypted: r.mfaTotpPendingSecretEncrypted ?? null,
        mfaTotpPendingExpiresAt: r.mfaTotpPendingExpiresAt ?? null,
        mfaEmailEnabled: Boolean(r.mfaEmailEnabled)
      };
    }
    return undefined;
  }

  const db = pgDb();
  const selectShape = {
    id: pg.users.id,
    tenantId: pg.users.tenantId,
    email: pg.users.email,
    passwordHash: pg.users.passwordHash,
    role: pg.users.role,
    accessTokenVersion: pg.users.accessTokenVersion,
    firstPasswordLoginAt: pg.users.firstPasswordLoginAt,
    mfaGraceExpiresAt: pg.users.mfaGraceExpiresAt,
    mfaBlockedAt: pg.users.mfaBlockedAt,
    mfaTotpSecretEncrypted: pg.users.mfaTotpSecretEncrypted,
    mfaTotpEnabled: pg.users.mfaTotpEnabled,
    mfaTotpPendingSecretEncrypted: pg.users.mfaTotpPendingSecretEncrypted,
    mfaTotpPendingExpiresAt: pg.users.mfaTotpPendingExpiresAt,
    mfaEmailEnabled: pg.users.mfaEmailEnabled
  } as const;
  const wheres = encKey
    ? realmIdentityKeysForLogin(tenantId, normalized).map((identityKey) =>
        and(eq(pg.users.tenantId, tenantId), eq(pg.users.identityKey, identityKey))
      )
    : [and(eq(pg.users.tenantId, tenantId), eq(pg.users.email, normalized))];
  for (const where of wheres) {
    const rows = await db.select(selectShape).from(pg.users).where(where).limit(1);
    const r = rows[0];
    if (!r) continue;
    return {
      id: r.id,
      tenantId: r.tenantId ?? null,
      email: await plaintextUserEmail(r),
      passwordHash: r.passwordHash,
      role: r.role,
      accessTokenVersion: r.accessTokenVersion ?? 0,
      firstPasswordLoginAt: r.firstPasswordLoginAt ?? null,
      mfaGraceExpiresAt: r.mfaGraceExpiresAt ?? null,
      mfaBlockedAt: r.mfaBlockedAt ?? null,
      mfaTotpSecretEncrypted: r.mfaTotpSecretEncrypted ?? null,
      mfaTotpEnabled: r.mfaTotpEnabled ?? false,
      mfaTotpPendingSecretEncrypted: r.mfaTotpPendingSecretEncrypted ?? null,
      mfaTotpPendingExpiresAt: r.mfaTotpPendingExpiresAt ?? null,
      mfaEmailEnabled: r.mfaEmailEnabled ?? false
    };
  }
  return undefined;
};

/** Counts `tenant_admin` rows for a tenant (used to decide signup role for domain-based realms). */
export const countTenantAdmins = async (tenantId: string): Promise<number> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select({ c: count() })
      .from(mysql.users)
      .where(and(eq(mysql.users.tenantId, tenantId), eq(mysql.users.role, "tenant_admin")));
    return Number(rows[0]?.c ?? 0);
  }
  const db = pgDb();
  const rows = await db
    .select({ c: count() })
    .from(pg.users)
    .where(and(eq(pg.users.tenantId, tenantId), eq(pg.users.role, "tenant_admin")));
  return Number(rows[0]?.c ?? 0);
};

/** Persists only the **hash** of the opaque refresh token (never store plaintext). */
export const insertRefreshToken = async (input: {
  userId: string;
  tenantId?: string | null;
  tokenHash: string;
  expiresAt: Date;
  /** When present (mobile session), tying refresh rotation + revocation to `user_devices.id`. */
  userDeviceId?: string | null;
}) => {
  const tenantId = input.tenantId ?? null;
  const userDeviceId = input.userDeviceId ?? null;
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const id = randomUUID();
    await db.insert(mysql.refreshTokens).values({
      id,
      userId: input.userId,
      tenantId,
      userDeviceId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt
    });
    return { id };
  }

  const db = pgDb();
  const inserted = await db
    .insert(pg.refreshTokens)
    .values({
      userId: input.userId,
      tenantId,
      userDeviceId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt
    })
    .returning({ id: pg.refreshTokens.id });
  const row = inserted[0];
  if (!row) {
    throw new Error("Failed to create refresh token");
  }
  return row;
};

/** Join result used when exchanging a refresh token for new credentials. */
export type RefreshWithUser = {
  tokenId: string;
  userId: string;
  tenantId: string | null;
  userDeviceId: string | null;
  expiresAt: Date;
  email: string;
  role: string;
  accessTokenVersion: number;
};

/**
 * Locate refresh token row + owning user email for JWT signing after rotation.
 * Driver quirks: coerce `expiresAt` to `Date` when MySQL returns string timestamps.
 */
export const findRefreshTokenWithUser = async (
  tokenHash: string
): Promise<RefreshWithUser | undefined> => {
  const encKey = fieldEncryptionKeyFromEnv();
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select({
        tokenId: mysql.refreshTokens.id,
        userId: mysql.users.id,
        tenantId: mysql.refreshTokens.tenantId,
        userDeviceId: mysql.refreshTokens.userDeviceId,
        expiresAt: mysql.refreshTokens.expiresAt,
        email: mysql.users.email,
        role: mysql.users.role,
        accessTokenVersion: mysql.users.accessTokenVersion
      })
      .from(mysql.refreshTokens)
      .innerJoin(mysql.users, eq(mysql.refreshTokens.userId, mysql.users.id))
      .where(eq(mysql.refreshTokens.tokenHash, tokenHash))
      .limit(1);
    const row = rows[0];
    if (!row) return undefined;
    return {
      tokenId: row.tokenId,
      userId: row.userId,
      tenantId: row.tenantId,
      userDeviceId: row.userDeviceId ?? null,
      expiresAt: row.expiresAt instanceof Date ? row.expiresAt : new Date(row.expiresAt),
      email: await plaintextUserEmail(row),
      role: row.role,
      accessTokenVersion: Number(row.accessTokenVersion ?? 0)
    };
  }

  const db = pgDb();
  const rows = await db
    .select({
      tokenId: pg.refreshTokens.id,
      userId: pg.users.id,
      tenantId: pg.refreshTokens.tenantId,
      userDeviceId: pg.refreshTokens.userDeviceId,
      expiresAt: pg.refreshTokens.expiresAt,
      email: pg.users.email,
      role: pg.users.role,
      accessTokenVersion: pg.users.accessTokenVersion
    })
    .from(pg.refreshTokens)
    .innerJoin(pg.users, eq(pg.refreshTokens.userId, pg.users.id))
    .leftJoin(pg.userDevices, eq(pg.refreshTokens.userDeviceId, pg.userDevices.id))
    .where(
      and(
        eq(pg.refreshTokens.tokenHash, tokenHash),
        or(isNull(pg.refreshTokens.userDeviceId), isNull(pg.userDevices.revokedAt))
      )
    )
    .limit(1);
  const row = rows[0];
  if (!row) return undefined;
  return {
    tokenId: row.tokenId,
    userId: row.userId,
    tenantId: row.tenantId,
    userDeviceId: row.userDeviceId ?? null,
    expiresAt: row.expiresAt instanceof Date ? row.expiresAt : new Date(row.expiresAt),
    email: await plaintextUserEmail(row),
    role: row.role,
    accessTokenVersion: row.accessTokenVersion ?? 0
  };
};

/** Deletes a refresh token row after successful rotation or cleanup of expired tokens. */
export const deleteRefreshTokenById = async (tokenId: string) => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db.delete(mysql.refreshTokens).where(eq(mysql.refreshTokens.id, tokenId));
    return;
  }
  const db = pgDb();
  await db.delete(pg.refreshTokens).where(eq(pg.refreshTokens.id, tokenId));
};

/** Revokes all refresh sessions for a user (e.g. after password change). */
export const deleteRefreshTokensByUserId = async (userId: string): Promise<void> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db.delete(mysql.refreshTokens).where(eq(mysql.refreshTokens.userId, userId));
    return;
  }
  const db = pgDb();
  await db.delete(pg.refreshTokens).where(eq(pg.refreshTokens.userId, userId));
};

/** Remove active refresh sessions bound to a device before marking `revoked_at`. */
export const deleteRefreshTokensByUserDeviceId = async (userDeviceId: string): Promise<void> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db.delete(mysql.refreshTokens).where(eq(mysql.refreshTokens.userDeviceId, userDeviceId));
    return;
  }
  const db = pgDb();
  await db.delete(pg.refreshTokens).where(eq(pg.refreshTokens.userDeviceId, userDeviceId));
};

export type UserDeviceRecord = {
  id: string;
  platform: string;
  label: string | null;
  installKey: string;
  createdAt: Date;
  lastSeenAt: Date;
};

export const listActiveUserDevicesForUser = async (userId: string): Promise<UserDeviceRecord[]> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select({
        id: mysql.userDevices.id,
        platform: mysql.userDevices.platform,
        label: mysql.userDevices.label,
        installKey: mysql.userDevices.installKey,
        createdAt: mysql.userDevices.createdAt,
        lastSeenAt: mysql.userDevices.lastSeenAt
      })
      .from(mysql.userDevices)
      .where(and(eq(mysql.userDevices.userId, userId), isNull(mysql.userDevices.revokedAt)));
    return rows.map((r) => ({
      id: r.id,
      platform: r.platform,
      label: r.label ?? null,
      installKey: r.installKey,
      createdAt: r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt),
      lastSeenAt: r.lastSeenAt instanceof Date ? r.lastSeenAt : new Date(r.lastSeenAt)
    }));
  }
  const db = pgDb();
  const rows = await db
    .select({
      id: pg.userDevices.id,
      platform: pg.userDevices.platform,
      label: pg.userDevices.label,
      installKey: pg.userDevices.installKey,
      createdAt: pg.userDevices.createdAt,
      lastSeenAt: pg.userDevices.lastSeenAt
    })
    .from(pg.userDevices)
    .where(and(eq(pg.userDevices.userId, userId), isNull(pg.userDevices.revokedAt)));
  return rows.map((r) => ({
    id: r.id,
    platform: r.platform,
    label: r.label ?? null,
    installKey: r.installKey,
    createdAt: r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt),
    lastSeenAt: r.lastSeenAt instanceof Date ? r.lastSeenAt : new Date(r.lastSeenAt)
  }));
};

/**
 * Creates or updates a row keyed by `(userId, installKey)` for React Native login registration.
 * Clears `revoked_at` when the same install reconnects after policy allowed re-login.
 */
export const upsertUserMobileDevice = async (
  userId: string,
  input: { installKey: string; platform: string; label?: string | null; pushToken?: string | null }
): Promise<string> => {
  const label = input.label ?? null;
  const pushToken = input.pushToken ?? null;
  const now = new Date();

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const existing = await db
      .select({ id: mysql.userDevices.id })
      .from(mysql.userDevices)
      .where(and(eq(mysql.userDevices.userId, userId), eq(mysql.userDevices.installKey, input.installKey)))
      .limit(1);
    const hit = existing[0];
    if (hit) {
      await db
        .update(mysql.userDevices)
        .set({
          platform: input.platform,
          label,
          pushToken,
          lastSeenAt: now,
          revokedAt: null
        })
        .where(eq(mysql.userDevices.id, hit.id));
      return hit.id;
    }
    const id = randomUUID();
    await db.insert(mysql.userDevices).values({
      id,
      userId,
      installKey: input.installKey,
      platform: input.platform,
      label,
      pushToken,
      createdAt: now,
      lastSeenAt: now
    });
    return id;
  }

  const db = pgDb();
  const existing = await db
    .select({ id: pg.userDevices.id })
    .from(pg.userDevices)
    .where(and(eq(pg.userDevices.userId, userId), eq(pg.userDevices.installKey, input.installKey)))
    .limit(1);
  const hit = existing[0];
  if (hit) {
    await db
      .update(pg.userDevices)
      .set({
        platform: input.platform,
        label,
        pushToken,
        lastSeenAt: now,
        revokedAt: null
      })
      .where(eq(pg.userDevices.id, hit.id));
    return hit.id;
  }
  const inserted = await db
    .insert(pg.userDevices)
    .values({
      userId,
      installKey: input.installKey,
      platform: input.platform,
      label,
      pushToken,
      createdAt: now,
      lastSeenAt: now
    })
    .returning({ id: pg.userDevices.id });
  const row = inserted[0];
  if (!row) throw new Error("Failed to insert user device");
  return row.id;
};

/** Deletes refresh rows for the device and marks `revoked_at`. Returns false if not found / wrong owner. */
export const revokeUserDeviceForUser = async (userId: string, deviceId: string): Promise<boolean> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select({ id: mysql.userDevices.id })
      .from(mysql.userDevices)
      .where(and(eq(mysql.userDevices.id, deviceId), eq(mysql.userDevices.userId, userId)))
      .limit(1);
    if (!rows[0]) return false;
    await deleteRefreshTokensByUserDeviceId(deviceId);
    await db
      .update(mysql.userDevices)
      .set({ revokedAt: new Date() })
      .where(eq(mysql.userDevices.id, deviceId));
    return true;
  }
  const db = pgDb();
  const rows = await db
    .select({ id: pg.userDevices.id })
    .from(pg.userDevices)
    .where(and(eq(pg.userDevices.id, deviceId), eq(pg.userDevices.userId, userId)))
    .limit(1);
  if (!rows[0]) return false;
  await deleteRefreshTokensByUserDeviceId(deviceId);
  await db.update(pg.userDevices).set({ revokedAt: new Date() }).where(eq(pg.userDevices.id, deviceId));
  return true;
};

/** Stores encrypted tax identifier for the authenticated realm user. */
export const updateUserTaxIdAtRest = async (
  userId: string,
  tenantId: string,
  taxId: string
): Promise<void> => {
  const encryptedTaxId = await sealUserTaxIdAtRest(tenantId, taxId);
  await updateEncryptedTaxIdForUser(userId, tenantId, encryptedTaxId);
};

/** Returns decrypted tax id for the authenticated realm user. */
export const getUserTaxIdAtRest = async (
  userId: string,
  tenantId: string
): Promise<string | null> => {
  const encrypted = await getEncryptedTaxIdForUser(userId, tenantId);
  if (!encrypted?.trim()) return null;
  return openUserTaxIdAtRest(tenantId, encrypted);
};

/** Writes ciphertext into `users.encrypted_tax_id`. */
export const updateEncryptedTaxIdForUser = async (
  userId: string,
  tenantId: string,
  encryptedTaxId: string | null
) => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db
      .update(mysql.users)
      .set({ encryptedTaxId })
      .where(and(eq(mysql.users.id, userId), eq(mysql.users.tenantId, tenantId)));
    return;
  }
  const db = pgDb();
  await db
    .update(pg.users)
    .set({ encryptedTaxId })
    .where(and(eq(pg.users.id, userId), eq(pg.users.tenantId, tenantId)));
};

/** Reads ciphertext column for decryption in the API layer. */
export const getEncryptedTaxIdForUser = async (
  userId: string,
  tenantId: string
): Promise<string | null | undefined> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select({ encryptedTaxId: mysql.users.encryptedTaxId })
      .from(mysql.users)
      .where(and(eq(mysql.users.id, userId), eq(mysql.users.tenantId, tenantId)))
      .limit(1);
    return rows[0]?.encryptedTaxId;
  }

  const db = pgDb();
  const rows = await db
    .select({ encryptedTaxId: pg.users.encryptedTaxId })
    .from(pg.users)
    .where(and(eq(pg.users.id, userId), eq(pg.users.tenantId, tenantId)))
    .limit(1);
  return rows[0]?.encryptedTaxId;
};

/** Non-sensitive account preferences + email for `/account/settings` (JWT `sub` scopes the row). */
export type AccountSettingsRow = {
  email: string;
  displayName: string | null;
  countryCode: string | null;
  measurementSystem: string | null;
  timezone: string | null;
  currencyCode: string | null;
  currencyFormat: string | null;
  dateTimeFormat: string | null;
  /** `12h` | `24h`; null = follow tenant Finance default. */
  timeFormat: string | null;
  homeAddressLine1: string | null;
  homeAddressLine2: string | null;
  homePostalCode: string | null;
  homeCity: string | null;
  homeState: string | null;
  homeCountry: string | null;
};

export const getAccountSettingsByUserId = async (
  userId: string
): Promise<AccountSettingsRow | undefined> => {
  const userSelect = {
    id: mysql.users.id,
    tenantId: mysql.users.tenantId,
    email: mysql.users.email,
    displayName: mysql.users.displayName,
    countryCode: mysql.users.countryCode,
    measurementSystem: mysql.users.measurementSystem,
    timezone: mysql.users.timezone,
    currencyCode: mysql.users.currencyCode,
    currencyFormat: mysql.users.currencyFormat,
    dateTimeFormat: mysql.users.dateTimeFormat,
    timeFormat: mysql.users.timeFormat,
    homeAddressLine1: mysql.users.homeAddressLine1,
    homeAddressLine2: mysql.users.homeAddressLine2,
    homePostalCode: mysql.users.homePostalCode,
    homeCity: mysql.users.homeCity,
    homeState: mysql.users.homeState,
    homeCountry: mysql.users.homeCountry
  };
  const mapSettings = async (
    r: typeof userSelect extends infer _ ? Record<string, unknown> : never
  ): Promise<AccountSettingsRow> => {
    const plain = await decryptUserSensitiveRow(r);
    return {
      email: String(plain.email ?? ""),
      displayName: (plain.displayName as string | null) ?? null,
      countryCode: (r.countryCode as string | null) ?? null,
      measurementSystem: (r.measurementSystem as string | null) ?? null,
      timezone: (r.timezone as string | null) ?? null,
      currencyCode: (r.currencyCode as string | null) ?? null,
      currencyFormat: (r.currencyFormat as string | null) ?? null,
      dateTimeFormat: (r.dateTimeFormat as string | null) ?? null,
      timeFormat: (r.timeFormat as string | null) ?? null,
      homeAddressLine1: (plain.homeAddressLine1 as string | null) ?? null,
      homeAddressLine2: (plain.homeAddressLine2 as string | null) ?? null,
      homePostalCode: (plain.homePostalCode as string | null) ?? null,
      homeCity: (plain.homeCity as string | null) ?? null,
      homeState: (plain.homeState as string | null) ?? null,
      homeCountry: (plain.homeCountry as string | null) ?? null
    };
  };

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select(userSelect)
      .from(mysql.users)
      .where(eq(mysql.users.id, userId))
      .limit(1);
    const r = rows[0];
    if (!r) return undefined;
    return mapSettings(r as Record<string, unknown>);
  }
  const db = pgDb();
  const rows = await db
    .select({
      id: pg.users.id,
      tenantId: pg.users.tenantId,
      email: pg.users.email,
      displayName: pg.users.displayName,
      countryCode: pg.users.countryCode,
      measurementSystem: pg.users.measurementSystem,
      timezone: pg.users.timezone,
      currencyCode: pg.users.currencyCode,
      currencyFormat: pg.users.currencyFormat,
      dateTimeFormat: pg.users.dateTimeFormat,
      timeFormat: pg.users.timeFormat,
      homeAddressLine1: pg.users.homeAddressLine1,
      homeAddressLine2: pg.users.homeAddressLine2,
      homePostalCode: pg.users.homePostalCode,
      homeCity: pg.users.homeCity,
      homeState: pg.users.homeState,
      homeCountry: pg.users.homeCountry
    })
    .from(pg.users)
    .where(eq(pg.users.id, userId))
    .limit(1);
  const r = rows[0];
  if (!r) return undefined;
  return mapSettings(r as Record<string, unknown>);
};

export type AccountSettingsPatch = Partial<{
  displayName: string | null;
  countryCode: string | null;
  measurementSystem: string | null;
  timezone: string | null;
  currencyCode: string | null;
  currencyFormat: string | null;
  dateTimeFormat: string | null;
  timeFormat: string | null;
  homeAddressLine1: string | null;
  homeAddressLine2: string | null;
  homePostalCode: string | null;
  homeCity: string | null;
  homeState: string | null;
  homeCountry: string | null;
}>;

export const updateAccountSettingsByUserId = async (
  userId: string,
  patch: AccountSettingsPatch
): Promise<void> => {
  const setMysql: Partial<typeof mysql.users.$inferInsert> = {};
  const setPg: Partial<typeof pg.users.$inferInsert> = {};
  if (patch.displayName !== undefined) {
    setMysql.displayName = patch.displayName;
    setPg.displayName = patch.displayName;
  }
  if (patch.countryCode !== undefined) {
    setMysql.countryCode = patch.countryCode;
    setPg.countryCode = patch.countryCode;
  }
  if (patch.measurementSystem !== undefined) {
    setMysql.measurementSystem = patch.measurementSystem;
    setPg.measurementSystem = patch.measurementSystem;
  }
  if (patch.timezone !== undefined) {
    setMysql.timezone = patch.timezone;
    setPg.timezone = patch.timezone;
  }
  if (patch.currencyCode !== undefined) {
    setMysql.currencyCode = patch.currencyCode;
    setPg.currencyCode = patch.currencyCode;
  }
  if (patch.currencyFormat !== undefined) {
    setMysql.currencyFormat = patch.currencyFormat;
    setPg.currencyFormat = patch.currencyFormat;
  }
  if (patch.dateTimeFormat !== undefined) {
    setMysql.dateTimeFormat = patch.dateTimeFormat;
    setPg.dateTimeFormat = patch.dateTimeFormat;
  }
  if (patch.timeFormat !== undefined) {
    setMysql.timeFormat = patch.timeFormat;
    setPg.timeFormat = patch.timeFormat;
  }
  if (patch.homeAddressLine1 !== undefined) {
    setMysql.homeAddressLine1 = patch.homeAddressLine1;
    setPg.homeAddressLine1 = patch.homeAddressLine1;
  }
  if (patch.homeAddressLine2 !== undefined) {
    setMysql.homeAddressLine2 = patch.homeAddressLine2;
    setPg.homeAddressLine2 = patch.homeAddressLine2;
  }
  if (patch.homePostalCode !== undefined) {
    setMysql.homePostalCode = patch.homePostalCode;
    setPg.homePostalCode = patch.homePostalCode;
  }
  if (patch.homeCity !== undefined) {
    setMysql.homeCity = patch.homeCity;
    setPg.homeCity = patch.homeCity;
  }
  if (patch.homeState !== undefined) {
    setMysql.homeState = patch.homeState;
    setPg.homeState = patch.homeState;
  }
  if (patch.homeCountry !== undefined) {
    setMysql.homeCountry = patch.homeCountry;
    setPg.homeCountry = patch.homeCountry;
  }

  const sensitiveFieldNames = [
    "displayName",
    "homeAddressLine1",
    "homeAddressLine2",
    "homePostalCode",
    "homeCity",
    "homeState",
    "homeCountry"
  ] as const;
  const sensitivePatch: Record<string, unknown> = {};
  const changedFields = new Set<string>();
  for (const field of sensitiveFieldNames) {
    if (patch[field] !== undefined) {
      sensitivePatch[field] = patch[field];
      changedFields.add(field);
    }
  }

  if (changedFields.size > 0) {
    const scope = await getUserTenantIdAndRoleById(userId);
    const tenantId = scope?.tenantId ?? null;
    const encrypted = await encryptUserSensitiveFields({
      tenantId,
      row: sensitivePatch,
      changedFields,
      entityId: userId
    });
    for (const field of changedFields) {
      const value = encrypted[field];
      if (field === "displayName") {
        setMysql.displayName = value as string | null;
        setPg.displayName = value as string | null;
      } else if (field === "homeAddressLine1") {
        setMysql.homeAddressLine1 = value as string | null;
        setPg.homeAddressLine1 = value as string | null;
      } else if (field === "homeAddressLine2") {
        setMysql.homeAddressLine2 = value as string | null;
        setPg.homeAddressLine2 = value as string | null;
      } else if (field === "homePostalCode") {
        setMysql.homePostalCode = value as string | null;
        setPg.homePostalCode = value as string | null;
      } else if (field === "homeCity") {
        setMysql.homeCity = value as string | null;
        setPg.homeCity = value as string | null;
      } else if (field === "homeState") {
        setMysql.homeState = value as string | null;
        setPg.homeState = value as string | null;
      } else if (field === "homeCountry") {
        setMysql.homeCountry = value as string | null;
        setPg.homeCountry = value as string | null;
      }
    }
    const middleware = getFieldEncryptionMiddleware();
    if (middleware?.hasSearchIndex()) {
      await middleware.syncSearchTokensForRow({
        tableKey: "users",
        tenantId,
        entityId: userId,
        row: encrypted,
        plainRow: sensitivePatch,
        changedFields
      });
    }
  }

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    if (Object.keys(setMysql).length === 0) return;
    await db.update(mysql.users).set(setMysql).where(eq(mysql.users.id, userId));
    return;
  }
  const db = pgDb();
  if (Object.keys(setPg).length === 0) return;
  await db.update(pg.users).set(setPg).where(eq(pg.users.id, userId));
};

/** Returns Argon2 hash for password verification (never expose to clients). */
export const getUserPasswordHashById = async (userId: string): Promise<string | undefined> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select({ passwordHash: mysql.users.passwordHash })
      .from(mysql.users)
      .where(eq(mysql.users.id, userId))
      .limit(1);
    return rows[0]?.passwordHash;
  }
  const db = pgDb();
  const rows = await db
    .select({ passwordHash: pg.users.passwordHash })
    .from(pg.users)
    .where(eq(pg.users.id, userId))
    .limit(1);
  return rows[0]?.passwordHash;
};

/** Role only — used when password reset must be gated by `super_admin` vs realm accounts. */
export const getUserRoleById = async (userId: string): Promise<string | undefined> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select({ role: mysql.users.role })
      .from(mysql.users)
      .where(eq(mysql.users.id, userId))
      .limit(1);
    return rows[0]?.role;
  }
  const db = pgDb();
  const rows = await db
    .select({ role: pg.users.role })
    .from(pg.users)
    .where(eq(pg.users.id, userId))
    .limit(1);
  return rows[0]?.role;
};

/** Primary sign-in email for a user row (lowercase in DB). */
export const getUserEmailById = async (userId: string): Promise<string | undefined> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select({
        id: mysql.users.id,
        tenantId: mysql.users.tenantId,
        email: mysql.users.email,
      })
      .from(mysql.users)
      .where(eq(mysql.users.id, userId))
      .limit(1);
    const r = rows[0];
    if (!r) return undefined;
    return (await plaintextUserEmail(r)) || undefined;
  }
  const db = pgDb();
  const rows = await db
    .select({
      id: pg.users.id,
      tenantId: pg.users.tenantId,
      email: pg.users.email,
    })
    .from(pg.users)
    .where(eq(pg.users.id, userId))
    .limit(1);
  const r = rows[0];
  if (!r) return undefined;
  return (await plaintextUserEmail(r)) || undefined;
};

/** Display name or decrypted email — for short UI labels (e.g. funnel activity text). */
export const getUserDisplayLabelById = async (userId: string): Promise<string | null> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select({
        id: mysql.users.id,
        tenantId: mysql.users.tenantId,
        displayName: mysql.users.displayName,
        email: mysql.users.email,
      })
      .from(mysql.users)
      .where(eq(mysql.users.id, userId))
      .limit(1);
    const r = rows[0];
    if (!r) return null;
    const plain = await decryptUserSensitiveRow(r);
    const email = String(plain.email ?? "");
    const dn = (plain.displayName as string | null)?.trim();
    return dn || email || null;
  }
  const db = pgDb();
  const rows = await db
    .select({
      id: pg.users.id,
      tenantId: pg.users.tenantId,
      displayName: pg.users.displayName,
      email: pg.users.email,
    })
    .from(pg.users)
    .where(eq(pg.users.id, userId))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  const plain = await decryptUserSensitiveRow(r);
  const email = String(plain.email ?? "");
  const dn = (plain.displayName as string | null)?.trim();
  return dn || email || null;
};

/** `tenant_id` + `role` for a row — reset endpoints enforce realm vs platform membership. */
export const getUserTenantIdAndRoleById = async (
  userId: string
): Promise<{ tenantId: string | null; role: string } | undefined> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select({ tenantId: mysql.users.tenantId, role: mysql.users.role })
      .from(mysql.users)
      .where(eq(mysql.users.id, userId))
      .limit(1);
    const row = rows[0];
    if (!row) return undefined;
    return { tenantId: row.tenantId ?? null, role: row.role };
  }
  const db = pgDb();
  const rows = await db
    .select({ tenantId: pg.users.tenantId, role: pg.users.role })
    .from(pg.users)
    .where(eq(pg.users.id, userId))
    .limit(1);
  const row = rows[0];
  if (!row) return undefined;
  return { tenantId: row.tenantId ?? null, role: row.role };
};

export const updateUserPasswordHashById = async (userId: string, passwordHash: string): Promise<void> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db
      .update(mysql.users)
      .set({
        passwordHash,
        accessTokenVersion: sql`${mysql.users.accessTokenVersion} + 1`
      })
      .where(eq(mysql.users.id, userId));
    await deleteRefreshTokensByUserId(userId);
    return;
  }
  const db = pgDb();
  await db
    .update(pg.users)
    .set({
      passwordHash,
      accessTokenVersion: sql`${pg.users.accessTokenVersion} + 1`
    })
    .where(eq(pg.users.id, userId));
  await deleteRefreshTokensByUserId(userId);
};

/** Bump access-token generation — invalidates outstanding access JWTs (e.g. admin MFA reset). */
export const incrementUserAccessTokenVersionById = async (userId: string): Promise<void> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db
      .update(mysql.users)
      .set({ accessTokenVersion: sql`${mysql.users.accessTokenVersion} + 1` })
      .where(eq(mysql.users.id, userId));
    return;
  }
  const db = pgDb();
  await db
    .update(pg.users)
    .set({ accessTokenVersion: sql`${pg.users.accessTokenVersion} + 1` })
    .where(eq(pg.users.id, userId));
};

export const getUserAccessTokenVersionById = async (userId: string): Promise<number | undefined> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select({ accessTokenVersion: mysql.users.accessTokenVersion })
      .from(mysql.users)
      .where(eq(mysql.users.id, userId))
      .limit(1);
    if (!rows[0]) return undefined;
    return Number(rows[0].accessTokenVersion ?? 0);
  }
  const db = pgDb();
  const rows = await db
    .select({ accessTokenVersion: pg.users.accessTokenVersion })
    .from(pg.users)
    .where(eq(pg.users.id, userId))
    .limit(1);
  if (!rows[0]) return undefined;
  return rows[0].accessTokenVersion ?? 0;
};

/** Escapes `%`, `_`, and `\` inside the substring matched by SQL `LIKE` / `ILIKE`. */
const escapeSqlLikeFragment = (s: string): string =>
  s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");

/** Inputs validated by `@starter/shared` `platformUsersQuerySchema` at the HTTP boundary. */
export type ListPlatformUsersParams = {
  page: number;
  pageSize: number;
  sort: "email" | "displayName" | "role" | "createdAt" | "tenantName";
  order: "asc" | "desc";
  q?: string;
  role?: "super_admin" | "tenant_admin" | "tenant_user";
  realm: "all" | "platform" | "realm";
};

export type PlatformUserRow = {
  id: string;
  tenantId: string | null;
  tenantName: string | null;
  email: string;
  displayName: string | null;
  role: string;
  createdAt: Date;
};

export type ListPlatformUsersResult = {
  rows: PlatformUserRow[];
  total: number;
};

const coerceDate = (v: Date | string): Date => (v instanceof Date ? v : new Date(v));

export const listPlatformUsers = async (params: ListPlatformUsersParams): Promise<ListPlatformUsersResult> => {
  if (dialectFromEnv() === "mysql") {
    return listPlatformUsersMysql(params);
  }
  return listPlatformUsersPg(params);
};

const listPlatformUsersPg = async (params: ListPlatformUsersParams): Promise<ListPlatformUsersResult> => {
  const db = pgDb();
  const offset = (params.page - 1) * params.pageSize;
  const limit = params.pageSize;

  const parts: SQL[] = [];
  if (params.q?.trim()) {
    const raw = params.q.trim();
    const middleware = getFieldEncryptionMiddleware();
    const pat = `%${escapeSqlLikeFragment(raw)}%`;
    const displayMatch = sql`COALESCE(${pg.users.displayName}, '') ILIKE ${pat}`;
    if (middleware?.hasSearchIndex()) {
      const ids = await findUserIdsByGlobalSearch(
        raw,
        middleware.getSearchKeyB64()!,
        middleware.getNgramSize()
      );
      parts.push(ids.length > 0 ? or(inArray(pg.users.id, ids), displayMatch)! : displayMatch);
    } else {
      parts.push(displayMatch);
    }
  }
  if (params.role) {
    parts.push(eq(pg.users.role, params.role));
  }
  if (params.realm === "platform") {
    parts.push(isNull(pg.users.tenantId));
  } else if (params.realm === "realm") {
    parts.push(isNotNull(pg.users.tenantId));
  }

  const whereClause = parts.length ? and(...parts) : undefined;

  const dir = params.order === "asc" ? asc : desc;
  const orderByCols = (() => {
    switch (params.sort) {
      case "email":
        return [dir(sql`lower(coalesce(${pg.users.displayName}, ''))`), dir(pg.users.id)];
      case "displayName":
        return [dir(pg.users.displayName)];
      case "role":
        return [dir(pg.users.role)];
      case "createdAt":
        return [dir(pg.users.createdAt)];
      case "tenantName":
        return [dir(sql<string>`COALESCE(${pg.tenants.name}, '')`)];
      default:
        return [dir(pg.users.createdAt)];
    }
  })();

  const rowRows = await db
    .select({
      id: pg.users.id,
      tenantId: pg.users.tenantId,
      email: pg.users.email,
      displayName: pg.users.displayName,
      role: pg.users.role,
      createdAt: pg.users.createdAt,
      tenantName: pg.tenants.name
    })
    .from(pg.users)
    .leftJoin(pg.tenants, eq(pg.users.tenantId, pg.tenants.id))
    .where(whereClause)
    .orderBy(...orderByCols)
    .limit(limit)
    .offset(offset);

  const countRows = await db
    .select({ c: count() })
    .from(pg.users)
    .leftJoin(pg.tenants, eq(pg.users.tenantId, pg.tenants.id))
    .where(whereClause);

  const total = Number(countRows[0]?.c ?? 0);

  return {
    rows: await Promise.all(
      rowRows.map(async (r) => {
        const plain = await decryptUserSensitiveRow(r);
        return {
          id: r.id,
          tenantId: r.tenantId ?? null,
          tenantName: r.tenantName ?? null,
          email: String(plain.email ?? ""),
          displayName: (plain.displayName as string | null) ?? null,
          role: r.role,
          createdAt: coerceDate(r.createdAt)
        };
      })
    ),
    total
  };
};

const listPlatformUsersMysql = async (params: ListPlatformUsersParams): Promise<ListPlatformUsersResult> => {
  const db = mysqlDb();
  const offset = (params.page - 1) * params.pageSize;
  const limit = params.pageSize;

  const parts: SQL[] = [];
  if (params.q?.trim()) {
    const raw = params.q.trim();
    const middleware = getFieldEncryptionMiddleware();
    const pat = `%${escapeSqlLikeFragment(raw)}%`;
    const displayMatch = sql`LOWER(COALESCE(${mysql.users.displayName}, '')) LIKE LOWER(${pat})`;
    if (middleware?.hasSearchIndex()) {
      const ids = await findUserIdsByGlobalSearch(
        raw,
        middleware.getSearchKeyB64()!,
        middleware.getNgramSize()
      );
      parts.push(ids.length > 0 ? or(inArray(mysql.users.id, ids), displayMatch)! : displayMatch);
    } else {
      parts.push(displayMatch);
    }
  }
  if (params.role) {
    parts.push(eq(mysql.users.role, params.role));
  }
  if (params.realm === "platform") {
    parts.push(isNull(mysql.users.tenantId));
  } else if (params.realm === "realm") {
    parts.push(isNotNull(mysql.users.tenantId));
  }

  const whereClause = parts.length ? and(...parts) : undefined;

  const dir = params.order === "asc" ? asc : desc;
  const orderByCols = (() => {
    switch (params.sort) {
      case "email":
        return [dir(sql`lower(coalesce(${mysql.users.displayName}, ''))`), dir(mysql.users.id)];
      case "displayName":
        return [dir(mysql.users.displayName)];
      case "role":
        return [dir(mysql.users.role)];
      case "createdAt":
        return [dir(mysql.users.createdAt)];
      case "tenantName":
        return [dir(sql<string>`COALESCE(${mysql.tenants.name}, '')`)];
      default:
        return [dir(mysql.users.createdAt)];
    }
  })();

  const rowRows = await db
    .select({
      id: mysql.users.id,
      tenantId: mysql.users.tenantId,
      email: mysql.users.email,
      displayName: mysql.users.displayName,
      role: mysql.users.role,
      createdAt: mysql.users.createdAt,
      tenantName: mysql.tenants.name
    })
    .from(mysql.users)
    .leftJoin(mysql.tenants, eq(mysql.users.tenantId, mysql.tenants.id))
    .where(whereClause)
    .orderBy(...orderByCols)
    .limit(limit)
    .offset(offset);

  const countRows = await db
    .select({ c: count() })
    .from(mysql.users)
    .leftJoin(mysql.tenants, eq(mysql.users.tenantId, mysql.tenants.id))
    .where(whereClause);

  const total = Number(countRows[0]?.c ?? 0);

  return {
    rows: await Promise.all(
      rowRows.map(async (r) => {
        const plain = await decryptUserSensitiveRow(r);
        return {
          id: r.id,
          tenantId: r.tenantId ?? null,
          tenantName: r.tenantName ?? null,
          email: String(plain.email ?? ""),
          displayName: (plain.displayName as string | null) ?? null,
          role: r.role,
          createdAt: coerceDate(r.createdAt)
        };
      })
    ),
    total
  };
};

/** Inputs validated by `@starter/shared` `tenantUsersQuerySchema`; rows limited to one realm tenant. */
export type ListTenantUsersParams = {
  tenantId: string;
  page: number;
  pageSize: number;
  sort: "email" | "displayName" | "role" | "createdAt";
  order: "asc" | "desc";
  q?: string;
  role?: "tenant_admin" | "tenant_user";
};

export const listTenantUsers = async (params: ListTenantUsersParams): Promise<ListPlatformUsersResult> => {
  if (dialectFromEnv() === "mysql") {
    return listTenantUsersMysql(params);
  }
  return listTenantUsersPg(params);
};

const listTenantUsersPg = async (params: ListTenantUsersParams): Promise<ListPlatformUsersResult> => {
  const db = pgDb();
  const offset = (params.page - 1) * params.pageSize;
  const limit = params.pageSize;

  const parts: SQL[] = [eq(pg.users.tenantId, params.tenantId)];
  if (params.q?.trim()) {
    const raw = params.q.trim();
    const middleware = getFieldEncryptionMiddleware();
    const pat = `%${escapeSqlLikeFragment(raw)}%`;
    const displayMatch = sql`COALESCE(${pg.users.displayName}, '') ILIKE ${pat}`;
    if (middleware?.hasSearchIndex()) {
      const ids = await findEntityIdsByMultiFieldContains(
        params.tenantId,
        params.tenantId,
        "users",
        raw,
        middleware.getSearchKeyB64()!,
        middleware.getNgramSize()
      );
      parts.push(ids.length > 0 ? or(inArray(pg.users.id, ids), displayMatch)! : displayMatch);
    } else {
      parts.push(displayMatch);
    }
  }
  if (params.role) {
    parts.push(eq(pg.users.role, params.role));
  }

  const whereClause = and(...parts)!;

  const dir = params.order === "asc" ? asc : desc;
  const orderByCols = (() => {
    switch (params.sort) {
      case "email":
        return [dir(sql`lower(coalesce(${pg.users.displayName}, ''))`), dir(pg.users.id)];
      case "displayName":
        return [dir(pg.users.displayName)];
      case "role":
        return [dir(pg.users.role)];
      case "createdAt":
        return [dir(pg.users.createdAt)];
      default:
        return [dir(pg.users.createdAt)];
    }
  })();

  const rowRows = await db
    .select({
      id: pg.users.id,
      tenantId: pg.users.tenantId,
      email: pg.users.email,
      displayName: pg.users.displayName,
      role: pg.users.role,
      createdAt: pg.users.createdAt,
      tenantName: pg.tenants.name
    })
    .from(pg.users)
    .leftJoin(pg.tenants, eq(pg.users.tenantId, pg.tenants.id))
    .where(whereClause)
    .orderBy(...orderByCols)
    .limit(limit)
    .offset(offset);

  const countRows = await db
    .select({ c: count() })
    .from(pg.users)
    .where(whereClause);

  const total = Number(countRows[0]?.c ?? 0);

  return {
    rows: await Promise.all(
      rowRows.map(async (r) => {
        const plain = await decryptUserSensitiveRow(r);
        return {
          id: r.id,
          tenantId: r.tenantId ?? null,
          tenantName: r.tenantName ?? null,
          email: String(plain.email ?? ""),
          displayName: (plain.displayName as string | null) ?? null,
          role: r.role,
          createdAt: coerceDate(r.createdAt)
        };
      })
    ),
    total
  };
};

const listTenantUsersMysql = async (params: ListTenantUsersParams): Promise<ListPlatformUsersResult> => {
  const db = mysqlDb();
  const offset = (params.page - 1) * params.pageSize;
  const limit = params.pageSize;

  const parts: SQL[] = [eq(mysql.users.tenantId, params.tenantId)];
  if (params.q?.trim()) {
    const raw = params.q.trim();
    const middleware = getFieldEncryptionMiddleware();
    const pat = `%${escapeSqlLikeFragment(raw)}%`;
    const displayMatch = sql`LOWER(COALESCE(${mysql.users.displayName}, '')) LIKE LOWER(${pat})`;
    if (middleware?.hasSearchIndex()) {
      const ids = await findEntityIdsByMultiFieldContains(
        params.tenantId,
        params.tenantId,
        "users",
        raw,
        middleware.getSearchKeyB64()!,
        middleware.getNgramSize()
      );
      parts.push(ids.length > 0 ? or(inArray(mysql.users.id, ids), displayMatch)! : displayMatch);
    } else {
      parts.push(displayMatch);
    }
  }
  if (params.role) {
    parts.push(eq(mysql.users.role, params.role));
  }

  const whereClause = and(...parts)!;

  const dir = params.order === "asc" ? asc : desc;
  const orderByCols = (() => {
    switch (params.sort) {
      case "email":
        return [dir(sql`lower(coalesce(${mysql.users.displayName}, ''))`), dir(mysql.users.id)];
      case "displayName":
        return [dir(mysql.users.displayName)];
      case "role":
        return [dir(mysql.users.role)];
      case "createdAt":
        return [dir(mysql.users.createdAt)];
      default:
        return [dir(mysql.users.createdAt)];
    }
  })();

  const rowRows = await db
    .select({
      id: mysql.users.id,
      tenantId: mysql.users.tenantId,
      email: mysql.users.email,
      displayName: mysql.users.displayName,
      role: mysql.users.role,
      createdAt: mysql.users.createdAt,
      tenantName: mysql.tenants.name
    })
    .from(mysql.users)
    .leftJoin(mysql.tenants, eq(mysql.users.tenantId, mysql.tenants.id))
    .where(whereClause)
    .orderBy(...orderByCols)
    .limit(limit)
    .offset(offset);

  const countRows = await db
    .select({ c: count() })
    .from(mysql.users)
    .where(whereClause);

  const total = Number(countRows[0]?.c ?? 0);

  return {
    rows: await Promise.all(
      rowRows.map(async (r) => {
        const plain = await decryptUserSensitiveRow(r);
        return {
          id: r.id,
          tenantId: r.tenantId ?? null,
          tenantName: r.tenantName ?? null,
          email: String(plain.email ?? ""),
          displayName: (plain.displayName as string | null) ?? null,
          role: r.role,
          createdAt: coerceDate(r.createdAt)
        };
      })
    ),
    total
  };
};

export type PlatformTenantRow = {
  id: string;
  name: string;
  createdAt: Date;
};

export type ListPlatformTenantsParams = {
  page: number;
  pageSize: number;
  q?: string;
};

export type ListPlatformTenantsResult = {
  rows: PlatformTenantRow[];
  total: number;
};

export const findTenantById = async (tenantId: string): Promise<{ id: string; name: string } | undefined> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select({ id: mysql.tenants.id, name: mysql.tenants.name })
      .from(mysql.tenants)
      .where(eq(mysql.tenants.id, tenantId))
      .limit(1);
    const row = rows[0];
    return row ? await openTenantNameRow(row) : undefined;
  }
  const db = pgDb();
  const rows = await db
    .select({ id: pg.tenants.id, name: pg.tenants.name })
    .from(pg.tenants)
    .where(eq(pg.tenants.id, tenantId))
    .limit(1);
  const row = rows[0];
  return row ? await openTenantNameRow(row) : undefined;
};

const tenantListSearchIds = async (query: string): Promise<string[] | null> => {
  const middleware = getFieldEncryptionMiddleware();
  if (!middleware?.hasSearchIndex()) return null;
  const searchKey = middleware.getSearchKeyB64();
  if (!searchKey) return null;
  return findEntityIdsByMultiFieldContains(
    null,
    PLATFORM_SCOPE_ID,
    TENANTS_TABLE_KEY,
    query,
    searchKey,
    middleware.getNgramSize()
  );
};

export const listPlatformTenants = async (params: ListPlatformTenantsParams): Promise<ListPlatformTenantsResult> => {
  if (dialectFromEnv() === "mysql") {
    return listPlatformTenantsMysql(params);
  }
  return listPlatformTenantsPg(params);
};

const listPlatformTenantsPg = async (params: ListPlatformTenantsParams): Promise<ListPlatformTenantsResult> => {
  const db = pgDb();
  const offset = (params.page - 1) * params.pageSize;
  const limit = params.pageSize;
  const q = params.q?.trim() ?? "";

  const parts: SQL[] = [];
  if (q) {
    const searchIds = await tenantListSearchIds(q);
    if (searchIds) {
      if (searchIds.length === 0) return { rows: [], total: 0 };
      parts.push(inArray(pg.tenants.id, searchIds));
    } else {
      const pat = `%${escapeSqlLikeFragment(q)}%`;
      parts.push(sql`${pg.tenants.name} ILIKE ${pat}`);
    }
  }
  const whereClause = parts.length ? and(...parts) : undefined;
  const orderByName = !getFieldEncryptionMiddleware();

  const rowRows = await db
    .select({
      id: pg.tenants.id,
      name: pg.tenants.name,
      createdAt: pg.tenants.createdAt
    })
    .from(pg.tenants)
    .where(whereClause)
    .orderBy(orderByName ? asc(pg.tenants.name) : desc(pg.tenants.createdAt))
    .limit(limit)
    .offset(offset);

  const countRows = await db.select({ c: count() }).from(pg.tenants).where(whereClause);
  const total = Number(countRows[0]?.c ?? 0);

  const rows = await Promise.all(
    rowRows.map(async (r) => {
      const opened = await openTenantNameRow(r);
      return {
        id: opened.id,
        name: opened.name,
        createdAt: coerceDate(r.createdAt)
      };
    })
  );
  if (orderByName) return { rows, total };
  rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return { rows, total };
};

const listPlatformTenantsMysql = async (params: ListPlatformTenantsParams): Promise<ListPlatformTenantsResult> => {
  const db = mysqlDb();
  const offset = (params.page - 1) * params.pageSize;
  const limit = params.pageSize;
  const q = params.q?.trim() ?? "";

  const parts: SQL[] = [];
  if (q) {
    const searchIds = await tenantListSearchIds(q);
    if (searchIds) {
      if (searchIds.length === 0) return { rows: [], total: 0 };
      parts.push(inArray(mysql.tenants.id, searchIds));
    } else {
      const pat = `%${escapeSqlLikeFragment(q)}%`;
      parts.push(like(mysql.tenants.name, pat));
    }
  }
  const whereClause = parts.length ? and(...parts) : undefined;
  const orderByName = !getFieldEncryptionMiddleware();

  const rowRows = await db
    .select({
      id: mysql.tenants.id,
      name: mysql.tenants.name,
      createdAt: mysql.tenants.createdAt
    })
    .from(mysql.tenants)
    .where(whereClause)
    .orderBy(orderByName ? asc(mysql.tenants.name) : desc(mysql.tenants.createdAt))
    .limit(limit)
    .offset(offset);

  const countRows = await db.select({ c: count() }).from(mysql.tenants).where(whereClause);
  const total = Number(countRows[0]?.c ?? 0);

  const rows = await Promise.all(
    rowRows.map(async (r) => {
      const opened = await openTenantNameRow(r);
      return {
        id: opened.id,
        name: opened.name,
        createdAt: coerceDate(r.createdAt)
      };
    })
  );
  if (orderByName) return { rows, total };
  rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return { rows, total };
};
