/**
 * Workforce (HRM) module contracts.
 *
 * Employee CRUD schemas, work schedules, departments, social profiles, and display helpers for
 * the optional workforce module.
 *
 * Responsibilities:
 * - Validate employee create/patch/list query bodies
 * - Export kind enums (person/agent), schedule day codes, social providers, and display name helper
 *
 * Related:
 * - API tenant workforce routes; web workforce admin screens
 *
 * Security:
 * - Tenant-scoped module; requires workforce module permission on API.
 */
import { z } from "zod";

/** Full name for UI / sorting (trimmed parts, space-separated). */
export const workforceEmployeeDisplayName = (firstName: string, lastName: string) =>
  [firstName, lastName].map((s) => s.trim()).filter(Boolean).join(" ").trim();

export const workforceEmployeeKindSchema = z.enum(["person", "agent"]);
export type WorkforceEmployeeKind = z.infer<typeof workforceEmployeeKindSchema>;

export const workforceSocialProviderSchema = z.enum(["linkedin"]);
export type WorkforceSocialProvider = z.infer<typeof workforceSocialProviderSchema>;

/** True when the hostname is linkedin.com or a subdomain (e.g. www, country TLD hosts). */
export const isLinkedinProfileHost = (hostname: string): boolean => {
  const host = hostname.trim().toLowerCase();
  return host === "linkedin.com" || host.endsWith(".linkedin.com");
};

const linkedinProfileUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .url({ message: "Enter a valid LinkedIn profile URL" })
  .refine(
    (u) => {
      try {
        return isLinkedinProfileHost(new URL(u).hostname);
      } catch {
        return false;
      }
    },
    { message: "URL must be a LinkedIn profile (linkedin.com)" }
  );

/** Optional LinkedIn URL on create/patch: omit = leave unchanged (patch), empty/null = clear. */
const optionalLinkedinUrl = z
  .union([linkedinProfileUrlSchema, z.literal(""), z.null()])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === null || v === "" ? null : v));

export const workforceWorkTimeKindSchema = z.enum(["full", "part"]);
export type WorkforceWorkTimeKind = z.infer<typeof workforceWorkTimeKindSchema>;

export const workforceWorkScheduleDayCodeSchema = z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
export type WorkforceWorkScheduleDayCode = z.infer<typeof workforceWorkScheduleDayCodeSchema>;

const workforceTimeHmSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM (e.g. 08:00)");

export const workforceWorkScheduleEntrySchema = z
  .object({
    day: workforceWorkScheduleDayCodeSchema,
    start: workforceTimeHmSchema,
    end: workforceTimeHmSchema
  })
  .strict()
  .refine((e) => e.start < e.end, { message: "End time must be after start time", path: ["end"] });

export const workforceWorkScheduleSchema = z
  .array(workforceWorkScheduleEntrySchema)
  .max(7)
  .refine((rows) => new Set(rows.map((r) => r.day)).size === rows.length, {
    message: "Each day may appear only once",
    path: []
  });

export type WorkforceWorkScheduleEntry = z.infer<typeof workforceWorkScheduleEntrySchema>;

/** Short labels for schedule rows (detail card, lists). */
export const workforceWorkScheduleDayShortLabel: Record<WorkforceWorkScheduleDayCode, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun"
};

export function parseWorkforceWorkScheduleJson(raw: string | null | undefined): WorkforceWorkScheduleEntry[] | null {
  if (raw == null || !String(raw).trim()) return null;
  try {
    const v = JSON.parse(String(raw)) as unknown;
    const p = workforceWorkScheduleSchema.safeParse(v);
    return p.success ? p.data : null;
  } catch {
    return null;
  }
}

export function stringifyWorkforceWorkScheduleForDb(
  rows: WorkforceWorkScheduleEntry[] | null | undefined
): string | null {
  if (rows == null || rows.length === 0) return null;
  const order: WorkforceWorkScheduleDayCode[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const sorted = [...rows].sort((a, b) => order.indexOf(a.day) - order.indexOf(b.day));
  return JSON.stringify(sorted);
}

export const workforceEmployeeIdParamsSchema = z.object({ id: z.string().uuid() });
export type WorkforceEmployeeIdParams = z.infer<typeof workforceEmployeeIdParamsSchema>;

export const workforceEmployeeDocumentParamsSchema = z.object({
  id: z.string().uuid(),
  docId: z.string().uuid()
});
export type WorkforceEmployeeDocumentParams = z.infer<typeof workforceEmployeeDocumentParamsSchema>;

export const workforceEmployeesListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});

export type WorkforceEmployeesListQueryInput = z.infer<typeof workforceEmployeesListQuerySchema>;

const optionalIsoDate = z
  .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === null || v === "" ? null : v));

