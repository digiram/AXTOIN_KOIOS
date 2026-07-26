/**
 * Platform-wide endpoints (JWT must be **platform super admin** — no tenant realm).
 */

import argon2 from "argon2";
import type { FastifyInstance } from "fastify";

import {
  ensurePlatformGeolocationSettingsRow,
  ensurePlatformModuleSettingsRow,
  ensureSystemRelationshipTypesForTenant,
  findOrCreateTenantByName,
  findTenantByExactName,
  findTenantById,
  findUserByTenantEmail,
  getTenantGeneralSettings,
  getUserRoleById,
  getUserTenantIdAndRoleById,
  insertUser,
  listPlatformTenants,
  listPlatformUsers,
  type PlatformModuleSettingsPatch,
  resetUserMfaEnrollment,
  upsertPlatformGeolocationSettingsRow,
  upsertPlatformModuleSettingsRow
} from "@starter/db";
import {
  platformGeolocationPutBodySchema,
  platformJobQueueIdParamsSchema,
  platformJobsListQuerySchema,
  platformModuleSettingsPutBodySchema,
  platformTenantsQuerySchema,
  platformUserCreateBodySchema,
  platformUserIdParamsSchema,
  platformUsersQuerySchema,
  queueStrategyFromEnv,
  type PlatformJobQueueId
} from "@starter/shared";

import {
  getQueueCounts,
  listJobsForQueue,
  normalizeQueueCounts,
  resolveEmailQueueName
} from "../lib/job-queue-inspection.js";
import { deliverProvisionedUserCredentials } from "../lib/admin-provision-user-flow.js";
import { enqueuePlatformQueueTestJob, enqueueWelcomeEmail } from "../lib/email-queue.js";
import { enqueueInvoicingLifecycleScan, resolveInvoicingLifecycleQueueName } from "../lib/invoicing-lifecycle-queue.js";
import { enqueueMailboxSyncScan, resolveMailboxSyncQueueName } from "../lib/mailbox-queue.js";
import { enqueueSubscriptionBillingRenewalScan, resolveSubscriptionBillingQueueName } from "../lib/subscription-billing-queue.js";
import { runAdminPasswordReset } from "../lib/admin-password-reset-flow.js";
import { generateTemporaryPassword } from "../lib/generate-temp-password.js";
import { handleGeocodeSearch, registerGeocodeRateLimit } from "../lib/geocode-route.js";
import { requireFreshSuperAdmin } from "../plugins/authorize-fresh.js";
import { requireSuperAdmin } from "../plugins/super-admin.js";

const resolvePlatformQueueBullmqName = (id: PlatformJobQueueId): string => {
  switch (id) {
    case "email":
      return resolveEmailQueueName();
    case "subscription-billing":
      return resolveSubscriptionBillingQueueName();
    case "invoicing-lifecycle":
      return resolveInvoicingLifecycleQueueName();
    case "mail-sync":
      return resolveMailboxSyncQueueName();
    default:
      return id;
  }
};

const platformJobQueueIds: PlatformJobQueueId[] = ["email", "subscription-billing", "invoicing-lifecycle", "mail-sync"];

