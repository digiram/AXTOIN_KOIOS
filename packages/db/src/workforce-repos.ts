/**
 * Tenant workforce — org units (with optional assignee) and employees (no app user linkage).
 *
 * Also persists employee social profiles (`workforce_employee_socials`, LinkedIn first).
 */

import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, ilike, inArray, isNotNull, or, sql } from "drizzle-orm";

import type {
  WorkforceEmployeeCreateInput,
  WorkforceEmployeePatchInput,
  WorkforceSocialProvider,
  WorkforceWorkScheduleEntry,
  WorkforceWorkTimeKind
} from "@starter/shared";
import { parseWorkforceWorkScheduleJson, stringifyWorkforceWorkScheduleForDb } from "@starter/shared";

import { escapeLike } from "./crm-repos-query-helpers.js";
import {
  deleteSearchTokensForEntity,
  findEntityIdsByMultiFieldContains,
  getFieldEncryptionMiddleware
} from "./field-encryption/index.js";
import { encryptRowAtBoundary, decryptRowAtBoundary } from "./field-encryption/repo-boundary.js";
import * as mysql from "./mysql-schema.js";
import * as pg from "./pg-schema.js";
import { mysqlDb, pgDb } from "./crm-repos-db.js";
import { dialectFromEnv } from "./schema.js";

export type WorkforceEmployeeKind = "person" | "agent";

export type WorkforceEmployeeRow = {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  /** ISO YYYY-MM-DD when set. */
  dateOfEmployment: string | null;
  personalPhone: string | null;
  personalEmail: string | null;
  workPhone: string | null;
  workEmail: string | null;
  personalAddress: string | null;
  workLocation: string | null;
  /** Employment org unit (many employees per unit); independent of org chart assignee. */
  employmentOrgUnitId: string | null;
  jobTitle: string | null;
  employeeKind: WorkforceEmployeeKind;
  notes: string | null;
  photoRelPath: string | null;
  /** Documented full-time vs part-time; null when not set. */
  workTimeKind: WorkforceWorkTimeKind | null;
  /** Parsed schedule rows; null when not set or invalid JSON. */
  workSchedule: WorkforceWorkScheduleEntry[] | null;
  createdAt: Date;
  updatedAt: Date;
};

export type WorkforceOrgUnitRow = {
  id: string;
  tenantId: string;
  name: string;
  parentOrgUnitId: string | null;
  assignedEmployeeId: string | null;
  onOrgChart: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type WorkforceEmployeeDocumentRow = {
  id: string;
  tenantId: string;
  employeeId: string;
  title: string;
  originalFilename: string;
  mimeType: string | null;
  storageRelPath: string;
  byteSize: number;
  createdAt: Date;
};

export type WorkforceEmployeeSocialRow = {
  id: string;
  tenantId: string;
  employeeId: string;
  provider: WorkforceSocialProvider;
  profileUrl: string;
  createdAt: Date;
  updatedAt: Date;
};

const asKind = (raw: string): WorkforceEmployeeKind =>
  raw === "agent" ? "agent" : "person";

const asWorkTimeKind = (raw: string | null | undefined): WorkforceWorkTimeKind | null =>
  raw === "full" || raw === "part" ? raw : null;

const asSocialProvider = (raw: string): WorkforceSocialProvider | null =>
  raw === "linkedin" ? "linkedin" : null;

const EMPLOYEES_TABLE_KEY = "workforce_employees";
const ORG_UNITS_TABLE_KEY = "workforce_org_units";
const SOCIALS_TABLE_KEY = "workforce_employee_socials";

type EmpDbRow = typeof pg.workforceEmployees.$inferSelect | typeof mysql.workforceEmployees.$inferSelect;
type OrgDbRow = typeof pg.workforceOrgUnits.$inferSelect | typeof mysql.workforceOrgUnits.$inferSelect;

const mapPlainEmpRow = (row: {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  dateOfEmployment?: string | null;
  personalPhone?: string | null;
  personalEmail?: string | null;
  workPhone?: string | null;
  workEmail?: string | null;
  personalAddress?: string | null;
  workLocation?: string | null;
  employmentOrgUnitId?: string | null;
  jobTitle?: string | null;
  employeeKind: string;
  notes?: string | null;
  photoRelPath?: string | null;
  workTimeKind?: string | null;
  workScheduleJson?: string | null;
  createdAt: Date;
  updatedAt: Date;
}): WorkforceEmployeeRow => ({
  id: row.id,
  tenantId: row.tenantId,
  firstName: row.firstName,
  lastName: row.lastName,
  dateOfEmployment: row.dateOfEmployment?.trim?.() || row.dateOfEmployment || null,
  personalPhone: row.personalPhone ?? null,
  personalEmail: row.personalEmail ?? null,
  workPhone: row.workPhone ?? null,
  workEmail: row.workEmail ?? null,
  personalAddress: row.personalAddress ?? null,
  workLocation: row.workLocation ?? null,
  employmentOrgUnitId: row.employmentOrgUnitId ?? null,
  jobTitle: row.jobTitle ?? null,
  employeeKind: asKind(row.employeeKind),
  notes: row.notes ?? null,
  photoRelPath: row.photoRelPath ?? null,
  workTimeKind: asWorkTimeKind(row.workTimeKind),
  workSchedule: parseWorkforceWorkScheduleJson(row.workScheduleJson ?? null),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
});

const decryptEmpRow = async (tenantId: string, row: EmpDbRow): Promise<WorkforceEmployeeRow> =>
  decryptRowAtBoundary(EMPLOYEES_TABLE_KEY, tenantId, row as unknown as Record<string, unknown>, (plain) =>
    mapPlainEmpRow(plain as EmpDbRow)
  );

const encryptEmpFields = async (
  tenantId: string,
  row: Record<string, unknown>,
  opts?: { changedFields?: Set<string>; entityId?: string }
): Promise<Record<string, unknown>> => encryptRowAtBoundary(EMPLOYEES_TABLE_KEY, tenantId, row, opts);

const mapPlainOrgRow = (row: {
  id: string;
  tenantId: string;
  name: string;
  parentOrgUnitId?: string | null;
  assignedEmployeeId?: string | null;
  onOrgChart: boolean;
  createdAt: Date;
  updatedAt: Date;
}): WorkforceOrgUnitRow => ({
  id: row.id,
  tenantId: row.tenantId,
  name: row.name,
  parentOrgUnitId: row.parentOrgUnitId ?? null,
  assignedEmployeeId: row.assignedEmployeeId ?? null,
  onOrgChart: row.onOrgChart,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
});

const decryptOrgRow = async (tenantId: string, row: OrgDbRow): Promise<WorkforceOrgUnitRow> =>
  decryptRowAtBoundary(ORG_UNITS_TABLE_KEY, tenantId, row as unknown as Record<string, unknown>, (plain) =>
    mapPlainOrgRow(plain as OrgDbRow)
  );

const encryptOrgFields = async (
  tenantId: string,
  row: Record<string, unknown>,
  opts?: { changedFields?: Set<string>; entityId?: string }
): Promise<Record<string, unknown>> => encryptRowAtBoundary(ORG_UNITS_TABLE_KEY, tenantId, row, opts);

const mapEmpPg = (row: typeof pg.workforceEmployees.$inferSelect): WorkforceEmployeeRow => mapPlainEmpRow(row);

const mapEmpMysql = (row: typeof mysql.workforceEmployees.$inferSelect): WorkforceEmployeeRow =>
  mapPlainEmpRow({ ...row, dateOfEmployment: row.dateOfEmployment?.trim() || null });

const mapOrgPg = (row: typeof pg.workforceOrgUnits.$inferSelect): WorkforceOrgUnitRow => mapPlainOrgRow(row);

const mapOrgMysql = (row: typeof mysql.workforceOrgUnits.$inferSelect): WorkforceOrgUnitRow =>
  mapPlainOrgRow({ ...row, onOrgChart: Boolean(row.onOrgChart) });

const clearEmployeeFromOtherOrgUnits = async (
  tenantId: string,
  employeeId: string,
  exceptOrgUnitId: string | null
): Promise<void> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const parts = [
      eq(mysql.workforceOrgUnits.tenantId, tenantId),
      eq(mysql.workforceOrgUnits.assignedEmployeeId, employeeId)
    ];
    if (exceptOrgUnitId) {
      parts.push(sql`${mysql.workforceOrgUnits.id} <> ${exceptOrgUnitId}`);
    }
    await db.update(mysql.workforceOrgUnits).set({ assignedEmployeeId: null }).where(and(...parts));
    return;
  }
  const db = pgDb();
  const parts = [eq(pg.workforceOrgUnits.tenantId, tenantId), eq(pg.workforceOrgUnits.assignedEmployeeId, employeeId)];
  if (exceptOrgUnitId) {
    parts.push(sql`${pg.workforceOrgUnits.id} <> ${exceptOrgUnitId}`);
  }
  await db.update(pg.workforceOrgUnits).set({ assignedEmployeeId: null }).where(and(...parts));
};

