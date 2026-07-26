/**
 * Versioned application routes (`/v1/*`).
 */

import type { FastifyInstance, FastifyRequest } from "fastify";
import rateLimit from "@fastify/rate-limit";

import {
  authRateLimitKey,
  authRateLimitMax,
  authRateLimitTimeWindowMs,
  isTenantModuleAvailabilityRoute,
  tenantRateLimitMax,
  tenantRateLimitTimeWindowMs
} from "./lib/http-rate-limit-config.js";
import { incrementCounter } from "./lib/metrics.js";
import { registerAccountRoutes } from "./routes/account.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerPlatformMailRoutes } from "./routes/platform-mail.js";
import { registerPlatformPaymentRoutes } from "./routes/platform-payments.js";
import { registerPlatformSubscriptionRoutes } from "./routes/platform-subscriptions.js";
import { registerPlatformRoutes } from "./routes/platform.js";
import { registerPlatformJobQueuesWebSocket } from "./routes/platform-job-queues-ws.js";
import { registerPlatformWsTicketRoutes } from "./routes/platform-ws-ticket.js";
import { registerTenantCrmRoutes } from "./routes/tenant-crm.js";
import { registerTenantWorkforceRoutes } from "./routes/tenant-workforce.js";
import { registerTenantCompanySubscriptionsRoutes } from "./routes/tenant-company-subscriptions.js";
import { registerTenantInvoicingRoutes } from "./routes/tenant-invoicing.js";
import { registerTenantSalesRoutes } from "./routes/tenant-sales.js";
import { registerTenantMailRoutes } from "./routes/tenant-mail.js";
import {
  registerTenantMailboxOAuthRoutes,
  registerTenantMailboxRoutes
} from "./routes/tenant-mailbox.js";
import { registerTenantRoutes } from "./routes/tenant.js";
import { registerTenantSubscriptionRoutes } from "./routes/tenant-subscriptions.js";
import { registerProfileRoutes } from "./routes/profile.js";
import { registerPublicInvoicingRoutes } from "./routes/public-invoicing.js";

const tenantRateLimitKey = (request: FastifyRequest): string => {
  const auth = request.headers.authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    try {
      const decoded = request.server.jwt.decode(auth.slice(7).trim()) as { tenantId?: string };
      if (decoded?.tenantId) return `tenant:${decoded.tenantId}`;
    } catch {
      /* ignore */
    }
  }
  return `ip:${request.ip}`;
};

/** Registers auth, tenant, platform, and profile routes (no `/v1` prefix — parent adds it). */
export const registerApplicationRoutes = async (app: FastifyInstance): Promise<void> => {
  app.addHook("onResponse", async (request, reply) => {
    incrementCounter("starter_http_requests_total", {
      method: request.method,
      route: request.routeOptions.url ?? request.url.split("?")[0] ?? "unknown",
      status: String(reply.statusCode)
    });
  });

  await app.register(
    async (authScope) => {
      await authScope.register(rateLimit, {
        max: authRateLimitMax(),
        timeWindow: authRateLimitTimeWindowMs(),
        nameSpace: "auth-public",
        keyGenerator: authRateLimitKey
      });
      await authScope.register(registerAuthRoutes);
    },
    { prefix: "/auth" }
  );

  await app.register(registerProfileRoutes, { prefix: "/profile" });
  await app.register(registerAccountRoutes, { prefix: "/account" });

  await app.register(
    async (publicScope) => {
      await publicScope.register(rateLimit, {
        max: authRateLimitMax(),
        timeWindow: authRateLimitTimeWindowMs(),
        nameSpace: "public-invoicing",
        keyGenerator: (request) => `ip:${request.ip}`
      });
      await publicScope.register(registerPublicInvoicingRoutes);
    },
    { prefix: "/public/invoicing" }
  );

  await app.register(
    async (tenantScope) => {
      await tenantScope.register(rateLimit, {
        max: tenantRateLimitMax(),
        timeWindow: tenantRateLimitTimeWindowMs(),
        nameSpace: "tenant",
        keyGenerator: tenantRateLimitKey,
        allowList: (request) => isTenantModuleAvailabilityRoute(request.url)
      });
      await tenantScope.register(registerTenantRoutes);
      await tenantScope.register(registerTenantMailRoutes);
      await tenantScope.register(registerTenantSubscriptionRoutes);
      await tenantScope.register(registerTenantCrmRoutes);
      await tenantScope.register(registerTenantWorkforceRoutes);
      await tenantScope.register(registerTenantCompanySubscriptionsRoutes);
      await tenantScope.register(registerTenantInvoicingRoutes);
      await tenantScope.register(registerTenantSalesRoutes);
      await tenantScope.register(registerTenantMailboxRoutes, { prefix: "/mailbox" });
      await tenantScope.register(registerTenantMailboxOAuthRoutes, { prefix: "/mailbox" });
    },
    { prefix: "/tenant" }
  );

  await app.register(
    async (platformScope) => {
      await platformScope.register(registerPlatformRoutes);
      await platformScope.register(registerPlatformWsTicketRoutes);
      await platformScope.register(registerPlatformJobQueuesWebSocket);
      await platformScope.register(registerPlatformMailRoutes);
      await platformScope.register(registerPlatformPaymentRoutes);
      await platformScope.register(registerPlatformSubscriptionRoutes);
    },
    { prefix: "/platform" }
  );
};
