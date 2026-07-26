/**
 * SMTP connectivity test request body.
 *
 * Shared schema for platform and tenant mail settings when sending a probe message.
 *
 * Responsibilities:
 * - Validate recipient address on SMTP test endpoints
 *
 * Related:
 * - `platform-mail.ts`, `tenant-mail.ts`
 *
 * Security:
 * - Rate-limited on API; recipient must be a valid email, not arbitrary headers.
 */
import { z } from "zod";

/** POST body for platform and tenant SMTP test endpoints. */
export const mailSmtpTestBodySchema = z
  .object({
    to: z.string().trim().email().max(320)
  })
  .strict();

export type MailSmtpTestBodyInput = z.infer<typeof mailSmtpTestBodySchema>;
