/**
 * MFA persistence: TOTP secrets (encrypted by API), email MFA flag, grace / lock, OTP challenges.
 */

import { createHash, randomUUID } from "node:crypto";
import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { getDb } from "./client.js";
import * as mysql from "./mysql-schema.js";
import * as pg from "./pg-schema.js";
import { incrementUserAccessTokenVersionById } from "./repos.js";
import { dialectFromEnv } from "./schema.js";
import {
  openUserMfaTotpPendingSecretAtRest,
  openUserMfaTotpSecretAtRest,
  sealUserMfaTotpPendingSecretAtRest,
  sealUserMfaTotpSecretAtRest
} from "./field-encryption/user-secrets.js";
import { decryptStoredUserEmail } from "./field-encryption/user-fields.js";

const mysqlDb = (): MySql2Database<typeof mysql> => getDb() as MySql2Database<typeof mysql>;
const pgDb = (): NodePgDatabase<typeof pg> => getDb() as NodePgDatabase<typeof pg>;

/** Matches tenant MFA enrollment grace in `realm-mfa-login.ts`. */
const TENANT_MFA_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export type UserMfaRow = {
  id: string;
  tenantId: string | null;
  email: string;
  accessTokenVersion: number;
  firstPasswordLoginAt: Date | null;
  mfaGraceExpiresAt: Date | null;
  mfaBlockedAt: Date | null;
  mfaTotpSecretEncrypted: string | null;
  mfaTotpEnabled: boolean;
  mfaTotpPendingSecretEncrypted: string | null;
  mfaTotpPendingExpiresAt: Date | null;
  mfaEmailEnabled: boolean;
};

const mapUserMfa = async (r: {
  id: string;
  tenantId: string | null;
  email: string;
  accessTokenVersion: number | null;
  firstPasswordLoginAt: Date | null;
  mfaGraceExpiresAt: Date | null;
  mfaBlockedAt: Date | null;
  mfaTotpSecretEncrypted: string | null;
  mfaTotpEnabled: boolean | null;
  mfaTotpPendingSecretEncrypted: string | null;
  mfaTotpPendingExpiresAt: Date | null;
  mfaEmailEnabled: boolean | null;
}): Promise<UserMfaRow> => ({
  id: r.id,
  tenantId: r.tenantId,
  email: await decryptStoredUserEmail({
    email: r.email,
    tenantId: r.tenantId,
    userId: r.id
  }),
  accessTokenVersion: Number(r.accessTokenVersion ?? 0),
  firstPasswordLoginAt: r.firstPasswordLoginAt,
  mfaGraceExpiresAt: r.mfaGraceExpiresAt,
  mfaBlockedAt: r.mfaBlockedAt,
  mfaTotpSecretEncrypted: r.mfaTotpSecretEncrypted,
  mfaTotpEnabled: Boolean(r.mfaTotpEnabled),
  mfaTotpPendingSecretEncrypted: r.mfaTotpPendingSecretEncrypted,
  mfaTotpPendingExpiresAt: r.mfaTotpPendingExpiresAt,
  mfaEmailEnabled: Boolean(r.mfaEmailEnabled)
});

export const getUserMfaRowById = async (userId: string): Promise<UserMfaRow | undefined> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select({
        id: mysql.users.id,
        tenantId: mysql.users.tenantId,
        email: mysql.users.email,
        accessTokenVersion: mysql.users.accessTokenVersion,
        firstPasswordLoginAt: mysql.users.firstPasswordLoginAt,
        mfaGraceExpiresAt: mysql.users.mfaGraceExpiresAt,
        mfaBlockedAt: mysql.users.mfaBlockedAt,
        mfaTotpSecretEncrypted: mysql.users.mfaTotpSecretEncrypted,
        mfaTotpEnabled: mysql.users.mfaTotpEnabled,
        mfaTotpPendingSecretEncrypted: mysql.users.mfaTotpPendingSecretEncrypted,
        mfaTotpPendingExpiresAt: mysql.users.mfaTotpPendingExpiresAt,
        mfaEmailEnabled: mysql.users.mfaEmailEnabled
      })
      .from(mysql.users)
      .where(eq(mysql.users.id, userId))
      .limit(1);
    const r = rows[0];
    return r ? await mapUserMfa(r) : undefined;
  }
  const db = pgDb();
  const rows = await db
    .select({
      id: pg.users.id,
      tenantId: pg.users.tenantId,
      email: pg.users.email,
      accessTokenVersion: pg.users.accessTokenVersion,
      firstPasswordLoginAt: pg.users.firstPasswordLoginAt,
      mfaGraceExpiresAt: pg.users.mfaGraceExpiresAt,
      mfaBlockedAt: pg.users.mfaBlockedAt,
      mfaTotpSecretEncrypted: pg.users.mfaTotpSecretEncrypted,
      mfaTotpEnabled: pg.users.mfaTotpEnabled,
      mfaTotpPendingSecretEncrypted: pg.users.mfaTotpPendingSecretEncrypted,
      mfaTotpPendingExpiresAt: pg.users.mfaTotpPendingExpiresAt,
      mfaEmailEnabled: pg.users.mfaEmailEnabled
    })
    .from(pg.users)
    .where(eq(pg.users.id, userId))
    .limit(1);
  const r = rows[0];
  return r ? await mapUserMfa(r) : undefined;
};

