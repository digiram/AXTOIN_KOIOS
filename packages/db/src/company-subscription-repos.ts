/**
 * Company subscriptions — tenant vendor/SaaS registry (documentation, not realm billing).
 */

import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";

import type {
  CompanySubscriptionCadenceKind,
  CompanySubscriptionCadenceUnit,
  CompanySubscriptionKind,
  CompanySubscriptionPlanCreateInput,
  CompanySubscriptionPlanPatchInput,
  CompanySubscriptionProviderCreateInput,
  CompanySubscriptionProviderPatchInput,
  CompanySubscriptionProvidersListQueryInput,
  CompanySubscriptionSeatCreateInput,
  CompanySubscriptionSeatPatchInput,
  CompanySubscriptionSeatStatus,
  CompanySubscriptionStatus
} from "@starter/shared";
import {
  amountMinorPerMonth,
  planMonthlyCostMinor,
  isSeatedCompanySubscription,
  isSingularCompanySubscription,
  parseCompanySubscriptionBillingMetadataJson,
  stringifyCompanySubscriptionBillingMetadataForDb
} from "@starter/shared";

import { escapeLike } from "./crm-repos-query-helpers.js";
import { mysqlDb, pgDb } from "./crm-repos-db.js";
import {
  getFieldEncryptionMiddleware,
  openCompanySubscriptionSeatRow,
  sealCompanySubscriptionSeatFields
} from "./field-encryption/index.js";
import { getWorkforceEmployeeById } from "./workforce-repos.js";
import * as mysql from "./mysql-schema.js";
import * as pg from "./pg-schema.js";
import { dialectFromEnv } from "./schema.js";

