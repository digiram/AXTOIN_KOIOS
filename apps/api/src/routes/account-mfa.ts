/**
 * Account MFA enrollment and management routes.
 *
 * Authenticated realm and platform-operator users enroll TOTP or email MFA,
 * inspect status, and disable factors when tenant policy allows.
 *
 * Responsibilities:
 * - Expose MFA status and enrollment endpoints under account routes
 * - Generate pending TOTP secrets and verify enrollment codes
 * - Send and confirm email-based MFA setup OTPs
 * - Disable MFA when tenant enforcement does not block removal
 *
 * Related:
 * - `routes/account.ts` — parent registrar
 * - `lib/realm-mfa-login.ts` — login-time MFA gate
 *
 * Security:
 * - Requires valid access JWT (`requireTenantContext`)
 * - Platform operators may enroll without `tenantId`
 * - TOTP secrets encrypted at rest; OTPs hashed with pepper
 * - Rate limits MFA enrollment email sends (5/hour)
 */

import { randomInt } from "node:crypto";

import type { FastifyInstance, FastifyRequest } from "fastify";
import { generateSecret, generateURI, verifySync } from "otplib";

import {
  clearTotpPending,
  confirmTotpEnrollmentPlaintext,
  countRecentMfaChallenges,
  disableAllUserMfa,
  ensurePlatformModuleSettingsRow,
  getPlatformSmtpSettingsRow,
  getTenantGeneralSettings,
  getUserMfaRowById,
  hashMfaOtp,
  insertMfaOtpChallenge,
  openTotpPendingSecretForUser,
  resolveEffectiveSmtpForTenant,
  setEmailMfaEnabled,
  setTotpPendingPlaintext,
  verifyAndConsumeMfaOtpChallenge
} from "@starter/db";
import {
  mfaEmailConfirmBodySchema,
  mfaTotpVerifyBodySchema
} from "@starter/shared";

import { sendMailHtml } from "../lib/mail-transport.js";
import { requireTenantContext } from "../plugins/tenant.js";

const MFA_ENROLL_EMAIL_PURPOSE = "mfa_enroll_email";

const mfaOtpPepper = (): string => {
  const p = process.env.MFA_OTP_PEPPER?.trim() || process.env.FIELD_ENCRYPTION_KEY?.trim();
  if (!p) throw new Error("MFA_OTP_PEPPER or FIELD_ENCRYPTION_KEY must be set");
  return p;
};

const isPlatformOperator = (request: FastifyRequest): boolean =>
  request.role === "super_admin" && !request.tenantId;

