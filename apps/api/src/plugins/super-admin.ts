/**
 * Requires JWT (`requireTenantContext`) **and** `role === "super_admin"` (platform operator).
 */

import type { FastifyReply, FastifyRequest } from "fastify";

import { requireTenantContext } from "./tenant.js";
import { refreshRequestRoleFromDb } from "../lib/refresh-request-role.js";

export const requireSuperAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
  await requireTenantContext(request, reply);
  if (reply.sent) return;

  const role = await refreshRequestRoleFromDb(request);
  if (role !== "super_admin") {
    return reply.code(403).send({
      error: "forbidden",
      message: "Platform administrator access required"
    });
  }
};
