/**
 * Platform subscription module: singleton settings, plan catalog, subscription payment ledger rows.
 *
 * **Who writes `platform_subscription_payments`:** the API creates the **first** line at subscribe via
 * `insertSubscriptionWithFirstPayment` → `insertPlatformSubscriptionPayment` **only when the plan’s `trial_days` is
 * 0**; otherwise the first charge is deferred to the **billing worker** after `trial_ends_at`. **Renewals, catch-up, and
 * PSP reconciliation** are intended to run in **`apps/worker`** (BullMQ), batched and idempotent — see
 * **`docs/guidelines/architecture.md`** (*Realm subscriptions* → payment ledger) and **`docs/guidelines/best-practices.md`**
 * (*Subscription payment generation*).
 */

import { randomUUID } from "node:crypto";

import { and, asc, count, desc, eq, gte, isNotNull, lte, or, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { getDb } from "./client.js";
import * as mysql from "./mysql-schema.js";
import * as pg from "./pg-schema.js";
import { dialectFromEnv } from "./schema.js";
import { decryptStoredUserEmail } from "./field-encryption/user-fields.js";

const mysqlDb = (): MySql2Database<typeof mysql> => getDb() as MySql2Database<typeof mysql>;
const pgDb = (): NodePgDatabase<typeof pg> => getDb() as NodePgDatabase<typeof pg>;

export const PLATFORM_SUBSCRIPTION_SETTINGS_ROW_ID = "00000000-0000-0000-0000-000000000006";

export type SubscriptionDurationUnit = "day" | "month" | "year";
export type SubscriptionBillingScope = "tenant" | "user";
export type SubscriptionPaymentStatus =
  | "outstanding"
  | "due"
  | "overdue"
  | "paid"
  | "cancelled"
  | "reimbursed";

export type PlatformSubscriptionSettingsRow = {
  id: string;
  subscriptionsEnabled: boolean;
  subscriptionCurrencyCode: string;
  updatedAt: Date;
};

export type PlatformSubscriptionPlanRow = {
  id: string;
  tierName: string;
  durationUnit: SubscriptionDurationUnit;
  durationCount: number;
  priceCents: number;
  currencyCode: string;
  allowCancelAnytime: boolean;
  trialDays: number;
  allowTierChangeNextPeriod: boolean;
  billingScope: SubscriptionBillingScope;
  sortOrder: number;
  /** Hidden from subscriber catalogs; use when ledger rows exist instead of deleting the tier. */
  disabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type PlatformSubscriptionPaymentListRow = {
  id: string;
  planId: string | null;
  tenantId: string;
  userId: string | null;
  amountCents: number;
  currencyCode: string;
  status: SubscriptionPaymentStatus;
  dueAt: Date | null;
  paidAt: Date | null;
  cancelledAt: Date | null;
  reimbursedAt: Date | null;
  description: string | null;
  pspInvoiceId: string | null;
  pspPaymentIntentId: string | null;
  pspChargeId: string | null;
  createdAt: Date;
  updatedAt: Date;
  tenantName: string;
  userEmail: string | null;
  tierName: string | null;
};

export type ListPlatformSubscriptionPaymentsFilters = {
  tenantId?: string;
  status?: SubscriptionPaymentStatus;
  createdFrom?: Date;
  createdTo?: Date;
};

export type PlanCatalogAuditAction = "plan_created" | "plan_updated" | "plan_deleted" | "plan_disabled_changed";

export type PlatformSubscriptionPlanAuditRow = {
  id: string;
  createdAt: Date;
  action: PlanCatalogAuditAction;
  planId: string | null;
  actorUserId: string | null;
  summary: string;
  detailJson: string | null;
};

const mapPlan = (r: {
  id: string;
  tierName: string;
  durationUnit: string;
  durationCount: number;
  priceCents: number;
  currencyCode: string;
  allowCancelAnytime: boolean;
  trialDays?: number | null;
  allowTierChangeNextPeriod?: boolean | null;
  disabled?: boolean | null;
  billingScope: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}): PlatformSubscriptionPlanRow => ({
  id: r.id,
  tierName: r.tierName,
  durationUnit: (["day", "month", "year"].includes(r.durationUnit) ? r.durationUnit : "month") as SubscriptionDurationUnit,
  durationCount: r.durationCount,
  priceCents: r.priceCents,
  currencyCode: r.currencyCode,
  allowCancelAnytime: Boolean(r.allowCancelAnytime),
  trialDays: Math.min(365, Math.max(0, Math.trunc(Number(r.trialDays ?? 0)))),
  allowTierChangeNextPeriod: r.allowTierChangeNextPeriod == null ? true : Boolean(r.allowTierChangeNextPeriod),
  billingScope: (r.billingScope === "user" ? "user" : "tenant") as SubscriptionBillingScope,
  sortOrder: r.sortOrder,
  disabled: Boolean(r.disabled),
  createdAt: r.createdAt,
  updatedAt: r.updatedAt
});

export const getPlatformSubscriptionSettingsRow = async (): Promise<
  PlatformSubscriptionSettingsRow | undefined
> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select()
      .from(mysql.platformSubscriptionSettings)
      .where(eq(mysql.platformSubscriptionSettings.id, PLATFORM_SUBSCRIPTION_SETTINGS_ROW_ID))
      .limit(1);
    const r = rows[0];
    if (!r) return undefined;
    return {
      id: r.id,
      subscriptionsEnabled: Boolean(r.subscriptionsEnabled),
      subscriptionCurrencyCode: (r.subscriptionCurrencyCode ?? "USD").toUpperCase(),
      updatedAt: r.updatedAt
    };
  }
  const db = pgDb();
  const rows = await db
    .select()
    .from(pg.platformSubscriptionSettings)
    .where(eq(pg.platformSubscriptionSettings.id, PLATFORM_SUBSCRIPTION_SETTINGS_ROW_ID))
    .limit(1);
  const r = rows[0];
  if (!r) return undefined;
  return {
    id: r.id,
    subscriptionsEnabled: Boolean(r.subscriptionsEnabled),
    subscriptionCurrencyCode: (r.subscriptionCurrencyCode ?? "USD").toUpperCase(),
    updatedAt: r.updatedAt
  };
};