export type CompanySubscriptionProviderRow = {
  id: string;
  tenantId: string;
  name: string;
  vendorName: string | null;
  category: string | null;
  description: string | null;
  status: CompanySubscriptionStatus;
  subscriptionKind: CompanySubscriptionKind;
  ownerEmployeeId: string | null;
  renewalDate: string | null;
  contractStartDate: string | null;
  contractEndDate: string | null;
  cadenceKind: CompanySubscriptionCadenceKind;
  cadenceIntervalCount: number | null;
  cadenceIntervalUnit: string | null;
  amountMinor: number | null;
  currencyCode: string | null;
  billingMetadataJson: string;
  notes: string | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CompanySubscriptionPlanRow = {
  id: string;
  tenantId: string;
  providerId: string;
  name: string;
  sku: string | null;
  seatCount: number | null;
  amountMinor: number | null;
  currencyCode: string | null;
  cadenceKind: CompanySubscriptionCadenceKind;
  cadenceIntervalCount: number | null;
  cadenceIntervalUnit: string | null;
  startDate: string | null;
  endDate: string | null;
  renewalDate: string | null;
  autoRenew: boolean;
  notes: string | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CompanySubscriptionSeatRow = {
  id: string;
  tenantId: string;
  planId: string;
  employeeId: string | null;
  displayName: string | null;
  email: string | null;
  seatType: string | null;
  status: CompanySubscriptionSeatStatus;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CompanySubscriptionProviderDocumentRow = {
  id: string;
  tenantId: string;
  providerId: string;
  title: string;
  originalFilename: string;
  mimeType: string | null;
  storageRelPath: string;
  byteSize: number;
  createdAt: Date;
};

export type CompanySubscriptionDashboardSummary = {
  activeProviderCount: number;
  totalSeatCount: number;
  upcomingRenewals30d: number;
  expiring30d: number;
  estimatedRecurringCostMinor: number;
};

export type ProviderOverviewAggregate = {
  planCount: number;
  seatCount: number;
  monthlyCostMinor: number | null;
};

const asIsoDate = (raw: string | Date | null | undefined): string | null => {
  if (raw == null) return null;
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  const s = String(raw).trim();
  return s.length > 0 ? s.slice(0, 10) : null;
};

const asStatus = (raw: string): CompanySubscriptionStatus => {
  const v = raw as CompanySubscriptionStatus;
  return v === "active" ||
    v === "trial" ||
    v === "pending_renewal" ||
    v === "expired" ||
    v === "cancelled"
    ? v
    : "active";
};

const asSeatStatus = (raw: string): CompanySubscriptionSeatStatus => {
  const v = raw as CompanySubscriptionSeatStatus;
  return v === "active" || v === "pending" || v === "disabled" || v === "removed" ? v : "active";
};

const asCadenceKind = (raw: string): CompanySubscriptionCadenceKind => {
  const v = raw as CompanySubscriptionCadenceKind;
  return v === "daily" ||
    v === "weekly" ||
    v === "monthly" ||
    v === "quarterly" ||
    v === "yearly" ||
    v === "custom"
    ? v
    : "monthly";
};

const asSubscriptionKind = (v: string | null | undefined): CompanySubscriptionKind =>
  v === "seated" ? "seated" : "singular";

const resolveProviderBillingFields = (
  kind: CompanySubscriptionKind,
  fields: {
    renewalDate?: string | null | undefined;
    contractStartDate?: string | null | undefined;
    contractEndDate?: string | null | undefined;
    cadenceKind?: CompanySubscriptionCadenceKind | undefined;
    cadenceIntervalCount?: number | null | undefined;
    cadenceIntervalUnit?: string | null | undefined;
    amountMinor?: number | null | undefined;
  }
) => {
  if (isSeatedCompanySubscription(kind)) {
    return {
      renewalDate: null,
      contractStartDate: null,
      contractEndDate: null,
      amountMinor: null,
      cadenceKind: "monthly" as CompanySubscriptionCadenceKind,
      cadenceIntervalCount: null,
      cadenceIntervalUnit: null
    };
  }
  return {
    renewalDate: fields.renewalDate?.trim() || null,
    contractStartDate: fields.contractStartDate?.trim() || null,
    contractEndDate: fields.contractEndDate?.trim() || null,
    amountMinor: fields.amountMinor ?? null,
    cadenceKind: fields.cadenceKind ?? "monthly",
    cadenceIntervalCount: fields.cadenceIntervalCount ?? null,
    cadenceIntervalUnit: fields.cadenceIntervalUnit?.trim() || null
  };
};

const mapProviderPg = (row: typeof pg.companySubscriptionProviders.$inferSelect): CompanySubscriptionProviderRow => ({
  id: row.id,
  tenantId: row.tenantId,
  name: row.name,
  vendorName: row.vendorName ?? null,
  category: row.category ?? null,
  description: row.description ?? null,
  status: asStatus(row.status),
  subscriptionKind: asSubscriptionKind(row.subscriptionKind),
  ownerEmployeeId: row.ownerEmployeeId ?? null,
  renewalDate: asIsoDate(row.renewalDate),
  contractStartDate: asIsoDate(row.contractStartDate),
  contractEndDate: asIsoDate(row.contractEndDate),
  cadenceKind: asCadenceKind(row.cadenceKind),
  cadenceIntervalCount: row.cadenceIntervalCount ?? null,
  cadenceIntervalUnit: row.cadenceIntervalUnit ?? null,
  amountMinor: row.amountMinor ?? null,
  currencyCode: row.currencyCode ?? null,
  billingMetadataJson: row.billingMetadataJson ?? "{}",
  notes: row.notes ?? null,
  createdByUserId: row.createdByUserId ?? null,
  updatedByUserId: row.updatedByUserId ?? null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
});

const mapProviderMysql = (
  row: typeof mysql.companySubscriptionProviders.$inferSelect
): CompanySubscriptionProviderRow => ({
  id: row.id,
  tenantId: row.tenantId,
  name: row.name,
  vendorName: row.vendorName ?? null,
  category: row.category ?? null,
  description: row.description ?? null,
  status: asStatus(row.status),
  subscriptionKind: asSubscriptionKind(row.subscriptionKind),
  ownerEmployeeId: row.ownerEmployeeId ?? null,
  renewalDate: asIsoDate(row.renewalDate),
  contractStartDate: asIsoDate(row.contractStartDate),
  contractEndDate: asIsoDate(row.contractEndDate),
  cadenceKind: asCadenceKind(row.cadenceKind),
  cadenceIntervalCount: row.cadenceIntervalCount ?? null,
  cadenceIntervalUnit: row.cadenceIntervalUnit ?? null,
  amountMinor: row.amountMinor ?? null,
  currencyCode: row.currencyCode ?? null,
  billingMetadataJson: row.billingMetadataJson ?? "{}",
  notes: row.notes ?? null,
  createdByUserId: row.createdByUserId ?? null,
  updatedByUserId: row.updatedByUserId ?? null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
});

const mapPlanPg = (row: typeof pg.companySubscriptionPlans.$inferSelect): CompanySubscriptionPlanRow => ({
  id: row.id,
  tenantId: row.tenantId,
  providerId: row.providerId,
  name: row.name,
  sku: row.sku ?? null,
  seatCount: row.seatCount ?? null,
  amountMinor: row.amountMinor ?? null,
  currencyCode: row.currencyCode ?? null,
  cadenceKind: asCadenceKind(row.cadenceKind),
  cadenceIntervalCount: row.cadenceIntervalCount ?? null,
  cadenceIntervalUnit: row.cadenceIntervalUnit ?? null,
  startDate: asIsoDate(row.startDate),
  endDate: asIsoDate(row.endDate),
  renewalDate: asIsoDate(row.renewalDate),
  autoRenew: row.autoRenew,
  notes: row.notes ?? null,
  createdByUserId: row.createdByUserId ?? null,
  updatedByUserId: row.updatedByUserId ?? null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
});

const mapPlanMysql = (row: typeof mysql.companySubscriptionPlans.$inferSelect): CompanySubscriptionPlanRow => ({
  id: row.id,
  tenantId: row.tenantId,
  providerId: row.providerId,
  name: row.name,
  sku: row.sku ?? null,
  seatCount: row.seatCount ?? null,
  amountMinor: row.amountMinor ?? null,
  currencyCode: row.currencyCode ?? null,
  cadenceKind: asCadenceKind(row.cadenceKind),
  cadenceIntervalCount: row.cadenceIntervalCount ?? null,
  cadenceIntervalUnit: row.cadenceIntervalUnit ?? null,
  startDate: asIsoDate(row.startDate),
  endDate: asIsoDate(row.endDate),
  renewalDate: asIsoDate(row.renewalDate),
  autoRenew: Boolean(row.autoRenew),
  notes: row.notes ?? null,
  createdByUserId: row.createdByUserId ?? null,
  updatedByUserId: row.updatedByUserId ?? null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
});

const mapSeatPg = (row: typeof pg.companySubscriptionSeats.$inferSelect): CompanySubscriptionSeatRow => ({
  id: row.id,
  tenantId: row.tenantId,
  planId: row.planId,
  employeeId: row.employeeId ?? null,
  displayName: row.displayName ?? null,
  email: row.email ?? null,
  seatType: row.seatType ?? null,
  status: asSeatStatus(row.status),
  startDate: asIsoDate(row.startDate),
  endDate: asIsoDate(row.endDate),
  notes: row.notes ?? null,
  createdByUserId: row.createdByUserId ?? null,
  updatedByUserId: row.updatedByUserId ?? null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
});

const mapSeatMysql = (row: typeof mysql.companySubscriptionSeats.$inferSelect): CompanySubscriptionSeatRow => ({
  id: row.id,
  tenantId: row.tenantId,
  planId: row.planId,
  employeeId: row.employeeId ?? null,
  displayName: row.displayName ?? null,
  email: row.email ?? null,
  seatType: row.seatType ?? null,
  status: asSeatStatus(row.status),
  startDate: asIsoDate(row.startDate),
  endDate: asIsoDate(row.endDate),
  notes: row.notes ?? null,
  createdByUserId: row.createdByUserId ?? null,
  updatedByUserId: row.updatedByUserId ?? null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
});

const openSeatRow = async (
  tenantId: string,
  row: typeof pg.companySubscriptionSeats.$inferSelect | typeof mysql.companySubscriptionSeats.$inferSelect
): Promise<CompanySubscriptionSeatRow> => {
  const plain = await openCompanySubscriptionSeatRow(tenantId, row as unknown as Record<string, unknown>);
  return dialectFromEnv() === "mysql"
    ? mapSeatMysql(plain as typeof mysql.companySubscriptionSeats.$inferSelect)
    : mapSeatPg(plain as typeof pg.companySubscriptionSeats.$inferSelect);
};

const mapDocPg = (
  row: typeof pg.companySubscriptionProviderDocuments.$inferSelect
): CompanySubscriptionProviderDocumentRow => ({
  id: row.id,
  tenantId: row.tenantId,
  providerId: row.providerId,
  title: row.title,
  originalFilename: row.originalFilename,
  mimeType: row.mimeType ?? null,
  storageRelPath: row.storageRelPath,
  byteSize: row.byteSize,
  createdAt: row.createdAt
});

const mapDocMysql = (
  row: typeof mysql.companySubscriptionProviderDocuments.$inferSelect
): CompanySubscriptionProviderDocumentRow => ({
  id: row.id,
  tenantId: row.tenantId,
  providerId: row.providerId,
  title: row.title,
  originalFilename: row.originalFilename,
  mimeType: row.mimeType ?? null,
  storageRelPath: row.storageRelPath,
  byteSize: row.byteSize,
  createdAt: row.createdAt
});

const utcTodayIso = (): string => new Date().toISOString().slice(0, 10);

const addUtcDaysIso = (isoDate: string, days: number): string => {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const isoToMysqlDate = (iso: string | null | undefined): Date | null => {
  if (!iso?.trim()) return null;
  return new Date(`${iso.trim().slice(0, 10)}T00:00:00.000Z`);
};

const isoToPgDate = (iso: string | null | undefined): string | null => iso?.trim()?.slice(0, 10) || null;

const toMysqlCompareDate = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

const resolveOwnerEmployeeId = async (
  tenantId: string,
  value: string | null | undefined
): Promise<string | null | { error: "invalid_employee" }> => {
  if (value == null) return null;
  const emp = await getWorkforceEmployeeById(tenantId, value);
  if (!emp) return { error: "invalid_employee" };
  return emp.id;
};

export const getCompanySubscriptionProviderById = async (
  tenantId: string,
  id: string
): Promise<CompanySubscriptionProviderRow | undefined> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select()
      .from(mysql.companySubscriptionProviders)
      .where(and(eq(mysql.companySubscriptionProviders.tenantId, tenantId), eq(mysql.companySubscriptionProviders.id, id)))
      .limit(1);
    return rows[0] ? mapProviderMysql(rows[0]) : undefined;
  }
  const db = pgDb();
  const rows = await db
    .select()
    .from(pg.companySubscriptionProviders)
    .where(and(eq(pg.companySubscriptionProviders.tenantId, tenantId), eq(pg.companySubscriptionProviders.id, id)))
    .limit(1);
  return rows[0] ? mapProviderPg(rows[0]) : undefined;
};

export type ListCompanySubscriptionProvidersParams = CompanySubscriptionProvidersListQueryInput & {
  tenantId: string;
};

const buildProviderListWhere = (
  tenantId: string,
  query: CompanySubscriptionProvidersListQueryInput,
  dialect: "pg" | "mysql"
) => {
  const parts: unknown[] = [];
  if (dialect === "mysql") {
    parts.push(eq(mysql.companySubscriptionProviders.tenantId, tenantId));
    if (query.status) parts.push(eq(mysql.companySubscriptionProviders.status, query.status));
    if (query.category?.trim()) parts.push(eq(mysql.companySubscriptionProviders.category, query.category.trim()));
    if (query.cadenceKind) parts.push(eq(mysql.companySubscriptionProviders.cadenceKind, query.cadenceKind));
    const q = query.q?.trim() ?? "";
    if (q.length > 0) {
      const pat = "%" + escapeLike(q) + "%";
      parts.push(
        or(
          sql`LOWER(${mysql.companySubscriptionProviders.name}) LIKE LOWER(${pat})`,
          sql`LOWER(COALESCE(${mysql.companySubscriptionProviders.vendorName},'')) LIKE LOWER(${pat})`,
          sql`LOWER(COALESCE(${mysql.companySubscriptionProviders.category},'')) LIKE LOWER(${pat})`,
          sql`LOWER(COALESCE(${mysql.companySubscriptionProviders.description},'')) LIKE LOWER(${pat})`
        )!
      );
    }
    if (query.renewalWithinDays != null) {
      const today = utcTodayIso();
      const end = addUtcDaysIso(today, query.renewalWithinDays);
      parts.push(gte(mysql.companySubscriptionProviders.renewalDate, toMysqlCompareDate(today)));
      parts.push(lte(mysql.companySubscriptionProviders.renewalDate, toMysqlCompareDate(end)));
    }
    return and(...(parts as Parameters<typeof and>));
  }

  parts.push(eq(pg.companySubscriptionProviders.tenantId, tenantId));
  if (query.status) parts.push(eq(pg.companySubscriptionProviders.status, query.status));
  if (query.category?.trim()) parts.push(eq(pg.companySubscriptionProviders.category, query.category.trim()));
  if (query.cadenceKind) parts.push(eq(pg.companySubscriptionProviders.cadenceKind, query.cadenceKind));
  const q = query.q?.trim() ?? "";
  if (q.length > 0) {
    const pat = `%${escapeLike(q)}%`;
    parts.push(
      or(
        ilike(pg.companySubscriptionProviders.name, pat),
        ilike(pg.companySubscriptionProviders.vendorName, pat),
        ilike(pg.companySubscriptionProviders.category, pat),
        ilike(pg.companySubscriptionProviders.description, pat)
      )!
    );
  }
  if (query.renewalWithinDays != null) {
    const today = utcTodayIso();
    const end = addUtcDaysIso(today, query.renewalWithinDays);
    parts.push(gte(pg.companySubscriptionProviders.renewalDate, today));
    parts.push(lte(pg.companySubscriptionProviders.renewalDate, end));
  }
  return and(...(parts as Parameters<typeof and>));
};

export const listCompanySubscriptionProviders = async (
  params: ListCompanySubscriptionProvidersParams
): Promise<{ rows: CompanySubscriptionProviderRow[]; total: number }> => {
  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;
  const sort = params.sort ?? "name";
  const order = params.order ?? "asc";
  const query = params;

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const whereClause = buildProviderListWhere(params.tenantId, query, "mysql");
    const cRows = await db.select({ c: count() }).from(mysql.companySubscriptionProviders).where(whereClause);
    const sortCol =
      sort === "renewal_date"
        ? mysql.companySubscriptionProviders.renewalDate
        : sort === "status"
          ? mysql.companySubscriptionProviders.status
          : sort === "updated_at"
            ? mysql.companySubscriptionProviders.updatedAt
            : mysql.companySubscriptionProviders.name;
    const orderFn = order === "desc" ? desc : asc;
    const rows = await db
      .select()
      .from(mysql.companySubscriptionProviders)
      .where(whereClause)
      .orderBy(orderFn(sortCol), asc(mysql.companySubscriptionProviders.id))
      .limit(limit)
      .offset(offset);
    return { rows: rows.map(mapProviderMysql), total: Number(cRows[0]?.c ?? 0) };
  }

  const db = pgDb();
  const whereClause = buildProviderListWhere(params.tenantId, query, "pg");
  const cRows = await db.select({ c: count() }).from(pg.companySubscriptionProviders).where(whereClause);
  const sortCol =
    sort === "renewal_date"
      ? pg.companySubscriptionProviders.renewalDate
      : sort === "status"
        ? pg.companySubscriptionProviders.status
        : sort === "updated_at"
          ? pg.companySubscriptionProviders.updatedAt
          : pg.companySubscriptionProviders.name;
  const orderFn = order === "desc" ? desc : asc;
  const rows = await db
    .select()
    .from(pg.companySubscriptionProviders)
    .where(whereClause)
    .orderBy(orderFn(sortCol), asc(pg.companySubscriptionProviders.id))
    .limit(limit)
    .offset(offset);
  return { rows: rows.map(mapProviderPg), total: Number(cRows[0]?.c ?? 0) };
};

export const buildProviderOverviewAggregates = async (
  tenantId: string,
  providers: CompanySubscriptionProviderRow[]
): Promise<Map<string, ProviderOverviewAggregate>> => {
  const map = new Map<string, ProviderOverviewAggregate>();
  if (providers.length === 0) return map;

  const ids = providers.map((p) => p.id);
  for (const id of ids) {
    map.set(id, { planCount: 0, seatCount: 0, monthlyCostMinor: null });
  }

  const applyPlanCount = (providerId: string, n: number) => {
    const entry = map.get(providerId);
    if (entry) entry.planCount = n;
  };
  const applySeatCount = (providerId: string, n: number) => {
    const entry = map.get(providerId);
    if (entry) entry.seatCount = n;
  };

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const planCountRows = await db
      .select({
        providerId: mysql.companySubscriptionPlans.providerId,
        c: count()
      })
      .from(mysql.companySubscriptionPlans)
      .where(
        and(eq(mysql.companySubscriptionPlans.tenantId, tenantId), inArray(mysql.companySubscriptionPlans.providerId, ids))
      )
      .groupBy(mysql.companySubscriptionPlans.providerId);
    for (const row of planCountRows) applyPlanCount(row.providerId, Number(row.c ?? 0));

    const seatCountRows = await db
      .select({
        providerId: mysql.companySubscriptionPlans.providerId,
        c: count()
      })
      .from(mysql.companySubscriptionSeats)
      .innerJoin(
        mysql.companySubscriptionPlans,
        eq(mysql.companySubscriptionSeats.planId, mysql.companySubscriptionPlans.id)
      )
      .where(
        and(eq(mysql.companySubscriptionSeats.tenantId, tenantId), inArray(mysql.companySubscriptionPlans.providerId, ids))
      )
      .groupBy(mysql.companySubscriptionPlans.providerId);
    for (const row of seatCountRows) applySeatCount(row.providerId, Number(row.c ?? 0));

    const seatedIds = providers.filter((p) => isSeatedCompanySubscription(p.subscriptionKind)).map((p) => p.id);
    if (seatedIds.length > 0) {
      const planRows = await db
        .select()
        .from(mysql.companySubscriptionPlans)
        .where(
          and(
            eq(mysql.companySubscriptionPlans.tenantId, tenantId),
            inArray(mysql.companySubscriptionPlans.providerId, seatedIds)
          )
        );
      const planIds = planRows.map((p) => p.id);
      const assignedByPlanId = new Map<string, number>();
      if (planIds.length > 0) {
        const assignedRows = await db
          .select({ planId: mysql.companySubscriptionSeats.planId, c: count() })
          .from(mysql.companySubscriptionSeats)
          .where(
            and(
              eq(mysql.companySubscriptionSeats.tenantId, tenantId),
              inArray(mysql.companySubscriptionSeats.planId, planIds)
            )
          )
          .groupBy(mysql.companySubscriptionSeats.planId);
        for (const row of assignedRows) assignedByPlanId.set(row.planId, Number(row.c ?? 0));
      }
      for (const plan of planRows) {
        const entry = map.get(plan.providerId);
        if (!entry) continue;
        const monthly = planMonthlyCostMinor(
          {
            amountMinor: plan.amountMinor,
            seatCount: plan.seatCount,
            cadenceKind: asCadenceKind(plan.cadenceKind),
            cadenceIntervalCount: plan.cadenceIntervalCount,
            cadenceIntervalUnit: plan.cadenceIntervalUnit as CompanySubscriptionCadenceUnit | null
          },
          assignedByPlanId.get(plan.id) ?? 0
        );
        if (monthly == null) continue;
        entry.monthlyCostMinor = (entry.monthlyCostMinor ?? 0) + monthly;
      }
    }
  } else {
    const db = pgDb();
    const planCountRows = await db
      .select({
        providerId: pg.companySubscriptionPlans.providerId,
        c: count()
      })
      .from(pg.companySubscriptionPlans)
      .where(and(eq(pg.companySubscriptionPlans.tenantId, tenantId), inArray(pg.companySubscriptionPlans.providerId, ids)))
      .groupBy(pg.companySubscriptionPlans.providerId);
    for (const row of planCountRows) applyPlanCount(row.providerId, Number(row.c ?? 0));

    const seatCountRows = await db
      .select({
        providerId: pg.companySubscriptionPlans.providerId,
        c: count()
      })
      .from(pg.companySubscriptionSeats)
      .innerJoin(pg.companySubscriptionPlans, eq(pg.companySubscriptionSeats.planId, pg.companySubscriptionPlans.id))
      .where(and(eq(pg.companySubscriptionSeats.tenantId, tenantId), inArray(pg.companySubscriptionPlans.providerId, ids)))
      .groupBy(pg.companySubscriptionPlans.providerId);
    for (const row of seatCountRows) applySeatCount(row.providerId, Number(row.c ?? 0));

    const seatedIds = providers.filter((p) => isSeatedCompanySubscription(p.subscriptionKind)).map((p) => p.id);
    if (seatedIds.length > 0) {
      const planRows = await db
        .select()
        .from(pg.companySubscriptionPlans)
        .where(
          and(eq(pg.companySubscriptionPlans.tenantId, tenantId), inArray(pg.companySubscriptionPlans.providerId, seatedIds))
        );
      const planIds = planRows.map((p) => p.id);
      const assignedByPlanId = new Map<string, number>();
      if (planIds.length > 0) {
        const assignedRows = await db
          .select({ planId: pg.companySubscriptionSeats.planId, c: count() })
          .from(pg.companySubscriptionSeats)
          .where(
            and(eq(pg.companySubscriptionSeats.tenantId, tenantId), inArray(pg.companySubscriptionSeats.planId, planIds))
          )
          .groupBy(pg.companySubscriptionSeats.planId);
        for (const row of assignedRows) assignedByPlanId.set(row.planId, Number(row.c ?? 0));
      }
      for (const plan of planRows) {
        const entry = map.get(plan.providerId);
        if (!entry) continue;
        const monthly = planMonthlyCostMinor(
          {
            amountMinor: plan.amountMinor,
            seatCount: plan.seatCount,
            cadenceKind: asCadenceKind(plan.cadenceKind),
            cadenceIntervalCount: plan.cadenceIntervalCount,
            cadenceIntervalUnit: plan.cadenceIntervalUnit as CompanySubscriptionCadenceUnit | null
          },
          assignedByPlanId.get(plan.id) ?? 0
        );
        if (monthly == null) continue;
        entry.monthlyCostMinor = (entry.monthlyCostMinor ?? 0) + monthly;
      }
    }
  }

  for (const provider of providers) {
    if (!isSingularCompanySubscription(provider.subscriptionKind)) continue;
    const entry = map.get(provider.id);
    if (!entry) continue;
    entry.monthlyCostMinor = amountMinorPerMonth(provider.amountMinor, {
      cadenceKind: provider.cadenceKind,
      cadenceIntervalCount: provider.cadenceIntervalCount,
      cadenceIntervalUnit: provider.cadenceIntervalUnit as CompanySubscriptionCadenceUnit | null
    });
  }

  return map;
};

