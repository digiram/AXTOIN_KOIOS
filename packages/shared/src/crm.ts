/**
 * CRM module HTTP contracts and relationship type catalog.
 *
 * Organizations, contacts, activities, addresses, and relationship schemas
 * shared by tenant CRM API routes and web admin UI.
 *
 * Responsibilities:
 * - Validate CRM entity CRUD, activity logging, and relationship bodies
 * - Export seeded system relationship type definitions and reserved name guard
 *
 * Related:
 * - API `tenant-crm` routes; web CRM screens
 *
 * Security:
 * - All entities tenant-scoped; queries filter by JWT `tenant_id` on API.
 */
import { z } from "zod";

/** CRM record discriminant: organization account vs individual contact. */
export const crmEntityKindSchema = z.enum(["ORGANIZATION", "CONTACT"]);
export type CrmEntityKind = z.infer<typeof crmEntityKindSchema>;

/** Seeded per tenant; `name` is the forward label from `sourceEntityKind` → `targetEntityKind`. */
export const CRM_SYSTEM_RELATIONSHIP_TYPE_DEFINITIONS = [
  {
    name: "Employee",
    reverseName: "Employer",
    sourceEntityKind: "CONTACT" as const,
    targetEntityKind: "ORGANIZATION" as const
  },
  {
    name: "Spouse",
    reverseName: "Spouse",
    sourceEntityKind: "CONTACT" as const,
    targetEntityKind: "CONTACT" as const
  },
  {
    name: "Colleague",
    reverseName: "Colleague",
    sourceEntityKind: "CONTACT" as const,
    targetEntityKind: "CONTACT" as const
  },
  {
    name: "Subsidiary",
    reverseName: "Holding",
    sourceEntityKind: "ORGANIZATION" as const,
    targetEntityKind: "ORGANIZATION" as const
  },
  {
    name: "Subsidiary (competing)",
    reverseName: "Competitor",
    sourceEntityKind: "ORGANIZATION" as const,
    targetEntityKind: "ORGANIZATION" as const
  },
  {
    name: "Subsidiary (partner)",
    reverseName: "Partner",
    sourceEntityKind: "ORGANIZATION" as const,
    targetEntityKind: "ORGANIZATION" as const
  },
  {
    name: "Other",
    reverseName: "Other",
    sourceEntityKind: "ORGANIZATION" as const,
    targetEntityKind: "ORGANIZATION" as const
  },
  {
    name: "Other",
    reverseName: "Other",
    sourceEntityKind: "ORGANIZATION" as const,
    targetEntityKind: "CONTACT" as const
  },
  {
    name: "Other",
    reverseName: "Other",
    sourceEntityKind: "CONTACT" as const,
    targetEntityKind: "ORGANIZATION" as const
  },
  {
    name: "Other",
    reverseName: "Other",
    sourceEntityKind: "CONTACT" as const,
    targetEntityKind: "CONTACT" as const
  }
] as const;

const RESERVED_CRM_RELATIONSHIP_TYPE_NAMES = new Set(
  CRM_SYSTEM_RELATIONSHIP_TYPE_DEFINITIONS.flatMap((d) => [d.name.toLowerCase(), d.reverseName.toLowerCase()])
);

/** Blocks custom types from colliding with system forward/reverse labels (case-insensitive). */
export const isReservedCrmRelationshipTypeName = (raw: string): boolean =>
  RESERVED_CRM_RELATIONSHIP_TYPE_NAMES.has(raw.trim().toLowerCase());

export const crmActivityTypeSchema = z.enum([
  "CALL",
  "MEETING",
  "CONVERSATION",
  "NOTE",
  "EMAIL",
  "MAIL"
]);
export type CrmActivityType = z.infer<typeof crmActivityTypeSchema>;

export const crmActivityDirectionSchema = z.enum(["INBOUND", "OUTBOUND"]);
export type CrmActivityDirection = z.infer<typeof crmActivityDirectionSchema>;

export const crmAddressFieldsSchema = z.object({
  addressLine1: z.string().trim().max(512).optional().nullable(),
  addressLine2: z.string().trim().max(512).optional().nullable(),
  postalCode: z.string().trim().max(32).optional().nullable(),
  city: z.string().trim().max(255).optional().nullable(),
  state: z.string().trim().max(255).optional().nullable(),
  country: z.string().trim().max(255).optional().nullable()
});