export const upsertPlatformSubscriptionSettingsRow = async (input: {
  subscriptionsEnabled?: boolean;
  subscriptionCurrencyCode?: string;
}): Promise<void> => {
  const now = new Date();
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const existing = await getPlatformSubscriptionSettingsRow();
    if (!existing) {
      const code = (input.subscriptionCurrencyCode ?? "USD").trim().toUpperCase().slice(0, 3);
      await db.insert(mysql.platformSubscriptionSettings).values({
        id: PLATFORM_SUBSCRIPTION_SETTINGS_ROW_ID,
        subscriptionsEnabled: input.subscriptionsEnabled ?? false,
        subscriptionCurrencyCode: code,
        updatedAt: now
      });
      return;
    }
    const set: Partial<{
      subscriptionsEnabled: boolean;
      subscriptionCurrencyCode: string;
      updatedAt: Date;
    }> = { updatedAt: now };
    if (input.subscriptionsEnabled !== undefined) set.subscriptionsEnabled = input.subscriptionsEnabled;
    if (input.subscriptionCurrencyCode !== undefined) {
      set.subscriptionCurrencyCode = input.subscriptionCurrencyCode.trim().toUpperCase().slice(0, 3);
    }
    await db
      .update(mysql.platformSubscriptionSettings)
      .set(set)
      .where(eq(mysql.platformSubscriptionSettings.id, PLATFORM_SUBSCRIPTION_SETTINGS_ROW_ID));
    return;
  }
  const db = pgDb();
  const existing = await getPlatformSubscriptionSettingsRow();
  if (!existing) {
    const code = (input.subscriptionCurrencyCode ?? "USD").trim().toUpperCase().slice(0, 3);
    await db.insert(pg.platformSubscriptionSettings).values({
      id: PLATFORM_SUBSCRIPTION_SETTINGS_ROW_ID,
      subscriptionsEnabled: input.subscriptionsEnabled ?? false,
      subscriptionCurrencyCode: code,
      updatedAt: now
    });
    return;
  }
  const set: Partial<{
    subscriptionsEnabled: boolean;
    subscriptionCurrencyCode: string;
    updatedAt: Date;
  }> = { updatedAt: now };
  if (input.subscriptionsEnabled !== undefined) set.subscriptionsEnabled = input.subscriptionsEnabled;
  if (input.subscriptionCurrencyCode !== undefined) {
    set.subscriptionCurrencyCode = input.subscriptionCurrencyCode.trim().toUpperCase().slice(0, 3);
  }
  await db
    .update(pg.platformSubscriptionSettings)
    .set(set)
    .where(eq(pg.platformSubscriptionSettings.id, PLATFORM_SUBSCRIPTION_SETTINGS_ROW_ID));
};