export const insertCompanySubscriptionProvider = async (
  tenantId: string,
  input: CompanySubscriptionProviderCreateInput,
  actorUserId: string | null
): Promise<CompanySubscriptionProviderRow | { error: "invalid_employee" }> => {
  const ownerResolved = await resolveOwnerEmployeeId(tenantId, input.ownerEmployeeId);
  if (ownerResolved !== null && typeof ownerResolved === "object") return ownerResolved;
  const ownerEmployeeId = ownerResolved;

  const now = new Date();
  const id = randomUUID();
  const billingJson = stringifyCompanySubscriptionBillingMetadataForDb(input.billingMetadata);
  const subscriptionKind = asSubscriptionKind(input.subscriptionKind);
  const billing = resolveProviderBillingFields(subscriptionKind, input);
  const values = {
    id,
    tenantId,
    name: input.name.trim(),
    vendorName: input.vendorName?.trim() || null,
    category: input.category?.trim() || null,
    description: input.description?.trim() || null,
    status: input.status ?? "active",
    subscriptionKind,
    ownerEmployeeId,
    renewalDate: isoToMysqlDate(billing.renewalDate),
    contractStartDate: isoToMysqlDate(billing.contractStartDate),
    contractEndDate: isoToMysqlDate(billing.contractEndDate),
    cadenceKind: billing.cadenceKind,
    cadenceIntervalCount: billing.cadenceIntervalCount,
    cadenceIntervalUnit: billing.cadenceIntervalUnit,
    amountMinor: billing.amountMinor,
    currencyCode: input.currencyCode?.trim() || null,
    billingMetadataJson: billingJson,
    notes: input.notes?.trim() || null,
    createdByUserId: actorUserId,
    updatedByUserId: actorUserId,
    createdAt: now,
    updatedAt: now
  };

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db.insert(mysql.companySubscriptionProviders).values(values);
  } else {
    const db = pgDb();
    await db.insert(pg.companySubscriptionProviders).values({
      ...values,
      renewalDate: isoToPgDate(billing.renewalDate),
      contractStartDate: isoToPgDate(billing.contractStartDate),
      contractEndDate: isoToPgDate(billing.contractEndDate)
    });
  }
  return (await getCompanySubscriptionProviderById(tenantId, id))!;
};