/** Chart manager assignment also sets the employee's employment org unit (employee profile / Organizations view). */
const linkAssigneeEmploymentToOrgUnit = async (
  tenantId: string,
  employeeId: string,
  orgUnitId: string
): Promise<void> => {
  const now = new Date();
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db
      .update(mysql.workforceEmployees)
      .set({ employmentOrgUnitId: orgUnitId, updatedAt: now })
      .where(and(eq(mysql.workforceEmployees.tenantId, tenantId), eq(mysql.workforceEmployees.id, employeeId)));
    return;
  }
  const db = pgDb();
  await db
    .update(pg.workforceEmployees)
    .set({ employmentOrgUnitId: orgUnitId, updatedAt: now })
    .where(and(eq(pg.workforceEmployees.tenantId, tenantId), eq(pg.workforceEmployees.id, employeeId)));
};

export const listWorkforceEmployeesByIds = async (
  tenantId: string,
  ids: string[]
): Promise<Map<string, WorkforceEmployeeRow>> => {
  const uniq = [...new Set(ids)].filter(Boolean);
  const out = new Map<string, WorkforceEmployeeRow>();
  if (uniq.length === 0) return out;
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select()
      .from(mysql.workforceEmployees)
      .where(and(eq(mysql.workforceEmployees.tenantId, tenantId), inArray(mysql.workforceEmployees.id, uniq)));
    for (const r of rows) out.set(r.id, await decryptEmpRow(tenantId, r));
    return out;
  }
  const db = pgDb();
  const rows = await db
    .select()
    .from(pg.workforceEmployees)
    .where(and(eq(pg.workforceEmployees.tenantId, tenantId), inArray(pg.workforceEmployees.id, uniq)));
  for (const r of rows) out.set(r.id, await decryptEmpRow(tenantId, r));
  return out;
};

export const listWorkforceOrgUnits = async (tenantId: string): Promise<WorkforceOrgUnitRow[]> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select()
      .from(mysql.workforceOrgUnits)
      .where(eq(mysql.workforceOrgUnits.tenantId, tenantId));
    const decrypted = await Promise.all(rows.map((r) => decryptOrgRow(tenantId, r)));
    return decrypted.sort((a, b) => a.name.localeCompare(b.name));
  }
  const db = pgDb();
  const rows = await db
    .select()
    .from(pg.workforceOrgUnits)
    .where(eq(pg.workforceOrgUnits.tenantId, tenantId));
  const decrypted = await Promise.all(rows.map((r) => decryptOrgRow(tenantId, r)));
  return decrypted.sort((a, b) => a.name.localeCompare(b.name));
};

/** Count employees linked via employment org unit (not org-chart assignee). */
export const countWorkforceEmploymentMembersByOrgUnit = async (
  tenantId: string
): Promise<Map<string, number>> => {
  const out = new Map<string, number>();
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select({
        orgUnitId: mysql.workforceEmployees.employmentOrgUnitId,
        c: count()
      })
      .from(mysql.workforceEmployees)
      .where(
        and(eq(mysql.workforceEmployees.tenantId, tenantId), isNotNull(mysql.workforceEmployees.employmentOrgUnitId))
      )
      .groupBy(mysql.workforceEmployees.employmentOrgUnitId);
    for (const row of rows) {
      const id = row.orgUnitId;
      if (id) out.set(id, Number(row.c ?? 0));
    }
    return out;
  }
  const db = pgDb();
  const rows = await db
    .select({
      orgUnitId: pg.workforceEmployees.employmentOrgUnitId,
      c: count()
    })
    .from(pg.workforceEmployees)
    .where(
      and(eq(pg.workforceEmployees.tenantId, tenantId), isNotNull(pg.workforceEmployees.employmentOrgUnitId))
    )
    .groupBy(pg.workforceEmployees.employmentOrgUnitId);
  for (const row of rows) {
    const id = row.orgUnitId;
    if (id) out.set(id, Number(row.c ?? 0));
  }
  return out;
};

export const getWorkforceOrgUnitById = async (
  tenantId: string,
  id: string
): Promise<WorkforceOrgUnitRow | undefined> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select()
      .from(mysql.workforceOrgUnits)
      .where(and(eq(mysql.workforceOrgUnits.tenantId, tenantId), eq(mysql.workforceOrgUnits.id, id)))
      .limit(1);
    return rows[0] ? await decryptOrgRow(tenantId, rows[0]) : undefined;
  }
  const db = pgDb();
  const rows = await db
    .select()
    .from(pg.workforceOrgUnits)
    .where(and(eq(pg.workforceOrgUnits.tenantId, tenantId), eq(pg.workforceOrgUnits.id, id)))
    .limit(1);
  return rows[0] ? await decryptOrgRow(tenantId, rows[0]) : undefined;
};

