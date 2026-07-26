/**
 * Shared SMTP test-send flow for platform and tenant mail routes.
 */

import {
  DEFAULT_WELCOME_BODY_HTML,
  getPlatformEmailTemplateByKey,
  upsertPlatformEmailTemplate,
  type PlatformSmtpRow,
  sendMailHtml
} from "@starter/db";

export type SmtpTestValidationFailure = {
  status: 400 | 503;
  error: "validation_error" | "service_unavailable" | "template_error";
  message: string;
};

export const validateSmtpRowForTest = (
  row: PlatformSmtpRow,
  disabledMessage: string
): SmtpTestValidationFailure | null => {
  if (!row.smtpEnabled) {
    return {
      status: 503,
      error: "service_unavailable",
      message: disabledMessage
    };
  }
  if (!row.host.trim()) {
    return {
      status: 400,
      error: "validation_error",
      message: "Configure SMTP host (and credentials if required) before sending a test."
    };
  }
  return null;
};

const resolveWelcomeTestContent = async (seedIfMissing: boolean): Promise<
  | { html: string; subject: string }
  | { error: "template_error"; message: string }
> => {
  let welcome = await getPlatformEmailTemplateByKey("welcome");
  if (!welcome && seedIfMissing) {
    await upsertPlatformEmailTemplate({
      templateKey: "welcome",
      displayName: "Welcome email",
      subject: "Welcome",
      bodyHtml: DEFAULT_WELCOME_BODY_HTML
    });
    welcome = await getPlatformEmailTemplateByKey("welcome");
  }

  const html = welcome?.bodyHtml?.trim() || DEFAULT_WELCOME_BODY_HTML;
  if (!html) {
    return {
      error: "template_error",
      message: "Welcome template body_html is empty — update the row in platform_email_templates."
    };
  }

  return {
    html,
    subject: welcome?.subject?.trim() || "Mail test"
  };
};

export type ExecuteSmtpTestSendArgs = {
  row: PlatformSmtpRow;
  to: string;
  /** Appended inside `[Test…]` prefix, e.g. `" — platform SMTP"` or empty string. */
  subjectSuffix?: string;
  smtpScope?: { tenantId?: string };
  seedWelcomeTemplateIfMissing?: boolean;
};

export const executeSmtpTestSend = async (
  args: ExecuteSmtpTestSendArgs
): Promise<SmtpTestValidationFailure | null> => {
  const content = await resolveWelcomeTestContent(args.seedWelcomeTemplateIfMissing ?? false);
  if ("error" in content) {
    return { status: 400, error: content.error, message: content.message };
  }

  const suffix = args.subjectSuffix ?? "";
  await sendMailHtml({
    row: args.row,
    smtpScope: args.smtpScope ?? {},
    to: args.to,
    subject: `[Test${suffix}] ${content.subject}`,
    html: content.html
  });
  return null;
};