export const updateCompanySubscriptionProvider = async (
  tenantId: string,
  id: string,
  patch: CompanySubscriptionProviderPatchInput,
  actorUserId: string | null
): Promise<CompanySubscriptionProviderRow | { error: "not_found" | "invalid_employee" }> => {
  const existing = await getCompanySubscriptionProviderById(tenantId, id);
  if (!existing) return { error: "not_found" };

  let ownerEmployeeId = existing.ownerEmployeeId;
  if (patch.ownerEmployeeId !== undefined) {
    const ownerResolved = await resolveOwnerEmployeeId(tenantId, patch.ownerEmployeeId);
    if (ownerResolved !== null && typeof ownerResolved === "object") return ownerResolved;
    ownerEmployeeId = ownerResolved;
  }

  const now = new Date();
  const billingJson =
    patch.billingMetadata !== undefined
      ? stringifyCompanySubscriptionBillingMetadataForDb(patch.billingMetadata)
      : existing.billingMetadataJson;

  const subscriptionKind =
    patch.subscriptionKind !== undefined ? asSubscriptionKind(patch.subscriptionKind) : existing.subscriptionKind;

  const billing = resolveProviderBillingFields(subscriptionKind, {
    renewalDate: patch.renewalDate !== undefined ? patch.renewalDate : existing.renewalDate,
    contractStartDate:
      patch.contractStartDate !== undefined ? patch.contractStartDate : existing.contractStartDate,
    contractEndDate: patch.contractEndDate !== undefined ? patch.contractEndDate : existing.contractEndDate,
    cadenceKind: patch.cadenceKind ?? existing.cadenceKind,
    cadenceIntervalCount:
      patch.cadenceIntervalCount !== undefined ? patch.cadenceIntervalCount : existing.cadenceIntervalCount,
    cadenceIntervalUnit:
      patch.cadenceIntervalUnit !== undefined ? patch.cadenceIntervalUnit : existing.cadenceIntervalUnit,
    amountMinor: patch.amountMinor !== undefined ? patch.amountMinor : existing.amountMinor
  });

  const setBase = {
    name: patch.name !== undefined ? patch.name.trim() : existing.name,
    vendorName: patch.vendorName !== undefined ? patch.vendorName?.trim() || null : existing.vendorName,
    category: patch.category !== undefined ? patch.category?.trim() || null : existing.category,
    description: patch.description !== undefined ? patch.description?.trim() || null : existing.description,
    status: patch.status ?? existing.status,
    subscriptionKind,
    ownerEmployeeId,
    cadenceKind: billing.cadenceKind,
    cadenceIntervalCount: billing.cadenceIntervalCount,
    cadenceIntervalUnit: billing.cadenceIntervalUnit,
    amountMinor: billing.amountMinor,
    currencyCode: patch.currencyCode !== undefined ? patch.currencyCode?.trim() || null : existing.currencyCode,
    billingMetadataJson: billingJson,
    notes: patch.notes !== undefined ? patch.notes?.trim() || null : existing.notes,
    updatedByUserId: actorUserId,
    updatedAt: now
  };

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db
      .update(mysql.companySubscriptionProviders)
      .set({
        ...setBase,
        renewalDate: isoToMysqlDate(billing.renewalDate),
        contractStartDate: isoToMysqlDate(billing.contractStartDate),
        contractEndDate: isoToMysqlDate(billing.contractEndDate)
      })
      .where(and(eq(mysql.companySubscriptionProviders.tenantId, tenantId), eq(mysql.companySubscriptionProviders.id, id)));
  } else {
    const db = pgDb();
    await db
      .update(pg.companySubscriptionProviders)
      .set({
        ...setBase,
        renewalDate: isoToPgDate(billing.renewalDate),
        contractStartDate: isoToPgDate(billing.contractStartDate),
        contractEndDate: isoToPgDate(billing.contractEndDate)
      })
      .where(and(eq(pg.companySubscriptionProviders.tenantId, tenantId), eq(pg.companySubscriptionProviders.id, id)));
  }
  return (await getCompanySubscriptionProviderById(tenantId, id))!;
};