export const touchFirstPasswordLoginAt = async (userId: string): Promise<void> => {
  const existing = await getUserMfaRowById(userId);
  if (!existing || existing.firstPasswordLoginAt) return;
  const now = new Date();
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db.update(mysql.users).set({ firstPasswordLoginAt: now }).where(eq(mysql.users.id, userId));
    return;
  }
  const db = pgDb();
  await db.update(pg.users).set({ firstPasswordLoginAt: now }).where(eq(pg.users.id, userId));
};

export const setUserMfaGraceExpiresAt = async (userId: string, at: Date | null): Promise<void> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db.update(mysql.users).set({ mfaGraceExpiresAt: at }).where(eq(mysql.users.id, userId));
    return;
  }
  const db = pgDb();
  await db.update(pg.users).set({ mfaGraceExpiresAt: at }).where(eq(pg.users.id, userId));
};

export const setUserMfaBlockedAt = async (userId: string, at: Date | null): Promise<void> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db.update(mysql.users).set({ mfaBlockedAt: at }).where(eq(mysql.users.id, userId));
    return;
  }
  const db = pgDb();
  await db.update(pg.users).set({ mfaBlockedAt: at }).where(eq(pg.users.id, userId));
};

export const setTotpPendingPlaintext = async (
  userId: string,
  tenantId: string | null,
  secret: string,
  expiresAt: Date
): Promise<void> => {
  const encryptedSecret = await sealUserMfaTotpPendingSecretAtRest(tenantId, secret);
  await setTotpPending(userId, encryptedSecret, expiresAt);
};

export const confirmTotpEnrollmentPlaintext = async (
  userId: string,
  tenantId: string | null,
  secret: string
): Promise<void> => {
  const encryptedSecret = await sealUserMfaTotpSecretAtRest(tenantId, secret);
  await confirmTotpEnrollment(userId, encryptedSecret);
};

export const openTotpPendingSecretForUser = async (
  row: Pick<UserMfaRow, "tenantId" | "mfaTotpPendingSecretEncrypted">
): Promise<string> => {
  if (!row.mfaTotpPendingSecretEncrypted) {
    throw new Error("Missing pending TOTP secret");
  }
  return openUserMfaTotpPendingSecretAtRest(row.tenantId, row.mfaTotpPendingSecretEncrypted);
};

export const openTotpSecretForUser = async (
  row: Pick<UserMfaRow, "tenantId" | "mfaTotpSecretEncrypted">
): Promise<string> => {
  if (!row.mfaTotpSecretEncrypted) {
    throw new Error("Missing TOTP secret");
  }
  return openUserMfaTotpSecretAtRest(row.tenantId, row.mfaTotpSecretEncrypted);
};

export const setTotpPending = async (
  userId: string,
  encryptedSecret: string,
  expiresAt: Date
): Promise<void> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db
      .update(mysql.users)
      .set({
        mfaTotpPendingSecretEncrypted: encryptedSecret,
        mfaTotpPendingExpiresAt: expiresAt
      })
      .where(eq(mysql.users.id, userId));
    return;
  }
  const db = pgDb();
  await db
    .update(pg.users)
    .set({
      mfaTotpPendingSecretEncrypted: encryptedSecret,
      mfaTotpPendingExpiresAt: expiresAt
    })
    .where(eq(pg.users.id, userId));
};

