/**
 * MFA request bodies for authenticated step-up and login-time verification.
 *
 * Shared Zod schemas for TOTP and email OTP flows after password login or when
 * a session must confirm a second factor before sensitive actions.
 *
 * Responsibilities:
 * - Validate MFA codes and tickets on `/auth/mfa/*` and `/account/mfa/*` routes
 * - Keep API and web aligned on method enum (`totp` | `email`) and code length
 *
 * Related:
 * - `apps/api` auth routes; web login and account security screens
 *
 * Security:
 * - `mfaTicket` is a short-lived opaque handle; never log codes or tickets.
 */
import { z } from "zod";

/** Body for confirming an enrolled TOTP device (`POST /account/mfa/totp/verify`). */
export const mfaTotpVerifyBodySchema = z
  .object({
    code: z.string().trim().min(6).max(12)
  })
  .strict();

/** Body for confirming email MFA enrollment (`POST /account/mfa/email/confirm`). */
export const mfaEmailConfirmBodySchema = z
  .object({
    code: z.string().trim().min(6).max(12)
  })
  .strict();

/** Login step-up body: ticket from password login plus method and OTP code. */
export const authMfaVerifyBodySchema = z
  .object({
    mfaTicket: z.string().min(10),
    method: z.enum(["totp", "email"]),
    code: z.string().trim().min(6).max(12)
  })
  .strict();

/** Triggers resend of email OTP during login MFA (`POST /auth/mfa/email/send`). */
export const authMfaEmailSendBodySchema = z
  .object({
    mfaTicket: z.string().min(10)
  })
  .strict();
