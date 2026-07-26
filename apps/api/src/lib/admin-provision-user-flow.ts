/**
 * Super-admin user provisioning: in **production**, prefer delivering the temporary password by
 * email (platform SMTP) before the user row is inserted; non-production returns plaintext in JSON.
 */

import type { FastifyBaseLogger } from "fastify";

import { getPlatformSmtpSettingsRow } from "@starter/db";

import { escapeHtml } from "./escape-html.js";
import { buildAdminPasswordResetResponse, type AdminPasswordResetResponseBody } from "./admin-password-reset-response.js";
import { sendMailHtml } from "./mail-transport.js";

export type AdminProvisionUserDeliveryResult =
  | { status: 200; body: AdminPasswordResetResponseBody | { ok: true; passwordSent: true; message: string } }
  | { status: 502 | 503; body: { error: string; message: string } };

/** Validates that credentials can be delivered before inserting the user (production SMTP path). */
export async function deliverProvisionedUserCredentials(params: {
  email: string;
  temporaryPassword: string;
  nodeEnv: string;
  log: FastifyBaseLogger;
}): Promise<AdminProvisionUserDeliveryResult> {
  const { email, temporaryPassword, nodeEnv, log } = params;
  const isProd = nodeEnv === "production";

  if (!isProd) {
    return { status: 200, body: buildAdminPasswordResetResponse(temporaryPassword) };
  }

  const smtp = await getPlatformSmtpSettingsRow();
  const to = email.trim();

  if (smtp?.smtpEnabled === true && to.length > 0) {
    try {
      await sendMailHtml({
        row: smtp,
        to,
        subject: "Your new account credentials",
        html: `<p>A platform administrator created an account for you.</p><p style="font-size:18px;font-weight:bold;">Temporary password: ${escapeHtml(
          temporaryPassword
        )}</p><p>Sign in and change it immediately. If you did not expect this email, contact support.</p>`
      });
    } catch (err) {
      log.warn({ err, email: to }, "admin provision user email send failed");
      return {
        status: 502,
        body: {
          error: "mail_error",
          message:
            "Could not send the temporary password by email. The account was not created. Check SMTP settings and try again."
        }
      };
    }
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
    return { status: 200, body: buildAdminPasswordResetResponse(temporaryPassword) };
  }

  return {
    status: 503,
    body: {
      error: "password_delivery_unavailable",
      message:
        "In production, user provisioning requires platform SMTP (enabled) or ADMIN_PASSWORD_RESET_RETURN_PLAIN=true as an emergency override. The account was not created."
    }
  };
}