export const ensurePlatformSubscriptionSettingsRow = async (): Promise<PlatformSubscriptionSettingsRow> => {
  const row = await getPlatformSubscriptionSettingsRow();
  if (row) return row;
  await upsertPlatformSubscriptionSettingsRow({ subscriptionsEnabled: false });
  const created = await getPlatformSubscriptionSettingsRow();
  if (!created) throw new Error("ensurePlatformSubscriptionSettingsRow failed");
  return created;
};

/** True when at least one subscription payment row is tied to a plan (tier); then catalog currency must stay fixed. */
export const existsSubscriptionPaymentLinkedToPlan = async (): Promise<boolean> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select({ id: mysql.platformSubscriptionPayments.id })
      .from(mysql.platformSubscriptionPayments)
      .where(isNotNull(mysql.platformSubscriptionPayments.planId))
      .limit(1);
    return rows.length > 0;
  }
  const db = pgDb();
  const rows = await db
    .select({ id: pg.platformSubscriptionPayments.id })
    .from(pg.platformSubscriptionPayments)
    .where(isNotNull(pg.platformSubscriptionPayments.planId))
    .limit(1);
  return rows.length > 0;
};

/** Plan IDs that appear on at least one subscription payment row (tier is “affected” for catalog edits). */
export const listPlatformSubscriptionPlanIdsWithPayments = async (): Promise<Set<string>> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select({ planId: mysql.platformSubscriptionPayments.planId })
      .from(mysql.platformSubscriptionPayments)
      .where(isNotNull(mysql.platformSubscriptionPayments.planId))
      .groupBy(mysql.platformSubscriptionPayments.planId);
    return new Set(rows.map((r) => r.planId).filter((id): id is string => id != null && id !== ""));
  }
  const db = pgDb();
  const rows = await db
    .select({ planId: pg.platformSubscriptionPayments.planId })
    .from(pg.platformSubscriptionPayments)
    .where(isNotNull(pg.platformSubscriptionPayments.planId))
    .groupBy(pg.platformSubscriptionPayments.planId);
  return new Set(rows.map((r) => r.planId).filter((id): id is string => id != null && id !== ""));
};

/** True if any realm subscription uses this plan as current or pending next-period tier. */
export const existsSubscriptionReferencesPlanId = async (planId: string): Promise<boolean> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select({ id: mysql.subscriptions.id })
      .from(mysql.subscriptions)
      .where(or(eq(mysql.subscriptions.planId, planId), eq(mysql.subscriptions.pendingPlanId, planId)))
      .limit(1);
    return rows.length > 0;
  }
  const db = pgDb();
  const rows = await db
    .select({ id: pg.subscriptions.id })
    .from(pg.subscriptions)
    .where(or(eq(pg.subscriptions.planId, planId), eq(pg.subscriptions.pendingPlanId, planId)))
    .limit(1);
  return rows.length > 0;
};

export const existsSubscriptionPaymentForPlanId = async (planId: string): Promise<boolean> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select({ id: mysql.platformSubscriptionPayments.id })
      .from(mysql.platformSubscriptionPayments)
      .where(eq(mysql.platformSubscriptionPayments.planId, planId))
      .limit(1);
    return rows.length > 0;
  }
  const db = pgDb();
  const rows = await db
    .select({ id: pg.platformSubscriptionPayments.id })
    .from(pg.platformSubscriptionPayments)
    .where(eq(pg.platformSubscriptionPayments.planId, planId))
    .limit(1);
  return rows.length > 0;
};

/** Align every plan row with the platform subscription currency (after settings change). */
export const updateAllPlatformSubscriptionPlanCurrencies = async (currencyCode: string): Promise<void> => {
  const c = currencyCode.trim().toUpperCase().slice(0, 3);
  const now = new Date();
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db
      .update(mysql.platformSubscriptionPlans)
      .set({ currencyCode: c, updatedAt: now })
      .where(sql`1 = 1`);
    return;
  }
  const db = pgDb();
  await db
    .update(pg.platformSubscriptionPlans)
    .set({ currencyCode: c, updatedAt: now })
    .where(sql`1 = 1`);
};

export const listPlatformSubscriptionPlans = async (): Promise<PlatformSubscriptionPlanRow[]> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select()
      .from(mysql.platformSubscriptionPlans)
      .orderBy(asc(mysql.platformSubscriptionPlans.sortOrder), asc(mysql.platformSubscriptionPlans.tierName));
    return rows.map(mapPlan);
  }
  const db = pgDb();
  const rows = await db
    .select()
    .from(pg.platformSubscriptionPlans)
    .orderBy(asc(pg.platformSubscriptionPlans.sortOrder), asc(pg.platformSubscriptionPlans.tierName));
  return rows.map(mapPlan);
};

