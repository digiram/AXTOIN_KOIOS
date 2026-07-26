/**
 * Mail transport re-export.
 *
 * Re-exports SMTP send helpers from `@starter/db` for API-layer mail delivery
 * (MFA emails, invoicing, registration, etc.).
 */

export { sendMailHtml, resolveSmtpFromRow, createNodemailerTransport, type ResolvedSmtpConfig, type SmtpPasswordScope } from "@starter/db";