export const confirmTotpEnrollment = async (userId: string, encryptedSecret: string): Promise<void> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db
      .update(mysql.users)
      .set({
        mfaTotpSecretEncrypted: encryptedSecret,
        mfaTotpEnabled: true,
        mfaTotpPendingSecretEncrypted: null,
        mfaTotpPendingExpiresAt: null,
        mfaEmailEnabled: false,
        mfaBlockedAt: null
      })
      .where(eq(mysql.users.id, userId));
    return;
  }
  const db = pgDb();
  await db
    .update(pg.users)
    .set({
      mfaTotpSecretEncrypted: encryptedSecret,
      mfaTotpEnabled: true,
      mfaTotpPendingSecretEncrypted: null,
      mfaTotpPendingExpiresAt: null,
      mfaEmailEnabled: false,
      mfaBlockedAt: null
    })
    .where(eq(pg.users.id, userId));
};

export const clearTotpPending = async (userId: string): Promise<void> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db
      .update(mysql.users)
      .set({ mfaTotpPendingSecretEncrypted: null, mfaTotpPendingExpiresAt: null })
      .where(eq(mysql.users.id, userId));
    return;
  }
  const db = pgDb();
  await db
    .update(pg.users)
    .set({ mfaTotpPendingSecretEncrypted: null, mfaTotpPendingExpiresAt: null })
    .where(eq(pg.users.id, userId));
};

export const setEmailMfaEnabled = async (userId: string, enabled: boolean): Promise<void> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    if (enabled) {
      await db
        .update(mysql.users)
        .set({
          mfaEmailEnabled: true,
          mfaTotpSecretEncrypted: null,
          mfaTotpEnabled: false,
          mfaTotpPendingSecretEncrypted: null,
          mfaTotpPendingExpiresAt: null,
          mfaBlockedAt: null
        })
        .where(eq(mysql.users.id, userId));
    } else {
      await db.update(mysql.users).set({ mfaEmailEnabled: false }).where(eq(mysql.users.id, userId));
    }
    return;
  }
  const db = pgDb();
  if (enabled) {
    await db
      .update(pg.users)
      .set({
        mfaEmailEnabled: true,
        mfaTotpSecretEncrypted: null,
        mfaTotpEnabled: false,
        mfaTotpPendingSecretEncrypted: null,
        mfaTotpPendingExpiresAt: null,
        mfaBlockedAt: null
      })
      .where(eq(pg.users.id, userId));
  } else {
    await db.update(pg.users).set({ mfaEmailEnabled: false }).where(eq(pg.users.id, userId));
  }
};

export const disableAllUserMfa = async (userId: string): Promise<void> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db
      .update(mysql.users)
      .set({
        mfaTotpSecretEncrypted: null,
        mfaTotpEnabled: false,
        mfaTotpPendingSecretEncrypted: null,
        mfaTotpPendingExpiresAt: null,
        mfaEmailEnabled: false
      })
      .where(eq(mysql.users.id, userId));
    return;
  }
  const db = pgDb();
  await db
    .update(pg.users)
    .set({
      mfaTotpSecretEncrypted: null,
      mfaTotpEnabled: false,
      mfaTotpPendingSecretEncrypted: null,
      mfaTotpPendingExpiresAt: null,
      mfaEmailEnabled: false
    })
    .where(eq(pg.users.id, userId));
};

/**
 * Admin-driven MFA wipe: removes authenticator + email MFA for the user.
 * If the tenant enforces MFA, starts a fresh 7-day enrollment window (and clears any block).
 * Otherwise clears grace and block so sign-in stays password-only until they opt in again.
 */
export const resetUserMfaEnrollment = async (
  userId: string,
  tenantMfaEnforced: boolean
): Promise<{ mfaGraceExpiresAt: string | null }> => {
  await disableAllUserMfa(userId);
  const graceExpiresAt = tenantMfaEnforced ? new Date(Date.now() + TENANT_MFA_GRACE_MS) : null;
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db
      .update(mysql.users)
      .set({ mfaBlockedAt: null, mfaGraceExpiresAt: graceExpiresAt })
      .where(eq(mysql.users.id, userId));
  } else {
    const db = pgDb();
    await db
      .update(pg.users)
      .set({ mfaBlockedAt: null, mfaGraceExpiresAt: graceExpiresAt })
      .where(eq(pg.users.id, userId));
  }
  await incrementUserAccessTokenVersionById(userId);
  return { mfaGraceExpiresAt: graceExpiresAt?.toISOString() ?? null };
};

/** HMAC-SHA256 hex for OTP storage (fast compare). Pepper must be server-wide secret. */
export const hashMfaOtp = (pepper: string, userId: string, purpose: string, code: string): string =>
  createHash("sha256")
    .update(`${pepper}:${userId}:${purpose}:${code.trim()}`)
    .digest("hex");

