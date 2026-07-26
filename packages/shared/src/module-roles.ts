/**
 * Tenant module roles and permission matrix helpers.
 *
 * Defines optional module keys (CRM, sales, invoicing, etc.), Manager/User/Viewer
 * roles, and maps UI permission toggles to API storage (`read`/`write`/`delete`).
 *
 * Responsibilities:
 * - Export module and role enums/schemas
 * - Resolve effective permissions and admin matrix defaults
 *
 * Related:
 * - API `require*ModulePermission` hooks; tenant user admin UI
 *
 * Security:
 * - Permissions are tenant-scoped; enforcement happens in API route hooks.
 */
import { z } from "zod";

/** Tenant-scoped modules that support per-user Manager / User / Viewer roles. */
export const TENANT_MODULE_KEYS = ["crm", "sales", "workforce", "company_subscriptions", "invoicing", "mailbox"] as const;
export type TenantModuleKey = (typeof TENANT_MODULE_KEYS)[number];

export const tenantModuleKeySchema = z.enum(TENANT_MODULE_KEYS);

export const MODULE_ROLES = ["manager", "user", "viewer"] as const;
export type ModuleRole = (typeof MODULE_ROLES)[number];

export const moduleRoleSchema = z.enum(MODULE_ROLES);

export type TenantModuleRolesMap = Partial<Record<TenantModuleKey, ModuleRole>>;

export type ModulePermission = "read" | "write" | "delete";

/** Granular flags for the admin permissions matrix (maps to Manager / User / Viewer). */
export type ModulePermissionFlags = {
  read: boolean;
  write: boolean;
  delete: boolean;
};

export type ModulePermissionToggle = keyof ModulePermissionFlags;

export const MODULE_PERMISSION_COLUMNS: {
  key: ModulePermissionToggle;
  label: string;
  sublabel: string;
  implies: ModulePermissionToggle[];
}[] = [
  { key: "read", label: "View", sublabel: "Viewer", implies: [] },
  { key: "write", label: "Add & edit", sublabel: "User", implies: ["read"] },
  { key: "delete", label: "Delete", sublabel: "Manager", implies: ["read", "write"] }
];

/** Admin matrix columns — maps to read / write / delete for API storage. */
export type ModulePermissionUiKey = "view" | "add" | "edit" | "delete";

export type ModulePermissionUiFlags = {
  view: boolean;
  add: boolean;
  edit: boolean;
  delete: boolean;
};

export const MODULE_PERMISSION_UI_COLUMNS: { key: ModulePermissionUiKey; label: string }[] = [
  { key: "view", label: "View" },
  { key: "add", label: "Add" },
  { key: "edit", label: "Edit" },
  { key: "delete", label: "Delete" }
];

export const emptyModulePermissionUiFlags = (): ModulePermissionUiFlags => ({
  view: false,
  add: false,
  edit: false,
  delete: false
});

export const storageFlagsToUi = (flags: ModulePermissionFlags): ModulePermissionUiFlags => ({
  view: flags.read,
  add: flags.write,
  edit: flags.write,
  delete: flags.delete
});

export const uiToStorageFlags = (ui: ModulePermissionUiFlags): ModulePermissionFlags => ({
  read: ui.view || ui.add || ui.edit || ui.delete,
  write: ui.add || ui.edit || ui.delete,
  delete: ui.delete
});

export const moduleRoleToUiPermissionFlags = (role: ModuleRole | null | undefined): ModulePermissionUiFlags =>
  storageFlagsToUi(moduleRoleToPermissionFlags(role));

export const uiPermissionFlagsToModuleRole = (ui: ModulePermissionUiFlags): ModuleRole | null =>
  permissionFlagsToModuleRole(uiToStorageFlags(ui));

export const moduleRolesMapToUiPermissionMatrix = (
  roles: TenantModuleRolesMap
): Record<TenantModuleKey, ModulePermissionUiFlags> => {
  const out = {} as Record<TenantModuleKey, ModulePermissionUiFlags>;
  for (const key of TENANT_MODULE_KEYS) {
    out[key] = moduleRoleToUiPermissionFlags(roles[key]);
  }
  return out;
};

