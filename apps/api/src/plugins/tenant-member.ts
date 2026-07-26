/**
 * Requires realm JWT with **`tenant_admin`** or **`tenant_user`** (CRM and other tenant-wide member routes).
 */

import type { FastifyReply, FastifyRequest } from "fastify";

import { requireTenantContext } from "./tenant.js";
import { refreshRequestRoleFromDb } from "../lib/refresh-request-role.js";

export const requireTenantMember = async (request: FastifyRequest, reply: FastifyReply) => {
  await requireTenantContext(request, reply);
  if (reply.sent) return;

  const role = await refreshRequestRoleFromDb(request);
  if (role !== "tenant_admin" && role !== "tenant_user") {
    return reply.code(403).send({
      error: "forbidden",
      message: "Organization member access required"
    });
  }
  if (!request.tenantId) {
    return reply.code(403).send({
      error: "forbidden",
      message: "Tenant context required"
    });
  }
};