/** Typed address row (Home / Work / …); primary mirrored to legacy scalar columns server-side. */
export const crmAddressEntrySchema = z.object({
  kind: z.string().trim().min(1).max(64),
  addressLine1: z.string().trim().max(512).optional().nullable(),
  addressLine2: z.string().trim().max(512).optional().nullable(),
  houseNumber: z.string().trim().max(64).optional().nullable(),
  postalCode: z.string().trim().max(32).optional().nullable(),
  city: z.string().trim().max(255).optional().nullable(),
  state: z.string().trim().max(255).optional().nullable(),
  country: z.string().trim().max(255).optional().nullable(),
  isPrimary: z.boolean()
});
export type CrmAddressEntry = z.infer<typeof crmAddressEntrySchema>;

/** Form row shape used by CRM address editor (empty strings allowed). */
export type CrmAddressFormRowInput = {
  kind: string;
  addressLine1: string;
  addressLine2: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  state: string;
  country: string;
  isPrimary: boolean;
};

export function crmAddressRowHasContent(row: CrmAddressFormRowInput): boolean {
  return [
    row.addressLine1,
    row.addressLine2,
    row.houseNumber,
    row.postalCode,
    row.city,
    row.state,
    row.country
  ].some((v) => (v ?? "").trim().length > 0);
}

const nzForm = (s: string | undefined): string | null => {
  const t = (s ?? "").trim();
  return t.length === 0 ? null : t;
};

export function crmAddressFormRowToEntry(row: CrmAddressFormRowInput, defaultKind: string): CrmAddressEntry {
  const kind = (row.kind || defaultKind).trim().slice(0, 64) || defaultKind;
  return {
    kind,
    addressLine1: nzForm(row.addressLine1),
    addressLine2: nzForm(row.addressLine2),
    houseNumber: nzForm(row.houseNumber),
    postalCode: nzForm(row.postalCode),
    city: nzForm(row.city),
    state: nzForm(row.state),
    country: nzForm(row.country),
    isPrimary: Boolean(row.isPrimary)
  };
}

export type CrmAddressFieldError = { rowIndex: number; field: string; message: string };

export function validateCrmAddressFormRows(
  rows: ReadonlyArray<CrmAddressFormRowInput>,
  defaultKind: string
): CrmAddressFieldError[] {
  const errors: CrmAddressFieldError[] = [];
  rows.forEach((row, rowIndex) => {
    if (!crmAddressRowHasContent(row)) return;
    const entry = crmAddressFormRowToEntry(row, defaultKind);
    const r = crmAddressEntrySchema.safeParse(entry);
    if (!r.success) {
      for (const issue of r.error.issues) {
        const field = String(issue.path[0] ?? "_row");
        errors.push({ rowIndex, field, message: issue.message });
      }
    }
  });
  return errors;
}

export function crmAddressErrorsNested(errors: readonly CrmAddressFieldError[]): Record<number, Record<string, string>> {
  const out: Record<number, Record<string, string>> = {};
  for (const e of errors) {
    out[e.rowIndex] ??= {};
    out[e.rowIndex][e.field] = e.message;
  }
  return out;
}

/** API payload: non-empty rows only; exactly one primary when multiple exist. */
export function toCrmAddressPayload(
  rows: ReadonlyArray<CrmAddressFormRowInput>,
  defaultKind: string
): CrmAddressEntry[] {
  const filled = rows
    .map((r) => crmAddressFormRowToEntry(r, defaultKind))
    .filter((e) =>
      [
        e.addressLine1,
        e.addressLine2,
        e.houseNumber,
        e.postalCode,
        e.city,
        e.state,
        e.country
      ].some((v) => (v ?? "").length > 0)
    );
  if (filled.length === 0) return [];
  let pi = filled.findIndex((a) => a.isPrimary);
  if (pi < 0) pi = 0;
  return filled.map((a, i) => ({ ...a, isPrimary: i === pi }));
}

/** True when a typed CRM address row has any field used for one-line display. */
export function crmAddressEntryHasContent(a: CrmAddressEntry): boolean {
  return [
    a.addressLine1,
    a.addressLine2,
    a.houseNumber,
    a.postalCode,
    a.city,
    a.state,
    a.country
  ].some((v) => (v ?? "").trim().length > 0);
}