const countOrgChildren = async (tenantId: string, parentId: string): Promise<number> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select({ c: count() })
      .from(mysql.workforceOrgUnits)
      .where(and(eq(mysql.workforceOrgUnits.tenantId, tenantId), eq(mysql.workforceOrgUnits.parentOrgUnitId, parentId)));
    return Number(rows[0]?.c ?? 0);
  }
  const db = pgDb();
  const rows = await db
    .select({ c: count() })
    .from(pg.workforceOrgUnits)
    .where(and(eq(pg.workforceOrgUnits.tenantId, tenantId), eq(pg.workforceOrgUnits.parentOrgUnitId, parentId)));
  return Number(rows[0]?.c ?? 0);
};

const wouldCreateOrgCycle = (
  tenantId: string,
  unitId: string,
  newParentId: string | null,
  rows: WorkforceOrgUnitRow[]
) => {
  if (newParentId === null) return false;
  if (newParentId === unitId) return true;
  const byId = new Map(rows.map((r) => [r.id, r]));
  let cur: string | null = newParentId;
  const seen = new Set<string>();
  while (cur) {
    if (cur === unitId) return true;
    if (seen.has(cur)) return true;
    seen.add(cur);
    const p = byId.get(cur);
    cur = p?.parentOrgUnitId ?? null;
  }
  return false;
};

export const insertWorkforceOrgUnit = async (
  tenantId: string,
  input: {
    name: string;
    parentOrgUnitId?: string | null;
    assignedEmployeeId?: string | null;
    onOrgChart?: boolean;
  }
): Promise<WorkforceOrgUnitRow | { error: "invalid_parent" | "invalid_employee" }> => {
  const onChart = input.onOrgChart ?? false;
  const parentId = onChart ? (input.parentOrgUnitId ?? null) : null;
  if (parentId) {
    const parent = await getWorkforceOrgUnitById(tenantId, parentId);
    if (!parent) return { error: "invalid_parent" };
    if (!parent.onOrgChart) return { error: "invalid_parent" };
  }
  const empId = input.assignedEmployeeId ?? null;
  if (empId) {
    const emp = await getWorkforceEmployeeById(tenantId, empId);
    if (!emp) return { error: "invalid_employee" };
    await clearEmployeeFromOtherOrgUnits(tenantId, empId, null);
  }

  const now = new Date();
  const plainName = input.name.trim();
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const id = randomUUID();
    const encrypted = await encryptOrgFields(tenantId, { name: plainName }, { entityId: id });
    await db.insert(mysql.workforceOrgUnits).values({
      id,
      tenantId,
      name: String(encrypted.name ?? plainName),
      parentOrgUnitId: parentId,
      assignedEmployeeId: empId,
      onOrgChart: onChart,
      createdAt: now,
      updatedAt: now
    });
    const middleware = getFieldEncryptionMiddleware();
    if (middleware?.hasSearchIndex()) {
      await middleware.syncSearchTokensForRow({
        tableKey: ORG_UNITS_TABLE_KEY,
        tenantId,
        entityId: id,
        row: encrypted,
        plainRow: { name: plainName }
      });
    }
    if (empId) {
      await linkAssigneeEmploymentToOrgUnit(tenantId, empId, id);
    }
    return (await getWorkforceOrgUnitById(tenantId, id))!;
  }
  const db = pgDb();
  const encrypted = await encryptOrgFields(tenantId, { name: plainName });
  const inserted = await db
    .insert(pg.workforceOrgUnits)
    .values({
      tenantId,
      name: String(encrypted.name ?? plainName),
      parentOrgUnitId: parentId,
      assignedEmployeeId: empId,
      onOrgChart: onChart,
      createdAt: now,
      updatedAt: now
    })
    .returning();
  const row = await decryptOrgRow(tenantId, inserted[0]!);
  const middleware = getFieldEncryptionMiddleware();
  if (middleware?.hasSearchIndex()) {
    await middleware.syncSearchTokensForRow({
      tableKey: ORG_UNITS_TABLE_KEY,
      tenantId,
      entityId: row.id,
      row: encrypted,
      plainRow: { name: plainName }
    });
  }
  if (empId) {
    await linkAssigneeEmploymentToOrgUnit(tenantId, empId, row.id);
  }
  return row;
};

export const updateWorkforceOrgUnit = async (
  tenantId: string,
  id: string,
  patch: {
    name?: string;
    parentOrgUnitId?: string | null;
    assignedEmployeeId?: string | null;
    onOrgChart?: boolean;
  }
): Promise<
  WorkforceOrgUnitRow | { error: "not_found" | "invalid_parent" | "cycle" | "invalid_employee" }
> => {
  const existing = await getWorkforceOrgUnitById(tenantId, id);
  if (!existing) return { error: "not_found" };

  const nextName = patch.name !== undefined ? patch.name.trim() : existing.name;
  let nextParent = patch.parentOrgUnitId !== undefined ? patch.parentOrgUnitId : existing.parentOrgUnitId;
  let nextAssignee =
    patch.assignedEmployeeId !== undefined ? patch.assignedEmployeeId : existing.assignedEmployeeId;
  let nextOnChart = patch.onOrgChart !== undefined ? patch.onOrgChart : existing.onOrgChart;

  if (patch.onOrgChart === false) {
    nextOnChart = false;
    nextParent = null;
  }

  if (patch.parentOrgUnitId !== undefined && patch.parentOrgUnitId !== null) {
    nextOnChart = true;
  }

  if (patch.parentOrgUnitId !== undefined && patch.parentOrgUnitId === id) {
    return { error: "invalid_parent" };
  }
  if (nextParent) {
    const parent = await getWorkforceOrgUnitById(tenantId, nextParent);
    if (!parent) return { error: "invalid_parent" };
    if (!parent.onOrgChart) return { error: "invalid_parent" };
  }

  if (patch.parentOrgUnitId !== undefined && nextOnChart) {
    const all = await listWorkforceOrgUnits(tenantId);
    if (wouldCreateOrgCycle(tenantId, id, nextParent, all)) {
      return { error: "cycle" };
    }
  }

  if (patch.assignedEmployeeId !== undefined) {
    if (nextAssignee) {
      const emp = await getWorkforceEmployeeById(tenantId, nextAssignee);
      if (!emp) return { error: "invalid_employee" };
      await clearEmployeeFromOtherOrgUnits(tenantId, nextAssignee, id);
    } else {
      nextAssignee = null;
    }
  }

  const now = new Date();
  const setPayload: Record<string, unknown> = {
    name: nextName,
    parentOrgUnitId: nextParent,
    assignedEmployeeId: nextAssignee,
    onOrgChart: nextOnChart,
    updatedAt: now
  };
  const changedFields = new Set<string>();
  if (patch.name !== undefined) changedFields.add("name");
  if (changedFields.size > 0) {
    const encrypted = await encryptOrgFields(tenantId, setPayload, { changedFields, entityId: id });
    for (const key of changedFields) {
      if (key in encrypted) setPayload[key] = encrypted[key];
    }
    const middleware = getFieldEncryptionMiddleware();
    if (middleware?.hasSearchIndex()) {
      await middleware.syncSearchTokensForRow({
        tableKey: ORG_UNITS_TABLE_KEY,
        tenantId,
        entityId: id,
        row: setPayload,
        plainRow: { name: nextName },
        changedFields
      });
    }
  }
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db
      .update(mysql.workforceOrgUnits)
      .set({
        name: String(setPayload.name),
        parentOrgUnitId: nextParent,
        assignedEmployeeId: nextAssignee,
        onOrgChart: nextOnChart,
        updatedAt: now
      })
      .where(and(eq(mysql.workforceOrgUnits.tenantId, tenantId), eq(mysql.workforceOrgUnits.id, id)));
  } else {
    const db = pgDb();
    await db
      .update(pg.workforceOrgUnits)
      .set({
        name: String(setPayload.name),
        parentOrgUnitId: nextParent,
        assignedEmployeeId: nextAssignee,
        onOrgChart: nextOnChart,
        updatedAt: now
      })
      .where(and(eq(pg.workforceOrgUnits.tenantId, tenantId), eq(pg.workforceOrgUnits.id, id)));
  }
  if (patch.assignedEmployeeId !== undefined && nextAssignee) {
    await linkAssigneeEmploymentToOrgUnit(tenantId, nextAssignee, id);
  }
  return (await getWorkforceOrgUnitById(tenantId, id))!;
};