export type PlatformSubscriptionPlanInsert = {
  tierName: string;
  durationUnit: SubscriptionDurationUnit;
  durationCount: number;
  priceCents: number;
  currencyCode: string;
  allowCancelAnytime: boolean;
  trialDays: number;
  allowTierChangeNextPeriod: boolean;
  billingScope: SubscriptionBillingScope;
  sortOrder: number;
};

export const insertPlatformSubscriptionPlan = async (input: PlatformSubscriptionPlanInsert): Promise<string> => {
  const id = randomUUID();
  const now = new Date();
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db.insert(mysql.platformSubscriptionPlans).values({
      id,
      tierName: input.tierName,
      durationUnit: input.durationUnit,
      durationCount: input.durationCount,
      priceCents: input.priceCents,
      currencyCode: input.currencyCode,
      allowCancelAnytime: input.allowCancelAnytime,
      trialDays: input.trialDays,
      allowTierChangeNextPeriod: input.allowTierChangeNextPeriod,
      billingScope: input.billingScope,
      sortOrder: input.sortOrder,
      disabled: false,
      createdAt: now,
      updatedAt: now
    });
    return id;
  }
  const db = pgDb();
  await db.insert(pg.platformSubscriptionPlans).values({
    id,
    tierName: input.tierName,
    durationUnit: input.durationUnit,
    durationCount: input.durationCount,
    priceCents: input.priceCents,
    currencyCode: input.currencyCode,
    allowCancelAnytime: input.allowCancelAnytime,
    trialDays: input.trialDays,
    allowTierChangeNextPeriod: input.allowTierChangeNextPeriod,
    billingScope: input.billingScope,
    sortOrder: input.sortOrder,
    disabled: false,
    createdAt: now,
    updatedAt: now
  });
  return id;
};

export const setPlatformSubscriptionPlanDisabled = async (planId: string, disabled: boolean): Promise<boolean> => {
  const now = new Date();
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const res = await db
      .update(mysql.platformSubscriptionPlans)
      .set({ disabled, updatedAt: now })
      .where(eq(mysql.platformSubscriptionPlans.id, planId));
    const header = Array.isArray(res) ? res[0] : res;
    const affected =
      typeof header === "object" && header !== null && "affectedRows" in header ? Number(header.affectedRows) : 0;
    return affected > 0;
  }
  const db = pgDb();
  const res = await db
    .update(pg.platformSubscriptionPlans)
    .set({ disabled, updatedAt: now })
    .where(eq(pg.platformSubscriptionPlans.id, planId))
    .returning({ id: pg.platformSubscriptionPlans.id });
  return res.length > 0;
};

export const updatePlatformSubscriptionPlanById = async (
  planId: string,
  input: PlatformSubscriptionPlanInsert
): Promise<boolean> => {
  const now = new Date();
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const res = await db
      .update(mysql.platformSubscriptionPlans)
      .set({
        tierName: input.tierName,
        durationUnit: input.durationUnit,
        durationCount: input.durationCount,
        priceCents: input.priceCents,
        currencyCode: input.currencyCode,
        allowCancelAnytime: input.allowCancelAnytime,
        trialDays: input.trialDays,
        allowTierChangeNextPeriod: input.allowTierChangeNextPeriod,
        billingScope: input.billingScope,
        sortOrder: input.sortOrder,
        updatedAt: now
      })
      .where(eq(mysql.platformSubscriptionPlans.id, planId));
    const header = Array.isArray(res) ? res[0] : res;
    const affected =
      typeof header === "object" && header !== null && "affectedRows" in header ? Number(header.affectedRows) : 0;
    return affected > 0;
  }
  const db = pgDb();
  const res = await db
    .update(pg.platformSubscriptionPlans)
    .set({
      tierName: input.tierName,
      durationUnit: input.durationUnit,
      durationCount: input.durationCount,
      priceCents: input.priceCents,
      currencyCode: input.currencyCode,
      allowCancelAnytime: input.allowCancelAnytime,
      trialDays: input.trialDays,
      allowTierChangeNextPeriod: input.allowTierChangeNextPeriod,
      billingScope: input.billingScope,
      sortOrder: input.sortOrder,
      updatedAt: now
    })
    .where(eq(pg.platformSubscriptionPlans.id, planId))
    .returning({ id: pg.platformSubscriptionPlans.id });
  return res.length > 0;
};

