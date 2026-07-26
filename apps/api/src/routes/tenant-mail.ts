/**
 * Tenant-admin mail: optional SMTP settings with platform fallback when host/from email are empty.
 */

import type { FastifyInstance } from "fastify";

import {
  getTenantSmtpSettingsRow,
  isTenantSmtpConfigured,
  resolveEffectiveSmtpForTenant,
  sealTenantSmtpPasswordAtRest,
  upsertTenantSmtpSettingsRow
} from "@starter/db";
import { mailSmtpTestBodySchema, tenantMailSmtpPutBodySchema } from "@starter/shared";

import { executeSmtpTestSend, validateSmtpRowForTest } from "../lib/smtp-test-send.js";
import { requireFreshTenantAdmin } from "../plugins/authorize-fresh.js";

const iso = (d: Date) => d.toISOString();

const smtpGetResponse = async (tenantId: string) => {
  const row = await getTenantSmtpSettingsRow(tenantId);
  const configured = isTenantSmtpConfigured(row);
  const effective = await resolveEffectiveSmtpForTenant(tenantId);
  return {
    host: row?.host ?? "",
    port: row?.port ?? 587,
    secure: row?.secure ?? false,
    username: row?.username ?? null,
    hasPassword: Boolean(row?.passwordEncrypted?.trim()),
    fromName: row?.fromName ?? "",
    fromEmail: row?.fromEmail ?? "",
    smtpEnabled: row?.smtpEnabled ?? true,
    configured,
    usingPlatformFallback: !configured,
    effectiveSource: effective.source,
    updatedAt: row ? iso(row.updatedAt) : null
  };
};

export const registerTenantMailRoutes = async (app: FastifyInstance) => {
  app.get(
    "/mail/smtp",
    { preHandler: requireFreshTenantAdmin },
    async (request) => {
      const tenantId = request.tenantId!;
      return smtpGetResponse(tenantId);
    }
  );

  app.put(
    "/mail/smtp",
    { preHandler: requireFreshTenantAdmin },
    async (request, reply) => {
      const parsed = tenantMailSmtpPutBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
      }
      const tenantId = request.tenantId!;
      const b = parsed.data;

      let passwordEncrypted: string | null | undefined;
      if (b.password !== undefined) {
        if (b.password === "") {
          passwordEncrypted = null;
        } else {
          try {
            passwordEncrypted = await sealTenantSmtpPasswordAtRest(tenantId, b.password);
          } catch {
            return reply.code(400).send({
              error: "configuration_error",
              message: "Set FIELD_ENCRYPTION_KEY (32-byte base64) before storing SMTP passwords."
            });
          }
        }
      }

      await upsertTenantSmtpSettingsRow(tenantId, {
        host: b.host,
        port: b.port,
        secure: b.secure,
        username: b.username ?? null,
        passwordEncrypted,
        fromName: b.fromName,
        fromEmail: b.fromEmail,
        smtpEnabled: b.smtpEnabled
      });

      return smtpGetResponse(tenantId);
    }
  );

  app.post(
    "/mail/smtp/test",
    { preHandler: requireFreshTenantAdmin },
    async (request, reply) => {
      const parsed = mailSmtpTestBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
      }
      const tenantId = request.tenantId!;
      const { row, source } = await resolveEffectiveSmtpForTenant(tenantId);
      if (!row) {
        return reply.code(500).send({ error: "server_error", message: "SMTP settings are not available." });
      }

      const validation = validateSmtpRowForTest(
        row,
        source === "tenant"
          ? "SMTP delivery is disabled for this organization — turn it on before sending a test."
          : "SMTP delivery is disabled at the platform — ask a platform operator to enable it, or configure your own SMTP."
      );
      if (validation) {
        return reply.code(validation.status).send({ error: validation.error, message: validation.message });
      }

      try {
        const templateError = await executeSmtpTestSend({
          row,
          to: parsed.data.to,
          subjectSuffix: source === "platform" ? " — platform SMTP" : "",
          smtpScope: source === "tenant" ? { tenantId } : {},
          seedWelcomeTemplateIfMissing: false
        });
        if (templateError) {
          return reply.code(templateError.status).send({
            error: templateError.error,
            message: templateError.message
          });
        }
      } catch (err) {
        app.log.warn({ err, tenantId, source }, "tenant mail smtp test failed");
        const message =
          err instanceof Error ? err.message : "SMTP send failed — verify host, port, TLS, and credentials.";
        return reply.code(502).send({ error: "smtp_error", message });
      }

      return { ok: true, source };
    }
  );
};
