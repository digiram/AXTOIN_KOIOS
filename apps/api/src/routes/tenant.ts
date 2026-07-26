/**
 * Tenant-scoped endpoints for realm **tenant administrators** — lists and actions apply only to users
 * whose **`tenant_id`** matches the JWT (`requireTenantAdmin`).
 */

import argon2 from "argon2";
import type { FastifyInstance } from "fastify";

import {
  clearUserModuleRole,
  ensurePlatformModuleSettingsRow,
  getTenantGeneralSettings,
  getUserTenantIdAndRoleById,
  incrementUserAccessTokenVersionById,
  listModuleRolesForUsers,
  listTenantUsers,
  resetUserMfaEnrollment,
  setUserModuleRole,
  updateTenantMfaEnforced,
  updateTenantRealmSelfRegisterEnabled
} from "@starter/db";
import {
  moduleRoleSchema,
  TENANT_MODULE_KEYS,
  tenantRealmGeneralPutBodySchema,
  tenantUserIdParamsSchema,
  tenantUserModuleRolesPatchSchema,
  tenantUsersQuerySchema,
  type TenantModuleKey
} from "@starter/shared";

import { runAdminPasswordReset } from "../lib/admin-password-reset-flow.js";
import { logSecurityEvent } from "../lib/security-audit-log.js";
import { generateTemporaryPassword } from "../lib/generate-temp-password.js";
import { requireFreshTenantAdmin } from "../plugins/authorize-fresh.js";

