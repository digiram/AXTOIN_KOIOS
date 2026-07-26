/**
 * Subscription renewal billing (worker) — idempotent ledger rows and period roll-forward.
 */

import { and, eq, isNull, lte, or } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { addMonthsUtc } from "@starter/shared";

import { getDb } from "./client.js";
import * as mysql from "./mysql-schema.js";
import * as pg from "./pg-schema.js";
import { dialectFromEnv } from "./schema.js";
import {
  getPlatformSubscriptionPlanById,
  insertPlatformSubscriptionPayment,
  type SubscriptionPaymentStatus
} from "./platform-subscription-repos.js";
import { getSubscriptionByIdForTenant, type SubscriptionRow } from "./subscription-repos.js";

const mysqlDb = (): MySql2Database<typeof mysql> => getDb() as MySql2Database<typeof mysql>;
const pgDb = (): NodePgDatabase<typeof pg> => getDb() as NodePgDatabase<typeof pg>;

export type SubscriptionDueForRenewalRow = {
  id: string;
  tenantId: string;
  userId: string | null;
  planId: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
};

const mapDue = (r: {
  id: string;
  tenantId: string;
  userId: string | null;
  planId: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
}): SubscriptionDueForRenewalRow => ({
  id: r.id,
  tenantId: r.tenantId,
  userId: r.userId,
  planId: r.planId,
  currentPeriodStart: r.currentPeriodStart,
  currentPeriodEnd: r.currentPeriodEnd
});

/** Active subscriptions whose current period has ended (v1 monthly roll). */
export const listSubscriptionsDueForRenewal = async (limit: number): Promise<SubscriptionDueForRenewalRow[]> => {
  const now = new Date();
  const cap = Math.min(Math.max(1, limit), 1000);

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select({
        id: mysql.subscriptions.id,
        tenantId: mysql.subscriptions.tenantId,
        userId: mysql.subscriptions.userId,
        planId: mysql.subscriptions.planId,
        currentPeriodStart: mysql.subscriptions.currentPeriodStart,
        currentPeriodEnd: mysql.subscriptions.currentPeriodEnd
      })
      .from(mysql.subscriptions)
      .where(
        and(
          eq(mysql.subscriptions.status, "active"),
          lte(mysql.subscriptions.currentPeriodEnd, now),
          or(isNull(mysql.subscriptions.trialEndsAt), lte(mysql.subscriptions.trialEndsAt, now)),
          eq(mysql.subscriptions.cancelAtPeriodEnd, false)
        )
      )
      .limit(cap);
    return rows.map(mapDue);
  }

  const db = pgDb();
  const rows = await db
    .select({
      id: pg.subscriptions.id,
      tenantId: pg.subscriptions.tenantId,
      userId: pg.subscriptions.userId,
      planId: pg.subscriptions.planId,
      currentPeriodStart: pg.subscriptions.currentPeriodStart,
      currentPeriodEnd: pg.subscriptions.currentPeriodEnd
    })
    .from(pg.subscriptions)
    .where(
      and(
        eq(pg.subscriptions.status, "active"),
        lte(pg.subscriptions.currentPeriodEnd, now),
        or(isNull(pg.subscriptions.trialEndsAt), lte(pg.subscriptions.trialEndsAt, now)),
        eq(pg.subscriptions.cancelAtPeriodEnd, false)
      )
    )
    .limit(cap);
  return rows.map(mapDue);
};

export type ProcessSubscriptionRenewalResult =
  | { ok: true; paymentId: string; subscription: SubscriptionRow }
  | { ok: true; skipped: true; reason: "duplicate_period" | "plan_missing" }
  | { ok: false; error: "not_found" };

/**
 * Creates the next period payment row (idempotent on subscription + period_start) and advances subscription period.
 * PSP charge is out of scope here — ledger + period boundaries only (worker may call Stripe separately later).
 */
export const processSubscriptionRenewal = async (
  subscriptionId: string,
  tenantId: string
): Promise<ProcessSubscriptionRenewalResult> => {
  const sub = await getSubscriptionByIdForTenant(subscriptionId, tenantId);
  if (!sub || sub.status !== "active") return { ok: false, error: "not_found" };

  const nextPeriodStart = sub.currentPeriodEnd;
  const nextPeriodEnd = addMonthsUtc(nextPeriodStart, 1);

  const plan = await getPlatformSubscriptionPlanById(sub.planId);
  if (!plan) return { ok: true, skipped: true, reason: "plan_missing" };

  const paymentId = await insertPlatformSubscriptionPayment({
    tenantId: sub.tenantId,
    userId: sub.userId,
    planId: sub.planId,
    subscriptionId: sub.id,
    amountCents: plan.priceCents,
    currencyCode: plan.currencyCode,
    status: "due" as SubscriptionPaymentStatus,
    dueAt: nextPeriodStart,
    description: "Subscription renewal",
    periodStartUtc: nextPeriodStart
  }).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    if (/duplicate|unique|ER_DUP_ENTRY/i.test(msg)) return null;
    throw err;
  });

  if (paymentId === null) {
    return { ok: true, skipped: true, reason: "duplicate_period" };
  }

  const now = new Date();
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db
      .update(mysql.subscriptions)
      .set({
        currentPeriodStart: nextPeriodStart,
        currentPeriodEnd: nextPeriodEnd,
        updatedAt: now
      })
      .where(and(eq(mysql.subscriptions.id, subscriptionId), eq(mysql.subscriptions.tenantId, tenantId)));
  } else {
    const db = pgDb();
    await db
      .update(pg.subscriptions)
      .set({
        currentPeriodStart: nextPeriodStart,
        currentPeriodEnd: nextPeriodEnd,
        updatedAt: now
      })
      .where(and(eq(pg.subscriptions.id, subscriptionId), eq(pg.subscriptions.tenantId, tenantId)));
  }

  const updated = await getSubscriptionByIdForTenant(subscriptionId, tenantId);
  if (!updated) return { ok: false, error: "not_found" };
  return { ok: true, paymentId, subscription: updated };
};

/** BullMQ deterministic job id for one subscription renewal attempt. */
export const subscriptionRenewalJobId = (subscriptionId: string, periodStart: Date): string =>
  `renewal:${subscriptionId}:${periodStart.toISOString()}`;