export const deleteWorkforceOrgUnit = async (
  tenantId: string,
  id: string
): Promise<{ ok: true } | { ok: false; error: "not_found" | "has_children" }> => {
  const existing = await getWorkforceOrgUnitById(tenantId, id);
  if (!existing) return { ok: false, error: "not_found" };
  const kids = await countOrgChildren(tenantId, id);
  if (kids > 0) return { ok: false, error: "has_children" };

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db
      .delete(mysql.workforceOrgUnits)
      .where(and(eq(mysql.workforceOrgUnits.tenantId, tenantId), eq(mysql.workforceOrgUnits.id, id)));
  } else {
    const db = pgDb();
    await db
      .delete(pg.workforceOrgUnits)
      .where(and(eq(pg.workforceOrgUnits.tenantId, tenantId), eq(pg.workforceOrgUnits.id, id)));
  }
  await deleteSearchTokensForEntity(tenantId, ORG_UNITS_TABLE_KEY, id);
  return { ok: true };
};

export const getWorkforceEmployeeById = async (
  tenantId: string,
  id: string
): Promise<WorkforceEmployeeRow | undefined> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select()
      .from(mysql.workforceEmployees)
      .where(and(eq(mysql.workforceEmployees.tenantId, tenantId), eq(mysql.workforceEmployees.id, id)))
      .limit(1);
    return rows[0] ? await decryptEmpRow(tenantId, rows[0]) : undefined;
  }
  const db = pgDb();
  const rows = await db
    .select()
    .from(pg.workforceEmployees)
    .where(and(eq(pg.workforceEmployees.tenantId, tenantId), eq(pg.workforceEmployees.id, id)))
    .limit(1);
  return rows[0] ? await decryptEmpRow(tenantId, rows[0]) : undefined;
};

export type ListWorkforceEmployeesParams = { tenantId: string; page: number; pageSize: number; q?: string };

export const listWorkforceEmployees = async (
  params: ListWorkforceEmployeesParams
): Promise<{ rows: WorkforceEmployeeRow[]; total: number }> => {
  const offset = (params.page - 1) * params.pageSize;
  const q = params.q?.trim() ?? "";
  const middleware = getFieldEncryptionMiddleware();

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const base = eq(mysql.workforceEmployees.tenantId, params.tenantId);
    const pat = "%" + escapeLike(q) + "%";
    let whereClause = base;
    if (q.length > 0) {
      const plaintextMatch = or(
        sql`LOWER(COALESCE(${mysql.workforceEmployees.jobTitle},'')) LIKE LOWER(${pat})`,
        sql`LOWER(COALESCE(${mysql.workforceEmployees.employeeKind},'')) LIKE LOWER(${pat})`
      )!;
      if (middleware?.hasSearchIndex()) {
        const ids = await findEntityIdsByMultiFieldContains(
          params.tenantId,
          params.tenantId,
          EMPLOYEES_TABLE_KEY,
          q,
          middleware.getSearchKeyB64()!,
          middleware.getNgramSize()
        );
        whereClause =
          ids.length === 0
            ? and(base, plaintextMatch)!
            : and(base, or(inArray(mysql.workforceEmployees.id, ids), plaintextMatch)!)!;
      } else {
        whereClause = and(
          base,
          or(
            sql`LOWER(CONCAT(${mysql.workforceEmployees.firstName},' ',${mysql.workforceEmployees.lastName})) LIKE LOWER(${pat})`,
            sql`LOWER(${mysql.workforceEmployees.firstName}) LIKE LOWER(${pat})`,
            sql`LOWER(${mysql.workforceEmployees.lastName}) LIKE LOWER(${pat})`,
            sql`LOWER(COALESCE(${mysql.workforceEmployees.personalEmail},'')) LIKE LOWER(${pat})`,
            sql`LOWER(COALESCE(${mysql.workforceEmployees.workEmail},'')) LIKE LOWER(${pat})`,
            sql`LOWER(COALESCE(${mysql.workforceEmployees.personalPhone},'')) LIKE LOWER(${pat})`,
            sql`LOWER(COALESCE(${mysql.workforceEmployees.workPhone},'')) LIKE LOWER(${pat})`,
            plaintextMatch,
            sql`LOWER(COALESCE(${mysql.workforceEmployees.workLocation},'')) LIKE LOWER(${pat})`,
            sql`LOWER(COALESCE(${mysql.workforceEmployees.personalAddress},'')) LIKE LOWER(${pat})`,
            sql`LOWER(COALESCE(${mysql.workforceEmployees.notes},'')) LIKE LOWER(${pat})`
          )!
        )!;
      }
    }
    const cRows = await db.select({ c: count() }).from(mysql.workforceEmployees).where(whereClause);
    const rows = await db
      .select()
      .from(mysql.workforceEmployees)
      .where(whereClause)
      .orderBy(desc(mysql.workforceEmployees.updatedAt))
      .limit(params.pageSize)
      .offset(offset);
    const decrypted = await Promise.all(rows.map((r) => decryptEmpRow(params.tenantId, r)));
    return { rows: decrypted, total: Number(cRows[0]?.c ?? 0) };
  }

  const db = pgDb();
  const base = eq(pg.workforceEmployees.tenantId, params.tenantId);
  const t = `%${escapeLike(q)}%`;
  let whereClause = base;
  if (q.length > 0) {
    const plaintextMatch = or(ilike(pg.workforceEmployees.jobTitle, t), ilike(pg.workforceEmployees.employeeKind, t))!;
    if (middleware?.hasSearchIndex()) {
      const ids = await findEntityIdsByMultiFieldContains(
        params.tenantId,
        params.tenantId,
        EMPLOYEES_TABLE_KEY,
        q,
        middleware.getSearchKeyB64()!,
        middleware.getNgramSize()
      );
      whereClause =
        ids.length === 0
          ? and(base, plaintextMatch)!
          : and(base, or(inArray(pg.workforceEmployees.id, ids), plaintextMatch)!)!;
    } else {
      whereClause = and(
        base,
        or(
          ilike(pg.workforceEmployees.firstName, t),
          ilike(pg.workforceEmployees.lastName, t),
          ilike(pg.workforceEmployees.personalEmail, t),
          ilike(pg.workforceEmployees.workEmail, t),
          ilike(pg.workforceEmployees.personalPhone, t),
          ilike(pg.workforceEmployees.workPhone, t),
          plaintextMatch,
          ilike(pg.workforceEmployees.workLocation, t),
          ilike(pg.workforceEmployees.personalAddress, t),
          ilike(pg.workforceEmployees.notes, t),
          sql`${pg.workforceEmployees.firstName} || ' ' || ${pg.workforceEmployees.lastName} ILIKE ${t}`
        )!
      )!;
    }
  }
  const cRows = await db.select({ c: count() }).from(pg.workforceEmployees).where(whereClause);
  const rows = await db
    .select()
    .from(pg.workforceEmployees)
    .where(whereClause)
    .orderBy(desc(pg.workforceEmployees.updatedAt))
    .limit(params.pageSize)
    .offset(offset);
  const decrypted = await Promise.all(rows.map((r) => decryptEmpRow(params.tenantId, r)));
  return { rows: decrypted, total: Number(cRows[0]?.c ?? 0) };
};