export const registerTenantRoutes = async (app: FastifyInstance) => {
  app.get(
    "/settings/general",
    { preHandler: requireFreshTenantAdmin },
    async (request, reply) => {
      const tenantId = request.tenantId!;
      const row = await getTenantGeneralSettings(tenantId);
      if (!row) {
        return reply.code(404).send({ error: "not_found", message: "Tenant not found." });
      }
      const modules = await ensurePlatformModuleSettingsRow();
      return {
        realmSelfRegisterEnabled: row.realmSelfRegisterEnabled,
        mfaEnforced: row.mfaEnforced,
        mfaFeatureEnabled: modules.mfaTotpEnabled
      };
    }
  );

  app.put(
    "/settings/general",
    { preHandler: requireFreshTenantAdmin },
    async (request, reply) => {
      const parsed = tenantRealmGeneralPutBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
      }
      const tenantId = request.tenantId!;
      const existing = await getTenantGeneralSettings(tenantId);
      if (!existing) {
        return reply.code(404).send({ error: "not_found", message: "Tenant not found." });
      }
      if (parsed.data.realmSelfRegisterEnabled !== undefined) {
        await updateTenantRealmSelfRegisterEnabled(tenantId, parsed.data.realmSelfRegisterEnabled);
      }
      if (parsed.data.mfaEnforced !== undefined) {
        const modules = await ensurePlatformModuleSettingsRow();
        if (parsed.data.mfaEnforced && !modules.mfaTotpEnabled) {
          return reply.code(403).send({
            error: "forbidden",
            message: "Multi-factor authentication must be enabled by a platform operator before it can be enforced."
          });
        }
        await updateTenantMfaEnforced(tenantId, parsed.data.mfaEnforced);
      }
      const row = await getTenantGeneralSettings(tenantId);
      if (!row) {
        return reply.code(500).send({ error: "server_error", message: "Could not read settings after update." });
      }
      const modules = await ensurePlatformModuleSettingsRow();
      return {
        realmSelfRegisterEnabled: row.realmSelfRegisterEnabled,
        mfaEnforced: row.mfaEnforced,
        mfaFeatureEnabled: modules.mfaTotpEnabled
      };
    }
  );

  app.post(
    "/users/:userId/mfa-reset",
    { preHandler: requireFreshTenantAdmin },
    async (request, reply) => {
      const parsed = tenantUserIdParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
      }
      const tenantId = request.tenantId!;
      const scope = await getUserTenantIdAndRoleById(parsed.data.userId);
      if (!scope || scope.tenantId !== tenantId) {
        return reply.code(404).send({ error: "not_found", message: "User not found in this organization." });
      }
      const row = await getTenantGeneralSettings(tenantId);
      const enforced = row?.mfaEnforced === true;
      const out = await resetUserMfaEnrollment(parsed.data.userId, enforced);
      return { ok: true, mfaGraceExpiresAt: out.mfaGraceExpiresAt };
    }
  );

  /** Same as `mfa-reset`; prefer bundling via `POST .../reset-password` in normal admin flows. */
  app.post(
    "/users/:userId/mfa-unblock",
    { preHandler: requireFreshTenantAdmin },
    async (request, reply) => {
      const parsed = tenantUserIdParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
      }
      const tenantId = request.tenantId!;
      const scope = await getUserTenantIdAndRoleById(parsed.data.userId);
      if (!scope || scope.tenantId !== tenantId) {
        return reply.code(404).send({ error: "not_found", message: "User not found in this organization." });
      }
      const row = await getTenantGeneralSettings(tenantId);
      const enforced = row?.mfaEnforced === true;
      const out = await resetUserMfaEnrollment(parsed.data.userId, enforced);
      return { ok: true, mfaGraceExpiresAt: out.mfaGraceExpiresAt };
    }
  );

  app.get(
    "/users",
    { preHandler: requireFreshTenantAdmin },
    async (request, reply) => {
      const parsed = tenantUsersQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
      }

      const q = parsed.data;
      const tenantId = request.tenantId!;

      const result = await listTenantUsers({
        tenantId,
        page: q.page,
        pageSize: q.pageSize,
        sort: q.sort,
        order: q.order,
        q: q.q,
        role: q.role
      });

      const userIds = result.rows.map((row) => row.id);
      const moduleRolesByUser = await listModuleRolesForUsers(tenantId, userIds);

      return {
        users: result.rows.map((row) => ({
          id: row.id,
          tenantId: row.tenantId,
          tenantName: row.tenantName,
          email: row.email,
          displayName: row.displayName,
          role: row.role,
          moduleRoles: moduleRolesByUser.get(row.id) ?? {},
          createdAt: row.createdAt.toISOString()
        })),
        total: result.total,
        page: q.page,
        pageSize: q.pageSize
      };
    }
  );

  app.patch(
    "/users/:userId/module-roles",
    { preHandler: requireFreshTenantAdmin },
    async (request, reply) => {
      const params = tenantUserIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send({ error: "validation_error", message: params.error.message });
      }
      const body = tenantUserModuleRolesPatchSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: "validation_error", message: body.error.message });
      }

      const tenantId = request.tenantId!;
      const { userId } = params.data;
      const scope = await getUserTenantIdAndRoleById(userId);
      if (!scope || scope.tenantId !== tenantId) {
        return reply.code(404).send({ error: "not_found", message: "User not found in this organization." });
      }
      if (scope.role !== "tenant_user") {
        return reply.code(403).send({
          error: "forbidden",
          message: "Module roles apply to members only. Tenant administrators have full access."
        });
      }

      for (const module of TENANT_MODULE_KEYS) {
        const value = body.data[module];
        if (value === undefined) continue;
        if (value === null) {
          await clearUserModuleRole({ tenantId, userId, module });
          continue;
        }
        const roleParsed = moduleRoleSchema.safeParse(value);
        if (!roleParsed.success) {
          return reply.code(400).send({
            error: "validation_error",
            message: `Invalid ${module} role.`
          });
        }
        await setUserModuleRole({
          tenantId,
          userId,
          module: module as TenantModuleKey,
          role: roleParsed.data
        });
      }

      await incrementUserAccessTokenVersionById(userId);
      logSecurityEvent(request.log, {
        action: "tenant.module_roles_updated",
        actorUserId: request.userId,
        targetUserId: userId,
        tenantId,
        requestId: request.requestId,
        outcome: "ok"
      });
      const moduleRoles = (await listModuleRolesForUsers(tenantId, [userId])).get(userId) ?? {};
      return { ok: true, moduleRoles };
    }
  );

  app.post(
    "/users/:userId/reset-password",
    { preHandler: requireFreshTenantAdmin },
    async (request, reply) => {
      const parsed = tenantUserIdParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
      }
      const { userId } = parsed.data;
      const tenantId = request.tenantId!;

      const scope = await getUserTenantIdAndRoleById(userId);
      if (scope === undefined) {
        return reply.code(404).send({ error: "not_found", message: "User not found" });
      }
      if (scope.tenantId !== tenantId) {
        return reply.code(403).send({
          error: "forbidden",
          message: "That user is not in your organization."
        });
      }
      if (scope.role === "super_admin") {
        return reply.code(403).send({
          error: "forbidden",
          message: "Super admin passwords cannot be reset from the app; configure via environment variables."
        });
      }
      if (scope.role === "tenant_admin") {
        return reply.code(403).send({
          error: "forbidden",
          message: "Tenant administrator passwords cannot be reset from this overview."
        });
      }

      const temporaryPassword = generateTemporaryPassword(8);
      const passwordHash = await argon2.hash(temporaryPassword);

      const tenantSettings = await getTenantGeneralSettings(tenantId);
      const afterPasswordUpdated = async () => {
        await resetUserMfaEnrollment(userId, tenantSettings?.mfaEnforced === true);
      };

      const outcome = await runAdminPasswordReset({
        userId,
        temporaryPassword,
        passwordHash,
        nodeEnv: process.env.NODE_ENV ?? "development",
        log: request.log,
        afterPasswordUpdated,
        tenantId,
        actorUserId: request.userId,
        requestId: request.requestId
      });
      if (outcome.status !== 200) {
        return reply.code(outcome.status).send(outcome.body);
      }
      return outcome.body;
    }
  );
};
