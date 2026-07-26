/**
 * Realm **subscriptions** (first-class billing subject): tenant-wide or per-user, rolling monthly UTC periods.
 */

import { randomUUID } from "node:crypto";

import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { addDaysUtc, addMonthsUtc, firstPeriodPriceCents, isV1SubscriberPlan } from "@starter/shared";

import { getDb } from "./client.js";
import * as mysql from "./mysql-schema.js";
import { getPlatformSubscriptionPlanById, insertPlatformSubscriptionPayment } from "./platform-subscription-repos.js";
import * as pg from "./pg-schema.js";
import { dialectFromEnv } from "./schema.js";

const mysqlDb = (): MySql2Database<typeof mysql> => getDb() as MySql2Database<typeof mysql>;
const pgDb = (): NodePgDatabase<typeof pg> => getDb() as NodePgDatabase<typeof pg>;

export type SubscriptionStatus = "active" | "canceling" | "canceled";

export type SubscriptionRow = {
  id: string;
  tenantId: string;
  userId: string | null;
  planId: string;
  pendingPlanId: string | null;
  status: SubscriptionStatus;
  startedAt: Date;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  cancelEffectiveMode: string | null;
  effectiveEndAt: Date | null;
  trialEndsAt: Date | null;
  pspCustomerId: string | null;
  pspSubscriptionId: string | null;
  pspDefaultPaymentMethodId: string | null;
  paymentMethodBrand: string | null;
  paymentMethodLast4: string | null;
  paymentMethodExpMonth: number | null;
  paymentMethodExpYear: number | null;
  billingPastDueSince: Date | null;
  billingFailedChargeCount: number;
  billingLastPaymentErrorCode: string | null;
  billingNextRetryAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const ACTIVE_LIKE: SubscriptionStatus[] = ["active", "canceling"];

const mapStatus = (s: string): SubscriptionStatus =>
  s === "canceling" || s === "canceled" ? s : "active";

const mapSubscription = (r: {
  id: string;
  tenantId: string;
  userId: string | null;
  planId: string;
  pendingPlanId?: string | null;
  status: string;
  startedAt: Date;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  cancelEffectiveMode: string | null;
  effectiveEndAt: Date | null;
  trialEndsAt: Date | null;
  pspCustomerId?: string | null;
  pspSubscriptionId?: string | null;
  pspDefaultPaymentMethodId?: string | null;
  paymentMethodBrand?: string | null;
  paymentMethodLast4?: string | null;
  paymentMethodExpMonth?: number | null;
  paymentMethodExpYear?: number | null;
  billingPastDueSince?: Date | null;
  billingFailedChargeCount?: number | null;
  billingLastPaymentErrorCode?: string | null;
  billingNextRetryAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): SubscriptionRow => ({
  id: r.id,
  tenantId: r.tenantId,
  userId: r.userId,
  planId: r.planId,
  pendingPlanId: r.pendingPlanId ?? null,
  status: mapStatus(r.status),
  startedAt: r.startedAt,
  currentPeriodStart: r.currentPeriodStart,
  currentPeriodEnd: r.currentPeriodEnd,
  cancelAtPeriodEnd: Boolean(r.cancelAtPeriodEnd),
  canceledAt: r.canceledAt,
  cancelEffectiveMode: r.cancelEffectiveMode,
  effectiveEndAt: r.effectiveEndAt,
  trialEndsAt: r.trialEndsAt,
  pspCustomerId: r.pspCustomerId ?? null,
  pspSubscriptionId: r.pspSubscriptionId ?? null,
  pspDefaultPaymentMethodId: r.pspDefaultPaymentMethodId ?? null,
  paymentMethodBrand: r.paymentMethodBrand ?? null,
  paymentMethodLast4: r.paymentMethodLast4 ?? null,
  paymentMethodExpMonth: r.paymentMethodExpMonth ?? null,
  paymentMethodExpYear: r.paymentMethodExpYear ?? null,
  billingPastDueSince: r.billingPastDueSince ?? null,
  billingFailedChargeCount: r.billingFailedChargeCount ?? 0,
  billingLastPaymentErrorCode: r.billingLastPaymentErrorCode ?? null,
  billingNextRetryAt: r.billingNextRetryAt ?? null,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt
});

export const findActiveLikeTenantSubscription = async (tenantId: string): Promise<SubscriptionRow | undefined> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select()
      .from(mysql.subscriptions)
      .where(
        and(
          eq(mysql.subscriptions.tenantId, tenantId),
          isNull(mysql.subscriptions.userId),
          inArray(mysql.subscriptions.status, ACTIVE_LIKE)
        )
      )
      .limit(1);
    const r = rows[0];
    return r ? mapSubscription(r) : undefined;
  }
  const db = pgDb();
  const rows = await db
    .select()
    .from(pg.subscriptions)
    .where(
      and(eq(pg.subscriptions.tenantId, tenantId), isNull(pg.subscriptions.userId), inArray(pg.subscriptions.status, ACTIVE_LIKE))
    )
    .limit(1);
  const r = rows[0];
  return r ? mapSubscription(r) : undefined;
};