const resolveEmploymentOrgUnitId = async (
  tenantId: string,
  value: string | null | undefined,
  mode: "create" | "patch",
  existing: string | null
): Promise<string | null | { error: "invalid_org_unit" }> => {
  if (mode === "create") {
    if (value === undefined || value === null) return null;
    const ou = await getWorkforceOrgUnitById(tenantId, value);
    if (!ou) return { error: "invalid_org_unit" };
    return ou.id;
  }
  if (value === undefined) return existing;
  if (value === null) return null;
  const ou = await getWorkforceOrgUnitById(tenantId, value);
  if (!ou) return { error: "invalid_org_unit" };
  return ou.id;
};

export const insertWorkforceEmployee = async (
  tenantId: string,
  input: WorkforceEmployeeCreateInput
): Promise<WorkforceEmployeeRow | { error: "invalid_org_unit" }> => {
  const employmentResolved = await resolveEmploymentOrgUnitId(
    tenantId,
    input.employmentOrgUnitId,
    "create",
    null
  );
  if (
    employmentResolved !== null &&
    typeof employmentResolved === "object" &&
    "error" in employmentResolved
  ) {
    return employmentResolved;
  }

  const now = new Date();
  const kind = input.employeeKind === "agent" ? "agent" : "person";
  const workTimeKind = input.workTimeKind ?? null;
  const workScheduleJson = stringifyWorkforceWorkScheduleForDb(input.workSchedule);
  const plainRow = {
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    personalPhone: input.personalPhone?.trim() || null,
    personalEmail: input.personalEmail?.trim() || null,
    workPhone: input.workPhone?.trim() || null,
    workEmail: input.workEmail?.trim() || null,
    personalAddress: input.personalAddress?.trim() || null,
    workLocation: input.workLocation?.trim() || null,
    notes: input.notes?.trim() || null,
    workScheduleJson
  };
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const id = randomUUID();
    const encrypted = await encryptEmpFields(tenantId, plainRow, { entityId: id });
    await db.insert(mysql.workforceEmployees).values({
      id,
      tenantId,
      firstName: String(encrypted.firstName ?? plainRow.firstName),
      lastName: String(encrypted.lastName ?? plainRow.lastName),
      dateOfEmployment: input.dateOfEmployment?.trim() || null,
      personalPhone: (encrypted.personalPhone as string | null) ?? null,
      personalEmail: (encrypted.personalEmail as string | null) ?? null,
      workPhone: (encrypted.workPhone as string | null) ?? null,
      workEmail: (encrypted.workEmail as string | null) ?? null,
      personalAddress: (encrypted.personalAddress as string | null) ?? null,
      workLocation: (encrypted.workLocation as string | null) ?? null,
      employmentOrgUnitId: employmentResolved,
      jobTitle: input.jobTitle?.trim() || null,
      employeeKind: kind,
      notes: (encrypted.notes as string | null) ?? null,
      workTimeKind,
      workScheduleJson: String(encrypted.workScheduleJson ?? workScheduleJson),
      createdAt: now,
      updatedAt: now
    });
    const middleware = getFieldEncryptionMiddleware();
    if (middleware?.hasSearchIndex()) {
      await middleware.syncSearchTokensForRow({
        tableKey: EMPLOYEES_TABLE_KEY,
        tenantId,
        entityId: id,
        row: encrypted,
        plainRow
      });
    }
    const created = (await getWorkforceEmployeeById(tenantId, id))!;
    if (input.linkedinUrl !== undefined) {
      await syncWorkforceEmployeeLinkedinUrl(tenantId, created.id, input.linkedinUrl);
    }
    return created;
  }
  const db = pgDb();
  const encrypted = await encryptEmpFields(tenantId, plainRow);
  const inserted = await db
    .insert(pg.workforceEmployees)
    .values({
      tenantId,
      firstName: String(encrypted.firstName ?? plainRow.firstName),
      lastName: String(encrypted.lastName ?? plainRow.lastName),
      dateOfEmployment: input.dateOfEmployment?.trim() || null,
      personalPhone: (encrypted.personalPhone as string | null) ?? null,
      personalEmail: (encrypted.personalEmail as string | null) ?? null,
      workPhone: (encrypted.workPhone as string | null) ?? null,
      workEmail: (encrypted.workEmail as string | null) ?? null,
      personalAddress: (encrypted.personalAddress as string | null) ?? null,
      workLocation: (encrypted.workLocation as string | null) ?? null,
      employmentOrgUnitId: employmentResolved,
      jobTitle: input.jobTitle?.trim() || null,
      employeeKind: kind,
      notes: (encrypted.notes as string | null) ?? null,
      workTimeKind,
      workScheduleJson: String(encrypted.workScheduleJson ?? workScheduleJson),
      createdAt: now,
      updatedAt: now
    })
    .returning();
  const row = await decryptEmpRow(tenantId, inserted[0]!);
  const middleware = getFieldEncryptionMiddleware();
  if (middleware?.hasSearchIndex()) {
    await middleware.syncSearchTokensForRow({
      tableKey: EMPLOYEES_TABLE_KEY,
      tenantId,
      entityId: row.id,
      row: encrypted,
      plainRow
    });
  }
  if (input.linkedinUrl !== undefined) {
    await syncWorkforceEmployeeLinkedinUrl(tenantId, row.id, input.linkedinUrl);
  }
  return row;
};

