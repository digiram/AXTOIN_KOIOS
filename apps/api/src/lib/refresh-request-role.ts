/**
 * Re-reads global role (and tenant module roles) from DB so stale JWT claims cannot authorize requests.
 */

import type { FastifyRequest } from "fastify";

import { getUserRoleById, listModuleRolesForUser, moduleRolesRowsToMap } from "@starter/db";

export const refreshRequestRoleFromDb = async (request: FastifyRequest): Promise<string | undefined> => {
  const userId = request.userId;
  if (!userId) return undefined;

  const role = await getUserRoleById(userId);
  if (!role) return undefined;

  request.role = role;

  if (request.tenantId && role === "tenant_user") {
    const rows = await listModuleRolesForUser(request.tenantId, userId);
    request.moduleRoles = moduleRolesRowsToMap(rows);
  }

  return role;
};