/** Registers MFA enrollment, verification, and disable routes on the account router. */
export const registerAccountMfaRoutes = (app: FastifyInstance) => {
  app.get(
    "/mfa/status",
    { preHandler: requireTenantContext },
    async (request, reply) => {
      const userId = request.userId;
      if (!userId) {
        return reply.code(401).send({ error: "unauthorized", message: "Valid access token required" });
      }

      const row = await getUserMfaRowById(userId);
      if (!row) {
        return reply.code(404).send({ error: "not_found", message: "User not found" });
      }

      if (isPlatformOperator(request)) {
        return {
          applicable: true,
          platformOperator: true,
          totpEnabled: row.mfaTotpEnabled,
          emailMfaEnabled: row.mfaEmailEnabled
        };
      }

      if (!request.tenantId) {
        return { applicable: false };
      }

      const modules = await ensurePlatformModuleSettingsRow();
      const tenant = await getTenantGeneralSettings(request.tenantId);
      return {
        applicable: true,
        platformMfaEnabled: modules.mfaTotpEnabled,
        tenantMfaEnforced: tenant?.mfaEnforced ?? false,
        totpEnabled: row.mfaTotpEnabled,
        emailMfaEnabled: row.mfaEmailEnabled,
        mfaGraceExpiresAt: row.mfaGraceExpiresAt?.toISOString() ?? null,
        mfaBlockedAt: row.mfaBlockedAt?.toISOString() ?? null
      };
    }
  );

  app.post(
    "/mfa/totp/begin",
    { preHandler: requireTenantContext },
    async (request, reply) => {
      const userId = request.userId;
      if (!userId) {
        return reply.code(401).send({ error: "unauthorized", message: "Valid access token required" });
      }

      const platformOp = isPlatformOperator(request);
      const tenantId = request.tenantId;
      if (!platformOp && !tenantId) {
        return reply.code(400).send({ error: "validation_error", message: "MFA is only available for signed-in accounts." });
      }

      if (!platformOp) {
        const modules = await ensurePlatformModuleSettingsRow();
        if (!modules.mfaTotpEnabled) {
          return reply.code(403).send({ error: "forbidden", message: "Authenticator MFA is disabled by the platform." });
        }
      }

      const row = await getUserMfaRowById(userId);
      if (!row) {
        return reply.code(404).send({ error: "not_found", message: "User not found" });
      }

      const secret = generateSecret();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      try {
        await setTotpPendingPlaintext(userId, platformOp ? null : tenantId ?? null, secret, expiresAt);
      } catch {
        return reply.code(400).send({
          error: "configuration_error",
          message: "Set FIELD_ENCRYPTION_KEY (32-byte base64) before enrolling authenticator MFA."
        });
      }
      const otpauthUrl = generateURI({ issuer: "Starter", label: row.email, secret });
      return { secret, otpauthUrl, pendingExpiresAt: expiresAt.toISOString() };
    }
  );

  app.post(
    "/mfa/totp/verify",
    { preHandler: requireTenantContext },
    async (request, reply) => {
      const userId = request.userId;
      if (!userId) {
        return reply.code(401).send({ error: "unauthorized", message: "Valid access token required" });
      }

      const platformOp = isPlatformOperator(request);
      const tenantId = request.tenantId;
      if (!platformOp && !tenantId) {
        return reply.code(400).send({ error: "validation_error", message: "MFA is only available for signed-in accounts." });
      }

      const parsed = mfaTotpVerifyBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
      }

      if (!platformOp) {
        const modules = await ensurePlatformModuleSettingsRow();
        if (!modules.mfaTotpEnabled) {
          return reply.code(403).send({ error: "forbidden", message: "Authenticator MFA is disabled by the platform." });
        }
      }

      const row = await getUserMfaRowById(userId);
      if (!row?.mfaTotpPendingSecretEncrypted || !row.mfaTotpPendingExpiresAt) {
        return reply.code(400).send({ error: "validation_error", message: "Start setup again from the beginning." });
      }
      if (row.mfaTotpPendingExpiresAt.getTime() <= Date.now()) {
        await clearTotpPending(userId);
        return reply.code(400).send({ error: "validation_error", message: "Setup timed out. Start again." });
      }

      let secret: string;
      try {
        secret = await openTotpPendingSecretForUser(row);
      } catch {
        return reply.code(500).send({ error: "server_error", message: "Could not read pending secret." });
      }
      const ok = verifySync({
        secret,
        token: parsed.data.code.replace(/\s+/g, ""),
        epochTolerance: 2
      }).valid;
      if (!ok) {
        return reply.code(400).send({ error: "invalid_code", message: "That code does not match. Try again." });
      }
      try {
        await confirmTotpEnrollmentPlaintext(userId, platformOp ? null : tenantId ?? null, secret);
      } catch {
        return reply.code(500).send({ error: "server_error", message: "Could not store authenticator secret." });
      }
      return { ok: true, totpEnabled: true };
    }
  );

  app.post(
    "/mfa/email/send-setup",
    { preHandler: requireTenantContext },
    async (request, reply) => {
      const userId = request.userId;
      if (!userId) {
        return reply.code(401).send({ error: "unauthorized", message: "Valid access token required" });
      }

      const platformOp = isPlatformOperator(request);
      if (!platformOp && !request.tenantId) {
        return reply.code(400).send({ error: "validation_error", message: "MFA is only available for signed-in accounts." });
      }

      if (!platformOp) {
        const modules = await ensurePlatformModuleSettingsRow();
        if (!modules.mfaTotpEnabled) {
          return reply.code(403).send({ error: "forbidden", message: "MFA is disabled by the platform." });
        }
      }

      const row = await getUserMfaRowById(userId);
      if (!row) {
        return reply.code(404).send({ error: "not_found", message: "User not found" });
      }
      const since = new Date(Date.now() - 60 * 60 * 1000);
      const sent = await countRecentMfaChallenges(userId, MFA_ENROLL_EMAIL_PURPOSE, since);
      if (sent >= 5) {
        return reply.code(429).send({ error: "rate_limited", message: "Too many codes requested. Try again later." });
      }
      const code = String(randomInt(100_000, 1_000_000));
      const codeHash = hashMfaOtp(mfaOtpPepper(), userId, MFA_ENROLL_EMAIL_PURPOSE, code);
      await insertMfaOtpChallenge({
        userId,
        purpose: MFA_ENROLL_EMAIL_PURPOSE,
        codeHash,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000)
      });
      const smtp = request.tenantId
        ? (await resolveEffectiveSmtpForTenant(request.tenantId)).row
        : await getPlatformSmtpSettingsRow();
      if (!smtp) {
        return reply.code(500).send({ error: "server_error", message: "Mail is not configured." });
      }
      try {
        await sendMailHtml({
          row: smtp,
          smtpScope: request.tenantId ? { tenantId: request.tenantId } : {},
          to: row.email,
          subject: "Confirm email-based MFA",
          html: `<p>Use this code to turn on email verification for sign-in:</p><p style="font-size:22px;font-weight:bold;letter-spacing:4px">${code}</p><p>Code expires in 15 minutes.</p>`
        });
      } catch (err) {
        app.log.warn({ err }, "mfa enroll email send failed");
        return reply.code(502).send({ error: "mail_error", message: "Could not send email." });
      }
      return { ok: true };
    }
  );

  app.post(
    "/mfa/email/confirm-setup",
    { preHandler: requireTenantContext },
    async (request, reply) => {
      const userId = request.userId;
      if (!userId) {
        return reply.code(401).send({ error: "unauthorized", message: "Valid access token required" });
      }

      const platformOp = isPlatformOperator(request);
      if (!platformOp && !request.tenantId) {
        return reply.code(400).send({ error: "validation_error", message: "MFA is only available for signed-in accounts." });
      }

      const parsed = mfaEmailConfirmBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
      }

      if (!platformOp) {
        const modules = await ensurePlatformModuleSettingsRow();
        if (!modules.mfaTotpEnabled) {
          return reply.code(403).send({ error: "forbidden", message: "MFA is disabled by the platform." });
        }
      }

      const codeHash = hashMfaOtp(mfaOtpPepper(), userId, MFA_ENROLL_EMAIL_PURPOSE, parsed.data.code.replace(/\s+/g, ""));
      const ok = await verifyAndConsumeMfaOtpChallenge({ userId, purpose: MFA_ENROLL_EMAIL_PURPOSE, codeHash });
      if (!ok) {
        return reply.code(400).send({ error: "invalid_code", message: "Invalid or expired code." });
      }
      await setEmailMfaEnabled(userId, true);
      return { ok: true, emailMfaEnabled: true };
    }
  );

  app.delete(
    "/mfa",
    { preHandler: requireTenantContext },
    async (request, reply) => {
      const userId = request.userId;
      if (!userId) {
        return reply.code(401).send({ error: "unauthorized", message: "Valid access token required" });
      }
      if (request.tenantId) {
        const tenant = await getTenantGeneralSettings(request.tenantId);
        if (tenant?.mfaEnforced) {
          return reply.code(403).send({
            error: "forbidden",
            message: "Your organization requires MFA. You cannot turn it off while enforcement is on."
          });
        }
      }
      await disableAllUserMfa(userId);
      await clearTotpPending(userId);
      return { ok: true };
    }
  );
};