export const findActiveLikeUserSubscription = async (
  tenantId: string,
  userId: string
): Promise<SubscriptionRow | undefined> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select()
      .from(mysql.subscriptions)
      .where(
        and(
          eq(mysql.subscriptions.tenantId, tenantId),
          eq(mysql.subscriptions.userId, userId),
          inArray(mysql.subscriptions.status, ACTIVE_LIKE)
        )
      )
      .limit(1);
    const r = rows[0];
    return r ? mapSubscription(r) : undefined;
  }
  const db = pgDb();
  const rows = await db
    .select()
    .from(pg.subscriptions)
    .where(
      and(eq(pg.subscriptions.tenantId, tenantId), eq(pg.subscriptions.userId, userId), inArray(pg.subscriptions.status, ACTIVE_LIKE))
    )
    .limit(1);
  const r = rows[0];
  return r ? mapSubscription(r) : undefined;
};

/**
 * Settings / summary GET: prefer active or canceling; otherwise the most recently updated **canceled** row so UIs can
 * show ended state right after immediate cancel (active-like queries return nothing once status is `canceled`).
 */
export const findUserSubscriptionForSettingsView = async (
  tenantId: string,
  userId: string
): Promise<SubscriptionRow | undefined> => {
  const active = await findActiveLikeUserSubscription(tenantId, userId);
  if (active) return active;

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select()
      .from(mysql.subscriptions)
      .where(
        and(
          eq(mysql.subscriptions.tenantId, tenantId),
          eq(mysql.subscriptions.userId, userId),
          eq(mysql.subscriptions.status, "canceled")
        )
      )
      .orderBy(desc(mysql.subscriptions.updatedAt))
      .limit(1);
    const r = rows[0];
    return r ? mapSubscription(r) : undefined;
  }
  const db = pgDb();
  const rows = await db
    .select()
    .from(pg.subscriptions)
    .where(
      and(
        eq(pg.subscriptions.tenantId, tenantId),
        eq(pg.subscriptions.userId, userId),
        eq(pg.subscriptions.status, "canceled")
      )
    )
    .orderBy(desc(pg.subscriptions.updatedAt))
    .limit(1);
  const r = rows[0];
  return r ? mapSubscription(r) : undefined;
};

/** Tenant-wide settings GET: same as {@link findUserSubscriptionForSettingsView} but `user_id` is null. */
export const findTenantSubscriptionForSettingsView = async (
  tenantId: string
): Promise<SubscriptionRow | undefined> => {
  const active = await findActiveLikeTenantSubscription(tenantId);
  if (active) return active;

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select()
      .from(mysql.subscriptions)
      .where(
        and(
          eq(mysql.subscriptions.tenantId, tenantId),
          isNull(mysql.subscriptions.userId),
          eq(mysql.subscriptions.status, "canceled")
        )
      )
      .orderBy(desc(mysql.subscriptions.updatedAt))
      .limit(1);
    const r = rows[0];
    return r ? mapSubscription(r) : undefined;
  }
  const db = pgDb();
  const rows = await db
    .select()
    .from(pg.subscriptions)
    .where(
      and(
        eq(pg.subscriptions.tenantId, tenantId),
        isNull(pg.subscriptions.userId),
        eq(pg.subscriptions.status, "canceled")
      )
    )
    .orderBy(desc(pg.subscriptions.updatedAt))
    .limit(1);
  const r = rows[0];
  return r ? mapSubscription(r) : undefined;
};

