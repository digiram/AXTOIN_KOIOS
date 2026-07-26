/**
 * Nodemailer transport built from encrypted DB-backed SMTP settings rows.
 */

import nodemailer from "nodemailer";
import type { Attachment } from "nodemailer/lib/mailer/index.js";

import type { PlatformSmtpRow } from "./mail-repos.js";
import { openPlatformSmtpPasswordAtRest, openTenantSmtpPasswordAtRest } from "./mail-repos.js";

export type ResolvedSmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  auth?: { user: string; pass: string };
  from: string;
};

export type SmtpPasswordScope = {
  /** Set when using tenant SMTP; omit for platform singleton row. */
  tenantId?: string;
};

export const resolveSmtpFromRow = async (
  row: PlatformSmtpRow,
  scope: SmtpPasswordScope = {}
): Promise<ResolvedSmtpConfig> => {
  let pass = "";
  if (row.passwordEncrypted?.trim()) {
    pass = scope.tenantId
      ? await openTenantSmtpPasswordAtRest(scope.tenantId, row.passwordEncrypted)
      : await openPlatformSmtpPasswordAtRest(row.passwordEncrypted);
  }
  const auth =
    row.username?.trim() !== undefined && row.username.trim() !== ""
      ? { user: row.username.trim(), pass }
      : undefined;

  const fromName = row.fromName.trim();
  const fromEmail = row.fromEmail.trim();
  const from =
    fromName.length > 0
      ? `"${fromName.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}" <${fromEmail}>`
      : fromEmail;

  return {
    host: row.host.trim(),
    port: row.port,
    secure: row.secure,
    auth,
    from
  };
};

export const createNodemailerTransport = (cfg: ResolvedSmtpConfig) =>
  nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.auth
  });

export const sendMailHtml = async (opts: {
  row: PlatformSmtpRow;
  smtpScope?: SmtpPasswordScope;
  to: string;
  subject: string;
  html: string;
  attachments?: Attachment[];
}): Promise<void> => {
  if (!opts.row.smtpEnabled) {
    throw new Error("SMTP delivery is disabled for this deployment.");
  }
  const cfg = await resolveSmtpFromRow(opts.row, opts.smtpScope);
  if (!cfg.host) {
    throw new Error("SMTP host is not configured");
  }
  const transport = createNodemailerTransport(cfg);
  await transport.sendMail({
    from: cfg.from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    ...(opts.attachments?.length ? { attachments: opts.attachments } : {})
  });
};