export const uiPermissionMatrixToModuleRolesPatchBody = (
  matrix: Record<TenantModuleKey, ModulePermissionUiFlags>
): Record<TenantModuleKey, ModuleRole | null> => {
  const out = {} as Record<TenantModuleKey, ModuleRole | null>;
  for (const key of TENANT_MODULE_KEYS) {
    out[key] = uiPermissionFlagsToModuleRole(matrix[key]);
  }
  return out;
};

/** Toggle one UI permission; hierarchy: Delete ⊃ Add/Edit ⊃ View. */
export const applyUiPermissionToggle = (
  current: ModulePermissionUiFlags,
  toggle: ModulePermissionUiKey,
  enabled: boolean
): ModulePermissionUiFlags => {
  if (enabled) {
    if (toggle === "delete") return { view: true, add: true, edit: true, delete: true };
    if (toggle === "add") return { ...current, view: true, add: true };
    if (toggle === "edit") return { ...current, view: true, edit: true };
    return { ...current, view: true };
  }
  if (toggle === "view") return emptyModulePermissionUiFlags();
  if (toggle === "add") return { ...current, add: false, delete: false };
  if (toggle === "edit") return { ...current, edit: false, delete: false };
  return { ...current, delete: false };
};

export const emptyModulePermissionFlags = (): ModulePermissionFlags => ({
  read: false,
  write: false,
  delete: false
});

export const moduleRoleToPermissionFlags = (role: ModuleRole | null | undefined): ModulePermissionFlags => {
  if (!role) return emptyModulePermissionFlags();
  if (role === "manager") return { read: true, write: true, delete: true };
  if (role === "user") return { read: true, write: true, delete: false };
  return { read: true, write: false, delete: false };
};

/** Derives stored role from flags; hierarchy: delete ⊃ write ⊃ read. */
export const permissionFlagsToModuleRole = (flags: ModulePermissionFlags): ModuleRole | null => {
  if (!flags.read) return null;
  if (flags.delete) return "manager";
  if (flags.write) return "user";
  return "viewer";
};

export const moduleRolesMapToPermissionMatrix = (
  roles: TenantModuleRolesMap
): Record<TenantModuleKey, ModulePermissionFlags> => {
  const out = {} as Record<TenantModuleKey, ModulePermissionFlags>;
  for (const key of TENANT_MODULE_KEYS) {
    out[key] = moduleRoleToPermissionFlags(roles[key]);
  }
  return out;
};

export const permissionMatrixToModuleRolesMap = (
  matrix: Record<TenantModuleKey, ModulePermissionFlags>
): TenantModuleRolesMap => {
  const out: TenantModuleRolesMap = {};
  for (const key of TENANT_MODULE_KEYS) {
    const role = permissionFlagsToModuleRole(matrix[key]);
    if (role) out[key] = role;
  }
  return out;
};

/** Full PATCH body — every module key, `null` when access is cleared. */
export const permissionMatrixToModuleRolesPatchBody = (
  matrix: Record<TenantModuleKey, ModulePermissionFlags>
): Record<TenantModuleKey, ModuleRole | null> => {
  const out = {} as Record<TenantModuleKey, ModuleRole | null>;
  for (const key of TENANT_MODULE_KEYS) {
    out[key] = permissionFlagsToModuleRole(matrix[key]);
  }
  return out;
};

/** Toggle one permission and apply hierarchy (enabling upward, disabling downward). */
export const applyModulePermissionToggle = (
  current: ModulePermissionFlags,
  toggle: ModulePermissionToggle,
  enabled: boolean
): ModulePermissionFlags => {
  if (enabled) {
    if (toggle === "delete") return { read: true, write: true, delete: true };
    if (toggle === "write") return { read: true, write: true, delete: current.delete };
    return { read: true, write: current.write, delete: current.delete };
  }
  if (toggle === "read") return emptyModulePermissionFlags();
  if (toggle === "write") return { read: current.read, write: false, delete: false };
  return { read: current.read, write: current.write, delete: false };
};

export const MODULE_LABELS: Record<TenantModuleKey, string> = {
  crm: "CRM",
  sales: "Sales",
  workforce: "Workforce",
  company_subscriptions: "Company subscriptions",
  invoicing: "Invoicing & quoting",
  mailbox: "Mailbox"
};

