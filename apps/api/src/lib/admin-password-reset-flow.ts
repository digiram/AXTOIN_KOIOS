/**
 * Admin-initiated password reset: in **production**, prefer delivering the temporary password by
 * email (platform SMTP) so it never appears in JSON; non-production keeps JSON plaintext for local DX.
 */

import type { FastifyBaseLogger } from "fastify";

import { getPlatformSmtpSettingsRow, getUserEmailById, resolveEffectiveSmtpForTenant, updateUserPasswordHashById } from "@starter/db";

import { escapeHtml } from "./escape-html.js";
import { buildAdminPasswordResetResponse, type AdminPasswordResetResponseBody } from "./admin-password-reset-response.js";
import { sendMailHtml } from "./mail-transport.js";
import { logSecurityEvent } from "./security-audit-log.js";

export type AdminPasswordResetSuccessBody =
  | AdminPasswordResetResponseBody
  | { ok: true; passwordSent: true; message: string };

export type AdminPasswordResetHttpResult =
  | { status: 200; body: AdminPasswordResetSuccessBody }
  | { status: 502 | 503; body: { error: string; message: string } };

/**
 * Updates the password hash and runs `afterPasswordUpdated` (e.g. MFA reset) only after a viable
 * delivery path succeeds or non-production / emergency-plain path applies.
 */
export async function runAdminPasswordReset(params: {
  userId: string;
  temporaryPassword: string;
  passwordHash: string;
  nodeEnv: string;
  log: FastifyBaseLogger;
  afterPasswordUpdated: () => Promise<void>;
  /** When set, uses tenant SMTP with platform fallback; otherwise platform SMTP only. */
  tenantId?: string;
  actorUserId?: string;
  requestId?: string;
}): Promise<AdminPasswordResetHttpResult> {
  const { userId, temporaryPassword, passwordHash, nodeEnv, log, afterPasswordUpdated, tenantId, actorUserId, requestId } =
    params;
  const isProd = nodeEnv === "production";

  const persist = async () => {
    await updateUserPasswordHashById(userId, passwordHash);
    await afterPasswordUpdated();
    logSecurityEvent(log, {
      action: "admin.password_reset",
      actorUserId: actorUserId ?? null,
      targetUserId: userId,
      tenantId: tenantId ?? null,
      requestId,
      outcome: "ok"
    });
  };

  if (!isProd) {
    await persist();
    return { status: 200, body: buildAdminPasswordResetResponse(temporaryPassword) };
  }

  const smtp = tenantId
    ? (await resolveEffectiveSmtpForTenant(tenantId)).row
    : await getPlatformSmtpSettingsRow();
  const to = (await getUserEmailById(userId))?.trim() ?? "";

  if (smtp?.smtpEnabled === true && to.length > 0) {
    try {
      await sendMailHtml({
        row: smtp,
        to,
        subject: "Your account password was reset",
        html: `<p>An administrator reset the password for this account.</p><p style="font-size:18px;font-weight:bold;">Temporary password: ${escapeHtml(
          temporaryPassword
        )}</p><p>Sign in and change it immediately. If you did not expect this email, contact support.</p>`
      });
    } catch (err) {
      log.warn({ err, userId }, "admin password reset email send failed");
      return {
        status: 502,
        body: {
          error: "mail_error",
          message:
            "Could not send the temporary password by email. The password was not changed. Check SMTP settings and try again."
        }
      };
    }
    await persist();
    return {
      status: 200,
      body: {
        ok: true,
        passwordSent: true,
        message: "A temporary password was emailed to the user. It is not included in this response."
      }
    };
  }

  if (process.env.ADMIN_PASSWORD_RESET_RETURN_PLAIN === "true") {
    await persist();
    return { status: 200, body: buildAdminPasswordResetResponse(temporaryPassword) };
  }

  return {
    status: 503,
    body: {
      error: "password_reset_delivery_unavailable",
      message:
        "In production, password reset requires platform SMTP (enabled) and a user email, or ADMIN_PASSWORD_RESET_RETURN_PLAIN=true as an emergency override. The password was not changed."
    }
  };
}