/** Single-line postal address (matches contact/org profile cards). */
export function formatCrmAddressEntryOneLine(a: CrmAddressEntry): string {
  const line1 = [a.addressLine1, a.houseNumber].filter((x) => (x ?? "").trim()).join(" ").trim();
  return [
    line1 || undefined,
    a.addressLine2?.trim() || undefined,
    [a.postalCode, a.city].filter((x) => (x ?? "").trim()).join(" ").trim() || undefined,
    a.state?.trim() || undefined,
    a.country?.trim() || undefined
  ]
    .filter((x) => x && String(x).length > 0)
    .join(", ");
}

/**
 * Primary typed address row when present, otherwise first filled row, otherwise legacy scalar columns.
 */
export function formatCrmPrimaryAddressLine(entity: {
  addresses?: CrmAddressEntry[] | undefined;
  addressLine1?: string | null;
  addressLine2?: string | null;
  postalCode?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
}): string {
  const filled = (entity.addresses ?? []).filter(crmAddressEntryHasContent);
  if (filled.length > 0) {
    const a = filled.find((x) => x.isPrimary) ?? filled[0]!;
    return formatCrmAddressEntryOneLine(a).trim();
  }
  const pcCity = [entity.postalCode, entity.city]
    .filter((x) => x && String(x).trim().length > 0)
    .join(" ")
    .trim();
  return [
    entity.addressLine1?.trim() || undefined,
    entity.addressLine2?.trim() || undefined,
    pcCity || undefined,
    entity.state?.trim() || undefined,
    entity.country?.trim() || undefined
  ]
    .filter((x) => x && String(x).length > 0)
    .join(", ");
}

/** City on the same primary typed row (or legacy `entity.city`) as {@link formatCrmPrimaryAddressLine}. */
export function formatCrmPrimaryAddressCity(entity: {
  addresses?: CrmAddressEntry[] | undefined;
  city?: string | null;
}): string {
  const filled = (entity.addresses ?? []).filter(crmAddressEntryHasContent);
  if (filled.length > 0) {
    const a = filled.find((x) => x.isPrimary) ?? filled[0]!;
    return (a.city ?? "").trim();
  }
  return (entity.city ?? "").trim();
}

/** Typed email/phone row; exactly one entry per category should have `isPrimary` (enforced server-side). */
export const crmChannelEntrySchema = z.object({
  kind: z.string().trim().min(1).max(64),
  value: z.string().trim().max(320),
  isPrimary: z.boolean()
});
export type CrmChannelEntry = z.infer<typeof crmChannelEntrySchema>;

/** True when `value` has between 7 and 15 digits (non-digits ignored). */
export function crmSimplePhoneDigitsCountOk(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

export const crmChannelPhoneValueSchema = z
  .string()
  .trim()
  .max(320)
  .refine((s) => crmSimplePhoneDigitsCountOk(s), {
    message: "Enter a valid phone number (7–15 digits)."
  });

/** Email channel row (validated `value`). */
export const crmEmailChannelEntrySchema = crmChannelEntrySchema.extend({
  value: z.string().trim().email().max(320)
});

/** Phone channel row (validated `value`). */
export const crmPhoneChannelEntrySchema = crmChannelEntrySchema.extend({
  value: crmChannelPhoneValueSchema
});

const crmNullableLegacyPhoneSchema = z
  .string()
  .trim()
  .max(64)
  .optional()
  .nullable()
  .refine((v) => v == null || v.length === 0 || crmSimplePhoneDigitsCountOk(v), {
    message: "Enter a valid phone number (7–15 digits)."
  });

/** Inline channel validation keyed by editor row index (only rows with non-empty value). */
export type CrmChannelFormRowError = { rowIndex: number; message: string };

export function validateCrmEmailFormRows(
  rows: ReadonlyArray<{ kind: string; value: string; isPrimary: boolean }>,
  defaultKind: string
): CrmChannelFormRowError[] {
  const errors: CrmChannelFormRowError[] = [];
  rows.forEach((row, rowIndex) => {
    const value = row.value.trim();
    if (value.length === 0) return;
    const entry = {
      kind: (row.kind || defaultKind).trim().slice(0, 64) || defaultKind,
      value,
      isPrimary: Boolean(row.isPrimary)
    };
    const r = crmEmailChannelEntrySchema.safeParse(entry);
    if (!r.success) {
      errors.push({ rowIndex, message: r.error.issues[0]?.message ?? "Invalid email" });
    }
  });
  return errors;
}

export function validateCrmPhoneFormRows(
  rows: ReadonlyArray<{ kind: string; value: string; isPrimary: boolean }>,
  defaultKind: string
): CrmChannelFormRowError[] {
  const errors: CrmChannelFormRowError[] = [];
  rows.forEach((row, rowIndex) => {
    const value = row.value.trim();
    if (value.length === 0) return;
    const entry = {
      kind: (row.kind || defaultKind).trim().slice(0, 64) || defaultKind,
      value,
      isPrimary: Boolean(row.isPrimary)
    };
    const r = crmPhoneChannelEntrySchema.safeParse(entry);
    if (!r.success) {
      errors.push({ rowIndex, message: r.error.issues[0]?.message ?? "Invalid phone number" });
    }
  });
  return errors;
}

export function crmChannelErrorsByRow(errors: readonly CrmChannelFormRowError[]): Record<number, string> {
  return Object.fromEntries(errors.map((e) => [e.rowIndex, e.message]));
}

export const crmOrganizationMarketSegmentCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    /** Omit or null for layer 1; required parent for layers 2 and 3. */
    parentId: z.string().uuid().optional().nullable()
  })
  .strict();

export const crmOrganizationMarketingTagCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(64)
  })
  .strict();

export const crmOrganizationCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(512),
    email: z.string().trim().email().max(320).optional().nullable(),
    phone: crmNullableLegacyPhoneSchema,
    emails: z.array(crmEmailChannelEntrySchema).max(40).optional(),
    phones: z.array(crmPhoneChannelEntrySchema).max(40).optional(),
    addresses: z.array(crmAddressEntrySchema).max(20).optional(),
    marketSegmentLayer1Id: z.string().uuid().optional().nullable(),
    marketSegmentLayer2Id: z.string().uuid().optional().nullable(),
    marketSegmentLayer3Id: z.string().uuid().optional().nullable(),
    marketingTagIds: z.array(z.string().uuid()).max(30).optional(),
    /** Creates a `Subsidiary` relationship (ORGANIZATION → ORGANIZATION) to this holding organization. */
    holdingOrganizationId: z.string().uuid().optional().nullable()
  })
  .merge(crmAddressFieldsSchema)
  .strict();

export const crmOrganizationPatchSchema = crmOrganizationCreateSchema.partial().strict();

export const crmContactCreateSchema = z
  .object({
    firstName: z.string().trim().min(1).max(255),
    lastName: z.string().trim().min(1).max(255),
    salutation: z.string().trim().max(64).optional().nullable(),
    title: z.string().trim().max(255).optional().nullable(),
    email: z.string().trim().email().max(320).optional().nullable(),
    phone: crmNullableLegacyPhoneSchema,
    emails: z.array(crmEmailChannelEntrySchema).max(40).optional(),
    phones: z.array(crmPhoneChannelEntrySchema).max(40).optional(),
    addresses: z.array(crmAddressEntrySchema).max(20).optional(),
    /** Creates an `Employee` relationship (CONTACT → ORGANIZATION) to this organization. */
    employerOrganizationId: z.string().uuid().optional().nullable()
  })
  .merge(crmAddressFieldsSchema)
  .strict();

export const crmContactPatchSchema = crmContactCreateSchema.partial().strict();

export const crmListQuerySchema = z
  .object({
    q: z.string().trim().max(200).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    marketSegmentLayer1Id: z.string().uuid().optional(),
    marketSegmentLayer2Id: z.string().uuid().optional(),
    marketSegmentLayer3Id: z.string().uuid().optional(),
    marketingTagId: z.string().uuid().optional(),
    marketingTagIds: z.preprocess(
      (val) => (val === undefined || val === null ? undefined : Array.isArray(val) ? val : [val]),
      z.array(z.string().uuid()).max(30).optional()
    )
  })
  .transform((data) => {
    const marketingTagIds = new Set<string>();
    if (data.marketingTagId) marketingTagIds.add(data.marketingTagId);
    if (data.marketingTagIds) {
      for (const id of data.marketingTagIds) marketingTagIds.add(id);
    }
    const { marketingTagId: _legacyTag, marketingTagIds: _rawTags, ...rest } = data;
    return {
      ...rest,
      marketingTagIds: marketingTagIds.size > 0 ? [...marketingTagIds] : undefined
    };
  });

export const crmOrganizationSegmentIdParamsSchema = z.object({ id: z.string().uuid() });
export const crmOrganizationMarketingTagIdParamsSchema = z.object({ id: z.string().uuid() });

