/**
 * Tenant-scoped profile routes — tax id stored via field-encryption middleware.
 */

import type { FastifyInstance } from "fastify";

import { getUserTaxIdAtRest, updateUserTaxIdAtRest } from "@starter/db";

import { requireTenantContext } from "../plugins/tenant.js";
import { requireTenantRealm } from "../plugins/tenant-realm.js";

export const registerProfileRoutes = async (app: FastifyInstance) => {
  app.post(
    "/tax-id",
    {
      preHandler: [requireTenantContext, requireTenantRealm]
    },
    async (request, reply) => {
      const body = request.body as { taxId?: string };
      if (!body.taxId?.trim()) {
        return reply.code(400).send({ error: "validation_error", message: "taxId is required" });
      }

      if (!request.userId || !request.tenantId) {
        return reply.code(401).send({ error: "unauthorized", message: "Valid access token required" });
      }

      try {
        await updateUserTaxIdAtRest(request.userId, request.tenantId, body.taxId.trim());
      } catch {
        return reply.code(400).send({
          error: "configuration_error",
          message: "Set FIELD_ENCRYPTION_KEY (32-byte base64) before storing encrypted profile fields."
        });
      }
      return { stored: true };
    }
  );

  app.get(
    "/tax-id",
    {
      preHandler: [requireTenantContext, requireTenantRealm]
    },
    async (request, reply) => {
      if (!request.userId || !request.tenantId) {
        return reply.code(401).send({ error: "unauthorized", message: "Valid access token required" });
      }

      try {
        const taxId = await getUserTaxIdAtRest(request.userId, request.tenantId);
        if (!taxId) {
          return reply.code(404).send({ error: "not_found", message: "Encrypted tax id was not found" });
        }
        return { taxId };
      } catch {
        return reply.code(500).send({ error: "server_error", message: "Could not read encrypted tax id." });
      }
    }
  );
};
