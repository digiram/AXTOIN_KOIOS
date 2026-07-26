/**
 * Requires JWT (`requireTenantContext`) **and** `role === "tenant_admin"` with a realm **`tenantId`** on the token.
 */

import type { FastifyReply, FastifyRequest } from "fastify";

import { requireTenantContext } from "./tenant.js";
import { refreshRequestRoleFromDb } from "../lib/refresh-request-role.js";

export const requireTenantAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
  await requireTenantContext(request, reply);
  if (reply.sent) return;

  const role = await refreshRequestRoleFromDb(request);
  if (role !== "tenant_admin") {
    return reply.code(403).send({
      error: "forbidden",
      message: "Tenant administrator access required"
    });
  }
  if (!request.tenantId) {
    return reply.code(403).send({
      error: "forbidden",
      message: "Tenant context required"
    });
  }
};
