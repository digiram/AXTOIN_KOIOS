/**
 * Field encryption public surface for `@starter/db`.
 *
 * Re-exports tenant-scoped encrypt/decrypt boundaries, Drizzle middleware, search helpers,
 * and module-specific row seal/open helpers used by repositories across the monorepo.
 *
 * Responsibilities:
 * - Barrel re-export of all field-encryption modules under `packages/db/src/field-encryption/`
 *
 * Depends on:
 * - `@starter/crypto` (via boundary modules) for SFENC1 envelopes and tenant DEKs
 *
 * Security:
 * - Callers must pass JWT-derived `tenant_id` into repo boundaries; never trust client-supplied tenant ids.
 * - Plaintext secrets and PII must not be logged; use boundary helpers before persistence.
 */

export * from "./company-subscription-boundary.js";
export * from "./context.js";
export * from "./invoicing-boundary.js";
export * from "./middleware.js";
export * from "./platform-smtp-boundary.js";
export * from "./registry.js";
export * from "./repo-boundary.js";
export * from "./sales-funnel-boundary.js";
export * from "./scope.js";
export * from "./search-repos.js";
export * from "./secret-boundary.js";
export * from "./tenant-boundary.js";
export * from "./user-fields.js";
export * from "./user-secrets.js";