export const getSubscriptionByIdForTenant = async (
  subscriptionId: string,
  tenantId: string
): Promise<SubscriptionRow | undefined> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select()
      .from(mysql.subscriptions)
      .where(and(eq(mysql.subscriptions.id, subscriptionId), eq(mysql.subscriptions.tenantId, tenantId)))
      .limit(1);
    const r = rows[0];
    return r ? mapSubscription(r) : undefined;
  }
  const db = pgDb();
  const rows = await db
    .select()
    .from(pg.subscriptions)
    .where(and(eq(pg.subscriptions.id, subscriptionId), eq(pg.subscriptions.tenantId, tenantId)))
    .limit(1);
  const r = rows[0];
  return r ? mapSubscription(r) : undefined;
};

export type CreateSubscriptionInput = {
  tenantId: string;
  userId: string | null;
  planId: string;
  priceCents: number;
  currencyCode: string;
  /** From catalog plan; when greater than 0, no initial payment row is created (billing worker charges after `trial_ends_at`). */
  trialDays: number;
};

export const insertSubscriptionWithFirstPayment = async (
  input: CreateSubscriptionInput
): Promise<{ subscription: SubscriptionRow; paymentId: string | null }> => {
  const id = randomUUID();
  const now = new Date();
  const periodEnd = addMonthsUtc(now, 1);
  const trialDays = Math.min(365, Math.max(0, Math.trunc(input.trialDays)));
  const trialEndsAt = trialDays > 0 ? addDaysUtc(now, trialDays) : null;
  const amountCents = firstPeriodPriceCents(input.priceCents);

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db.insert(mysql.subscriptions).values({
      id,
      tenantId: input.tenantId,
      userId: input.userId,
      planId: input.planId,
      status: "active",
      startedAt: now,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      cancelEffectiveMode: null,
      effectiveEndAt: null,
      trialEndsAt,
      createdAt: now,
      updatedAt: now
    });
  } else {
    const db = pgDb();
    await db.insert(pg.subscriptions).values({
      id,
      tenantId: input.tenantId,
      userId: input.userId,
      planId: input.planId,
      status: "active",
      startedAt: now,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      cancelEffectiveMode: null,
      effectiveEndAt: null,
      trialEndsAt,
      createdAt: now,
      updatedAt: now
    });
  }

  let paymentId: string | null = null;
  if (trialDays === 0) {
    paymentId = await insertPlatformSubscriptionPayment({
      tenantId: input.tenantId,
      userId: input.userId,
      planId: input.planId,
      subscriptionId: id,
      amountCents,
      currencyCode: input.currencyCode,
      status: "due",
      dueAt: now,
      periodStartUtc: now,
      description: "Subscription first period"
    });
  }

  const sub = await getSubscriptionByIdForTenant(id, input.tenantId);
  if (!sub) throw new Error("insertSubscriptionWithFirstPayment: readback failed");
  return { subscription: sub, paymentId };
};

export type CancelSubscriptionResult =
  | { ok: true; subscription: SubscriptionRow }
  | { ok: false; error: "not_found" | "already_canceled" | "immediate_not_allowed" };

export const cancelSubscriptionForTenant = async (
  subscriptionId: string,
  tenantId: string,
  effective: "immediate" | "period_end",
  planAllowsCancelAnytime: boolean
): Promise<CancelSubscriptionResult> => {
  const row = await getSubscriptionByIdForTenant(subscriptionId, tenantId);
  if (!row) return { ok: false, error: "not_found" };
  if (row.status === "canceled") return { ok: false, error: "already_canceled" };
  if (!planAllowsCancelAnytime && effective === "immediate") {
    return { ok: false, error: "immediate_not_allowed" };
  }

  const now = new Date();
  const nextStatus: SubscriptionStatus = effective === "immediate" ? "canceled" : "canceling";
  const effectiveEnd = effective === "immediate" ? now : row.currentPeriodEnd;

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db
      .update(mysql.subscriptions)
      .set({
        status: nextStatus,
        cancelAtPeriodEnd: effective === "period_end",
        canceledAt: now,
        cancelEffectiveMode: effective,
        effectiveEndAt: effectiveEnd,
        pendingPlanId: null,
        updatedAt: now
      })
      .where(and(eq(mysql.subscriptions.id, subscriptionId), eq(mysql.subscriptions.tenantId, tenantId)));
  } else {
    const db = pgDb();
    await db
      .update(pg.subscriptions)
      .set({
        status: nextStatus,
        cancelAtPeriodEnd: effective === "period_end",
        canceledAt: now,
        cancelEffectiveMode: effective,
        effectiveEndAt: effectiveEnd,
        pendingPlanId: null,
        updatedAt: now
      })
      .where(and(eq(pg.subscriptions.id, subscriptionId), eq(pg.subscriptions.tenantId, tenantId)));
  }

  const updated = await getSubscriptionByIdForTenant(subscriptionId, tenantId);
  if (!updated) return { ok: false, error: "not_found" };
  return { ok: true, subscription: updated };
};