export const insertMfaOtpChallenge = async (input: {
  userId: string;
  purpose: string;
  codeHash: string;
  expiresAt: Date;
}): Promise<string> => {
  const id = randomUUID();
  const now = new Date();
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db.insert(mysql.mfaOtpChallenges).values({
      id,
      userId: input.userId,
      purpose: input.purpose,
      codeHash: input.codeHash,
      expiresAt: input.expiresAt,
      consumedAt: null,
      createdAt: now
    });
    return id;
  }
  const db = pgDb();
  const inserted = await db
    .insert(pg.mfaOtpChallenges)
    .values({
      userId: input.userId,
      purpose: input.purpose,
      codeHash: input.codeHash,
      expiresAt: input.expiresAt,
      consumedAt: null,
      createdAt: now
    })
    .returning({ id: pg.mfaOtpChallenges.id });
  return inserted[0]!.id;
};

export const verifyAndConsumeMfaOtpChallenge = async (input: {
  userId: string;
  purpose: string;
  codeHash: string;
}): Promise<boolean> => {
  const now = new Date();
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select({ id: mysql.mfaOtpChallenges.id })
      .from(mysql.mfaOtpChallenges)
      .where(
        and(
          eq(mysql.mfaOtpChallenges.userId, input.userId),
          eq(mysql.mfaOtpChallenges.purpose, input.purpose),
          eq(mysql.mfaOtpChallenges.codeHash, input.codeHash),
          isNull(mysql.mfaOtpChallenges.consumedAt),
          sql`${mysql.mfaOtpChallenges.expiresAt} > ${now}`
        )
      )
      .orderBy(desc(mysql.mfaOtpChallenges.createdAt))
      .limit(1);
    const hit = rows[0];
    if (!hit) return false;
    await db
      .update(mysql.mfaOtpChallenges)
      .set({ consumedAt: now })
      .where(eq(mysql.mfaOtpChallenges.id, hit.id));
    return true;
  }
  const db = pgDb();
  const rows = await db
    .select({ id: pg.mfaOtpChallenges.id })
    .from(pg.mfaOtpChallenges)
    .where(
      and(
        eq(pg.mfaOtpChallenges.userId, input.userId),
        eq(pg.mfaOtpChallenges.purpose, input.purpose),
        eq(pg.mfaOtpChallenges.codeHash, input.codeHash),
        isNull(pg.mfaOtpChallenges.consumedAt),
        sql`${pg.mfaOtpChallenges.expiresAt} > ${now}`
      )
    )
    .orderBy(desc(pg.mfaOtpChallenges.createdAt))
    .limit(1);
  const hit = rows[0];
  if (!hit) return false;
  await db.update(pg.mfaOtpChallenges).set({ consumedAt: now }).where(eq(pg.mfaOtpChallenges.id, hit.id));
  return true;
};

/** Tenant admin support: clear lock and grant another 7-day MFA enrollment window. */
export const resetUserMfaGraceAndUnblock = async (userId: string, graceExpiresAt: Date): Promise<void> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db
      .update(mysql.users)
      .set({ mfaBlockedAt: null, mfaGraceExpiresAt: graceExpiresAt })
      .where(eq(mysql.users.id, userId));
    return;
  }
  const db = pgDb();
  await db
    .update(pg.users)
    .set({ mfaBlockedAt: null, mfaGraceExpiresAt: graceExpiresAt })
    .where(eq(pg.users.id, userId));
};

export const countRecentMfaChallenges = async (userId: string, purpose: string, since: Date): Promise<number> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select({ c: count() })
      .from(mysql.mfaOtpChallenges)
      .where(
        and(
          eq(mysql.mfaOtpChallenges.userId, userId),
          eq(mysql.mfaOtpChallenges.purpose, purpose),
          sql`${mysql.mfaOtpChallenges.createdAt} >= ${since}`
        )
      );
    return Number(rows[0]?.c ?? 0);
  }
  const db = pgDb();
  const rows = await db
    .select({ c: count() })
    .from(pg.mfaOtpChallenges)
    .where(
      and(
        eq(pg.mfaOtpChallenges.userId, userId),
        eq(pg.mfaOtpChallenges.purpose, purpose),
        sql`${pg.mfaOtpChallenges.createdAt} >= ${since}`
      )
    );
  return Number(rows[0]?.c ?? 0);
};
