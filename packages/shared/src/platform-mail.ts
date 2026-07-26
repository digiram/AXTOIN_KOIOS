/**
 * Platform outbound mail (SMTP) settings schema.
 *
 * Super-admin SMTP configuration for system email (registration, billing, etc.).
 *
 * Responsibilities:
 * - Validate `PUT /platform/mail/smtp` body including optional password rotation
 *
 * Related:
 * - `tenant-mail.ts` for per-tenant SMTP; `mail-smtp-test.ts` for probe sends
 *
 * Security:
 * - Password empty string clears stored secret; omit to leave unchanged.
 */
import { z } from "zod";

/** Super-admin SMTP configuration (`GET`/`PUT /platform/mail/smtp`). */
export const platformMailSmtpPutBodySchema = z
  .object({
    host: z.string().trim().max(255),
    port: z.coerce.number().int().min(1).max(65535),
    secure: z.coerce.boolean(),
    username: z.string().trim().max(512).nullable().optional(),
    /** Empty string clears stored password; omit to leave unchanged. */
    password: z.string().max(2048).optional(),
    fromName: z.string().trim().max(255),
    fromEmail: z.string().trim().email().max(320),
    smtpEnabled: z.boolean()
  })
  .strict();

export type PlatformMailSmtpPutBodyInput = z.infer<typeof platformMailSmtpPutBodySchema>;
