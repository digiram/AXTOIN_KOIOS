/**
 * Tenant CRM geocode endpoints (Nominatim) — mounted under `/tenant/crm` by `registerTenantCrmRoutes`.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { ensurePlatformModuleSettingsRow } from "@starter/db";

import { handleGeocodeSearch, handleGeocodeStatus, registerGeocodeRateLimit } from "../lib/geocode-route.js";
import { requireCrmModulePermission } from "../plugins/crm-permission.js";
import { requireTenantMember } from "../plugins/tenant-member.js";
import { requireTenantRealm } from "../plugins/tenant-realm.js";
import { requireTenantContext } from "../plugins/tenant.js";

const requireCrmModuleEnabled = async (_request: FastifyRequest, reply: FastifyReply) => {
  const row = await ensurePlatformModuleSettingsRow();
  if (!row.crmEnabled) {
    return reply.code(403).send({
      error: "feature_disabled",
      message: "CRM is disabled by the platform administrator."
    });
  }
};

export const registerTenantCrmGeocodeRoutes = async (app: FastifyInstance) => {
  await app.register(
    async (scope) => {
      scope.addHook("preHandler", requireTenantContext);
      scope.addHook("preHandler", requireTenantRealm);
      scope.addHook("preHandler", requireTenantMember);
      scope.addHook("preHandler", requireCrmModuleEnabled);
      scope.addHook("preHandler", requireCrmModulePermission);
      await registerGeocodeRateLimit(scope, "crm");

      scope.get("/geocode/search", handleGeocodeSearch);
      scope.get("/geocode/status", async () => handleGeocodeStatus());
    },
    { prefix: "/crm" }
  );
};