export const deletePlatformSubscriptionPlanById = async (planId: string): Promise<boolean> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const res = await db.delete(mysql.platformSubscriptionPlans).where(eq(mysql.platformSubscriptionPlans.id, planId));
    const header = Array.isArray(res) ? res[0] : res;
    const affected =
      typeof header === "object" && header !== null && "affectedRows" in header ? Number(header.affectedRows) : 0;
    return affected > 0;
  }
  const db = pgDb();
  const res = await db
    .delete(pg.platformSubscriptionPlans)
    .where(eq(pg.platformSubscriptionPlans.id, planId))
    .returning({ id: pg.platformSubscriptionPlans.id });
  return res.length > 0;
};

const mapPaymentStatus = (s: string): SubscriptionPaymentStatus => {
  const allowed: SubscriptionPaymentStatus[] = [
    "outstanding",
    "due",
    "overdue",
    "paid",
    "cancelled",
    "reimbursed"
  ];
  return (allowed.includes(s as SubscriptionPaymentStatus) ? s : "outstanding") as SubscriptionPaymentStatus;
};

const paymentFilterConditions = (
  filters: ListPlatformSubscriptionPaymentsFilters,
  table: typeof mysql.platformSubscriptionPayments | typeof pg.platformSubscriptionPayments
) => {
  const conds = [];
  if (filters.tenantId) conds.push(eq(table.tenantId, filters.tenantId));
  if (filters.status) conds.push(eq(table.status, filters.status));
  if (filters.createdFrom) conds.push(gte(table.createdAt, filters.createdFrom));
  if (filters.createdTo) conds.push(lte(table.createdAt, filters.createdTo));
  return conds.length ? and(...conds) : undefined;
};

const mapPaymentJoinRow = async (r: {
  id: string;
  planId: string | null;
  tenantId: string;
  userId: string | null;
  amountCents: number;
  currencyCode: string;
  status: string;
  dueAt: Date | null;
  paidAt: Date | null;
  cancelledAt: Date | null;
  reimbursedAt: Date | null;
  description: string | null;
  pspInvoiceId?: string | null;
  pspPaymentIntentId?: string | null;
  pspChargeId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  tenantName: string;
  userEmail: string | null;
  tierName: string | null;
}): Promise<PlatformSubscriptionPaymentListRow> => {
  const plain =
    r.userEmail == null || r.userId == null
      ? null
      : await decryptStoredUserEmail({
          email: r.userEmail,
          tenantId: null,
          userId: r.userId
        });
  return {
    id: r.id,
    planId: r.planId,
    tenantId: r.tenantId,
    userId: r.userId,
    amountCents: r.amountCents,
    currencyCode: r.currencyCode,
    status: mapPaymentStatus(r.status),
    dueAt: r.dueAt,
    paidAt: r.paidAt,
    cancelledAt: r.cancelledAt,
    reimbursedAt: r.reimbursedAt,
    description: r.description,
    pspInvoiceId: r.pspInvoiceId ?? null,
    pspPaymentIntentId: r.pspPaymentIntentId ?? null,
    pspChargeId: r.pspChargeId ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    tenantName: r.tenantName,
    userEmail: plain,
    tierName: r.tierName
  };
};

export const countPlatformSubscriptionPaymentsFiltered = async (
  filters: ListPlatformSubscriptionPaymentsFilters
): Promise<number> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const w = paymentFilterConditions(filters, mysql.platformSubscriptionPayments);
    const q = db.select({ n: count() }).from(mysql.platformSubscriptionPayments);
    const rows = w ? await q.where(w) : await q;
    return Number(rows[0]?.n ?? 0);
  }
  const db = pgDb();
  const w = paymentFilterConditions(filters, pg.platformSubscriptionPayments);
  const q = db.select({ n: count() }).from(pg.platformSubscriptionPayments);
  const rows = w ? await q.where(w) : await q;
  return Number(rows[0]?.n ?? 0);
};