export const registerPlatformRoutes = async (app: FastifyInstance) => {
  app.get(
    "/job-queues",
    { preHandler: requireSuperAdmin },
    async (_request, reply) => {
      try {
        const queues = await Promise.all(
          platformJobQueueIds.map(async (id) => {
            const raw = await getQueueCounts(id);
            return {
              id,
              bullmqName: resolvePlatformQueueBullmqName(id),
              counts: normalizeQueueCounts(raw as Record<string, number>)
            };
          })
        );
        return { queues, queueStrategy: queueStrategyFromEnv() };
      } catch (err) {
        app.log.warn({ err }, "platform job-queues: job queue inspection failed");
        return reply.code(503).send({
          error: "service_unavailable",
          message: "Could not read job queues. Check QUEUE_STRATEGY/REDIS_URL and that the worker queue names match this API."
        });
      }
    }
  );

  app.get(
    "/job-queues/:queueId/jobs",
    { preHandler: requireSuperAdmin },
    async (request, reply) => {
      const parsedParams = platformJobQueueIdParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.code(400).send({ error: "validation_error", message: parsedParams.error.message });
      }
      const parsedQuery = platformJobsListQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.code(400).send({ error: "validation_error", message: parsedQuery.error.message });
      }
      const { queueId } = parsedParams.data;
      const q = parsedQuery.data;
      try {
        const jobs = await listJobsForQueue(queueId, q.state, q.start, q.limit);
        return {
          jobs,
          meta: { queueId, state: q.state, start: q.start, limit: q.limit }
        };
      } catch (err) {
        app.log.warn({ err, queueId }, "platform job list: job queue inspection failed");
        return reply.code(503).send({
          error: "service_unavailable",
          message: "Could not list jobs. Check QUEUE_STRATEGY/REDIS_URL and queue connectivity."
        });
      }
    }
  );

  app.post(
    "/job-queues/:queueId/test-job",
    { preHandler: requireSuperAdmin },
    async (request, reply) => {
      const parsedParams = platformJobQueueIdParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.code(400).send({ error: "validation_error", message: parsedParams.error.message });
      }
      const { queueId } = parsedParams.data;
      try {
        const { jobId } =
          queueId === "invoicing-lifecycle"
            ? await enqueueInvoicingLifecycleScan()
            : queueId === "mail-sync"
              ? await enqueueMailboxSyncScan()
            : queueId === "subscription-billing"
              ? await enqueueSubscriptionBillingRenewalScan()
              : await enqueuePlatformQueueTestJob();
        return { queueId, jobId };
      } catch (err) {
        app.log.warn({ err, queueId }, "platform test job enqueue failed");
        return reply.code(503).send({
          error: "service_unavailable",
          message: "Could not enqueue test job. Check QUEUE_STRATEGY/REDIS_URL and worker queue alignment."
        });
      }
    }
  );

  app.get(
    "/users",
    { preHandler: requireSuperAdmin },
    async (request, reply) => {
      const parsed = platformUsersQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
      }

      const q = parsed.data;
      const result = await listPlatformUsers({
        page: q.page,
        pageSize: q.pageSize,
        sort: q.sort,
        order: q.order,
        q: q.q,
        role: q.role,
        realm: q.realm
      });

      return {
        users: result.rows.map((row) => ({
          id: row.id,
          tenantId: row.tenantId,
          tenantName: row.tenantName,
          email: row.email,
          displayName: row.displayName,
          role: row.role,
          createdAt: row.createdAt.toISOString()
        })),
        total: result.total,
        page: q.page,
        pageSize: q.pageSize
      };
    }
  );

  app.get(
    "/tenants",
    { preHandler: requireSuperAdmin },
    async (request, reply) => {
      const parsed = platformTenantsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
      }
      const q = parsed.data;
      const result = await listPlatformTenants({
        page: q.page,
        pageSize: q.pageSize,
        q: q.q
      });
      return {
        tenants: result.rows.map((row) => ({
          id: row.id,
          name: row.name,
          createdAt: row.createdAt.toISOString()
        })),
        total: result.total,
        page: q.page,
        pageSize: q.pageSize
      };
    }
  );

  app.post(
    "/users",
    { preHandler: requireFreshSuperAdmin },
    async (request, reply) => {
      const parsed = platformUserCreateBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
      }
      const b = parsed.data;
      const email = b.email.trim().toLowerCase();

      let tenantId: string;
      let tenantName: string;
      let tenantCreated = false;

      if (b.tenantId) {
        const tenant = await findTenantById(b.tenantId);
        if (!tenant) {
          return reply.code(404).send({ error: "not_found", message: "Tenant not found." });
        }
        tenantId = tenant.id;
        tenantName = tenant.name;
      } else {
        const name = b.tenantName!.trim();
        const existing = await findTenantByExactName(name);
        if (existing) {
          tenantId = existing.id;
          tenantName = existing.name;
        } else {
          const created = await findOrCreateTenantByName(name);
          tenantId = created.id;
          tenantName = name;
          tenantCreated = true;
          await ensureSystemRelationshipTypesForTenant(tenantId);
        }
      }

      const existingUser = await findUserByTenantEmail(tenantId, email);
      if (existingUser) {
        return reply.code(409).send({
          error: "conflict",
          message: "A user with this email already exists in the selected organization."
        });
      }

      const temporaryPassword = generateTemporaryPassword(8);
      const passwordHash = await argon2.hash(temporaryPassword);

      const delivery = await deliverProvisionedUserCredentials({
        email,
        temporaryPassword,
        nodeEnv: process.env.NODE_ENV ?? "development",
        log: request.log
      });
      if (delivery.status !== 200) {
        return reply.code(delivery.status).send(delivery.body);
      }

      const user = await insertUser({
        tenantId,
        email,
        passwordHash,
        displayName: b.displayName ?? null,
        role: b.role
      });

      await enqueueWelcomeEmail({ userId: user.id, tenantId });

      const createdAt = new Date().toISOString();
      const userJson = {
        id: user.id,
        tenantId,
        tenantName,
        email,
        displayName: b.displayName ?? null,
        role: user.role,
        createdAt
      };

      const deliveryBody = delivery.body;
      if ("temporaryPassword" in deliveryBody) {
        return {
          user: userJson,
          tenantCreated,
          temporaryPassword: deliveryBody.temporaryPassword
        };
      }
      if ("passwordSent" in deliveryBody && deliveryBody.passwordSent) {
        return {
          user: userJson,
          tenantCreated,
          passwordSent: true,
          message: deliveryBody.message
        };
      }
      return {
        user: userJson,
        tenantCreated,
        ...deliveryBody
      };
    }
  );

  app.post(
    "/users/:userId/reset-password",
    { preHandler: requireFreshSuperAdmin },
    async (request, reply) => {
      const parsed = platformUserIdParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
      }
      const { userId } = parsed.data;

      const role = await getUserRoleById(userId);
      if (role === undefined) {
        return reply.code(404).send({ error: "not_found", message: "User not found" });
      }
      if (role === "super_admin") {
        return reply.code(403).send({
          error: "forbidden",
          message: "Super admin passwords cannot be reset from the app; configure via environment variables."
        });
      }

      const temporaryPassword = generateTemporaryPassword(8);
      const passwordHash = await argon2.hash(temporaryPassword);

      const afterPasswordUpdated = async () => {
        const scope = await getUserTenantIdAndRoleById(userId);
        if (scope) {
          if (scope.role === "super_admin") {
            await resetUserMfaEnrollment(userId, false);
          } else if (scope.tenantId) {
            const tenant = await getTenantGeneralSettings(scope.tenantId);
            await resetUserMfaEnrollment(userId, tenant?.mfaEnforced === true);
          } else {
            await resetUserMfaEnrollment(userId, false);
          }
        }
      };

      const outcome = await runAdminPasswordReset({
        userId,
        temporaryPassword,
        passwordHash,
        nodeEnv: process.env.NODE_ENV ?? "development",
        log: request.log,
        afterPasswordUpdated,
        actorUserId: request.userId,
        requestId: request.requestId
      });
      if (outcome.status !== 200) {
        return reply.code(outcome.status).send(outcome.body);
      }
      return outcome.body;
    }
  );

  app.get(
    "/features/modules",
    { preHandler: requireSuperAdmin },
    async (_request, _reply) => {
      const row = await ensurePlatformModuleSettingsRow();
      return {
        crmEnabled: row.crmEnabled,
        hrmEnabled: row.hrmEnabled,
        salesFunnelEnabled: row.salesFunnelEnabled,
        companySubscriptionsEnabled: row.companySubscriptionsEnabled,
        invoicingEnabled: row.invoicingEnabled,
        mailboxEnabled: row.mailboxEnabled,
        crmRequiredForSales: true,
        selfRegisterEnabled: row.selfRegisterEnabled,
        mfaTotpEnabled: row.mfaTotpEnabled,
        updatedAt: row.updatedAt.toISOString()
      };
    }
  );

  app.put(
    "/features/modules",
    { preHandler: requireSuperAdmin },
    async (request, reply) => {
      const parsed = platformModuleSettingsPutBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
      }
      const patch: PlatformModuleSettingsPatch = {};
      if (parsed.data.crmEnabled !== undefined) patch.crmEnabled = parsed.data.crmEnabled;
      if (parsed.data.hrmEnabled !== undefined) patch.hrmEnabled = parsed.data.hrmEnabled;
      if (parsed.data.salesFunnelEnabled !== undefined) {
        patch.salesFunnelEnabled = parsed.data.salesFunnelEnabled;
      }
      if (parsed.data.companySubscriptionsEnabled !== undefined) {
        patch.companySubscriptionsEnabled = parsed.data.companySubscriptionsEnabled;
      }
      if (parsed.data.invoicingEnabled !== undefined) {
        patch.invoicingEnabled = parsed.data.invoicingEnabled;
      }
      if (parsed.data.mailboxEnabled !== undefined) {
        patch.mailboxEnabled = parsed.data.mailboxEnabled;
      }
      if (parsed.data.selfRegisterEnabled !== undefined) patch.selfRegisterEnabled = parsed.data.selfRegisterEnabled;
      if (parsed.data.mfaTotpEnabled !== undefined) patch.mfaTotpEnabled = parsed.data.mfaTotpEnabled;
      try {
        await upsertPlatformModuleSettingsRow(patch);
      } catch (e) {
        if (e instanceof Error && e.message === "crm_required_for_sales") {
          return reply.code(400).send({
            error: "crm_required",
            message: "Enable the CRM module before enabling Sales."
          });
        }
        throw e;
      }
      const row = await ensurePlatformModuleSettingsRow();
      return {
        crmEnabled: row.crmEnabled,
        hrmEnabled: row.hrmEnabled,
        salesFunnelEnabled: row.salesFunnelEnabled,
        companySubscriptionsEnabled: row.companySubscriptionsEnabled,
        invoicingEnabled: row.invoicingEnabled,
        mailboxEnabled: row.mailboxEnabled,
        crmRequiredForSales: true,
        selfRegisterEnabled: row.selfRegisterEnabled,
        mfaTotpEnabled: row.mfaTotpEnabled,
        updatedAt: row.updatedAt.toISOString()
      };
    }
  );

  app.get(
    "/integrations/geolocation",
    { preHandler: requireSuperAdmin },
    async (_request, _reply) => {
      const row = await ensurePlatformGeolocationSettingsRow();
      return {
        nominatimBaseUrl: row.nominatimBaseUrl,
        nominatimContactEmail: row.nominatimContactEmail,
        nominatimEnabled: row.nominatimEnabled,
        updatedAt: row.updatedAt.toISOString()
      };
    }
  );

  app.put(
    "/integrations/geolocation",
    { preHandler: requireSuperAdmin },
    async (request, reply) => {
      const parsed = platformGeolocationPutBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
      }
      const emailRaw = parsed.data.nominatimContactEmail;
      const nominatimContactEmail =
        emailRaw === undefined || emailRaw === null || emailRaw.trim() === "" ? null : emailRaw.trim();
      await upsertPlatformGeolocationSettingsRow({
        nominatimBaseUrl: parsed.data.nominatimBaseUrl.trim(),
        nominatimContactEmail,
        nominatimEnabled: parsed.data.nominatimEnabled
      });
      const row = await ensurePlatformGeolocationSettingsRow();
      return {
        nominatimBaseUrl: row.nominatimBaseUrl,
        nominatimContactEmail: row.nominatimContactEmail,
        nominatimEnabled: row.nominatimEnabled,
        updatedAt: row.updatedAt.toISOString()
      };
    }
  );

  await app.register(
    async (scope) => {
      scope.addHook("preHandler", requireSuperAdmin);
      await registerGeocodeRateLimit(scope, "platform");
      scope.get("/integrations/geolocation/test", handleGeocodeSearch);
    },
    { prefix: "" }
  );
};
