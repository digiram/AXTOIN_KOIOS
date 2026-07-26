/**
 * Tenant realm-wide settings and self-registration query schemas.
 *
 * General realm policy (self-registration, MFA enforcement) and optional email
 * query for public self-registration eligibility checks.
 *
 * Responsibilities:
 * - Validate tenant admin general settings PATCH
 * - Validate optional email on self-registration status endpoint
 *
 * Related:
 * - `account-settings.ts`; API auth registration routes
 *
 * Security:
 * - MFA enforcement applies to all realm users when enabled.
 */
import { z } from "zod";

/** Tenant admin updates realm-wide signup policy (`PUT /tenant/settings/general`). */
export const tenantRealmGeneralPutBodySchema = z
  .object({
    realmSelfRegisterEnabled: z.boolean().optional(),
    mfaEnforced: z.boolean().optional()
  })
  .strict()
  .refine((b) => b.realmSelfRegisterEnabled !== undefined || b.mfaEnforced !== undefined, {
    message: "Provide at least one of realmSelfRegisterEnabled or mfaEnforced"
  });

export type TenantRealmGeneralPutBodyInput = z.infer<typeof tenantRealmGeneralPutBodySchema>;

/** Optional `email` on `GET /auth/self-registration` to include per-realm policy. */
export const tenantSelfRegistrationQuerySchema = z.object({
  email: z.preprocess((v) => {
    if (v === undefined || v === null) return undefined;
    if (Array.isArray(v)) return typeof v[0] === "string" ? v[0].trim() : undefined;
    if (typeof v === "string") {
      const t = v.trim();
      return t === "" ? undefined : t;
    }
    return undefined;
  }, z.string().email().optional())
});

export type TenantSelfRegistrationQueryInput = z.infer<typeof tenantSelfRegistrationQuerySchema>;
