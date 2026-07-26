/**
 * Re-reads authorization from DB on sensitive routes so stale JWT role/module claims cannot persist.
 */

import type { FastifyReply, FastifyRequest } from "fastify";

import { getUserRoleById, listModuleRolesForUser, moduleRolesRowsToMap } from "@starter/db";
import {
  httpMethodToModulePermission,
  modulePermissionAllowed,
  resolveModuleRole,
  type TenantModuleKey
} from "@starter/shared";

import { requireTenantAdmin } from "./tenant-admin.js";
import { requireSuperAdmin } from "./super-admin.js";

export const requireFreshTenantAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
  await requireTenantAdmin(request, reply);
  if (reply.sent || !request.userId) return;

  const role = await getUserRoleById(request.userId);
  if (role !== "tenant_admin") {
    return reply.code(403).send({
      error: "forbidden",
      message: "Tenant administrator access required"
    });
  }
  request.role = role;
};

export const requireFreshSuperAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
  await requireSuperAdmin(request, reply);
  if (reply.sent || !request.userId) return;

  const role = await getUserRoleById(request.userId);
  if (role !== "super_admin") {
    return reply.code(403).send({
      error: "forbidden",
      message: "Platform administrator access required"
    });
  }
  request.role = role;
};

export const createRequireFreshModulePermission = (module: TenantModuleKey) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.tenantId || !request.userId) {
      return reply.code(403).send({ error: "forbidden", message: "Tenant context required" });
    }

    const role = await getUserRoleById(request.userId);
    if (!role) {
      return reply.code(401).send({ error: "unauthorized", message: "Valid access token required" });
    }
    request.role = role;

    let moduleRoles = request.moduleRoles ?? {};
    if (role === "tenant_user") {
      const rows = await listModuleRolesForUser(request.tenantId, request.userId);
      moduleRoles = moduleRolesRowsToMap(rows);
      request.moduleRoles = moduleRoles;
    }

    const permission = httpMethodToModulePermission(request.method);
    const moduleRole = resolveModuleRole(module, role, moduleRoles);
    if (!modulePermissionAllowed(moduleRole, permission)) {
      return reply.code(403).send({
        error: "forbidden",
        message: "Your role cannot perform this action."
      });
    }
  };
};

export const requireFreshCrmDelete = createRequireFreshModulePermission("crm");