export const listPlatformSubscriptionPaymentsJoined = async (
  filters: ListPlatformSubscriptionPaymentsFilters,
  limit: number,
  offset: number
): Promise<PlatformSubscriptionPaymentListRow[]> => {
  const cap = Math.min(Math.max(limit, 1), 200);
  const off = Math.max(0, offset);
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const w = paymentFilterConditions(filters, mysql.platformSubscriptionPayments);
    const qb = db
      .select({
        id: mysql.platformSubscriptionPayments.id,
        planId: mysql.platformSubscriptionPayments.planId,
        tenantId: mysql.platformSubscriptionPayments.tenantId,
        userId: mysql.platformSubscriptionPayments.userId,
        amountCents: mysql.platformSubscriptionPayments.amountCents,
        currencyCode: mysql.platformSubscriptionPayments.currencyCode,
        status: mysql.platformSubscriptionPayments.status,
        dueAt: mysql.platformSubscriptionPayments.dueAt,
        paidAt: mysql.platformSubscriptionPayments.paidAt,
        cancelledAt: mysql.platformSubscriptionPayments.cancelledAt,
        reimbursedAt: mysql.platformSubscriptionPayments.reimbursedAt,
        description: mysql.platformSubscriptionPayments.description,
        pspInvoiceId: mysql.platformSubscriptionPayments.pspInvoiceId,
        pspPaymentIntentId: mysql.platformSubscriptionPayments.pspPaymentIntentId,
        pspChargeId: mysql.platformSubscriptionPayments.pspChargeId,
        createdAt: mysql.platformSubscriptionPayments.createdAt,
        updatedAt: mysql.platformSubscriptionPayments.updatedAt,
        tenantName: mysql.tenants.name,
        userEmail: mysql.users.email,
        tierName: mysql.platformSubscriptionPlans.tierName
      })
      .from(mysql.platformSubscriptionPayments)
      .innerJoin(mysql.tenants, eq(mysql.platformSubscriptionPayments.tenantId, mysql.tenants.id))
      .leftJoin(mysql.users, eq(mysql.platformSubscriptionPayments.userId, mysql.users.id))
      .leftJoin(
        mysql.platformSubscriptionPlans,
        eq(mysql.platformSubscriptionPayments.planId, mysql.platformSubscriptionPlans.id)
      );
    const rows = await (w ? qb.where(w) : qb)
      .orderBy(desc(mysql.platformSubscriptionPayments.createdAt))
      .limit(cap)
      .offset(off);
    return Promise.all(rows.map(mapPaymentJoinRow));
  }
  const db = pgDb();
  const w = paymentFilterConditions(filters, pg.platformSubscriptionPayments);
  const qb = db
    .select({
      id: pg.platformSubscriptionPayments.id,
      planId: pg.platformSubscriptionPayments.planId,
      tenantId: pg.platformSubscriptionPayments.tenantId,
      userId: pg.platformSubscriptionPayments.userId,
      amountCents: pg.platformSubscriptionPayments.amountCents,
      currencyCode: pg.platformSubscriptionPayments.currencyCode,
      status: pg.platformSubscriptionPayments.status,
      dueAt: pg.platformSubscriptionPayments.dueAt,
      paidAt: pg.platformSubscriptionPayments.paidAt,
      cancelledAt: pg.platformSubscriptionPayments.cancelledAt,
      reimbursedAt: pg.platformSubscriptionPayments.reimbursedAt,
      description: pg.platformSubscriptionPayments.description,
      pspInvoiceId: pg.platformSubscriptionPayments.pspInvoiceId,
      pspPaymentIntentId: pg.platformSubscriptionPayments.pspPaymentIntentId,
      pspChargeId: pg.platformSubscriptionPayments.pspChargeId,
      createdAt: pg.platformSubscriptionPayments.createdAt,
      updatedAt: pg.platformSubscriptionPayments.updatedAt,
      tenantName: pg.tenants.name,
      userEmail: pg.users.email,
      tierName: pg.platformSubscriptionPlans.tierName
    })
    .from(pg.platformSubscriptionPayments)
    .innerJoin(pg.tenants, eq(pg.platformSubscriptionPayments.tenantId, pg.tenants.id))
    .leftJoin(pg.users, eq(pg.platformSubscriptionPayments.userId, pg.users.id))
    .leftJoin(
      pg.platformSubscriptionPlans,
      eq(pg.platformSubscriptionPayments.planId, pg.platformSubscriptionPlans.id)
    );
  const rows = await (w ? qb.where(w) : qb)
    .orderBy(desc(pg.platformSubscriptionPayments.createdAt))
    .limit(cap)
    .offset(off);
  return Promise.all(rows.map(mapPaymentJoinRow));
};

export const insertPlatformSubscriptionPlanAuditLog = async (input: {
  action: PlanCatalogAuditAction;
  planId: string | null;
  actorUserId: string | null;
  summary: string;
  detailJson?: string | null;
}): Promise<void> => {
  const now = new Date();
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db.insert(mysql.platformSubscriptionPlanAuditLog).values({
      id: randomUUID(),
      createdAt: now,
      action: input.action,
      planId: input.planId,
      actorUserId: input.actorUserId,
      summary: input.summary,
      detailJson: input.detailJson ?? null
    });
    return;
  }
  const db = pgDb();
  await db.insert(pg.platformSubscriptionPlanAuditLog).values({
    createdAt: now,
    action: input.action,
    planId: input.planId,
    actorUserId: input.actorUserId,
    summary: input.summary,
    detailJson: input.detailJson ?? null
  });
};

