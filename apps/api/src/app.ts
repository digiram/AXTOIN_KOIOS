/**
 * Fastify application factory — shared by HTTP entrypoint and integration tests (`inject`).
 */

import websocket from "@fastify/websocket";
import cookie from "@fastify/cookie";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import type { FastifyBaseLogger } from "fastify";

import { registerApplicationRoutes } from "./app-routes.js";
import { buildCorsOptions } from "./lib/cors-config.js";
import { buildHelmetOptions, registerSupplementalSecurityHeaders } from "./lib/helmet-config.js";
import {
  globalRateLimitMax,
  globalRateLimitTimeWindowMs,
  isTenantModuleAvailabilityRoute
} from "./lib/http-rate-limit-config.js";
import { createResponseHeaderBudgetHook } from "./lib/response-header-budget.js";
import { registerCsrfProtection } from "./plugins/csrf.js";
import { registerRequestContext } from "./plugins/request-context.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerMetricsRoutes } from "./routes/metrics.js";
import { registerOpenApiRoutes } from "./routes/openapi.js";
import { registerStripeWebhookRoutes } from "./routes/stripe-webhooks.js";

export type BuildAppOptions = {
  jwtAccessSecret: string;
  logHttp?: boolean;
  loggerInstance?: FastifyBaseLogger;
};

export const buildApp = async (opts: BuildAppOptions): Promise<FastifyInstance> => {
  const app = Fastify({
    loggerInstance: opts.loggerInstance,
    disableRequestLogging: opts.logHttp === false
  });

  // Root-scope guard: warn when any response's serialized headers exceed the byte budget. Hosts with a
  // hard per-response header limit (e.g. shared hosting) drop bloated headers — keep CSP/cookies lean.
  app.addHook("onSend", createResponseHeaderBudgetHook());

  await app.register(registerRequestContext);
  await app.register(registerHealthRoutes);
  await app.register(registerMetricsRoutes);
  await app.register(registerOpenApiRoutes);
  await app.register(helmet, buildHelmetOptions());
  registerSupplementalSecurityHeaders(app);
  await app.register(cookie);
  await app.register(cors, buildCorsOptions());
  await app.register(registerStripeWebhookRoutes);
  await app.register(registerCsrfProtection);

  await app.register(rateLimit, {
    max: (request: FastifyRequest) => globalRateLimitMax(request.url),
    timeWindow: globalRateLimitTimeWindowMs(),
    nameSpace: "global",
    allowList: (request) =>
      request.method === "GET" && isTenantModuleAvailabilityRoute(request.url)
  });

  await app.register(jwt, { secret: opts.jwtAccessSecret });

  await app.register(multipart, {
    limits: { fileSize: 5 * 1024 * 1024 }
  });

  await app.register(websocket);

  await app.register(registerApplicationRoutes, { prefix: "/v1" });

  return app;
};
