/**
 * Requires a **realm** (tenant) bound session — blocks platform `super_admin` tokens from tenant-only routes.
 */

import type { FastifyReply, FastifyRequest } from "fastify";

export const requireTenantRealm = async (request: FastifyRequest, reply: FastifyReply) => {
  if (!request.tenantId) {
    return reply.code(403).send({
      error: "tenant_required",
      message: "This endpoint requires an organization (tenant) session, not a platform administrator token."
    });
  }
};