export const deleteCompanySubscriptionProvider = async (
  tenantId: string,
  id: string
): Promise<{ ok: true } | { ok: false; error: "not_found" }> => {
  const existing = await getCompanySubscriptionProviderById(tenantId, id);
  if (!existing) return { ok: false, error: "not_found" };

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db
      .delete(mysql.companySubscriptionProviders)
      .where(and(eq(mysql.companySubscriptionProviders.tenantId, tenantId), eq(mysql.companySubscriptionProviders.id, id)));
  } else {
    const db = pgDb();
    await db
      .delete(pg.companySubscriptionProviders)
      .where(and(eq(pg.companySubscriptionProviders.tenantId, tenantId), eq(pg.companySubscriptionProviders.id, id)));
  }
  return { ok: true };
};

export const listPlansByProviderId = async (
  tenantId: string,
  providerId: string
): Promise<CompanySubscriptionPlanRow[]> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select()
      .from(mysql.companySubscriptionPlans)
      .where(
        and(eq(mysql.companySubscriptionPlans.tenantId, tenantId), eq(mysql.companySubscriptionPlans.providerId, providerId))
      )
      .orderBy(asc(mysql.companySubscriptionPlans.name));
    return rows.map(mapPlanMysql);
  }
  const db = pgDb();
  const rows = await db
    .select()
    .from(pg.companySubscriptionPlans)
    .where(and(eq(pg.companySubscriptionPlans.tenantId, tenantId), eq(pg.companySubscriptionPlans.providerId, providerId)))
    .orderBy(asc(pg.companySubscriptionPlans.name));
  return rows.map(mapPlanPg);
};

export const getPlanById = async (
  tenantId: string,
  planId: string
): Promise<CompanySubscriptionPlanRow | undefined> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select()
      .from(mysql.companySubscriptionPlans)
      .where(and(eq(mysql.companySubscriptionPlans.tenantId, tenantId), eq(mysql.companySubscriptionPlans.id, planId)))
      .limit(1);
    return rows[0] ? mapPlanMysql(rows[0]) : undefined;
  }
  const db = pgDb();
  const rows = await db
    .select()
    .from(pg.companySubscriptionPlans)
    .where(and(eq(pg.companySubscriptionPlans.tenantId, tenantId), eq(pg.companySubscriptionPlans.id, planId)))
    .limit(1);
  return rows[0] ? mapPlanPg(rows[0]) : undefined;
};

export const insertPlan = async (
  tenantId: string,
  providerId: string,
  input: CompanySubscriptionPlanCreateInput,
  actorUserId: string | null
): Promise<CompanySubscriptionPlanRow | { error: "provider_not_found" }> => {
  const provider = await getCompanySubscriptionProviderById(tenantId, providerId);
  if (!provider) return { error: "provider_not_found" };

  const now = new Date();
  const id = randomUUID();
  const values = {
    id,
    tenantId,
    providerId,
    name: input.name.trim(),
    sku: input.sku?.trim() || null,
    seatCount: input.seatCount ?? null,
    amountMinor: input.amountMinor ?? null,
    currencyCode: input.currencyCode?.trim() || null,
    cadenceKind: input.cadenceKind ?? "monthly",
    cadenceIntervalCount: input.cadenceIntervalCount ?? null,
    cadenceIntervalUnit: input.cadenceIntervalUnit ?? null,
    startDate: isoToMysqlDate(input.startDate),
    endDate: isoToMysqlDate(input.endDate),
    renewalDate: isoToMysqlDate(input.renewalDate),
    autoRenew: input.autoRenew ?? false,
    notes: input.notes?.trim() || null,
    createdByUserId: actorUserId,
    updatedByUserId: actorUserId,
    createdAt: now,
    updatedAt: now
  };

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db.insert(mysql.companySubscriptionPlans).values(values);
  } else {
    const db = pgDb();
    await db.insert(pg.companySubscriptionPlans).values({
      ...values,
      startDate: isoToPgDate(input.startDate),
      endDate: isoToPgDate(input.endDate),
      renewalDate: isoToPgDate(input.renewalDate)
    });
  }
  return (await getPlanById(tenantId, id))!;
};

export const updatePlan = async (
  tenantId: string,
  planId: string,
  patch: CompanySubscriptionPlanPatchInput,
  actorUserId: string | null
): Promise<CompanySubscriptionPlanRow | { error: "not_found" }> => {
  const existing = await getPlanById(tenantId, planId);
  if (!existing) return { error: "not_found" };

  const now = new Date();
  const startIso = patch.startDate !== undefined ? patch.startDate?.trim() || null : existing.startDate;
  const endIso = patch.endDate !== undefined ? patch.endDate?.trim() || null : existing.endDate;
  const renewalIso = patch.renewalDate !== undefined ? patch.renewalDate?.trim() || null : existing.renewalDate;
  const setBase = {
    name: patch.name !== undefined ? patch.name.trim() : existing.name,
    sku: patch.sku !== undefined ? patch.sku?.trim() || null : existing.sku,
    seatCount: patch.seatCount !== undefined ? patch.seatCount : existing.seatCount,
    amountMinor: patch.amountMinor !== undefined ? patch.amountMinor : existing.amountMinor,
    currencyCode: patch.currencyCode !== undefined ? patch.currencyCode?.trim() || null : existing.currencyCode,
    cadenceKind: patch.cadenceKind ?? existing.cadenceKind,
    cadenceIntervalCount:
      patch.cadenceIntervalCount !== undefined ? patch.cadenceIntervalCount : existing.cadenceIntervalCount,
    cadenceIntervalUnit:
      patch.cadenceIntervalUnit !== undefined ? patch.cadenceIntervalUnit : existing.cadenceIntervalUnit,
    autoRenew: patch.autoRenew !== undefined ? patch.autoRenew : existing.autoRenew,
    notes: patch.notes !== undefined ? patch.notes?.trim() || null : existing.notes,
    updatedByUserId: actorUserId,
    updatedAt: now
  };

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db
      .update(mysql.companySubscriptionPlans)
      .set({
        ...setBase,
        startDate: isoToMysqlDate(startIso),
        endDate: isoToMysqlDate(endIso),
        renewalDate: isoToMysqlDate(renewalIso)
      })
      .where(and(eq(mysql.companySubscriptionPlans.tenantId, tenantId), eq(mysql.companySubscriptionPlans.id, planId)));
  } else {
    const db = pgDb();
    await db
      .update(pg.companySubscriptionPlans)
      .set({
        ...setBase,
        startDate: isoToPgDate(startIso),
        endDate: isoToPgDate(endIso),
        renewalDate: isoToPgDate(renewalIso)
      })
      .where(and(eq(pg.companySubscriptionPlans.tenantId, tenantId), eq(pg.companySubscriptionPlans.id, planId)));
  }
  return (await getPlanById(tenantId, planId))!;
};