export const listPlatformSubscriptionPlanAuditLogsPaginated = async (
  limit: number,
  offset: number
): Promise<{ rows: PlatformSubscriptionPlanAuditRow[]; total: number }> => {
  const cap = Math.min(Math.max(limit, 1), 200);
  const off = Math.max(0, offset);
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const countRows = await db.select({ n: count() }).from(mysql.platformSubscriptionPlanAuditLog);
    const total = Number(countRows[0]?.n ?? 0);
    const raw = await db
      .select()
      .from(mysql.platformSubscriptionPlanAuditLog)
      .orderBy(desc(mysql.platformSubscriptionPlanAuditLog.createdAt))
      .limit(cap)
      .offset(off);
    const rows: PlatformSubscriptionPlanAuditRow[] = raw.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      action: r.action as PlanCatalogAuditAction,
      planId: r.planId,
      actorUserId: r.actorUserId,
      summary: r.summary,
      detailJson: r.detailJson
    }));
    return { rows, total };
  }
  const db = pgDb();
  const countRows = await db.select({ n: count() }).from(pg.platformSubscriptionPlanAuditLog);
  const total = Number(countRows[0]?.n ?? 0);
  const raw = await db
    .select()
    .from(pg.platformSubscriptionPlanAuditLog)
    .orderBy(desc(pg.platformSubscriptionPlanAuditLog.createdAt))
    .limit(cap)
    .offset(off);
  const rows: PlatformSubscriptionPlanAuditRow[] = raw.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    action: r.action as PlanCatalogAuditAction,
    planId: r.planId,
    actorUserId: r.actorUserId,
    summary: r.summary,
    detailJson: r.detailJson
  }));
  return { rows, total };
};

export const getPlatformSubscriptionPlanById = async (
  planId: string
): Promise<PlatformSubscriptionPlanRow | undefined> => {
  const plans = await listPlatformSubscriptionPlans();
  return plans.find((p) => p.id === planId);
};

/** v1: monthly / count 1 plans only (see product spec). */
export const listV1CatalogPlansForBillingScope = async (
  billingScope: SubscriptionBillingScope
): Promise<PlatformSubscriptionPlanRow[]> => {
  const all = await listPlatformSubscriptionPlans();
  return all.filter(
    (p) =>
      !p.disabled &&
      p.billingScope === billingScope &&
      p.durationUnit === "month" &&
      p.durationCount === 1
  );
};

export type InsertPlatformSubscriptionPaymentInput = {
  tenantId: string;
  userId: string | null;
  planId: string | null;
  subscriptionId: string | null;
  amountCents: number;
  currencyCode: string;
  status: SubscriptionPaymentStatus;
  dueAt: Date | null;
  /** UTC period anchor — required for renewal idempotency when subscription_id is set. */
  periodStartUtc?: Date | null;
  /** Optional human or machine-readable note; worker jobs may embed PSP / idempotency metadata here until a dedicated column exists. */
  description: string | null;
  pspInvoiceId?: string | null;
  pspPaymentIntentId?: string | null;
  pspChargeId?: string | null;
};

/** Inserts one ledger row. Callers must enforce idempotency for recurring charges (see docs). */
export const insertPlatformSubscriptionPayment = async (
  input: InsertPlatformSubscriptionPaymentInput
): Promise<string> => {
  const id = randomUUID();
  const now = new Date();
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db.insert(mysql.platformSubscriptionPayments).values({
      id,
      tenantId: input.tenantId,
      userId: input.userId,
      planId: input.planId,
      subscriptionId: input.subscriptionId,
      amountCents: input.amountCents,
      currencyCode: input.currencyCode,
      status: input.status,
      dueAt: input.dueAt,
      paidAt: null,
      cancelledAt: null,
      reimbursedAt: null,
      description: input.description,
      pspInvoiceId: input.pspInvoiceId ?? null,
      pspPaymentIntentId: input.pspPaymentIntentId ?? null,
      pspChargeId: input.pspChargeId ?? null,
      periodStartUtc: input.periodStartUtc ?? null,
      createdAt: now,
      updatedAt: now
    });
    return id;
  }
  const db = pgDb();
  await db.insert(pg.platformSubscriptionPayments).values({
    id,
    tenantId: input.tenantId,
    userId: input.userId,
    planId: input.planId,
    subscriptionId: input.subscriptionId,
    amountCents: input.amountCents,
    currencyCode: input.currencyCode,
    status: input.status,
    dueAt: input.dueAt,
    paidAt: null,
    cancelledAt: null,
    reimbursedAt: null,
    description: input.description,
    pspInvoiceId: input.pspInvoiceId ?? null,
    pspPaymentIntentId: input.pspPaymentIntentId ?? null,
    pspChargeId: input.pspChargeId ?? null,
    periodStartUtc: input.periodStartUtc ?? null,
    createdAt: now,
    updatedAt: now
  });
  return id;
};

