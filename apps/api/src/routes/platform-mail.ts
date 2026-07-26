/**
 * Super-admin mail module: SMTP settings (encrypted password). Welcome/test mail uses stored HTML in `platform_email_templates`.
 */

import type { FastifyInstance } from "fastify";

import {
  ensurePlatformMailSeed,
  getPlatformSmtpSettingsRow,
  sealPlatformSmtpPasswordAtRest,
  upsertPlatformSmtpSettingsRow
} from "@starter/db";
import { mailSmtpTestBodySchema, platformMailSmtpPutBodySchema } from "@starter/shared";

import { executeSmtpTestSend, validateSmtpRowForTest } from "../lib/smtp-test-send.js";
import { requireSuperAdmin } from "../plugins/super-admin.js";

const iso = (d: Date) => d.toISOString();

export const registerPlatformMailRoutes = async (app: FastifyInstance) => {
  app.addHook("onReady", async () => {
    await ensurePlatformMailSeed();
  });

  app.get(
    "/mail/smtp",
    { preHandler: requireSuperAdmin },
    async (_request, reply) => {
      const row = await getPlatformSmtpSettingsRow();
      if (!row) {
        return reply.code(500).send({ error: "server_error", message: "SMTP settings row missing" });
      }
      return {
        host: row.host,
        port: row.port,
        secure: row.secure,
        username: row.username,
        hasPassword: Boolean(row.passwordEncrypted?.trim()),
        fromName: row.fromName,
        fromEmail: row.fromEmail,
        smtpEnabled: row.smtpEnabled,
        updatedAt: iso(row.updatedAt)
      };
    }
  );

  app.put(
    "/mail/smtp",
    { preHandler: requireSuperAdmin },
    async (request, reply) => {
      const parsed = platformMailSmtpPutBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
      }
      const b = parsed.data;

      let passwordEncrypted: string | null | undefined;
      if (b.password !== undefined) {
        if (b.password === "") {
          passwordEncrypted = null;
        } else {
          try {
            passwordEncrypted = await sealPlatformSmtpPasswordAtRest(b.password);
          } catch {
            return reply.code(400).send({
              error: "configuration_error",
              message: "Set FIELD_ENCRYPTION_KEY (32-byte base64) before storing SMTP passwords."
            });
          }
        }
      }

      const existing = await getPlatformSmtpSettingsRow();
      if (!existing) {
        return reply.code(500).send({ error: "server_error", message: "SMTP settings row missing" });
      }

      await upsertPlatformSmtpSettingsRow({
        host: b.host,
        port: b.port,
        secure: b.secure,
        username: b.username ?? null,
        passwordEncrypted,
        fromName: b.fromName,
        fromEmail: b.fromEmail,
        smtpEnabled: b.smtpEnabled
      });

      const row = await getPlatformSmtpSettingsRow();
      if (!row) {
        return reply.code(500).send({ error: "server_error", message: "SMTP settings row missing" });
      }
      return {
        host: row.host,
        port: row.port,
        secure: row.secure,
        username: row.username,
        hasPassword: Boolean(row.passwordEncrypted?.trim()),
        fromName: row.fromName,
        fromEmail: row.fromEmail,
        smtpEnabled: row.smtpEnabled,
        updatedAt: iso(row.updatedAt)
      };
    }
  );

  app.post(
    "/mail/smtp/test",
    { preHandler: requireSuperAdmin },
    async (request, reply) => {
      const parsed = mailSmtpTestBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
      }

      const row = await getPlatformSmtpSettingsRow();
      if (!row) {
        return reply.code(500).send({ error: "server_error", message: "SMTP settings row missing" });
      }

      const validation = validateSmtpRowForTest(
        row,
        "SMTP delivery is disabled — turn it on in the toggle above before sending a test."
      );
      if (validation) {
        return reply.code(validation.status).send({ error: validation.error, message: validation.message });
      }

      try {
        const templateError = await executeSmtpTestSend({
          row,
          to: parsed.data.to,
          seedWelcomeTemplateIfMissing: true
        });
        if (templateError) {
          return reply.code(templateError.status).send({
            error: templateError.error,
            message: templateError.message
          });
        }
      } catch (err) {
        app.log.warn({ err }, "mail smtp test failed");
        const message =
          err instanceof Error ? err.message : "SMTP send failed — verify host, port, TLS, and credentials.";
        return reply.code(502).send({ error: "smtp_error", message });
      }

      return { ok: true };
    }
  );
};