export const deletePlan = async (
  tenantId: string,
  planId: string
): Promise<{ ok: true } | { ok: false; error: "not_found" }> => {
  const existing = await getPlanById(tenantId, planId);
  if (!existing) return { ok: false, error: "not_found" };

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db
      .delete(mysql.companySubscriptionPlans)
      .where(and(eq(mysql.companySubscriptionPlans.tenantId, tenantId), eq(mysql.companySubscriptionPlans.id, planId)));
  } else {
    const db = pgDb();
    await db
      .delete(pg.companySubscriptionPlans)
      .where(and(eq(pg.companySubscriptionPlans.tenantId, tenantId), eq(pg.companySubscriptionPlans.id, planId)));
  }
  return { ok: true };
};

export const listSeatsByPlanId = async (tenantId: string, planId: string): Promise<CompanySubscriptionSeatRow[]> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select()
      .from(mysql.companySubscriptionSeats)
      .where(and(eq(mysql.companySubscriptionSeats.tenantId, tenantId), eq(mysql.companySubscriptionSeats.planId, planId)))
      .orderBy(asc(mysql.companySubscriptionSeats.displayName), asc(mysql.companySubscriptionSeats.createdAt));
    return Promise.all(rows.map((row) => openSeatRow(tenantId, row)));
  }
  const db = pgDb();
  const rows = await db
    .select()
    .from(pg.companySubscriptionSeats)
    .where(and(eq(pg.companySubscriptionSeats.tenantId, tenantId), eq(pg.companySubscriptionSeats.planId, planId)))
    .orderBy(asc(pg.companySubscriptionSeats.displayName), asc(pg.companySubscriptionSeats.createdAt));
  return Promise.all(rows.map((row) => openSeatRow(tenantId, row)));
};

export const getSeatById = async (tenantId: string, seatId: string): Promise<CompanySubscriptionSeatRow | undefined> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select()
      .from(mysql.companySubscriptionSeats)
      .where(and(eq(mysql.companySubscriptionSeats.tenantId, tenantId), eq(mysql.companySubscriptionSeats.id, seatId)))
      .limit(1);
    return rows[0] ? await openSeatRow(tenantId, rows[0]) : undefined;
  }
  const db = pgDb();
  const rows = await db
    .select()
    .from(pg.companySubscriptionSeats)
    .where(and(eq(pg.companySubscriptionSeats.tenantId, tenantId), eq(pg.companySubscriptionSeats.id, seatId)))
    .limit(1);
  return rows[0] ? await openSeatRow(tenantId, rows[0]) : undefined;
};

const resolveSeatEmployeeId = async (
  tenantId: string,
  value: string | null | undefined
): Promise<string | null | { error: "invalid_employee" }> => {
  if (value == null) return null;
  const emp = await getWorkforceEmployeeById(tenantId, value);
  if (!emp) return { error: "invalid_employee" };
  return emp.id;
};

export const insertSeat = async (
  tenantId: string,
  planId: string,
  input: CompanySubscriptionSeatCreateInput,
  actorUserId: string | null
): Promise<CompanySubscriptionSeatRow | { error: "plan_not_found" | "invalid_employee" }> => {
  const plan = await getPlanById(tenantId, planId);
  if (!plan) return { error: "plan_not_found" };

  const employeeResolved = await resolveSeatEmployeeId(tenantId, input.employeeId);
  if (employeeResolved !== null && typeof employeeResolved === "object") return employeeResolved;
  const employeeId = employeeResolved;

  const now = new Date();
  const id = randomUUID();
  const emailPlain = input.email?.trim() || null;
  const sealed = emailPlain
    ? await sealCompanySubscriptionSeatFields(tenantId, { email: emailPlain }, id, new Set(["email"]))
    : { email: null };
  const values = {
    id,
    tenantId,
    planId,
    employeeId,
    displayName: input.displayName?.trim() || null,
    email: emailPlain ? String(sealed.email ?? emailPlain) : null,
    seatType: input.seatType?.trim() || null,
    status: input.status ?? "active",
    startDate: isoToMysqlDate(input.startDate),
    endDate: isoToMysqlDate(input.endDate),
    notes: input.notes?.trim() || null,
    createdByUserId: actorUserId,
    updatedByUserId: actorUserId,
    createdAt: now,
    updatedAt: now
  };

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db.insert(mysql.companySubscriptionSeats).values(values);
  } else {
    const db = pgDb();
    await db.insert(pg.companySubscriptionSeats).values({
      ...values,
      startDate: isoToPgDate(input.startDate),
      endDate: isoToPgDate(input.endDate)
    });
  }
  const middleware = getFieldEncryptionMiddleware();
  if (middleware?.hasSearchIndex() && emailPlain) {
    await middleware.syncSearchTokensForRow({
      tableKey: "company_subscription_seats",
      tenantId,
      entityId: id,
      row: { email: values.email },
      plainRow: { email: emailPlain },
      changedFields: new Set(["email"])
    });
  }
  return (await getSeatById(tenantId, id))!;
};

export const updateSeat = async (
  tenantId: string,
  seatId: string,
  patch: CompanySubscriptionSeatPatchInput,
  actorUserId: string | null
): Promise<CompanySubscriptionSeatRow | { error: "not_found" | "invalid_employee" }> => {
  const existing = await getSeatById(tenantId, seatId);
  if (!existing) return { error: "not_found" };

  let employeeId = existing.employeeId;
  if (patch.employeeId !== undefined) {
    const employeeResolved = await resolveSeatEmployeeId(tenantId, patch.employeeId);
    if (employeeResolved !== null && typeof employeeResolved === "object") return employeeResolved;
    employeeId = employeeResolved;
  }

  const now = new Date();
  const startIso = patch.startDate !== undefined ? patch.startDate?.trim() || null : existing.startDate;
  const endIso = patch.endDate !== undefined ? patch.endDate?.trim() || null : existing.endDate;
  const emailPlain =
    patch.email !== undefined ? patch.email?.trim() || null : existing.email;
  let emailStored = emailPlain;
  if (patch.email !== undefined) {
    const sealed = emailPlain
      ? await sealCompanySubscriptionSeatFields(tenantId, { email: emailPlain }, seatId, new Set(["email"]))
      : { email: null };
    emailStored = emailPlain ? String(sealed.email ?? emailPlain) : null;
  }
  const setBase = {
    employeeId,
    displayName: patch.displayName !== undefined ? patch.displayName?.trim() || null : existing.displayName,
    email: emailStored,
    seatType: patch.seatType !== undefined ? patch.seatType?.trim() || null : existing.seatType,
    status: patch.status ?? existing.status,
    notes: patch.notes !== undefined ? patch.notes?.trim() || null : existing.notes,
    updatedByUserId: actorUserId,
    updatedAt: now
  };

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db
      .update(mysql.companySubscriptionSeats)
      .set({
        ...setBase,
        startDate: isoToMysqlDate(startIso),
        endDate: isoToMysqlDate(endIso)
      })
      .where(and(eq(mysql.companySubscriptionSeats.tenantId, tenantId), eq(mysql.companySubscriptionSeats.id, seatId)));
  } else {
    const db = pgDb();
    await db
      .update(pg.companySubscriptionSeats)
      .set({
        ...setBase,
        startDate: isoToPgDate(startIso),
        endDate: isoToPgDate(endIso)
      })
      .where(and(eq(pg.companySubscriptionSeats.tenantId, tenantId), eq(pg.companySubscriptionSeats.id, seatId)));
  }
  if (patch.email !== undefined) {
    const middleware = getFieldEncryptionMiddleware();
    if (middleware?.hasSearchIndex()) {
      await middleware.syncSearchTokensForRow({
        tableKey: "company_subscription_seats",
        tenantId,
        entityId: seatId,
        row: { email: emailStored },
        plainRow: { email: emailPlain },
        changedFields: new Set(["email"])
      });
    }
  }
  return (await getSeatById(tenantId, seatId))!;
};