const employeePatchHasCoreFields = (patch: WorkforceEmployeePatchInput): boolean =>
  patch.firstName !== undefined ||
  patch.lastName !== undefined ||
  patch.dateOfEmployment !== undefined ||
  patch.personalPhone !== undefined ||
  patch.personalEmail !== undefined ||
  patch.workPhone !== undefined ||
  patch.workEmail !== undefined ||
  patch.personalAddress !== undefined ||
  patch.workLocation !== undefined ||
  patch.employmentOrgUnitId !== undefined ||
  patch.jobTitle !== undefined ||
  patch.employeeKind !== undefined ||
  patch.notes !== undefined ||
  patch.workTimeKind !== undefined ||
  patch.workSchedule !== undefined;

export const updateWorkforceEmployee = async (
  tenantId: string,
  id: string,
  patch: WorkforceEmployeePatchInput
): Promise<WorkforceEmployeeRow | { error: "not_found" | "invalid_org_unit" }> => {
  const existing = await getWorkforceEmployeeById(tenantId, id);
  if (!existing) return { error: "not_found" };

  if (!employeePatchHasCoreFields(patch)) {
    if (patch.linkedinUrl !== undefined) {
      await syncWorkforceEmployeeLinkedinUrl(tenantId, id, patch.linkedinUrl);
    }
    return (await getWorkforceEmployeeById(tenantId, id))!;
  }

  const employmentResolved = await resolveEmploymentOrgUnitId(
    tenantId,
    patch.employmentOrgUnitId,
    "patch",
    existing.employmentOrgUnitId
  );
  if (
    employmentResolved !== null &&
    typeof employmentResolved === "object" &&
    "error" in employmentResolved
  ) {
    return employmentResolved;
  }

  const next = {
    firstName: patch.firstName !== undefined ? patch.firstName.trim() : existing.firstName,
    lastName: patch.lastName !== undefined ? patch.lastName.trim() : existing.lastName,
    dateOfEmployment:
      patch.dateOfEmployment !== undefined
        ? patch.dateOfEmployment?.trim() || null
        : existing.dateOfEmployment,
    personalPhone:
      patch.personalPhone !== undefined ? patch.personalPhone?.trim() || null : existing.personalPhone,
    personalEmail:
      patch.personalEmail !== undefined ? patch.personalEmail?.trim() || null : existing.personalEmail,
    workPhone: patch.workPhone !== undefined ? patch.workPhone?.trim() || null : existing.workPhone,
    workEmail: patch.workEmail !== undefined ? patch.workEmail?.trim() || null : existing.workEmail,
    personalAddress:
      patch.personalAddress !== undefined ? patch.personalAddress?.trim() || null : existing.personalAddress,
    workLocation: patch.workLocation !== undefined ? patch.workLocation?.trim() || null : existing.workLocation,
    employmentOrgUnitId: employmentResolved,
    jobTitle: patch.jobTitle !== undefined ? (patch.jobTitle?.trim() || null) : existing.jobTitle,
    employeeKind:
      patch.employeeKind !== undefined ? (patch.employeeKind === "agent" ? "agent" : "person") : existing.employeeKind,
    notes: patch.notes !== undefined ? (patch.notes?.trim() || null) : existing.notes,
    workTimeKind: patch.workTimeKind !== undefined ? patch.workTimeKind : existing.workTimeKind,
    workSchedule: patch.workSchedule !== undefined ? patch.workSchedule : existing.workSchedule
  };

  const workScheduleJson = stringifyWorkforceWorkScheduleForDb(next.workSchedule);
  const setPayload: Record<string, unknown> = {
    firstName: next.firstName,
    lastName: next.lastName,
    personalPhone: next.personalPhone,
    personalEmail: next.personalEmail,
    workPhone: next.workPhone,
    workEmail: next.workEmail,
    personalAddress: next.personalAddress,
    workLocation: next.workLocation,
    notes: next.notes,
    workScheduleJson
  };
  const changedFields = new Set<string>();
  for (const key of Object.keys(setPayload)) {
    if (patch[key as keyof WorkforceEmployeePatchInput] !== undefined) {
      changedFields.add(key);
    }
  }
  if (patch.workSchedule !== undefined) changedFields.add("workScheduleJson");

  const encrypted = await encryptEmpFields(tenantId, setPayload, { changedFields, entityId: id });
  for (const key of changedFields) {
    if (key in encrypted) setPayload[key] = encrypted[key];
  }
  const middleware = getFieldEncryptionMiddleware();
  if (middleware?.hasSearchIndex() && changedFields.size > 0) {
    await middleware.syncSearchTokensForRow({
      tableKey: EMPLOYEES_TABLE_KEY,
      tenantId,
      entityId: id,
      row: setPayload,
      plainRow: {
        firstName: next.firstName,
        lastName: next.lastName,
        personalPhone: next.personalPhone,
        personalEmail: next.personalEmail,
        workPhone: next.workPhone,
        workEmail: next.workEmail,
        personalAddress: next.personalAddress,
        workLocation: next.workLocation,
        notes: next.notes,
        workScheduleJson
      },
      changedFields
    });
  }

  const now = new Date();
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db
      .update(mysql.workforceEmployees)
      .set({
        firstName: String(setPayload.firstName),
        lastName: String(setPayload.lastName),
        dateOfEmployment: next.dateOfEmployment,
        personalPhone: setPayload.personalPhone as string | null,
        personalEmail: setPayload.personalEmail as string | null,
        workPhone: setPayload.workPhone as string | null,
        workEmail: setPayload.workEmail as string | null,
        personalAddress: setPayload.personalAddress as string | null,
        workLocation: setPayload.workLocation as string | null,
        employmentOrgUnitId: next.employmentOrgUnitId,
        jobTitle: next.jobTitle,
        employeeKind: next.employeeKind,
        notes: setPayload.notes as string | null,
        workTimeKind: next.workTimeKind,
        workScheduleJson: String(setPayload.workScheduleJson ?? workScheduleJson),
        updatedAt: now
      })
      .where(and(eq(mysql.workforceEmployees.tenantId, tenantId), eq(mysql.workforceEmployees.id, id)));
  } else {
    const db = pgDb();
    await db
      .update(pg.workforceEmployees)
      .set({
        firstName: String(setPayload.firstName),
        lastName: String(setPayload.lastName),
        dateOfEmployment: next.dateOfEmployment,
        personalPhone: setPayload.personalPhone as string | null,
        personalEmail: setPayload.personalEmail as string | null,
        workPhone: setPayload.workPhone as string | null,
        workEmail: setPayload.workEmail as string | null,
        personalAddress: setPayload.personalAddress as string | null,
        workLocation: setPayload.workLocation as string | null,
        employmentOrgUnitId: next.employmentOrgUnitId,
        jobTitle: next.jobTitle,
        employeeKind: next.employeeKind,
        notes: setPayload.notes as string | null,
        workTimeKind: next.workTimeKind,
        workScheduleJson: String(setPayload.workScheduleJson ?? workScheduleJson),
        updatedAt: now
      })
      .where(and(eq(pg.workforceEmployees.tenantId, tenantId), eq(pg.workforceEmployees.id, id)));
  }
  if (patch.linkedinUrl !== undefined) {
    await syncWorkforceEmployeeLinkedinUrl(tenantId, id, patch.linkedinUrl);
  }
  return (await getWorkforceEmployeeById(tenantId, id))!;
};