export type ScheduleSubscriptionPlanChangeResult =
  | { ok: true; subscription: SubscriptionRow }
  | {
      ok: false;
      error:
        | "not_found"
        | "invalid_plan"
        | "same_plan"
        | "tier_change_not_allowed"
        | "scope_mismatch"
        | "inactive"
        | "plan_disabled";
    };

export const scheduleSubscriptionPlanChangeForTenant = async (
  subscriptionId: string,
  tenantId: string,
  nextPlanId: string
): Promise<ScheduleSubscriptionPlanChangeResult> => {
  const sub = await getSubscriptionByIdForTenant(subscriptionId, tenantId);
  if (!sub) return { ok: false, error: "not_found" };
  if (sub.status !== "active" && sub.status !== "canceling") return { ok: false, error: "inactive" };
  if (nextPlanId === sub.planId) return { ok: false, error: "same_plan" };

  const currentPlan = await getPlatformSubscriptionPlanById(sub.planId);
  const nextPlan = await getPlatformSubscriptionPlanById(nextPlanId);
  if (!currentPlan || !nextPlan) return { ok: false, error: "invalid_plan" };
  if (!currentPlan.allowTierChangeNextPeriod) return { ok: false, error: "tier_change_not_allowed" };
  if (currentPlan.billingScope !== nextPlan.billingScope) return { ok: false, error: "scope_mismatch" };
  if (!isV1SubscriberPlan(nextPlan.durationUnit, nextPlan.durationCount)) {
    return { ok: false, error: "invalid_plan" };
  }
  if (nextPlan.disabled) return { ok: false, error: "plan_disabled" };

  const now = new Date();
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db
      .update(mysql.subscriptions)
      .set({ pendingPlanId: nextPlanId, updatedAt: now })
      .where(and(eq(mysql.subscriptions.id, subscriptionId), eq(mysql.subscriptions.tenantId, tenantId)));
  } else {
    const db = pgDb();
    await db
      .update(pg.subscriptions)
      .set({ pendingPlanId: nextPlanId, updatedAt: now })
      .where(and(eq(pg.subscriptions.id, subscriptionId), eq(pg.subscriptions.tenantId, tenantId)));
  }

  const updated = await getSubscriptionByIdForTenant(subscriptionId, tenantId);
  if (!updated) return { ok: false, error: "not_found" };
  return { ok: true, subscription: updated };
};

export const clearSubscriptionScheduledPlanChangeForTenant = async (
  subscriptionId: string,
  tenantId: string
): Promise<ScheduleSubscriptionPlanChangeResult> => {
  const sub = await getSubscriptionByIdForTenant(subscriptionId, tenantId);
  if (!sub) return { ok: false, error: "not_found" };

  const now = new Date();
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db
      .update(mysql.subscriptions)
      .set({ pendingPlanId: null, updatedAt: now })
      .where(and(eq(mysql.subscriptions.id, subscriptionId), eq(mysql.subscriptions.tenantId, tenantId)));
  } else {
    const db = pgDb();
    await db
      .update(pg.subscriptions)
      .set({ pendingPlanId: null, updatedAt: now })
      .where(and(eq(pg.subscriptions.id, subscriptionId), eq(pg.subscriptions.tenantId, tenantId)));
  }

  const updated = await getSubscriptionByIdForTenant(subscriptionId, tenantId);
  if (!updated) return { ok: false, error: "not_found" };
  return { ok: true, subscription: updated };
};