export const deleteSeat = async (
  tenantId: string,
  seatId: string
): Promise<{ ok: true } | { ok: false; error: "not_found" }> => {
  const existing = await getSeatById(tenantId, seatId);
  if (!existing) return { ok: false, error: "not_found" };

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db
      .delete(mysql.companySubscriptionSeats)
      .where(and(eq(mysql.companySubscriptionSeats.tenantId, tenantId), eq(mysql.companySubscriptionSeats.id, seatId)));
  } else {
    const db = pgDb();
    await db
      .delete(pg.companySubscriptionSeats)
      .where(and(eq(pg.companySubscriptionSeats.tenantId, tenantId), eq(pg.companySubscriptionSeats.id, seatId)));
  }
  return { ok: true };
};

export const listProviderDocuments = async (
  tenantId: string,
  providerId: string
): Promise<CompanySubscriptionProviderDocumentRow[]> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select()
      .from(mysql.companySubscriptionProviderDocuments)
      .where(
        and(
          eq(mysql.companySubscriptionProviderDocuments.tenantId, tenantId),
          eq(mysql.companySubscriptionProviderDocuments.providerId, providerId)
        )
      )
      .orderBy(asc(mysql.companySubscriptionProviderDocuments.createdAt));
    return rows.map(mapDocMysql);
  }
  const db = pgDb();
  const rows = await db
    .select()
    .from(pg.companySubscriptionProviderDocuments)
    .where(
      and(
        eq(pg.companySubscriptionProviderDocuments.tenantId, tenantId),
        eq(pg.companySubscriptionProviderDocuments.providerId, providerId)
      )
    )
    .orderBy(asc(pg.companySubscriptionProviderDocuments.createdAt));
  return rows.map(mapDocPg);
};

export const getProviderDocumentById = async (
  tenantId: string,
  providerId: string,
  documentId: string
): Promise<CompanySubscriptionProviderDocumentRow | undefined> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select()
      .from(mysql.companySubscriptionProviderDocuments)
      .where(
        and(
          eq(mysql.companySubscriptionProviderDocuments.tenantId, tenantId),
          eq(mysql.companySubscriptionProviderDocuments.providerId, providerId),
          eq(mysql.companySubscriptionProviderDocuments.id, documentId)
        )
      )
      .limit(1);
    return rows[0] ? mapDocMysql(rows[0]) : undefined;
  }
  const db = pgDb();
  const rows = await db
    .select()
    .from(pg.companySubscriptionProviderDocuments)
    .where(
      and(
        eq(pg.companySubscriptionProviderDocuments.tenantId, tenantId),
        eq(pg.companySubscriptionProviderDocuments.providerId, providerId),
        eq(pg.companySubscriptionProviderDocuments.id, documentId)
      )
    )
    .limit(1);
  return rows[0] ? mapDocPg(rows[0]) : undefined;
};

export const insertProviderDocument = async (input: {
  tenantId: string;
  providerId: string;
  title: string;
  originalFilename: string;
  mimeType: string | null;
  storageRelPath: string;
  byteSize: number;
}): Promise<CompanySubscriptionProviderDocumentRow | undefined> => {
  const provider = await getCompanySubscriptionProviderById(input.tenantId, input.providerId);
  if (!provider) return undefined;

  const id = randomUUID();
  const now = new Date();
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db.insert(mysql.companySubscriptionProviderDocuments).values({
      id,
      tenantId: input.tenantId,
      providerId: input.providerId,
      title: input.title.trim(),
      originalFilename: input.originalFilename.trim().slice(0, 512),
      mimeType: input.mimeType?.trim() || null,
      storageRelPath: input.storageRelPath,
      byteSize: input.byteSize,
      createdAt: now
    });
    const row = await db
      .select()
      .from(mysql.companySubscriptionProviderDocuments)
      .where(
        and(
          eq(mysql.companySubscriptionProviderDocuments.tenantId, input.tenantId),
          eq(mysql.companySubscriptionProviderDocuments.id, id)
        )
      )
      .limit(1);
    return row[0] ? mapDocMysql(row[0]) : undefined;
  }
  const db = pgDb();
  const inserted = await db
    .insert(pg.companySubscriptionProviderDocuments)
    .values({
      id,
      tenantId: input.tenantId,
      providerId: input.providerId,
      title: input.title.trim(),
      originalFilename: input.originalFilename.trim().slice(0, 512),
      mimeType: input.mimeType?.trim() || null,
      storageRelPath: input.storageRelPath,
      byteSize: input.byteSize,
      createdAt: now
    })
    .returning();
  return inserted[0] ? mapDocPg(inserted[0]) : undefined;
};

export const deleteProviderDocument = async (
  tenantId: string,
  providerId: string,
  documentId: string
): Promise<CompanySubscriptionProviderDocumentRow | undefined> => {
  const existing = await getProviderDocumentById(tenantId, providerId, documentId);
  if (!existing) return undefined;

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db
      .delete(mysql.companySubscriptionProviderDocuments)
      .where(
        and(
          eq(mysql.companySubscriptionProviderDocuments.tenantId, tenantId),
          eq(mysql.companySubscriptionProviderDocuments.providerId, providerId),
          eq(mysql.companySubscriptionProviderDocuments.id, documentId)
        )
      );
  } else {
    const db = pgDb();
    await db
      .delete(pg.companySubscriptionProviderDocuments)
      .where(
        and(
          eq(pg.companySubscriptionProviderDocuments.tenantId, tenantId),
          eq(pg.companySubscriptionProviderDocuments.providerId, providerId),
          eq(pg.companySubscriptionProviderDocuments.id, documentId)
        )
      );
  }
  return existing;
};