export const setWorkforceEmployeePhotoRelPath = async (
  tenantId: string,
  id: string,
  photoRelPath: string | null
): Promise<WorkforceEmployeeRow | undefined> => {
  const now = new Date();
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db
      .update(mysql.workforceEmployees)
      .set({ photoRelPath, updatedAt: now })
      .where(and(eq(mysql.workforceEmployees.tenantId, tenantId), eq(mysql.workforceEmployees.id, id)));
    return getWorkforceEmployeeById(tenantId, id);
  }
  const db = pgDb();
  await db
    .update(pg.workforceEmployees)
    .set({ photoRelPath, updatedAt: now })
    .where(and(eq(pg.workforceEmployees.tenantId, tenantId), eq(pg.workforceEmployees.id, id)));
  return getWorkforceEmployeeById(tenantId, id);
};

const mapDocPg = (row: typeof pg.workforceEmployeeDocuments.$inferSelect): WorkforceEmployeeDocumentRow => ({
  id: row.id,
  tenantId: row.tenantId,
  employeeId: row.employeeId,
  title: row.title,
  originalFilename: row.originalFilename,
  mimeType: row.mimeType ?? null,
  storageRelPath: row.storageRelPath,
  byteSize: row.byteSize,
  createdAt: row.createdAt
});

const mapDocMysql = (row: typeof mysql.workforceEmployeeDocuments.$inferSelect): WorkforceEmployeeDocumentRow => ({
  id: row.id,
  tenantId: row.tenantId,
  employeeId: row.employeeId,
  title: row.title,
  originalFilename: row.originalFilename,
  mimeType: row.mimeType ?? null,
  storageRelPath: row.storageRelPath,
  byteSize: row.byteSize,
  createdAt: row.createdAt
});

export const listWorkforceEmployeeDocuments = async (
  tenantId: string,
  employeeId: string
): Promise<WorkforceEmployeeDocumentRow[]> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select()
      .from(mysql.workforceEmployeeDocuments)
      .where(
        and(eq(mysql.workforceEmployeeDocuments.tenantId, tenantId), eq(mysql.workforceEmployeeDocuments.employeeId, employeeId))
      )
      .orderBy(asc(mysql.workforceEmployeeDocuments.createdAt));
    return rows.map(mapDocMysql);
  }
  const db = pgDb();
  const rows = await db
    .select()
    .from(pg.workforceEmployeeDocuments)
    .where(and(eq(pg.workforceEmployeeDocuments.tenantId, tenantId), eq(pg.workforceEmployeeDocuments.employeeId, employeeId)))
    .orderBy(asc(pg.workforceEmployeeDocuments.createdAt));
  return rows.map(mapDocPg);
};

export const insertWorkforceEmployeeDocument = async (input: {
  tenantId: string;
  employeeId: string;
  title: string;
  originalFilename: string;
  mimeType: string | null;
  storageRelPath: string;
  byteSize: number;
}): Promise<WorkforceEmployeeDocumentRow | undefined> => {
  const id = randomUUID();
  const now = new Date();
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db.insert(mysql.workforceEmployeeDocuments).values({
      id,
      tenantId: input.tenantId,
      employeeId: input.employeeId,
      title: input.title.trim(),
      originalFilename: input.originalFilename.trim().slice(0, 512),
      mimeType: input.mimeType?.trim() || null,
      storageRelPath: input.storageRelPath,
      byteSize: input.byteSize,
      createdAt: now
    });
    const row = await db
      .select()
      .from(mysql.workforceEmployeeDocuments)
      .where(
        and(
          eq(mysql.workforceEmployeeDocuments.tenantId, input.tenantId),
          eq(mysql.workforceEmployeeDocuments.id, id)
        )
      )
      .limit(1);
    return row[0] ? mapDocMysql(row[0]) : undefined;
  }
  const db = pgDb();
  const inserted = await db
    .insert(pg.workforceEmployeeDocuments)
    .values({
      id,
      tenantId: input.tenantId,
      employeeId: input.employeeId,
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

export const getWorkforceEmployeeDocumentById = async (
  tenantId: string,
  employeeId: string,
  documentId: string
): Promise<WorkforceEmployeeDocumentRow | undefined> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select()
      .from(mysql.workforceEmployeeDocuments)
      .where(
        and(
          eq(mysql.workforceEmployeeDocuments.tenantId, tenantId),
          eq(mysql.workforceEmployeeDocuments.employeeId, employeeId),
          eq(mysql.workforceEmployeeDocuments.id, documentId)
        )
      )
      .limit(1);
    return rows[0] ? mapDocMysql(rows[0]) : undefined;
  }
  const db = pgDb();
  const rows = await db
    .select()
    .from(pg.workforceEmployeeDocuments)
    .where(
      and(
        eq(pg.workforceEmployeeDocuments.tenantId, tenantId),
        eq(pg.workforceEmployeeDocuments.employeeId, employeeId),
        eq(pg.workforceEmployeeDocuments.id, documentId)
      )
    )
    .limit(1);
  return rows[0] ? mapDocPg(rows[0]) : undefined;
};

export const deleteWorkforceEmployeeDocumentById = async (
  tenantId: string,
  employeeId: string,
  documentId: string
): Promise<boolean> => {
  const existing = await getWorkforceEmployeeDocumentById(tenantId, employeeId, documentId);
  if (!existing) return false;
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db
      .delete(mysql.workforceEmployeeDocuments)
      .where(
        and(
          eq(mysql.workforceEmployeeDocuments.tenantId, tenantId),
          eq(mysql.workforceEmployeeDocuments.employeeId, employeeId),
          eq(mysql.workforceEmployeeDocuments.id, documentId)
        )
      );
    return true;
  }
  const db = pgDb();
  await db
    .delete(pg.workforceEmployeeDocuments)
    .where(
      and(
        eq(pg.workforceEmployeeDocuments.tenantId, tenantId),
        eq(pg.workforceEmployeeDocuments.employeeId, employeeId),
        eq(pg.workforceEmployeeDocuments.id, documentId)
      )
    );
  return true;
};

export const deleteWorkforceEmployee = async (
  tenantId: string,
  id: string
): Promise<{ ok: true } | { ok: false; error: "not_found" }> => {
  const existing = await getWorkforceEmployeeById(tenantId, id);
  if (!existing) return { ok: false, error: "not_found" };

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    await db
      .update(mysql.workforceOrgUnits)
      .set({ assignedEmployeeId: null })
      .where(and(eq(mysql.workforceOrgUnits.tenantId, tenantId), eq(mysql.workforceOrgUnits.assignedEmployeeId, id)));
    await db
      .delete(mysql.workforceEmployees)
      .where(and(eq(mysql.workforceEmployees.tenantId, tenantId), eq(mysql.workforceEmployees.id, id)));
  } else {
    const db = pgDb();
    await db
      .update(pg.workforceOrgUnits)
      .set({ assignedEmployeeId: null })
      .where(and(eq(pg.workforceOrgUnits.tenantId, tenantId), eq(pg.workforceOrgUnits.assignedEmployeeId, id)));
    await db
      .delete(pg.workforceEmployees)
      .where(and(eq(pg.workforceEmployees.tenantId, tenantId), eq(pg.workforceEmployees.id, id)));
  }
  await deleteSearchTokensForEntity(tenantId, EMPLOYEES_TABLE_KEY, id);
  return { ok: true };
};

