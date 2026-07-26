/**
 * OTP challenges keyed by email (or other subject) for flows before a user row exists (e.g. registration).
 */

import { createHash, randomUUID } from "node:crypto";
import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { getDb } from "./client.js";
import * as mysql from "./mysql-schema.js";
import * as pg from "./pg-schema.js";
import { dialectFromEnv } from "./schema.js";

const mysqlDb = (): MySql2Database<typeof mysql> => getDb() as MySql2Database<typeof mysql>;
const pgDb = (): NodePgDatabase<typeof pg> => getDb() as NodePgDatabase<typeof pg>;

export const REGISTRATION_EMAIL_VERIFY_PURPOSE = "registration_email_verify";

/** HMAC-SHA256 hex for OTP storage (fast compare). Pepper must be server-wide secret. */
export const hashEmailOtp = (pepper: string, subjectKey: string, purpose: string, code: string): string =>
  createHash("sha256")
    .update(`${pepper}:${subjectKey}:${purpose}:${code.trim()}`)
    .digest("hex");

export const insertEmailOtpChallenge = async (input: {
  subjectKey: string;
  purpose: string;
  codeHash: string;
  expiresAt: Date;
}): Promise<string> => {
  const id = randomUUID();
  const now = new Date();
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db.insert(mysql.emailOtpChallenges).values({
      id,
      subjectKey: input.subjectKey,
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
    .insert(pg.emailOtpChallenges)
    .values({
      subjectKey: input.subjectKey,
      purpose: input.purpose,
      codeHash: input.codeHash,
      expiresAt: input.expiresAt,
      consumedAt: null,
      createdAt: now
    })
    .returning({ id: pg.emailOtpChallenges.id });
  return inserted[0]!.id;
};

export const verifyAndConsumeEmailOtpChallenge = async (input: {
  subjectKey: string;
  purpose: string;
  codeHash: string;
}): Promise<boolean> => {
  const now = new Date();
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select({ id: mysql.emailOtpChallenges.id })
      .from(mysql.emailOtpChallenges)
      .where(
        and(
          eq(mysql.emailOtpChallenges.subjectKey, input.subjectKey),
          eq(mysql.emailOtpChallenges.purpose, input.purpose),
          eq(mysql.emailOtpChallenges.codeHash, input.codeHash),
          isNull(mysql.emailOtpChallenges.consumedAt),
          sql`${mysql.emailOtpChallenges.expiresAt} > ${now}`
        )
      )
      .orderBy(desc(mysql.emailOtpChallenges.createdAt))
      .limit(1);
    const hit = rows[0];
    if (!hit) return false;
    await db
      .update(mysql.emailOtpChallenges)
      .set({ consumedAt: now })
      .where(eq(mysql.emailOtpChallenges.id, hit.id));
    return true;
  }
  const db = pgDb();
  const rows = await db
    .select({ id: pg.emailOtpChallenges.id })
    .from(pg.emailOtpChallenges)
    .where(
      and(
        eq(pg.emailOtpChallenges.subjectKey, input.subjectKey),
        eq(pg.emailOtpChallenges.purpose, input.purpose),
        eq(pg.emailOtpChallenges.codeHash, input.codeHash),
        isNull(pg.emailOtpChallenges.consumedAt),
        sql`${pg.emailOtpChallenges.expiresAt} > ${now}`
      )
    )
    .orderBy(desc(pg.emailOtpChallenges.createdAt))
    .limit(1);
  const hit = rows[0];
  if (!hit) return false;
  await db.update(pg.emailOtpChallenges).set({ consumedAt: now }).where(eq(pg.emailOtpChallenges.id, hit.id));
  return true;
};

export const countRecentEmailOtpChallenges = async (
  subjectKey: string,
  purpose: string,
  since: Date
): Promise<number> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select({ c: count() })
      .from(mysql.emailOtpChallenges)
      .where(
        and(
          eq(mysql.emailOtpChallenges.subjectKey, subjectKey),
          eq(mysql.emailOtpChallenges.purpose, purpose),
          sql`${mysql.emailOtpChallenges.createdAt} >= ${since}`
        )
      );
    return Number(rows[0]?.c ?? 0);
  }
  const db = pgDb();
  const rows = await db
    .select({ c: count() })
    .from(pg.emailOtpChallenges)
    .where(
      and(
        eq(pg.emailOtpChallenges.subjectKey, subjectKey),
        eq(pg.emailOtpChallenges.purpose, purpose),
        sql`${pg.emailOtpChallenges.createdAt} >= ${since}`
      )
    );
  return Number(rows[0]?.c ?? 0);
};