/** Tenant CRM forward geocode (Nominatim); `limit` capped server-side at 10. */
export const crmGeocodeSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(400),
  limit: z.coerce.number().int().min(1).max(10).optional().default(5)
});

export const crmRelationshipTypeCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    /** Defaults to `name` when omitted (symmetric / same label both directions). */
    reverseName: z.string().trim().min(1).max(255).optional(),
    sourceEntityKind: crmEntityKindSchema,
    targetEntityKind: crmEntityKindSchema
  })
  .strict();

export const crmRelationshipCreateSchema = z
  .object({
    relationshipTypeId: z.string().uuid(),
    sourceId: z.string().uuid(),
    sourceEntityKind: crmEntityKindSchema,
    targetId: z.string().uuid(),
    targetEntityKind: crmEntityKindSchema
  })
  .strict();

export const crmRelationshipsQuerySchema = z.object({
  entityKind: crmEntityKindSchema,
  entityId: z.string().uuid()
});

export const crmActivityCreateSchema = z
  .object({
    activityType: crmActivityTypeSchema,
    description: z.string().trim().min(1).max(20000),
    relatedEntityId: z.string().uuid(),
    relatedEntityKind: crmEntityKindSchema,
    scheduledAt: z.string().trim().max(40).optional().nullable(),
    direction: crmActivityDirectionSchema.optional().nullable()
  })
  .strict();

/**
 * Which timestamp date filters use. Omitted in the app UI (always logged-at / `createdAt`).
 * `scheduledAt` excludes rows with no schedule.
 */
export const crmActivityListDateFieldSchema = z.enum(["createdAt", "scheduledAt"]);

export const crmActivityListDatePresetSchema = z.enum(["between", "before", "after"]);

export const crmActivitiesQuerySchema = z
  .object({
    relatedKind: crmEntityKindSchema,
    relatedId: z.string().uuid(),
    activityType: crmActivityTypeSchema.optional(),
    datePreset: crmActivityListDatePresetSchema.optional(),
    dateField: crmActivityListDateFieldSchema.optional(),
    /** Inclusive start day `YYYY-MM-DD` (UTC boundaries). */
    dateFrom: z.string().trim().max(12).optional(),
    /** Inclusive end day `YYYY-MM-DD` for `between` only (UTC boundaries). */
    dateTo: z.string().trim().max(12).optional(),
    /** Case-insensitive match on title and description. */
    q: z.string().trim().max(200).optional()
  })
  .superRefine((data, ctx) => {
    const ymd = /^\d{4}-\d{2}-\d{2}$/;
    const preset = data.datePreset;
    if (!preset) {
      if (data.dateFrom && data.dateFrom.length > 0) {
        ctx.addIssue({ code: "custom", message: "dateFrom requires datePreset", path: ["dateFrom"] });
      }
      if (data.dateTo && data.dateTo.length > 0) {
        ctx.addIssue({ code: "custom", message: "dateTo requires datePreset", path: ["dateTo"] });
      }
      return;
    }
    if (!data.dateFrom || !ymd.test(data.dateFrom)) {
      ctx.addIssue({
        code: "custom",
        message: "dateFrom is required and must be YYYY-MM-DD when datePreset is set",
        path: ["dateFrom"]
      });
    }
    if (preset === "between") {
      if (!data.dateTo || !ymd.test(data.dateTo)) {
        ctx.addIssue({
          code: "custom",
          message: "dateTo is required and must be YYYY-MM-DD when datePreset is between",
          path: ["dateTo"]
        });
      } else if (data.dateFrom && ymd.test(data.dateFrom) && data.dateFrom > data.dateTo) {
        ctx.addIssue({
          code: "custom",
          message: "dateFrom must be on or before dateTo",
          path: ["dateFrom"]
        });
      }
    } else if (data.dateTo && data.dateTo.length > 0) {
      ctx.addIssue({
        code: "custom",
        message: "dateTo is only allowed when datePreset is between",
        path: ["dateTo"]
      });
    }
  });

export type CrmActivityListDateField = z.infer<typeof crmActivityListDateFieldSchema>;
export type CrmActivityListDatePreset = z.infer<typeof crmActivityListDatePresetSchema>;
export type CrmActivitiesQueryInput = z.infer<typeof crmActivitiesQuerySchema>;

export const crmIdParamsSchema = z.object({ id: z.string().uuid() });