const mapPlainSocialRow = (row: {
  id: string;
  tenantId: string;
  employeeId: string;
  provider: string;
  profileUrl: string;
  createdAt: Date;
  updatedAt: Date;
}): WorkforceEmployeeSocialRow | null => {
  const provider = asSocialProvider(row.provider);
  if (!provider) return null;
  return {
    id: row.id,
    tenantId: row.tenantId,
    employeeId: row.employeeId,
    provider,
    profileUrl: row.profileUrl,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
};

type SocialDbRow =
  | typeof pg.workforceEmployeeSocials.$inferSelect
  | typeof mysql.workforceEmployeeSocials.$inferSelect;

const decryptSocialRow = async (
  tenantId: string,
  row: SocialDbRow
): Promise<WorkforceEmployeeSocialRow | null> =>
  decryptRowAtBoundary(SOCIALS_TABLE_KEY, tenantId, row as unknown as Record<string, unknown>, (plain) =>
    mapPlainSocialRow(plain as SocialDbRow)
  );

const encryptSocialFields = async (
  tenantId: string,
  row: Record<string, unknown>,
  opts?: { changedFields?: Set<string>; entityId?: string }
): Promise<Record<string, unknown>> => encryptRowAtBoundary(SOCIALS_TABLE_KEY, tenantId, row, opts);

/**
 * List social profiles for an employee (tenant-scoped).
 */
export const listWorkforceEmployeeSocials = async (
  tenantId: string,
  employeeId: string
): Promise<WorkforceEmployeeSocialRow[]> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select()
      .from(mysql.workforceEmployeeSocials)
      .where(
        and(
          eq(mysql.workforceEmployeeSocials.tenantId, tenantId),
          eq(mysql.workforceEmployeeSocials.employeeId, employeeId)
        )
      )
      .orderBy(asc(mysql.workforceEmployeeSocials.provider));
    const out: WorkforceEmployeeSocialRow[] = [];
    for (const r of rows) {
      const mapped = await decryptSocialRow(tenantId, r);
      if (mapped) out.push(mapped);
    }
    return out;
  }
  const db = pgDb();
  const rows = await db
    .select()
    .from(pg.workforceEmployeeSocials)
    .where(
      and(eq(pg.workforceEmployeeSocials.tenantId, tenantId), eq(pg.workforceEmployeeSocials.employeeId, employeeId))
    )
    .orderBy(asc(pg.workforceEmployeeSocials.provider));
  const out: WorkforceEmployeeSocialRow[] = [];
  for (const r of rows) {
    const mapped = await decryptSocialRow(tenantId, r);
    if (mapped) out.push(mapped);
  }
  return out;
};

/**
 * Upsert or clear the LinkedIn social for an employee.
 *
 * @param profileUrl - Absolute LinkedIn URL, or `null` to remove
 */
export const syncWorkforceEmployeeLinkedinUrl = async (
  tenantId: string,
  employeeId: string,
  profileUrl: string | null
): Promise<void> => {
  const provider: WorkforceSocialProvider = "linkedin";
  const now = new Date();

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const existing = await db
      .select()
      .from(mysql.workforceEmployeeSocials)
      .where(
        and(
          eq(mysql.workforceEmployeeSocials.tenantId, tenantId),
          eq(mysql.workforceEmployeeSocials.employeeId, employeeId),
          eq(mysql.workforceEmployeeSocials.provider, provider)
        )
      )
      .limit(1);

    if (profileUrl == null || !profileUrl.trim()) {
      if (existing[0]) {
        await db
          .delete(mysql.workforceEmployeeSocials)
          .where(
            and(
              eq(mysql.workforceEmployeeSocials.tenantId, tenantId),
              eq(mysql.workforceEmployeeSocials.id, existing[0].id)
            )
          );
      }
      return;
    }

    const encrypted = await encryptSocialFields(
      tenantId,
      { profileUrl: profileUrl.trim() },
      { entityId: existing[0]?.id, changedFields: new Set(["profileUrl"]) }
    );
    const encUrl = String(encrypted.profileUrl ?? profileUrl.trim());

    if (existing[0]) {
      await db
        .update(mysql.workforceEmployeeSocials)
        .set({ profileUrl: encUrl, updatedAt: now })
        .where(
          and(
            eq(mysql.workforceEmployeeSocials.tenantId, tenantId),
            eq(mysql.workforceEmployeeSocials.id, existing[0].id)
          )
        );
      return;
    }

    const id = randomUUID();
    const encryptedInsert = await encryptSocialFields(
      tenantId,
      { profileUrl: profileUrl.trim() },
      { entityId: id, changedFields: new Set(["profileUrl"]) }
    );
    await db.insert(mysql.workforceEmployeeSocials).values({
      id,
      tenantId,
      employeeId,
      provider,
      profileUrl: String(encryptedInsert.profileUrl ?? profileUrl.trim()),
      createdAt: now,
      updatedAt: now
    });
    return;
  }

  const db = pgDb();
  const existing = await db
    .select()
    .from(pg.workforceEmployeeSocials)
    .where(
      and(
        eq(pg.workforceEmployeeSocials.tenantId, tenantId),
        eq(pg.workforceEmployeeSocials.employeeId, employeeId),
        eq(pg.workforceEmployeeSocials.provider, provider)
      )
    )
    .limit(1);

  if (profileUrl == null || !profileUrl.trim()) {
    if (existing[0]) {
      await db
        .delete(pg.workforceEmployeeSocials)
        .where(
          and(eq(pg.workforceEmployeeSocials.tenantId, tenantId), eq(pg.workforceEmployeeSocials.id, existing[0].id))
        );
    }
    return;
  }

  if (existing[0]) {
    const encrypted = await encryptSocialFields(
      tenantId,
      { profileUrl: profileUrl.trim() },
      { entityId: existing[0].id, changedFields: new Set(["profileUrl"]) }
    );
    await db
      .update(pg.workforceEmployeeSocials)
      .set({
        profileUrl: String(encrypted.profileUrl ?? profileUrl.trim()),
        updatedAt: now
      })
      .where(and(eq(pg.workforceEmployeeSocials.tenantId, tenantId), eq(pg.workforceEmployeeSocials.id, existing[0].id)));
    return;
  }

  const encryptedInsert = await encryptSocialFields(tenantId, { profileUrl: profileUrl.trim() });
  await db.insert(pg.workforceEmployeeSocials).values({
    tenantId,
    employeeId,
    provider,
    profileUrl: String(encryptedInsert.profileUrl ?? profileUrl.trim()),
    createdAt: now,
    updatedAt: now
  });
};
