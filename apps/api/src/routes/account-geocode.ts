/**
 * Account geocode — per-user rate limits (mounted under `/account` by `registerAccountRoutes`).
 */

import type { FastifyInstance } from "fastify";

import { handleGeocodeSearch, handleGeocodeStatus, registerGeocodeRateLimit } from "../lib/geocode-route.js";
import { requireTenantContext } from "../plugins/tenant.js";

export const registerAccountGeocodeRoutes = async (app: FastifyInstance): Promise<void> => {
  await app.register(async (scope) => {
    scope.addHook("preHandler", requireTenantContext);
    await registerGeocodeRateLimit(scope, "account");

    scope.get("/geocode/status", async (request, reply) => {
      if (!request.userId) {
        return reply.code(401).send({ error: "unauthorized", message: "Valid access token required" });
      }
      return handleGeocodeStatus();
    });

    scope.get("/geocode/search", async (request, reply) => {
      if (!request.userId) {
        return reply.code(401).send({ error: "unauthorized", message: "Valid access token required" });
      }
      return handleGeocodeSearch(request, reply);
    });
  });
};