export const findPlatformSubscriptionPaymentByPspPaymentIntentId = async (
  pspPaymentIntentId: string
): Promise<{ id: string; subscriptionId: string | null; tenantId: string } | undefined> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select({
        id: mysql.platformSubscriptionPayments.id,
        subscriptionId: mysql.platformSubscriptionPayments.subscriptionId,
        tenantId: mysql.platformSubscriptionPayments.tenantId
      })
      .from(mysql.platformSubscriptionPayments)
      .where(eq(mysql.platformSubscriptionPayments.pspPaymentIntentId, pspPaymentIntentId))
      .limit(1);
    const r = rows[0];
    return r ? { id: r.id, subscriptionId: r.subscriptionId, tenantId: r.tenantId } : undefined;
  }
  const db = pgDb();
  const rows = await db
    .select({
      id: pg.platformSubscriptionPayments.id,
      subscriptionId: pg.platformSubscriptionPayments.subscriptionId,
      tenantId: pg.platformSubscriptionPayments.tenantId
    })
    .from(pg.platformSubscriptionPayments)
    .where(eq(pg.platformSubscriptionPayments.pspPaymentIntentId, pspPaymentIntentId))
    .limit(1);
  const r = rows[0];
  return r ? { id: r.id, subscriptionId: r.subscriptionId, tenantId: r.tenantId } : undefined;
};

export const updatePlatformSubscriptionPaymentPspAndStatus = async (input: {
  paymentId: string;
  pspInvoiceId?: string | null;
  pspPaymentIntentId?: string | null;
  pspChargeId?: string | null;
  status?: SubscriptionPaymentStatus;
  paidAt?: Date | null;
}): Promise<boolean> => {
  const now = new Date();
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const res = await db
      .update(mysql.platformSubscriptionPayments)
      .set({
        ...(input.pspInvoiceId !== undefined ? { pspInvoiceId: input.pspInvoiceId } : {}),
        ...(input.pspPaymentIntentId !== undefined ? { pspPaymentIntentId: input.pspPaymentIntentId } : {}),
        ...(input.pspChargeId !== undefined ? { pspChargeId: input.pspChargeId } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.paidAt !== undefined ? { paidAt: input.paidAt } : {}),
        updatedAt: now
      })
      .where(eq(mysql.platformSubscriptionPayments.id, input.paymentId));
    const header = Array.isArray(res) ? res[0] : res;
    const affected =
      typeof header === "object" && header !== null && "affectedRows" in header ? Number(header.affectedRows) : 0;
    return affected > 0;
  }
  const db = pgDb();
  const res = await db
    .update(pg.platformSubscriptionPayments)
    .set({
      ...(input.pspInvoiceId !== undefined ? { pspInvoiceId: input.pspInvoiceId } : {}),
      ...(input.pspPaymentIntentId !== undefined ? { pspPaymentIntentId: input.pspPaymentIntentId } : {}),
      ...(input.pspChargeId !== undefined ? { pspChargeId: input.pspChargeId } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.paidAt !== undefined ? { paidAt: input.paidAt } : {}),
      updatedAt: now
    })
    .where(eq(pg.platformSubscriptionPayments.id, input.paymentId))
    .returning({ id: pg.platformSubscriptionPayments.id });
  return res.length > 0;
};

/** Hard-delete a ledger row (dev-only at API layer). */
export const deletePlatformSubscriptionPaymentById = async (id: string): Promise<boolean> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const res = await db.delete(mysql.platformSubscriptionPayments).where(eq(mysql.platformSubscriptionPayments.id, id));
    const header = Array.isArray(res) ? res[0] : res;
    const affected =
      typeof header === "object" && header !== null && "affectedRows" in header ? Number(header.affectedRows) : 0;
    return affected > 0;
  }
  const db = pgDb();
  const res = await db
    .delete(pg.platformSubscriptionPayments)
    .where(eq(pg.platformSubscriptionPayments.id, id))
    .returning({ id: pg.platformSubscriptionPayments.id });
  return res.length > 0;
};
