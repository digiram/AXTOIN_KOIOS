/**
 * Access token claim enrichment.
 *
 * Loads per-module role assignments from the database and serializes them into
 * access JWT claims before token issuance.
 *
 * Responsibilities:
 * - Query `tenant_user_module_roles` for realm members
 * - Omit module roles for super admins and tenant admins
 * - Enrich `AccessTokenSignInput` prior to signing
 *
 * Security:
 * - Module roles are tenant-scoped; only loaded when `tenantId` is present
 */

import {
  type TenantModuleRolesMap,
  serializeModuleRolesClaim
} from "@starter/shared";

import { listModuleRolesForUser, moduleRolesRowsToMap } from "@starter/db";

import type { AccessTokenSignInput } from "./issue-tokens.js";

/** Loads per-module roles for realm JWTs (tenant admins omit claim — resolved as Manager in shared helpers). */
export const loadModuleRolesForAccessToken = async (
  tenantId: string | null | undefined,
  userId: string,
  globalRole: string
): Promise<TenantModuleRolesMap> => {
  if (!tenantId || globalRole === "super_admin" || globalRole === "tenant_admin") {
    return {};
  }
  const rows = await listModuleRolesForUser(tenantId, userId);
  return moduleRolesRowsToMap(rows);
};

/** Serializes module roles for the JWT `mr` claim; returns `undefined` when empty. */
export const moduleRolesClaimValue = (roles: TenantModuleRolesMap): string | undefined =>
  serializeModuleRolesClaim(roles);

/** Loads `moduleRoles` from DB before signing access JWTs. */
export const enrichAccessTokenSignInput = async (
  input: Omit<AccessTokenSignInput, "moduleRoles">
): Promise<AccessTokenSignInput> => {
  const moduleRoles = await loadModuleRolesForAccessToken(input.tenantId, input.userId, input.role);
  return { ...input, moduleRoles };
};