const estimateTenantMonthlyRecurringCostMinor = async (tenantId: string, activeOnly: boolean): Promise<number> => {
  let total = 0;

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const providerWhere = activeOnly
      ? and(eq(mysql.companySubscriptionProviders.tenantId, tenantId), eq(mysql.companySubscriptionProviders.status, "active"))
      : eq(mysql.companySubscriptionProviders.tenantId, tenantId);
    const providerRows = await db.select().from(mysql.companySubscriptionProviders).where(providerWhere);
    const providers = providerRows.map(mapProviderMysql);
    const seatedIds = providers.filter((p) => isSeatedCompanySubscription(p.subscriptionKind)).map((p) => p.id);

    for (const p of providers) {
      if (!isSingularCompanySubscription(p.subscriptionKind)) continue;
      total += amountMinorPerMonth(p.amountMinor, {
        cadenceKind: p.cadenceKind,
        cadenceIntervalCount: p.cadenceIntervalCount,
        cadenceIntervalUnit: p.cadenceIntervalUnit as CompanySubscriptionCadenceUnit | null
      }) ?? 0;
    }

    if (seatedIds.length > 0) {
      const planRows = await db
        .select()
        .from(mysql.companySubscriptionPlans)
        .where(
          and(eq(mysql.companySubscriptionPlans.tenantId, tenantId), inArray(mysql.companySubscriptionPlans.providerId, seatedIds))
        );
      const planIds = planRows.map((p) => p.id);
      const assignedByPlanId = new Map<string, number>();
      if (planIds.length > 0) {
        const assignedRows = await db
          .select({ planId: mysql.companySubscriptionSeats.planId, c: count() })
          .from(mysql.companySubscriptionSeats)
          .where(
            and(eq(mysql.companySubscriptionSeats.tenantId, tenantId), inArray(mysql.companySubscriptionSeats.planId, planIds))
          )
          .groupBy(mysql.companySubscriptionSeats.planId);
        for (const row of assignedRows) assignedByPlanId.set(row.planId, Number(row.c ?? 0));
      }
      for (const plan of planRows) {
        total +=
          planMonthlyCostMinor(
            {
              amountMinor: plan.amountMinor,
              seatCount: plan.seatCount,
              cadenceKind: asCadenceKind(plan.cadenceKind),
              cadenceIntervalCount: plan.cadenceIntervalCount,
              cadenceIntervalUnit: plan.cadenceIntervalUnit as CompanySubscriptionCadenceUnit | null
            },
            assignedByPlanId.get(plan.id) ?? 0
          ) ?? 0;
      }
    }
    return total;
  }

  const db = pgDb();
  const providerWhere = activeOnly
    ? and(eq(pg.companySubscriptionProviders.tenantId, tenantId), eq(pg.companySubscriptionProviders.status, "active"))
    : eq(pg.companySubscriptionProviders.tenantId, tenantId);
  const providerRows = await db.select().from(pg.companySubscriptionProviders).where(providerWhere);
  const providers = providerRows.map(mapProviderPg);
  const seatedIds = providers.filter((p) => isSeatedCompanySubscription(p.subscriptionKind)).map((p) => p.id);

  for (const p of providers) {
    if (!isSingularCompanySubscription(p.subscriptionKind)) continue;
    total +=
      amountMinorPerMonth(p.amountMinor, {
        cadenceKind: p.cadenceKind,
        cadenceIntervalCount: p.cadenceIntervalCount,
        cadenceIntervalUnit: p.cadenceIntervalUnit as CompanySubscriptionCadenceUnit | null
      }) ?? 0;
  }

  if (seatedIds.length > 0) {
    const planRows = await db
      .select()
      .from(pg.companySubscriptionPlans)
      .where(and(eq(pg.companySubscriptionPlans.tenantId, tenantId), inArray(pg.companySubscriptionPlans.providerId, seatedIds)));
    const planIds = planRows.map((p) => p.id);
    const assignedByPlanId = new Map<string, number>();
    if (planIds.length > 0) {
      const assignedRows = await db
        .select({ planId: pg.companySubscriptionSeats.planId, c: count() })
        .from(pg.companySubscriptionSeats)
        .where(and(eq(pg.companySubscriptionSeats.tenantId, tenantId), inArray(pg.companySubscriptionSeats.planId, planIds)))
        .groupBy(pg.companySubscriptionSeats.planId);
      for (const row of assignedRows) assignedByPlanId.set(row.planId, Number(row.c ?? 0));
    }
    for (const plan of planRows) {
      total +=
        planMonthlyCostMinor(
          {
            amountMinor: plan.amountMinor,
            seatCount: plan.seatCount,
            cadenceKind: asCadenceKind(plan.cadenceKind),
            cadenceIntervalCount: plan.cadenceIntervalCount,
            cadenceIntervalUnit: plan.cadenceIntervalUnit as CompanySubscriptionCadenceUnit | null
          },
          assignedByPlanId.get(plan.id) ?? 0
        ) ?? 0;
    }
  }
  return total;
};

export const getCompanySubscriptionDashboardSummary = async (
  tenantId: string
): Promise<CompanySubscriptionDashboardSummary> => {
  const today = utcTodayIso();
  const horizon = addUtcDaysIso(today, 30);

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const activeWhere = and(
      eq(mysql.companySubscriptionProviders.tenantId, tenantId),
      eq(mysql.companySubscriptionProviders.status, "active")
    );
    const activeRows = await db.select({ c: count() }).from(mysql.companySubscriptionProviders).where(activeWhere);
    const seatRows = await db
      .select({ c: count() })
      .from(mysql.companySubscriptionSeats)
      .where(
        and(eq(mysql.companySubscriptionSeats.tenantId, tenantId), eq(mysql.companySubscriptionSeats.status, "active"))
      );
    const renewalRows = await db
      .select({ c: count() })
      .from(mysql.companySubscriptionProviders)
      .where(
        and(
          eq(mysql.companySubscriptionProviders.tenantId, tenantId),
          gte(mysql.companySubscriptionProviders.renewalDate, toMysqlCompareDate(today)),
          lte(mysql.companySubscriptionProviders.renewalDate, toMysqlCompareDate(horizon))
        )
      );
    const expiringRows = await db
      .select({ c: count() })
      .from(mysql.companySubscriptionProviders)
      .where(
        and(
          eq(mysql.companySubscriptionProviders.tenantId, tenantId),
          gte(mysql.companySubscriptionProviders.contractEndDate, toMysqlCompareDate(today)),
          lte(mysql.companySubscriptionProviders.contractEndDate, toMysqlCompareDate(horizon))
        )
      );
    const estimatedRecurringCostMinor = await estimateTenantMonthlyRecurringCostMinor(tenantId, true);
    return {
      activeProviderCount: Number(activeRows[0]?.c ?? 0),
      totalSeatCount: Number(seatRows[0]?.c ?? 0),
      upcomingRenewals30d: Number(renewalRows[0]?.c ?? 0),
      expiring30d: Number(expiringRows[0]?.c ?? 0),
      estimatedRecurringCostMinor
    };
  }

  const db = pgDb();
  const activeWhere = and(
    eq(pg.companySubscriptionProviders.tenantId, tenantId),
    eq(pg.companySubscriptionProviders.status, "active")
  );
  const activeRows = await db.select({ c: count() }).from(pg.companySubscriptionProviders).where(activeWhere);
  const seatRows = await db
    .select({ c: count() })
    .from(pg.companySubscriptionSeats)
    .where(and(eq(pg.companySubscriptionSeats.tenantId, tenantId), eq(pg.companySubscriptionSeats.status, "active")));
  const renewalRows = await db
    .select({ c: count() })
    .from(pg.companySubscriptionProviders)
    .where(
      and(
        eq(pg.companySubscriptionProviders.tenantId, tenantId),
        gte(pg.companySubscriptionProviders.renewalDate, today),
        lte(pg.companySubscriptionProviders.renewalDate, horizon)
      )
    );
  const expiringRows = await db
    .select({ c: count() })
    .from(pg.companySubscriptionProviders)
    .where(
      and(
        eq(pg.companySubscriptionProviders.tenantId, tenantId),
        gte(pg.companySubscriptionProviders.contractEndDate, today),
        lte(pg.companySubscriptionProviders.contractEndDate, horizon)
      )
    );
  const estimatedRecurringCostMinor = await estimateTenantMonthlyRecurringCostMinor(tenantId, true);
  return {
    activeProviderCount: Number(activeRows[0]?.c ?? 0),
    totalSeatCount: Number(seatRows[0]?.c ?? 0),
    upcomingRenewals30d: Number(renewalRows[0]?.c ?? 0),
    expiring30d: Number(expiringRows[0]?.c ?? 0),
    estimatedRecurringCostMinor
  };
};

export { parseCompanySubscriptionBillingMetadataJson };