/** Billing worker: move `pending_plan_id` onto `plan_id` when `current_period_end` has passed. Returns false if nothing to apply. */
export const applyPendingPlanChangeForSubscriptionId = async (subscriptionId: string): Promise<boolean> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select({ pendingPlanId: mysql.subscriptions.pendingPlanId })
      .from(mysql.subscriptions)
      .where(eq(mysql.subscriptions.id, subscriptionId))
      .limit(1);
    const pending = rows[0]?.pendingPlanId;
    if (!pending) return false;
    const now = new Date();
    await db
      .update(mysql.subscriptions)
      .set({ planId: pending, pendingPlanId: null, updatedAt: now })
      .where(eq(mysql.subscriptions.id, subscriptionId));
    return true;
  }
  const db = pgDb();
  const rows = await db
    .select({ pendingPlanId: pg.subscriptions.pendingPlanId })
    .from(pg.subscriptions)
    .where(eq(pg.subscriptions.id, subscriptionId))
    .limit(1);
  const pending = rows[0]?.pendingPlanId;
  if (!pending) return false;
  const now = new Date();
  await db
    .update(pg.subscriptions)
    .set({ planId: pending, pendingPlanId: null, updatedAt: now })
    .where(eq(pg.subscriptions.id, subscriptionId));
  return true;
};

export const findSubscriptionByPspCustomerId = async (pspCustomerId: string): Promise<SubscriptionRow | undefined> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select()
      .from(mysql.subscriptions)
      .where(eq(mysql.subscriptions.pspCustomerId, pspCustomerId))
      .limit(1);
    const r = rows[0];
    return r ? mapSubscription(r) : undefined;
  }
  const db = pgDb();
  const rows = await db
    .select()
    .from(pg.subscriptions)
    .where(eq(pg.subscriptions.pspCustomerId, pspCustomerId))
    .limit(1);
  const r = rows[0];
  return r ? mapSubscription(r) : undefined;
};

export type SubscriptionPspPaymentMethodPatch = {
  pspCustomerId?: string | null;
  pspSubscriptionId?: string | null;
  pspDefaultPaymentMethodId?: string | null;
  paymentMethodBrand?: string | null;
  paymentMethodLast4?: string | null;
  paymentMethodExpMonth?: number | null;
  paymentMethodExpYear?: number | null;
};

/** After SetupIntent / default PM change: persist PSP ids and non-sensitive card summary. */
export const updateSubscriptionPspPaymentMethodForTenant = async (
  subscriptionId: string,
  tenantId: string,
  patch: SubscriptionPspPaymentMethodPatch
): Promise<boolean> => {
  const now = new Date();
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const res = await db
      .update(mysql.subscriptions)
      .set({
        ...(patch.pspCustomerId !== undefined ? { pspCustomerId: patch.pspCustomerId } : {}),
        ...(patch.pspSubscriptionId !== undefined ? { pspSubscriptionId: patch.pspSubscriptionId } : {}),
        ...(patch.pspDefaultPaymentMethodId !== undefined
          ? { pspDefaultPaymentMethodId: patch.pspDefaultPaymentMethodId }
          : {}),
        ...(patch.paymentMethodBrand !== undefined ? { paymentMethodBrand: patch.paymentMethodBrand } : {}),
        ...(patch.paymentMethodLast4 !== undefined ? { paymentMethodLast4: patch.paymentMethodLast4 } : {}),
        ...(patch.paymentMethodExpMonth !== undefined ? { paymentMethodExpMonth: patch.paymentMethodExpMonth } : {}),
        ...(patch.paymentMethodExpYear !== undefined ? { paymentMethodExpYear: patch.paymentMethodExpYear } : {}),
        updatedAt: now
      })
      .where(and(eq(mysql.subscriptions.id, subscriptionId), eq(mysql.subscriptions.tenantId, tenantId)));
    const header = Array.isArray(res) ? res[0] : res;
    const affected =
      typeof header === "object" && header !== null && "affectedRows" in header ? Number(header.affectedRows) : 0;
    return affected > 0;
  }
  const db = pgDb();
  const res = await db
    .update(pg.subscriptions)
    .set({
      ...(patch.pspCustomerId !== undefined ? { pspCustomerId: patch.pspCustomerId } : {}),
      ...(patch.pspSubscriptionId !== undefined ? { pspSubscriptionId: patch.pspSubscriptionId } : {}),
      ...(patch.pspDefaultPaymentMethodId !== undefined
        ? { pspDefaultPaymentMethodId: patch.pspDefaultPaymentMethodId }
        : {}),
      ...(patch.paymentMethodBrand !== undefined ? { paymentMethodBrand: patch.paymentMethodBrand } : {}),
      ...(patch.paymentMethodLast4 !== undefined ? { paymentMethodLast4: patch.paymentMethodLast4 } : {}),
      ...(patch.paymentMethodExpMonth !== undefined ? { paymentMethodExpMonth: patch.paymentMethodExpMonth } : {}),
      ...(patch.paymentMethodExpYear !== undefined ? { paymentMethodExpYear: patch.paymentMethodExpYear } : {}),
      updatedAt: now
    })
    .where(and(eq(pg.subscriptions.id, subscriptionId), eq(pg.subscriptions.tenantId, tenantId)))
    .returning({ id: pg.subscriptions.id });
  return res.length > 0;
};

