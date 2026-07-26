/**
 * Tenant outbound mail (SMTP) settings schema.
 *
 * Tenant-admin SMTP override; empty host falls back to platform mail settings.
 *
 * Responsibilities:
 * - Validate `PUT /tenant/mail/smtp` including host/from-email pairing rules
 *
 * Related:
 * - `platform-mail.ts`; `mail-smtp-test.ts`
 *
 * Security:
 * - Password empty string clears stored secret; omit to leave unchanged.
 */
import { z } from "zod";

/** Tenant-admin SMTP configuration (`GET`/`PUT /tenant/mail/smtp`). Empty host/from email = platform fallback. */
export const tenantMailSmtpPutBodySchema = z
  .object({
    host: z.string().trim().max(255),
    port: z.coerce.number().int().min(1).max(65535),
    secure: z.coerce.boolean(),
    username: z.string().trim().max(512).nullable().optional(),
    /** Empty string clears stored password; omit to leave unchanged. */
    password: z.string().max(2048).optional(),
    fromName: z.string().trim().max(255),
    fromEmail: z.string().trim().max(320),
    smtpEnabled: z.boolean()
  })
  .strict()
  .superRefine((body, ctx) => {
    const host = body.host.trim();
    const fromEmail = body.fromEmail.trim();
    if (host.length === 0) return;
    if (fromEmail.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "From email is required when SMTP host is set.",
        path: ["fromEmail"]
      });
      return;
    }
    const parsed = z.string().email().safeParse(fromEmail);
    if (!parsed.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "From email must be valid when SMTP host is set.",
        path: ["fromEmail"]
      });
    }
  });

export type TenantMailSmtpPutBodyInput = z.infer<typeof tenantMailSmtpPutBodySchema>;
