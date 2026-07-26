/**
 * `@starter/db` — Drizzle ORM layer (dual Postgres/MySQL), repositories, connection singleton,
 * and optional startup migrations.
 *
 * Consumers (`apps/api`, `apps/worker`) import from here rather than deep-linking schema files,
 * so internal layout can evolve without touching app code.
 */

export * from "./field-encryption/index.js";
export * from "./schema.js";
export * from "./database-url.js";
export * from "./client.js";
export * from "./repos.js";
export * from "./migrate.js";
export * from "./mail-repos.js";
export * from "./mail-transport.js";
export * from "./platform-geolocation-repos.js";
export * from "./platform-payment-settings-repos.js";
export * from "./platform-subscription-repos.js";
export * from "./subscription-repos.js";
export * from "./platform-module-settings-repos.js";
export * from "./crm-repos.js";
export * from "./workforce-repos.js";
export * from "./company-subscription-repos.js";
export * from "./invoicing-repos.js";
export * from "./invoicing-offer-response-token-repos.js";
export * from "./sales-funnel-repos.js";
export * from "./sales-funnel-bdr-lead-repos.js";
export * from "./sales-funnel-sales-deal-repos.js";
export * from "./sales-funnel-contact-role-repos.js";
export * from "./module-roles-repos.js";
export * from "./mfa-repos.js";
export * from "./email-otp-repos.js";
export * from "./stripe-webhook-repos.js";
export * from "./subscription-billing-repos.js";
export * from "./mailbox-repos.js";
export * from "./mailbox-attachment-blob.js";
export * from "./mailbox-body-at-rest.js";
export * from "./tenant-blob-at-rest.js";
export * from "./s3-put-options.js";
export * from "./mailbox-connectors/index.js";
export * from "./mailbox-ics.js";
export * from "./mailbox-calendar-sync.js";
export * from "./mailbox-calendar-create.js";
export * from "./mailbox-provider-sync.js";
export * from "./health.js";
export * from "./boot-env.js";
export * from "./cache-repos.js";
export * from "./background-jobs-repos.js";
export * as pgSchema from "./pg-schema.js";
export * as mysqlSchema from "./mysql-schema.js";