export const MODULE_ROLE_LABELS: Record<ModuleRole, string> = {
  manager: "Manager",
  user: "User",
  viewer: "Viewer"
};

export const MODULE_ROLE_DESCRIPTIONS: Record<TenantModuleKey, Record<ModuleRole, string>> = {
  crm: {
    manager: "Full access — create, edit, and delete CRM records.",
    user: "Can add and edit CRM records; cannot delete organizations, contacts, or relationships.",
    viewer: "Read-only — browse organizations, contacts, and activity."
  },
  sales: {
    manager: "Full access — manage pipelines, leads, deals, and lanes.",
    user: "Can add and move leads and deals; cannot delete records or pipeline lanes.",
    viewer: "Read-only — view BDR and Sales pipelines."
  },
  workforce: {
    manager: "Full access — org chart, employees, documents, and photos.",
    user: "Can add and edit employees and org units; cannot delete records.",
    viewer: "Read-only — browse workforce and org chart."
  },
  company_subscriptions: {
    manager: "Full access — providers, plans, seats, documents, and billing metadata.",
    user: "Can add and edit subscriptions and seat assignments; cannot delete records.",
    viewer: "Read-only — browse company subscriptions and documented costs."
  },
  invoicing: {
    manager: "Full access — quotes, offers, invoices, catalog, and configuration.",
    user: "Can create, edit, and promote commercial documents; cannot delete or change numbering.",
    viewer: "Read-only — browse quotes, offers, and invoices."
  },
  mailbox: {
    manager: "Full access — connect accounts, shared mailboxes, compose, and calendar.",
    user: "Can read and send mail, connect personal accounts, and manage calendar RSVPs.",
    viewer: "Read-only — browse inbox threads and calendar events."
  }
};

/** Tenant administrators implicitly have Manager on every module. */
export const isTenantAdminRole = (role: string): boolean => role === "tenant_admin";

export const resolveModuleRole = (
  module: TenantModuleKey,
  globalRole: string,
  moduleRoles: TenantModuleRolesMap
): ModuleRole | null => {
  if (isTenantAdminRole(globalRole)) return "manager";
  return moduleRoles[module] ?? null;
};

export const modulePermissionAllowed = (
  moduleRole: ModuleRole | null,
  permission: ModulePermission
): boolean => {
  if (!moduleRole) return false;
  if (moduleRole === "manager") return true;
  if (moduleRole === "viewer") return permission === "read";
  return permission === "read" || permission === "write";
};

export const httpMethodToModulePermission = (method: string): ModulePermission => {
  const m = method.toUpperCase();
  if (m === "GET" || m === "HEAD") return "read";
  if (m === "DELETE") return "delete";
  return "write";
};

const parseModuleRoleValue = (raw: unknown): ModuleRole | undefined => {
  const parsed = moduleRoleSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
};

export const parseModuleRolesClaim = (raw: unknown): TenantModuleRolesMap => {
  if (raw == null || raw === "") return {};
  let parsed: unknown;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return {};
    }
  } else if (typeof raw === "object") {
    parsed = raw;
  } else {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const obj = parsed as Record<string, unknown>;
  const out: TenantModuleRolesMap = {};
  for (const key of TENANT_MODULE_KEYS) {
    const role = parseModuleRoleValue(obj[key]);
    if (role) out[key] = role;
  }
  return out;
};

export const serializeModuleRolesClaim = (roles: TenantModuleRolesMap): string | undefined => {
  const keys = TENANT_MODULE_KEYS.filter((k) => roles[k] != null);
  if (keys.length === 0) return undefined;
  const payload: Record<string, string> = {};
  for (const k of keys) {
    const v = roles[k];
    if (v) payload[k] = v;
  }
  return JSON.stringify(payload);
};

const moduleRoleField = () => moduleRoleSchema.nullable().optional();

export const tenantUserModuleRolesPatchSchema = z
  .object({
    crm: moduleRoleField(),
    sales: moduleRoleField(),
    workforce: moduleRoleField(),
    company_subscriptions: moduleRoleField(),
    invoicing: moduleRoleField(),
    mailbox: moduleRoleField()
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: "Provide at least one module role to update" });

export type TenantUserModuleRolesPatchInput = z.infer<typeof tenantUserModuleRolesPatchSchema>;
