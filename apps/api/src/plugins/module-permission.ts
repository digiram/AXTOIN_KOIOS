/**
 * Tenant module permission pre-handlers.
 *
 * Factory and pre-built Fastify guards that enforce per-module roles on tenant HTTP
 * routes based on HTTP method and JWT module-role claims.
 *
 * Responsibilities:
 * - Map HTTP verbs to module permission levels (read/write/delete)
 * - Refresh user role from DB before authorization check
 * - Export pre-configured guards per `TenantModuleKey`
 *
 * Security:
 * - Requires tenant context (`tenantId`, `userId`)
 * - Denies when module role is missing or insufficient for the verb
 */

import type { FastifyReply, FastifyRequest } from "fastify";

import {
  httpMethodToModulePermission,
  MODULE_LABELS,
  modulePermissionAllowed,
  resolveModuleRole,
  type TenantModuleKey
} from "@starter/shared";

import { refreshRequestRoleFromDb } from "../lib/refresh-request-role.js";

/**
 * Builds a Fastify pre-handler that enforces module-scoped permissions for the given module key.
 *
 * @param module - Tenant module key (e.g. `crm`, `invoicing`).
 */
export const createRequireModulePermission = (module: TenantModuleKey) => {
  const label = MODULE_LABELS[module];
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.tenantId || !request.userId) {
      return reply.code(403).send({ error: "forbidden", message: "Tenant context required" });
    }

    const role = await refreshRequestRoleFromDb(request);
    if (!role) {
      return reply.code(401).send({ error: "unauthorized", message: "Valid access token required" });
    }

    const permission = httpMethodToModulePermission(request.method);
    const moduleRole = resolveModuleRole(module, role, request.moduleRoles ?? {});
    if (!modulePermissionAllowed(moduleRole, permission)) {
      const message =
        moduleRole == null
          ? `You do not have access to ${label}. Ask your tenant administrator for a ${label} role.`
          : moduleRole === "viewer"
            ? `Your ${label} role is read-only.`
            : `Your ${label} role cannot delete records.`;
      return reply.code(403).send({ error: "forbidden", message });
    }
  };
};

export const requireCrmModulePermission = createRequireModulePermission("crm");
export const requireSalesModulePermission = createRequireModulePermission("sales");
export const requireWorkforceModulePermission = createRequireModulePermission("workforce");
export const requireCompanySubscriptionsModulePermission = createRequireModulePermission("company_subscriptions");
export const requireInvoicingModulePermission = createRequireModulePermission("invoicing");
export const requireMailboxModulePermission = createRequireModulePermission("mailbox");