/** Webhook: charge / payment_intent failed — increment counters and surface last PSP error (dunning model j). */
export const applySubscriptionBillingPaymentFailedForTenant = async (
  subscriptionId: string,
  tenantId: string,
  input: { lastErrorCode: string | null; nextRetryAt: Date | null }
): Promise<boolean> => {
  const now = new Date();
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select({
        billingFailedChargeCount: mysql.subscriptions.billingFailedChargeCount,
        billingPastDueSince: mysql.subscriptions.billingPastDueSince
      })
      .from(mysql.subscriptions)
      .where(and(eq(mysql.subscriptions.id, subscriptionId), eq(mysql.subscriptions.tenantId, tenantId)))
      .limit(1);
    const cur = rows[0];
    if (!cur) return false;
    const nextCount = (cur.billingFailedChargeCount ?? 0) + 1;
    const pastDueSince = cur.billingPastDueSince ?? now;
    const res = await db
      .update(mysql.subscriptions)
      .set({
        billingFailedChargeCount: nextCount,
        billingPastDueSince: pastDueSince,
        billingLastPaymentErrorCode: input.lastErrorCode,
        billingNextRetryAt: input.nextRetryAt,
        updatedAt: now
      })
      .where(and(eq(mysql.subscriptions.id, subscriptionId), eq(mysql.subscriptions.tenantId, tenantId)));
    const header = Array.isArray(res) ? res[0] : res;
    const affected =
      typeof header === "object" && header !== null && "affectedRows" in header ? Number(header.affectedRows) : 0;
    return affected > 0;
  }
  const db = pgDb();
  const rows = await db
    .select({
      billingFailedChargeCount: pg.subscriptions.billingFailedChargeCount,
      billingPastDueSince: pg.subscriptions.billingPastDueSince
    })
    .from(pg.subscriptions)
    .where(and(eq(pg.subscriptions.id, subscriptionId), eq(pg.subscriptions.tenantId, tenantId)))
    .limit(1);
  const cur = rows[0];
  if (!cur) return false;
  const nextCount = (cur.billingFailedChargeCount ?? 0) + 1;
  const pastDueSince = cur.billingPastDueSince ?? now;
  const res = await db
    .update(pg.subscriptions)
    .set({
      billingFailedChargeCount: nextCount,
      billingPastDueSince: pastDueSince,
      billingLastPaymentErrorCode: input.lastErrorCode,
      billingNextRetryAt: input.nextRetryAt,
      updatedAt: now
    })
    .where(and(eq(pg.subscriptions.id, subscriptionId), eq(pg.subscriptions.tenantId, tenantId)))
    .returning({ id: pg.subscriptions.id });
  return res.length > 0;
};

/** Webhook: successful charge — clear subscription-level delinquency markers. */
export const clearSubscriptionBillingDelinquencyForTenant = async (
  subscriptionId: string,
  tenantId: string
): Promise<boolean> => {
  const now = new Date();
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const res = await db
      .update(mysql.subscriptions)
      .set({
        billingPastDueSince: null,
        billingFailedChargeCount: 0,
        billingLastPaymentErrorCode: null,
        billingNextRetryAt: null,
        updatedAt: now
      })
      .where(and(eq(mysql.subscriptions.id, subscriptionId), eq(mysql.subscriptions.tenantId, tenantId)));
    const header = Array.isArray(res) ? res[0] : res;
    const affected =
      typeof header === "object" && header !== null && "affectedRows" in header ? Number(header.affectedRows) : 0;
    return affected > 0;
  }
  const db = pgDb();
  const res = await db
    .update(pg.subscriptions)
    .set({
      billingPastDueSince: null,
      billingFailedChargeCount: 0,
      billingLastPaymentErrorCode: null,
      billingNextRetryAt: null,
      updatedAt: now
    })
    .where(and(eq(pg.subscriptions.id, subscriptionId), eq(pg.subscriptions.tenantId, tenantId)))
    .returning({ id: pg.subscriptions.id });
  return res.length > 0;
};
