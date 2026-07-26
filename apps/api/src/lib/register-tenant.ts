/**
 * Tenant registration and realm login resolution.
 *
 * Derives deterministic tenant keys from registration emails and resolves the
 * realm `tenantId` for login when the email domain matches signup rules.
 *
 * Responsibilities:
 * - Build opaque personal-tenant keys for consumer email providers
 * - Map corporate domains to tenant name lookups
 *
 * Security:
 * - Personal keys are SHA-256 hashes; no PII stored in tenant name
 */

import { createHash } from "node:crypto";

import { findTenantByExactName } from "@starter/db";
import {
  extractEmailDomain,
  isConsumerEmailProviderDomain,
  normalizeRegistrationEmail
} from "@starter/shared";

/**
 * Deterministic `tenants.name` for public-mailbox signups: one realm per canonical email,
 * always `tenant_user` (no tenant_admin). Name is opaque and avoids `@` in stored tenant keys.
 */
export const personalTenantKeyFromEmail = (email: string): string => {
  const n = normalizeRegistrationEmail(email);
  return `personal:${createHash("sha256").update(n).digest("hex")}`;
};

/** Resolves `tenants.id` for realm login from email (must match registration domain / personal key rules). */
export const resolveTenantIdFromEmailForRealmLogin = async (email: string): Promise<string | null> => {
  const domain = extractEmailDomain(email);
  if (!domain) return null;
  const key = isConsumerEmailProviderDomain(domain)
    ? personalTenantKeyFromEmail(email)
    : domain.toLowerCase();
  const tenant = await findTenantByExactName(key);
  return tenant?.id ?? null;
};