const optionalTrimmedNullable = (max: number) =>
  z
    .union([z.string().max(max), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === null || v === "" ? null : String(v).trim()));

const optionalNullableWorkTimeKind = z
  .union([workforceWorkTimeKindSchema, z.literal(""), z.null()])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === null || v === "" ? null : v));

const optionalNullableUuid = z
  .union([z.string().uuid(), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === null || v === "" ? null : v));

export const workforceEmployeeCreateSchema = z
  .object({
    firstName: z.string().trim().min(1).max(255),
    lastName: z.string().trim().min(1).max(255),
    dateOfEmployment: optionalIsoDate,
    personalPhone: optionalTrimmedNullable(64),
    personalEmail: optionalTrimmedNullable(320),
    workPhone: optionalTrimmedNullable(64),
    workEmail: optionalTrimmedNullable(320),
    personalAddress: optionalTrimmedNullable(8000),
    workLocation: optionalTrimmedNullable(512),
    /** Employment org unit (many employees per unit); not the org-chart assignee. */
    employmentOrgUnitId: optionalNullableUuid,
    jobTitle: optionalTrimmedNullable(255),
    employeeKind: workforceEmployeeKindSchema.default("person"),
    notes: optionalTrimmedNullable(8000),
    workTimeKind: optionalNullableWorkTimeKind,
    workSchedule: workforceWorkScheduleSchema.optional(),
    /** LinkedIn profile URL; omit or empty = no LinkedIn social registered. */
    linkedinUrl: optionalLinkedinUrl
  })
  .strict();

export type WorkforceEmployeeCreateInput = z.infer<typeof workforceEmployeeCreateSchema>;

export const workforceEmployeePatchSchema = z
  .object({
    firstName: z.string().trim().min(1).max(255).optional(),
    lastName: z.string().trim().min(1).max(255).optional(),
    dateOfEmployment: optionalIsoDate,
    personalPhone: optionalTrimmedNullable(64),
    personalEmail: optionalTrimmedNullable(320),
    workPhone: optionalTrimmedNullable(64),
    workEmail: optionalTrimmedNullable(320),
    personalAddress: optionalTrimmedNullable(8000),
    workLocation: optionalTrimmedNullable(512),
    employmentOrgUnitId: optionalNullableUuid,
    jobTitle: optionalTrimmedNullable(255),
    employeeKind: workforceEmployeeKindSchema.optional(),
    notes: optionalTrimmedNullable(8000),
    workTimeKind: optionalNullableWorkTimeKind,
    workSchedule: z.union([workforceWorkScheduleSchema, z.null()]).optional(),
    /** LinkedIn profile URL; empty/null clears the LinkedIn social. */
    linkedinUrl: optionalLinkedinUrl
  })
  .strict()
  .refine(
    (b) =>
      b.firstName !== undefined ||
      b.lastName !== undefined ||
      b.dateOfEmployment !== undefined ||
      b.personalPhone !== undefined ||
      b.personalEmail !== undefined ||
      b.workPhone !== undefined ||
      b.workEmail !== undefined ||
      b.personalAddress !== undefined ||
      b.workLocation !== undefined ||
      b.employmentOrgUnitId !== undefined ||
      b.jobTitle !== undefined ||
      b.employeeKind !== undefined ||
      b.notes !== undefined ||
      b.workTimeKind !== undefined ||
      b.workSchedule !== undefined ||
      b.linkedinUrl !== undefined,
    { message: "Provide at least one field to update" }
  );

export type WorkforceEmployeePatchInput = z.infer<typeof workforceEmployeePatchSchema>;

export const workforceOrgUnitIdParamsSchema = z.object({ id: z.string().uuid() });
export type WorkforceOrgUnitIdParams = z.infer<typeof workforceOrgUnitIdParamsSchema>;

export const workforceOrgUnitCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    parentOrgUnitId: z.string().uuid().optional().nullable(),
    assignedEmployeeId: z.string().uuid().optional().nullable(),
    onOrgChart: z.boolean().optional()
  })
  .strict();

export type WorkforceOrgUnitCreateInput = z.infer<typeof workforceOrgUnitCreateSchema>;

export const workforceOrgUnitPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    parentOrgUnitId: z.string().uuid().nullable().optional(),
    assignedEmployeeId: z.string().uuid().nullable().optional(),
    onOrgChart: z.boolean().optional()
  })
  .strict()
  .refine(
    (b) =>
      b.name !== undefined ||
      b.parentOrgUnitId !== undefined ||
      b.assignedEmployeeId !== undefined ||
      b.onOrgChart !== undefined,
    {
      message: "Provide at least one of name, parentOrgUnitId, assignedEmployeeId, or onOrgChart"
    }
  );

export type WorkforceOrgUnitPatchInput = z.infer<typeof workforceOrgUnitPatchSchema>;
