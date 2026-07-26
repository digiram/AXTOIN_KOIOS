/**
 * Drizzle schema — MySQL dialect (`drizzle-orm/mysql-core`).
 *
 * Semantic mirror of `pg-schema.ts`. UUID primary keys are explicit `varchar(36)` strings from code.
 * SQL migrations live under `drizzle/mysql/`.
 *
 * Responsibilities:
 * - Same table coverage as pg schema with MySQL column types and index syntax
 * - Inline notes on encrypted columns and tenant scope
 *
 * Security:
 * - Tenant-scoped tables include `tenant_id`; repositories must filter every query by JWT tenant.
 * - Encryption layout matches pg schema (SFENC1 fields, tenant DEK envelope, HMAC lookup keys).
 */

import {
  bigint,
  boolean,
  date,
  decimal,
  index,
  int,
  mysqlTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
  type AnyMySqlColumn
} from "drizzle-orm/mysql-core";

export const tenants = mysqlTable(
  "tenants",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    name: text("name").notNull(),
    /** HMAC or plaintext realm key for exact lookup when `name` is encrypted at rest. */
    nameLookupKey: varchar("name_lookup_key", { length: 512 }).notNull(),
    /** When false, `POST /auth/register` rejects new users for this realm (tenant admin must provision accounts). */
    realmSelfRegisterEnabled: boolean("realm_self_register_enabled").notNull().default(true),
    mfaEnforced: boolean("mfa_enforced").notNull().default(false),
    /** AES-GCM wrapped tenant DEK (envelope encryption); null only for pre-backfill legacy rows. */
    encryptedDek: text("encrypted_dek"),
    /** KEK version used to wrap `encrypted_dek`. */
    dekKeyVersion: int("dek_key_version").notNull().default(1),
    createdAt: timestamp("created_at").defaultNow().notNull()
  },
  (table) => ({
    nameLookupKeyUnique: uniqueIndex("tenants_name_lookup_key_unique").on(table.nameLookupKey)
  })
);

/** Blind search index tokens (HMAC n-grams) for encrypted searchable fields. */
export const fieldSearchTokens = mysqlTable(
  "field_search_tokens",
  {
    /** Realm tenant id; null for platform-scoped rows (e.g. super-admin users). */
    tenantId: varchar("tenant_id", { length: 36 }).references(() => tenants.id, { onDelete: "cascade" }),
    entityTable: varchar("entity_table", { length: 64 }).notNull(),
    entityId: varchar("entity_id", { length: 36 }).notNull(),
    fieldName: varchar("field_name", { length: 64 }).notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull()
  },
  (table) => ({
    tokenUnique: uniqueIndex("field_search_tokens_unique").on(
      table.tenantId,
      table.entityTable,
      table.entityId,
      table.fieldName,
      table.tokenHash
    ),
    lookupIdx: index("field_search_tokens_lookup_idx").on(
      table.tenantId,
      table.entityTable,
      table.fieldName,
      table.tokenHash
    )
  })
);

/** Email OTP challenges for pre-account flows (registration verification). */
export const emailOtpChallenges = mysqlTable(
  "email_otp_challenges",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    subjectKey: varchar("subject_key", { length: 320 }).notNull(),
    purpose: varchar("purpose", { length: 32 }).notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    consumedAt: timestamp("consumed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull()
  },
  (table) => ({
    subjectPurposeIdx: index("email_otp_challenges_subject_purpose_idx").on(table.subjectKey, table.purpose)
  })
);

export const users = mysqlTable(
  "users",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).references(() => tenants.id, { onDelete: "cascade" }),
    /** SFENC1 ciphertext when field encryption is enabled. */
    email: text("email").notNull(),
    role: varchar("role", { length: 32 }).notNull().default("tenant_user"),
    identityKey: varchar("identity_key", { length: 512 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    encryptedTaxId: varchar("encrypted_tax_id", { length: 1024 }),
    displayName: varchar("display_name", { length: 255 }),
    countryCode: varchar("country_code", { length: 2 }),
    measurementSystem: varchar("measurement_system", { length: 16 }),
    timezone: varchar("timezone", { length: 128 }),
    currencyCode: varchar("currency_code", { length: 3 }),
    currencyFormat: varchar("currency_format", { length: 32 }),
    dateTimeFormat: varchar("date_time_format", { length: 16 }),
    /** `12h` | `24h`; null = use tenant Finance default. */
    timeFormat: varchar("time_format", { length: 8 }),
    homeAddressLine1: text("home_address_line1"),
    homeAddressLine2: text("home_address_line2"),
    homePostalCode: text("home_postal_code"),
    homeCity: text("home_city"),
    homeState: text("home_state"),
    homeCountry: text("home_country"),
    firstPasswordLoginAt: timestamp("first_password_login_at"),
    mfaGraceExpiresAt: timestamp("mfa_grace_expires_at"),
    mfaBlockedAt: timestamp("mfa_blocked_at"),
    mfaTotpSecretEncrypted: text("mfa_totp_secret_encrypted"),
    mfaTotpEnabled: boolean("mfa_totp_enabled").notNull().default(false),
    mfaTotpPendingSecretEncrypted: text("mfa_totp_pending_secret_encrypted"),
    mfaTotpPendingExpiresAt: timestamp("mfa_totp_pending_expires_at"),
    mfaEmailEnabled: boolean("mfa_email_enabled").notNull().default(false),
    accessTokenVersion: int("access_token_version").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull()
  },
  (table) => ({
    identityKeyUnique: uniqueIndex("users_identity_key_uidx").on(table.identityKey)
  })
);

export const mfaOtpChallenges = mysqlTable(
  "mfa_otp_challenges",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: varchar("purpose", { length: 32 }).notNull(),
    codeHash: varchar("code_hash", { length: 255 }).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    consumedAt: timestamp("consumed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull()
  },
  (table) => ({
    userPurposeIdx: index("mfa_otp_challenges_user_purpose_idx").on(table.userId, table.purpose)
  })
);

export const userDevices = mysqlTable(
  "user_devices",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    installKey: varchar("install_key", { length: 256 }).notNull(),
    platform: varchar("platform", { length: 16 }).notNull(),
    label: varchar("label", { length: 255 }),
    pushToken: varchar("push_token", { length: 4096 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
    revokedAt: timestamp("revoked_at")
  },
  (table) => ({
    userInstallUnique: uniqueIndex("user_devices_user_install_uidx").on(table.userId, table.installKey)
  })
);

/** Platform-wide transactional templates (stored HTML body). */
export const platformEmailTemplates = mysqlTable(
  "platform_email_templates",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    templateKey: varchar("template_key", { length: 64 }).notNull(),
    displayName: varchar("display_name", { length: 255 }).notNull(),
    subject: varchar("subject", { length: 512 }),
    bodyHtml: text("body_html").notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull()
  },
  (table) => ({
    templateKeyUnique: uniqueIndex("platform_email_templates_key_uidx").on(table.templateKey)
  })
);

/** Optional per-tenant SMTP transport; empty host/from email falls back to `platform_smtp_settings`. */
export const tenantSmtpSettings = mysqlTable("tenant_smtp_settings", {
  tenantId: varchar("tenant_id", { length: 36 })
    .primaryKey()
    .references(() => tenants.id, { onDelete: "cascade" }),
  host: varchar("host", { length: 255 }).notNull().default(""),
  port: int("port").notNull().default(587),
  secure: boolean("secure").notNull().default(false),
  username: varchar("username", { length: 512 }),
  passwordEncrypted: text("password_encrypted"),
  fromName: varchar("from_name", { length: 255 }).notNull().default(""),
  fromEmail: varchar("from_email", { length: 320 }).notNull().default(""),
  smtpEnabled: boolean("smtp_enabled").notNull().default(true),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const platformSmtpSettings = mysqlTable("platform_smtp_settings", {
  id: varchar("id", { length: 36 }).primaryKey(),
  host: text("host").notNull(),
  port: int("port").notNull().default(587),
  secure: boolean("secure").notNull().default(false),
  username: text("username"),
  passwordEncrypted: text("password_encrypted"),
  fromName: varchar("from_name", { length: 255 }).notNull().default(""),
  fromEmail: varchar("from_email", { length: 320 }).notNull().default(""),
  smtpEnabled: boolean("smtp_enabled").notNull().default(true),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

/** Singleton geolocation integration row (`id` fixed); Nominatim first. */
export const platformGeolocationSettings = mysqlTable("platform_geolocation_settings", {
  id: varchar("id", { length: 36 }).primaryKey(),
  nominatimBaseUrl: varchar("nominatim_base_url", { length: 512 }).notNull().default("https://nominatim.openstreetmap.org"),
  nominatimContactEmail: varchar("nominatim_contact_email", { length: 320 }),
  nominatimEnabled: boolean("nominatim_enabled").notNull().default(true),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const platformModuleSettings = mysqlTable("platform_module_settings", {
  id: varchar("id", { length: 36 }).primaryKey(),
  crmEnabled: boolean("crm_enabled").notNull().default(true),
  /** Super-admin: tenant workforce (org chart + employees, no app-user coupling). Off by default until enabled. */
  hrmEnabled: boolean("hrm_enabled").notNull().default(false),
  salesFunnelEnabled: boolean("sales_funnel_enabled").notNull().default(false),
  /** Super-admin: vendor/SaaS subscription registry (documentation only; soft-disable). */
  companySubscriptionsEnabled: boolean("company_subscriptions_enabled").notNull().default(false),
  invoicingEnabled: boolean("invoicing_enabled").notNull().default(false),
  mailboxEnabled: boolean("mailbox_enabled").notNull().default(false),
  /** When false, `POST /auth/register` is rejected; only admins may provision users (bootstrap / future admin APIs). */
  selfRegisterEnabled: boolean("self_register_enabled").notNull().default(false),
  mfaTotpEnabled: boolean("mfa_totp_enabled").notNull().default(false),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

/** Singleton payment processor row (`id` fixed); Stripe XOR Adyen — only `provider` is active at runtime. */
export const platformPaymentSettings = mysqlTable("platform_payment_settings", {
  id: varchar("id", { length: 36 }).primaryKey(),
  paymentsEnabled: boolean("payments_enabled").notNull().default(false),
  provider: varchar("provider", { length: 16 }).notNull().default("stripe"),
  stripePublishableKey: varchar("stripe_publishable_key", { length: 512 }).notNull().default(""),
  stripeSecretEncrypted: text("stripe_secret_encrypted"),
  stripeWebhookSecretEncrypted: text("stripe_webhook_secret_encrypted"),
  adyenMerchantAccount: varchar("adyen_merchant_account", { length: 255 }).notNull().default(""),
  adyenClientKey: varchar("adyen_client_key", { length: 512 }).notNull().default(""),
  adyenEnvironment: varchar("adyen_environment", { length: 16 }).notNull().default("test"),
  adyenApiKeyEncrypted: text("adyen_api_key_encrypted"),
  acceptedPaymentMethodsJson: text("accepted_payment_methods_json")
    .notNull()
    .default('["card","paypal","wallet_apple_google_pay","ideal"]'),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

/** Singleton: platform subscription billing (plans + payment requests). */
export const platformSubscriptionSettings = mysqlTable("platform_subscription_settings", {
  id: varchar("id", { length: 36 }).primaryKey(),
  subscriptionsEnabled: boolean("subscriptions_enabled").notNull().default(false),
  subscriptionCurrencyCode: varchar("subscription_currency_code", { length: 3 }).notNull().default("USD"),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const platformSubscriptionPlans = mysqlTable("platform_subscription_plans", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tierName: varchar("tier_name", { length: 128 }).notNull(),
  durationUnit: varchar("duration_unit", { length: 16 }).notNull(),
  durationCount: int("duration_count").notNull().default(1),
  priceCents: int("price_cents").notNull(),
  currencyCode: varchar("currency_code", { length: 3 }).notNull().default("USD"),
  allowCancelAnytime: boolean("allow_cancel_anytime").notNull().default(false),
  trialDays: int("trial_days").notNull().default(0),
  allowTierChangeNextPeriod: boolean("allow_tier_change_next_period").notNull().default(true),
  billingScope: varchar("billing_scope", { length: 16 }).notNull(),
  sortOrder: int("sort_order").notNull().default(0),
  disabled: boolean("disabled").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const subscriptions = mysqlTable(
  "subscriptions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 }).references(() => users.id, { onDelete: "cascade" }),
    planId: varchar("plan_id", { length: 36 })
      .notNull()
      .references(() => platformSubscriptionPlans.id),
    pendingPlanId: varchar("pending_plan_id", { length: 36 }).references(() => platformSubscriptionPlans.id, {
      onDelete: "set null"
    }),
    status: varchar("status", { length: 32 }).notNull(),
    startedAt: timestamp("started_at").notNull(),
    currentPeriodStart: timestamp("current_period_start").notNull(),
    currentPeriodEnd: timestamp("current_period_end").notNull(),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    canceledAt: timestamp("canceled_at"),
    cancelEffectiveMode: varchar("cancel_effective_mode", { length: 32 }),
    effectiveEndAt: timestamp("effective_end_at"),
    trialEndsAt: timestamp("trial_ends_at"),
    pspCustomerId: varchar("psp_customer_id", { length: 255 }),
    pspSubscriptionId: varchar("psp_subscription_id", { length: 255 }),
    pspDefaultPaymentMethodId: varchar("psp_default_payment_method_id", { length: 255 }),
    paymentMethodBrand: varchar("payment_method_brand", { length: 32 }),
    paymentMethodLast4: varchar("payment_method_last4", { length: 8 }),
    paymentMethodExpMonth: int("payment_method_exp_month"),
    paymentMethodExpYear: int("payment_method_exp_year"),
    billingPastDueSince: timestamp("billing_past_due_since"),
    billingFailedChargeCount: int("billing_failed_charge_count").notNull().default(0),
    billingLastPaymentErrorCode: varchar("billing_last_payment_error_code", { length: 128 }),
    billingNextRetryAt: timestamp("billing_next_retry_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull()
  },
  (table) => ({
    tenantUserIdx: index("subscriptions_tenant_user_idx").on(table.tenantId, table.userId),
    planIdx: index("subscriptions_plan_idx").on(table.planId),
    pendingPlanIdx: index("subscriptions_pending_plan_id_idx").on(table.pendingPlanId),
    statusIdx: index("subscriptions_status_idx").on(table.status),
    pspCustomerIdx: index("subscriptions_psp_customer_id_idx").on(table.pspCustomerId)
  })
);

export const platformSubscriptionPayments = mysqlTable(
  "platform_subscription_payments",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    planId: varchar("plan_id", { length: 36 }).references(() => platformSubscriptionPlans.id, {
      onDelete: "set null"
    }),
    subscriptionId: varchar("subscription_id", { length: 36 }).references(() => subscriptions.id, {
      onDelete: "set null"
    }),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
    amountCents: int("amount_cents").notNull(),
    currencyCode: varchar("currency_code", { length: 3 }).notNull().default("USD"),
    status: varchar("status", { length: 32 }).notNull(),
    dueAt: timestamp("due_at"),
    paidAt: timestamp("paid_at"),
    cancelledAt: timestamp("cancelled_at"),
    reimbursedAt: timestamp("reimbursed_at"),
    description: text("description"),
    pspInvoiceId: varchar("psp_invoice_id", { length: 255 }),
    pspPaymentIntentId: varchar("psp_payment_intent_id", { length: 255 }),
    pspChargeId: varchar("psp_charge_id", { length: 255 }),
    periodStartUtc: timestamp("period_start_utc"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull()
  },
  (table) => ({
    statusIdx: index("platform_subscription_payments_status_idx").on(table.status),
    tenantIdx: index("platform_subscription_payments_tenant_idx").on(table.tenantId),
    subscriptionIdx: index("platform_subscription_payments_subscription_idx").on(table.subscriptionId),
    pspPiIdx: index("platform_subscription_payments_psp_pi_idx").on(table.pspPaymentIntentId),
    subscriptionPeriodUnique: uniqueIndex("platform_subscription_payments_sub_period_unique").on(
      table.subscriptionId,
      table.periodStartUtc
    )
  })
);

export const platformSubscriptionPlanAuditLog = mysqlTable(
  "platform_subscription_plan_audit_log",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    action: varchar("action", { length: 48 }).notNull(),
    planId: varchar("plan_id", { length: 36 }),
    actorUserId: varchar("actor_user_id", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
    summary: text("summary").notNull(),
    detailJson: text("detail_json")
  },
  (table) => ({
    createdIdx: index("platform_subscription_plan_audit_log_created_idx").on(table.createdAt)
  })
);

export const refreshTokens = mysqlTable(
  "refresh_tokens",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tenantId: varchar("tenant_id", { length: 36 }).references(() => tenants.id, { onDelete: "cascade" }),
    userDeviceId: varchar("user_device_id", { length: 36 }).references(() => userDevices.id, {
      onDelete: "cascade"
    }),
    tokenHash: varchar("token_hash", { length: 255 }).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull()
  },
  (table) => ({
    tokenHashUnique: uniqueIndex("refresh_tokens_token_hash_uidx").on(table.tokenHash)
  })
);

export const crmOrganizations = mysqlTable(
  "crm_organizations",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    emailsJson: text("emails_json").notNull().default("[]"),
    phonesJson: text("phones_json").notNull().default("[]"),
    addressesJson: text("addresses_json").notNull().default("[]"),
    addressLine1: text("address_line1"),
    addressLine2: text("address_line2"),
    postalCode: text("postal_code"),
    city: text("city"),
    state: text("state"),
    country: text("country"),
    marketSegmentLayer1Id: varchar("market_segment_layer1_id", { length: 36 }).references(
      (): AnyMySqlColumn => crmOrganizationMarketSegments.id,
      { onDelete: "set null" }
    ),
    marketSegmentLayer2Id: varchar("market_segment_layer2_id", { length: 36 }).references(
      (): AnyMySqlColumn => crmOrganizationMarketSegments.id,
      { onDelete: "set null" }
    ),
    marketSegmentLayer3Id: varchar("market_segment_layer3_id", { length: 36 }).references(
      (): AnyMySqlColumn => crmOrganizationMarketSegments.id,
      { onDelete: "set null" }
    ),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull()
  },
  (table) => ({
    tenantNameIdx: index("crm_organizations_tenant_idx").on(table.tenantId),
    marketSegmentL1Idx: index("crm_organizations_market_segment_l1_idx").on(
      table.tenantId,
      table.marketSegmentLayer1Id
    ),
    marketSegmentL2Idx: index("crm_organizations_market_segment_l2_idx").on(
      table.tenantId,
      table.marketSegmentLayer2Id
    ),
    marketSegmentL3Idx: index("crm_organizations_market_segment_l3_idx").on(
      table.tenantId,
      table.marketSegmentLayer3Id
    )
  })
);

export const crmOrganizationMarketSegments = mysqlTable(
  "crm_organization_market_segments",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    layer: int("layer").notNull(),
    parentId: varchar("parent_id", { length: 36 }).references(
      (): AnyMySqlColumn => crmOrganizationMarketSegments.id,
      { onDelete: "restrict" }
    ),
    name: varchar("name", { length: 255 }).notNull(),
    sortOrder: int("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull()
  },
  (table) => ({
    tenantParentIdx: index("crm_org_market_segments_tenant_parent_idx").on(table.tenantId, table.parentId)
  })
);

export const crmOrganizationMarketingTags = mysqlTable(
  "crm_organization_marketing_tags",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 64 }).notNull(),
    sortOrder: int("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull()
  },
  (table) => ({
    tenantNameUnique: uniqueIndex("crm_org_marketing_tags_tenant_name_uidx").on(table.tenantId, table.name)
  })
);

export const crmOrganizationMarketingTagLinks = mysqlTable(
  "crm_organization_marketing_tag_links",
  {
    organizationId: varchar("organization_id", { length: 36 })
      .notNull()
      .references(() => crmOrganizations.id, { onDelete: "cascade" }),
    tagId: varchar("tag_id", { length: 36 })
      .notNull()
      .references(() => crmOrganizationMarketingTags.id, { onDelete: "cascade" })
  },
  (table) => ({
    pk: primaryKey({ columns: [table.organizationId, table.tagId] }),
    tagIdx: index("crm_org_marketing_tag_links_tag_idx").on(table.tagId)
  })
);

export const crmContacts = mysqlTable(
  "crm_contacts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    salutation: text("salutation"),
    title: text("title"),
    email: text("email"),
    phone: text("phone"),
    emailsJson: varchar("emails_json", { length: 8000 }).notNull().default("[]"),
    phonesJson: varchar("phones_json", { length: 8000 }).notNull().default("[]"),
    addressesJson: varchar("addresses_json", { length: 8000 }).notNull().default("[]"),
    addressLine1: text("address_line1"),
    addressLine2: text("address_line2"),
    postalCode: text("postal_code"),
    city: text("city"),
    state: text("state"),
    country: text("country"),
    photoRelPath: varchar("photo_rel_path", { length: 512 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull()
  },
  (table) => ({
    tenantContactIdx: index("crm_contacts_tenant_idx").on(table.tenantId)
  })
);

export const crmRelationshipTypes = mysqlTable(
  "crm_relationship_types",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    reverseName: varchar("reverse_name", { length: 255 }).notNull(),
    sourceEntityKind: varchar("source_entity_kind", { length: 32 }).notNull(),
    targetEntityKind: varchar("target_entity_kind", { length: 32 }).notNull(),
    isSystem: boolean("is_system").notNull().default(false),
    createdByUserId: varchar("created_by_user_id", { length: 36 }).references(() => users.id, {
      onDelete: "restrict"
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    relationshipUsageCount: int("relationship_usage_count").notNull().default(0)
  },
  (table) => ({
    tenantNameSrcTgtUnique: uniqueIndex("crm_relationship_types_tenant_name_src_tgt_uidx").on(
      table.tenantId,
      table.name,
      table.sourceEntityKind,
      table.targetEntityKind
    )
  })
);

export const crmRelationships = mysqlTable(
  "crm_relationships",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    relationshipTypeId: varchar("relationship_type_id", { length: 36 })
      .notNull()
      .references(() => crmRelationshipTypes.id, { onDelete: "restrict" }),
    sourceId: varchar("source_id", { length: 36 }).notNull(),
    sourceEntityKind: varchar("source_entity_kind", { length: 32 }).notNull(),
    targetId: varchar("target_id", { length: 36 }).notNull(),
    targetEntityKind: varchar("target_entity_kind", { length: 32 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull()
  },
  (table) => ({
    srcIdx: index("crm_relationships_src_idx").on(table.tenantId, table.sourceEntityKind, table.sourceId),
    tgtIdx: index("crm_relationships_tgt_idx").on(table.tenantId, table.targetEntityKind, table.targetId)
  })
);

export const crmActivities = mysqlTable(
  "crm_activities",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    activityType: varchar("activity_type", { length: 32 }).notNull(),
    title: text("title").notNull(),
    description: text("description"),
    relatedEntityId: varchar("related_entity_id", { length: 36 }).notNull(),
    relatedEntityKind: varchar("related_entity_kind", { length: 32 }).notNull(),
    scheduledAt: timestamp("scheduled_at"),
    direction: varchar("direction", { length: 16 }),
    createdAt: timestamp("created_at").defaultNow().notNull()
  },
  (table) => ({
    entityIdx: index("crm_activities_entity_idx").on(
      table.tenantId,
      table.relatedEntityKind,
      table.relatedEntityId,
      table.createdAt
    ),
    typeIdx: index("crm_activities_type_idx").on(table.tenantId, table.activityType)
  })
);

export const workforceEmployees = mysqlTable(
  "workforce_employees",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    dateOfEmployment: varchar("date_of_employment", { length: 10 }),
    personalPhone: text("personal_phone"),
    personalEmail: text("personal_email"),
    workPhone: text("work_phone"),
    workEmail: text("work_email"),
    personalAddress: text("personal_address"),
    workLocation: text("work_location"),
    /** Employment org unit (many employees per unit); chart assignee is stored on the org unit row. */
    employmentOrgUnitId: varchar("employment_org_unit_id", { length: 36 }).references((): AnyMySqlColumn => workforceOrgUnits.id, {
      onDelete: "set null"
    }),
    jobTitle: varchar("job_title", { length: 255 }),
    employeeKind: varchar("employee_kind", { length: 16 }).notNull().default("person"),
    notes: text("notes"),
    photoRelPath: varchar("photo_rel_path", { length: 512 }),
    workTimeKind: varchar("work_time_kind", { length: 16 }),
    workScheduleJson: text("work_schedule_json"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull()
  },
  (table) => ({
    tenantIdx: index("workforce_employees_tenant_idx").on(table.tenantId),
    employmentUnitIdx: index("workforce_employees_employment_org_unit_idx").on(table.tenantId, table.employmentOrgUnitId)
  })
);

export const workforceEmployeeDocuments = mysqlTable(
  "workforce_employee_documents",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    employeeId: varchar("employee_id", { length: 36 })
      .notNull()
      .references(() => workforceEmployees.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 512 }).notNull(),
    originalFilename: varchar("original_filename", { length: 512 }).notNull(),
    mimeType: varchar("mime_type", { length: 255 }),
    storageRelPath: varchar("storage_rel_path", { length: 512 }).notNull(),
    byteSize: int("byte_size").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull()
  },
  (table) => ({
    employeeIdx: index("workforce_employee_documents_employee_idx").on(table.tenantId, table.employeeId)
  })
);

/** Tenant workforce: external social profiles linked to an employee (LinkedIn first). */
export const workforceEmployeeSocials = mysqlTable(
  "workforce_employee_socials",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    employeeId: varchar("employee_id", { length: 36 })
      .notNull()
      .references(() => workforceEmployees.id, { onDelete: "cascade" }),
    /** Provider key, e.g. `linkedin`. */
    provider: varchar("provider", { length: 32 }).notNull(),
    /** Profile URL (SFENC1 when field encryption is on). */
    profileUrl: text("profile_url").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull()
  },
  (table) => ({
    employeeIdx: index("workforce_employee_socials_employee_idx").on(table.tenantId, table.employeeId),
    employeeProviderUnique: uniqueIndex("workforce_employee_socials_employee_provider_uidx").on(
      table.tenantId,
      table.employeeId,
      table.provider
    )
  })
);

export const workforceOrgUnits = mysqlTable(
  "workforce_org_units",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    parentOrgUnitId: varchar("parent_org_unit_id", { length: 36 }).references((): AnyMySqlColumn => workforceOrgUnits.id, {
      onDelete: "set null"
    }),
    assignedEmployeeId: varchar("assigned_employee_id", { length: 36 }).references(() => workforceEmployees.id, {
      onDelete: "set null"
    }),
    onOrgChart: boolean("on_org_chart").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull()
  },
  (table) => ({
    tenantIdx: index("workforce_org_units_tenant_idx").on(table.tenantId),
    assignedEmployeeUnique: uniqueIndex("workforce_org_units_assigned_employee_uidx").on(table.assignedEmployeeId)
  })
);

export const salesFunnelStages = mysqlTable(
  "sales_funnel_stages",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    pipeline: varchar("pipeline", { length: 16 }).notNull(),
    stageKey: varchar("stage_key", { length: 64 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    sortOrder: int("sort_order").notNull().default(0),
    outcome: varchar("outcome", { length: 16 }).notNull().default("open"),
    closeChancePercent: int("close_chance_percent"),
    readyForSales: boolean("ready_for_sales").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull()
  },
  (table) => ({
    tenantPipelineKeyUnique: uniqueIndex("sales_funnel_stages_tenant_pipeline_key_uidx").on(
      table.tenantId,
      table.pipeline,
      table.stageKey
    ),
    tenantPipelineSortIdx: index("sales_funnel_stages_tenant_pipeline_sort_idx").on(
      table.tenantId,
      table.pipeline,
      table.sortOrder
    )
  })
);

export const salesFunnelBdrLeads = mysqlTable(
  "sales_funnel_bdr_leads",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    stageKey: varchar("stage_key", { length: 64 }).notNull(),
    tagsJson: text("tags_json"),
    ownerUserId: varchar("owner_user_id", { length: 36 }),
    crmOrganizationId: varchar("crm_organization_id", { length: 36 }).references(() => crmOrganizations.id, {
      onDelete: "set null"
    }),
    stageEnteredAt: timestamp("stage_entered_at").defaultNow().notNull(),
    archivedAt: timestamp("archived_at"),
    active: boolean("active").notNull().default(true),
    inactiveStageLabel: varchar("inactive_stage_label", { length: 128 }),
    createdByUserId: varchar("created_by_user_id", { length: 36 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull()
  },
  (table) => ({
    crmOrgIdx: index("sales_funnel_bdr_leads_crm_org_idx").on(table.tenantId, table.crmOrganizationId),
    tenantStageIdx: index("sales_funnel_bdr_leads_tenant_stage_idx").on(
      table.tenantId,
      table.stageKey,
      table.updatedAt
    ),
    tenantOwnerIdx: index("sales_funnel_bdr_leads_tenant_owner_idx").on(table.tenantId, table.ownerUserId),
    tenantActiveIdx: index("sales_funnel_bdr_leads_tenant_active_idx").on(table.tenantId, table.archivedAt)
  })
);

export const salesFunnelContactRoles = mysqlTable(
  "sales_funnel_contact_roles",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 128 }).notNull(),
    sortOrder: int("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date", fsp: 3 }).notNull().defaultNow()
  },
  (table) => ({
    tenantLabelUnique: uniqueIndex("sales_funnel_contact_roles_tenant_label_uidx").on(
      table.tenantId,
      table.label
    ),
    tenantSortIdx: index("sales_funnel_contact_roles_tenant_sort_idx").on(
      table.tenantId,
      table.sortOrder,
      table.label
    )
  })
);

export const salesFunnelLeadContacts = mysqlTable(
  "sales_funnel_lead_contacts",
  {
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    leadId: varchar("lead_id", { length: 36 })
      .notNull()
      .references(() => salesFunnelBdrLeads.id, { onDelete: "cascade" }),
    contactId: varchar("contact_id", { length: 36 })
      .notNull()
      .references(() => crmContacts.id, { onDelete: "cascade" }),
    roleLabel: varchar("role_label", { length: 128 }).notNull().default(""),
    createdAt: timestamp("created_at").defaultNow().notNull()
  },
  (table) => ({
    pk: primaryKey({ columns: [table.leadId, table.contactId] }),
    contactIdx: index("sales_funnel_lead_contacts_contact_idx").on(table.tenantId, table.contactId)
  })
);

export const salesFunnelSalesDeals = mysqlTable(
  "sales_funnel_sales_deals",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    stageKey: varchar("stage_key", { length: 64 }).notNull(),
    tagsJson: text("tags_json"),
    ownerUserId: varchar("owner_user_id", { length: 36 }),
    crmOrganizationId: varchar("crm_organization_id", { length: 36 }).references(() => crmOrganizations.id, {
      onDelete: "set null"
    }),
    promotedFromLeadId: varchar("promoted_from_lead_id", { length: 36 }).references(
      () => salesFunnelBdrLeads.id,
      { onDelete: "set null" }
    ),
    stageEnteredAt: timestamp("stage_entered_at").defaultNow().notNull(),
    archivedAt: timestamp("archived_at"),
    active: boolean("active").notNull().default(true),
    outcomeBucket: varchar("outcome_bucket", { length: 8 }),
    inactiveStageLabel: varchar("inactive_stage_label", { length: 128 }),
    expectedValueMinor: bigint("expected_value_minor", { mode: "number" }),
    expectedValueCurrency: varchar("expected_value_currency", { length: 3 }),
    createdByUserId: varchar("created_by_user_id", { length: 36 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull()
  },
  (table) => ({
    crmOrgIdx: index("sales_funnel_sales_deals_crm_org_idx").on(table.tenantId, table.crmOrganizationId),
    tenantStageIdx: index("sales_funnel_sales_deals_tenant_stage_idx").on(
      table.tenantId,
      table.stageKey,
      table.updatedAt
    ),
    tenantOwnerIdx: index("sales_funnel_sales_deals_tenant_owner_idx").on(table.tenantId, table.ownerUserId),
    tenantActiveIdx: index("sales_funnel_sales_deals_tenant_active_idx").on(table.tenantId, table.archivedAt),
    promotedIdx: index("sales_funnel_sales_deals_promoted_idx").on(table.tenantId, table.promotedFromLeadId)
  })
);

export const salesFunnelDealContacts = mysqlTable(
  "sales_funnel_deal_contacts",
  {
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    dealId: varchar("deal_id", { length: 36 })
      .notNull()
      .references(() => salesFunnelSalesDeals.id, { onDelete: "cascade" }),
    contactId: varchar("contact_id", { length: 36 })
      .notNull()
      .references(() => crmContacts.id, { onDelete: "cascade" }),
    roleLabel: varchar("role_label", { length: 128 }).notNull().default(""),
    createdAt: timestamp("created_at").defaultNow().notNull()
  },
  (table) => ({
    pk: primaryKey({ columns: [table.dealId, table.contactId] }),
    contactIdx: index("sales_funnel_deal_contacts_contact_idx").on(table.tenantId, table.contactId)
  })
);

export const salesFunnelActivities = mysqlTable(
  "sales_funnel_activities",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    entityType: varchar("entity_type", { length: 32 }).notNull(),
    entityId: varchar("entity_id", { length: 36 }).notNull(),
    activityType: varchar("activity_type", { length: 32 }).notNull(),
    summary: text("summary").notNull(),
    payloadJson: text("payload_json"),
    actorUserId: varchar("actor_user_id", { length: 36 }),
    createdAt: timestamp("created_at").defaultNow().notNull()
  },
  (table) => ({
    entityIdx: index("sales_funnel_activities_entity_idx").on(
      table.tenantId,
      table.entityType,
      table.entityId,
      table.createdAt
    )
  })
);

/** Tenant: vendor/SaaS subscription registry (documentation — not realm billing). */
export const companySubscriptionProviders = mysqlTable(
  "company_subscription_providers",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 512 }).notNull(),
    vendorName: varchar("vendor_name", { length: 512 }),
    category: varchar("category", { length: 128 }),
    description: text("description"),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    subscriptionKind: varchar("subscription_kind", { length: 32 }).notNull().default("singular"),
    ownerEmployeeId: varchar("owner_employee_id", { length: 36 }).references(() => workforceEmployees.id, {
      onDelete: "set null"
    }),
    renewalDate: date("renewal_date"),
    contractStartDate: date("contract_start_date"),
    contractEndDate: date("contract_end_date"),
    cadenceKind: varchar("cadence_kind", { length: 32 }).notNull().default("monthly"),
    cadenceIntervalCount: int("cadence_interval_count"),
    cadenceIntervalUnit: varchar("cadence_interval_unit", { length: 16 }),
    amountMinor: bigint("amount_minor", { mode: "number" }),
    currencyCode: varchar("currency_code", { length: 3 }),
    billingMetadataJson: text("billing_metadata_json").notNull(),
    notes: text("notes"),
    createdByUserId: varchar("created_by_user_id", { length: 36 }).references(() => users.id, {
      onDelete: "set null"
    }),
    updatedByUserId: varchar("updated_by_user_id", { length: 36 }).references(() => users.id, {
      onDelete: "set null"
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull()
  },
  (table) => ({
    tenantStatusIdx: index("company_subscription_providers_tenant_status_idx").on(table.tenantId, table.status),
    tenantRenewalIdx: index("company_subscription_providers_tenant_renewal_idx").on(table.tenantId, table.renewalDate)
  })
);

export const companySubscriptionPlans = mysqlTable(
  "company_subscription_plans",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    providerId: varchar("provider_id", { length: 36 })
      .notNull()
      .references(() => companySubscriptionProviders.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 512 }).notNull(),
    sku: varchar("sku", { length: 256 }),
    seatCount: int("seat_count"),
    amountMinor: bigint("amount_minor", { mode: "number" }),
    currencyCode: varchar("currency_code", { length: 3 }),
    cadenceKind: varchar("cadence_kind", { length: 32 }).notNull().default("monthly"),
    cadenceIntervalCount: int("cadence_interval_count"),
    cadenceIntervalUnit: varchar("cadence_interval_unit", { length: 16 }),
    startDate: date("start_date"),
    endDate: date("end_date"),
    renewalDate: date("renewal_date"),
    autoRenew: boolean("auto_renew").notNull().default(false),
    notes: text("notes"),
    createdByUserId: varchar("created_by_user_id", { length: 36 }).references(() => users.id, {
      onDelete: "set null"
    }),
    updatedByUserId: varchar("updated_by_user_id", { length: 36 }).references(() => users.id, {
      onDelete: "set null"
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull()
  },
  (table) => ({
    providerIdx: index("company_subscription_plans_provider_idx").on(table.tenantId, table.providerId)
  })
);

export const companySubscriptionSeats = mysqlTable(
  "company_subscription_seats",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    planId: varchar("plan_id", { length: 36 })
      .notNull()
      .references(() => companySubscriptionPlans.id, { onDelete: "cascade" }),
    employeeId: varchar("employee_id", { length: 36 }).references(() => workforceEmployees.id, {
      onDelete: "set null"
    }),
    displayName: varchar("display_name", { length: 512 }),
    email: text("email"),
    seatType: varchar("seat_type", { length: 128 }),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    notes: text("notes"),
    createdByUserId: varchar("created_by_user_id", { length: 36 }).references(() => users.id, {
      onDelete: "set null"
    }),
    updatedByUserId: varchar("updated_by_user_id", { length: 36 }).references(() => users.id, {
      onDelete: "set null"
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull()
  },
  (table) => ({
    planIdx: index("company_subscription_seats_plan_idx").on(table.tenantId, table.planId)
  })
);

export const companySubscriptionProviderDocuments = mysqlTable(
  "company_subscription_provider_documents",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    providerId: varchar("provider_id", { length: 36 })
      .notNull()
      .references(() => companySubscriptionProviders.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 512 }).notNull(),
    originalFilename: varchar("original_filename", { length: 512 }).notNull(),
    mimeType: varchar("mime_type", { length: 255 }),
    storageRelPath: varchar("storage_rel_path", { length: 512 }).notNull(),
    byteSize: int("byte_size").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull()
  },
  (table) => ({
    providerIdx: index("company_subscription_provider_documents_provider_idx").on(table.tenantId, table.providerId)
  })
);

export const invoicingTenantConfiguration = mysqlTable("invoicing_tenant_configuration", {
  tenantId: varchar("tenant_id", { length: 36 })
    .primaryKey()
    .references(() => tenants.id, { onDelete: "cascade" }),
  quoteNumberPrefix: varchar("quote_number_prefix", { length: 16 }).notNull().default("QUO"),
  offerNumberPrefix: varchar("offer_number_prefix", { length: 16 }).notNull().default("OFF"),
  invoiceNumberPrefix: varchar("invoice_number_prefix", { length: 16 }).notNull().default("INV"),
  quoteSequenceYear: int("quote_sequence_year"),
  offerSequenceYear: int("offer_sequence_year"),
  invoiceSequenceYear: int("invoice_sequence_year"),
  quoteSequenceCurrent: int("quote_sequence_current").notNull().default(0),
  offerSequenceCurrent: int("offer_sequence_current").notNull().default(0),
  invoiceSequenceCurrent: int("invoice_sequence_current").notNull().default(0),
  numberPadding: int("number_padding").notNull().default(4),
  yearlyReset: boolean("yearly_reset").notNull().default(true),
  allowDirectQuoteToInvoice: boolean("allow_direct_quote_to_invoice").notNull().default(false),
  requireQuoteExpiryDate: boolean("require_quote_expiry_date").notNull().default(false),
  allowCustomerFacingQuotes: boolean("allow_customer_facing_quotes").notNull().default(true),
  defaultQuoteValidityDays: int("default_quote_validity_days"),
  defaultPaymentTermDays: int("default_payment_term_days").default(30),
  paymentReminderFirstOffsetDays: int("payment_reminder_first_offset_days").notNull().default(0),
  paymentReminderSecondOffsetDays: int("payment_reminder_second_offset_days").notNull().default(7),
  paymentRemindersEnabled: boolean("payment_reminders_enabled").notNull().default(true),
  emailMomentsEnabledJson: text("email_moments_enabled_json").notNull().default("{}"),
  autoExpireOffersEnabled: boolean("auto_expire_offers_enabled").notNull().default(true),
  quoteExpiryWarningsEnabled: boolean("quote_expiry_warnings_enabled").notNull().default(true),
  allowManualLineItems: boolean("allow_manual_line_items").notNull().default(true),
  allowDiscounts: boolean("allow_discounts").notNull().default(true),
  issuerSnapshotJson: text("issuer_snapshot_json").notNull().default("{}"),
  taxRateOptionsJson: text("tax_rate_options_json").notNull().default("[]"),
  defaultQuoteTermsText: text("default_quote_terms_text").notNull().default(""),
  defaultOfferTermsText: text("default_offer_terms_text").notNull().default(""),
  defaultInvoiceTermsText: text("default_invoice_terms_text").notNull().default(""),
  defaultFooterText: text("default_footer_text").notNull().default(""),
  documentThemeColor: varchar("document_theme_color", { length: 32 }).notNull().default("purple"),
  companyLogoRelPath: varchar("company_logo_rel_path", { length: 512 }),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull()
});

export const invoicingNumberSequences = mysqlTable(
  "invoicing_number_sequences",
  {
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    documentKind: varchar("document_kind", { length: 16 }).notNull(),
    sequenceYear: int("sequence_year").notNull().default(0),
    nextValue: int("next_value").notNull().default(1)
  },
  (table) => ({
    pk: primaryKey({ columns: [table.tenantId, table.documentKind, table.sequenceYear] })
  })
);

export const invoicingCatalogItems = mysqlTable(
  "invoicing_catalog_items",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    itemKind: varchar("item_kind", { length: 16 }).notNull().default("service"),
    sku: varchar("sku", { length: 64 }),
    name: varchar("name", { length: 512 }).notNull(),
    description: text("description").notNull().default(""),
    unitLabel: varchar("unit_label", { length: 32 }).notNull().default("unit"),
    unitPriceMinor: bigint("unit_price_minor", { mode: "number" }).notNull().default(0),
    currencyCode: varchar("currency_code", { length: 3 }).notNull().default("USD"),
    taxRateBps: int("tax_rate_bps"),
    isActive: boolean("is_active").notNull().default(true),
    createdByUserId: varchar("created_by_user_id", { length: 36 }),
    updatedByUserId: varchar("updated_by_user_id", { length: 36 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull()
  },
  (table) => ({
    tenantActiveIdx: index("invoicing_catalog_items_tenant_active_idx").on(table.tenantId, table.isActive, table.name)
  })
);

const invoicingDocumentTotalsColumnsMysql = {
  subtotalExcludingTaxMinor: bigint("subtotal_excluding_tax_minor", { mode: "number" }).notNull().default(0),
  discountTotalMinor: bigint("discount_total_minor", { mode: "number" }).notNull().default(0),
  taxTotalMinor: bigint("tax_total_minor", { mode: "number" }).notNull().default(0),
  totalIncludingTaxMinor: bigint("total_including_tax_minor", { mode: "number" }).notNull().default(0),
  taxBreakdownJson: text("tax_breakdown_json").notNull().default("[]"),
  notes: text("notes").notNull().default(""),
  internalNotes: text("internal_notes").notNull().default(""),
  termsText: text("terms_text").notNull().default(""),
  footerText: text("footer_text").notNull().default(""),
  createdByUserId: varchar("created_by_user_id", { length: 36 }),
  updatedByUserId: varchar("updated_by_user_id", { length: 36 }),
  archivedAt: timestamp("archived_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull()
};

export const invoicingQuotes = mysqlTable(
  "invoicing_quotes",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 32 }).notNull().default("quote_draft"),
    documentNumber: varchar("document_number", { length: 64 }),
    temporaryReference: varchar("temporary_reference", { length: 64 }),
    sourceOfferId: varchar("source_offer_id", { length: 36 }),
    sourceInvoiceId: varchar("source_invoice_id", { length: 36 }),
    crmOrganizationId: varchar("crm_organization_id", { length: 36 }),
    crmContactId: varchar("crm_contact_id", { length: 36 }),
    customerSnapshotJson: text("customer_snapshot_json").notNull().default("{}"),
    issuerSnapshotJson: text("issuer_snapshot_json").notNull().default("{}"),
    currencyCode: varchar("currency_code", { length: 3 }).notNull(),
    documentDate: date("document_date").notNull(),
    quoteExpiryDate: date("quote_expiry_date"),
    paymentTermDays: int("payment_term_days"),
    ...invoicingDocumentTotalsColumnsMysql
  },
  (table) => ({
    tenantStatusIdx: index("invoicing_quotes_tenant_status_idx").on(table.tenantId, table.status, table.updatedAt),
    tenantNumberIdx: index("invoicing_quotes_tenant_number_idx").on(table.tenantId, table.documentNumber),
    sourceOfferIdx: index("invoicing_quotes_source_offer_idx").on(table.sourceOfferId),
    sourceInvoiceIdx: index("invoicing_quotes_source_invoice_idx").on(table.sourceInvoiceId)
  })
);

export const invoicingQuoteLineItems = mysqlTable(
  "invoicing_quote_line_items",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    quoteId: varchar("quote_id", { length: 36 })
      .notNull()
      .references(() => invoicingQuotes.id, { onDelete: "cascade" }),
    sortOrder: int("sort_order").notNull().default(0),
    catalogItemId: varchar("catalog_item_id", { length: 36 }),
    lineKind: varchar("line_kind", { length: 16 }).notNull().default("manual"),
    description: text("description").notNull().default(""),
    sku: varchar("sku", { length: 64 }),
    quantity: decimal("quantity", { precision: 18, scale: 6 }).notNull().default("1"),
    unitLabel: varchar("unit_label", { length: 32 }).notNull().default("unit"),
    unitPriceMinor: bigint("unit_price_minor", { mode: "number" }).notNull().default(0),
    discountMinor: bigint("discount_minor", { mode: "number" }).notNull().default(0),
    taxRateBps: int("tax_rate_bps"),
    lineSubtotalMinor: bigint("line_subtotal_minor", { mode: "number" }).notNull().default(0),
    lineTaxMinor: bigint("line_tax_minor", { mode: "number" }).notNull().default(0),
    lineTotalMinor: bigint("line_total_minor", { mode: "number" }).notNull().default(0),
    snapshotJson: text("snapshot_json").notNull().default("{}"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull()
  },
  (table) => ({
    quoteIdx: index("invoicing_quote_line_items_quote_idx").on(table.quoteId, table.sortOrder)
  })
);

export const invoicingOffers = mysqlTable(
  "invoicing_offers",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 32 }).notNull().default("offer_draft"),
    documentNumber: varchar("document_number", { length: 64 }).notNull(),
    revision: varchar("revision", { length: 32 }),
    sourceQuoteId: varchar("source_quote_id", { length: 36 }),
    crmOrganizationId: varchar("crm_organization_id", { length: 36 }),
    crmContactId: varchar("crm_contact_id", { length: 36 }),
    customerSnapshotJson: text("customer_snapshot_json").notNull().default("{}"),
    issuerSnapshotJson: text("issuer_snapshot_json").notNull().default("{}"),
    currencyCode: varchar("currency_code", { length: 3 }).notNull(),
    documentDate: date("document_date").notNull(),
    offerExpiryDate: date("offer_expiry_date"),
    paymentTermDays: int("payment_term_days"),
    ...invoicingDocumentTotalsColumnsMysql
  },
  (table) => ({
    tenantStatusIdx: index("invoicing_offers_tenant_status_idx").on(table.tenantId, table.status, table.updatedAt),
    sourceQuoteIdx: index("invoicing_offers_source_quote_idx").on(table.sourceQuoteId)
  })
);

export const invoicingOfferLineItems = mysqlTable(
  "invoicing_offer_line_items",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    offerId: varchar("offer_id", { length: 36 })
      .notNull()
      .references(() => invoicingOffers.id, { onDelete: "cascade" }),
    sortOrder: int("sort_order").notNull().default(0),
    catalogItemId: varchar("catalog_item_id", { length: 36 }),
    lineKind: varchar("line_kind", { length: 16 }).notNull().default("manual"),
    description: text("description").notNull().default(""),
    sku: varchar("sku", { length: 64 }),
    quantity: decimal("quantity", { precision: 18, scale: 6 }).notNull().default("1"),
    unitLabel: varchar("unit_label", { length: 32 }).notNull().default("unit"),
    unitPriceMinor: bigint("unit_price_minor", { mode: "number" }).notNull().default(0),
    discountMinor: bigint("discount_minor", { mode: "number" }).notNull().default(0),
    taxRateBps: int("tax_rate_bps"),
    lineSubtotalMinor: bigint("line_subtotal_minor", { mode: "number" }).notNull().default(0),
    lineTaxMinor: bigint("line_tax_minor", { mode: "number" }).notNull().default(0),
    lineTotalMinor: bigint("line_total_minor", { mode: "number" }).notNull().default(0),
    snapshotJson: text("snapshot_json").notNull().default("{}"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull()
  },
  (table) => ({
    offerIdx: index("invoicing_offer_line_items_offer_idx").on(table.offerId, table.sortOrder)
  })
);

export const invoicingOfferResponseTokens = mysqlTable(
  "invoicing_offer_response_tokens",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    offerId: varchar("offer_id", { length: 36 })
      .notNull()
      .references(() => invoicingOffers.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull()
  },
  (table) => ({
    offerUnique: uniqueIndex("invoicing_offer_response_tokens_offer_unique").on(table.offerId),
    tokenHashUnique: uniqueIndex("invoicing_offer_response_tokens_hash_unique").on(table.tokenHash)
  })
);

export const invoicingInvoices = mysqlTable(
  "invoicing_invoices",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 32 }).notNull().default("invoice_draft"),
    documentNumber: varchar("document_number", { length: 64 }).notNull(),
    revision: varchar("revision", { length: 32 }),
    sourceQuoteId: varchar("source_quote_id", { length: 36 }),
    sourceOfferId: varchar("source_offer_id", { length: 36 }),
    sourceInvoiceId: varchar("source_invoice_id", { length: 36 }),
    crmOrganizationId: varchar("crm_organization_id", { length: 36 }),
    crmContactId: varchar("crm_contact_id", { length: 36 }),
    customerSnapshotJson: text("customer_snapshot_json").notNull().default("{}"),
    issuerSnapshotJson: text("issuer_snapshot_json").notNull().default("{}"),
    currencyCode: varchar("currency_code", { length: 3 }).notNull(),
    documentDate: date("document_date").notNull(),
    invoiceDate: date("invoice_date"),
    serviceDeliveryDate: date("service_delivery_date"),
    paymentTermDays: int("payment_term_days"),
    dueDate: date("due_date"),
    partialPaymentAnchorDate: date("partial_payment_anchor_date"),
    ...invoicingDocumentTotalsColumnsMysql,
    finalizedAt: timestamp("finalized_at")
  },
  (table) => ({
    tenantStatusIdx: index("invoicing_invoices_tenant_status_idx").on(table.tenantId, table.status, table.updatedAt),
    dueDateIdx: index("invoicing_invoices_due_date_idx").on(table.tenantId, table.status, table.dueDate),
    sourceOfferIdx: index("invoicing_invoices_source_offer_idx").on(table.sourceOfferId),
    sourceInvoiceIdx: index("invoicing_invoices_source_invoice_idx").on(table.sourceInvoiceId)
  })
);

export const invoicingInvoiceLineItems = mysqlTable(
  "invoicing_invoice_line_items",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    invoiceId: varchar("invoice_id", { length: 36 })
      .notNull()
      .references(() => invoicingInvoices.id, { onDelete: "cascade" }),
    sortOrder: int("sort_order").notNull().default(0),
    catalogItemId: varchar("catalog_item_id", { length: 36 }),
    lineKind: varchar("line_kind", { length: 16 }).notNull().default("manual"),
    description: text("description").notNull().default(""),
    sku: varchar("sku", { length: 64 }),
    quantity: decimal("quantity", { precision: 18, scale: 6 }).notNull().default("1"),
    unitLabel: varchar("unit_label", { length: 32 }).notNull().default("unit"),
    unitPriceMinor: bigint("unit_price_minor", { mode: "number" }).notNull().default(0),
    discountMinor: bigint("discount_minor", { mode: "number" }).notNull().default(0),
    taxRateBps: int("tax_rate_bps"),
    lineSubtotalMinor: bigint("line_subtotal_minor", { mode: "number" }).notNull().default(0),
    lineTaxMinor: bigint("line_tax_minor", { mode: "number" }).notNull().default(0),
    lineTotalMinor: bigint("line_total_minor", { mode: "number" }).notNull().default(0),
    snapshotJson: text("snapshot_json").notNull().default("{}"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull()
  },
  (table) => ({
    invoiceIdx: index("invoicing_invoice_line_items_invoice_idx").on(table.invoiceId, table.sortOrder)
  })
);

export const invoicingInvoicePayments = mysqlTable(
  "invoicing_invoice_payments",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    invoiceId: varchar("invoice_id", { length: 36 })
      .notNull()
      .references(() => invoicingInvoices.id, { onDelete: "cascade" }),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    paymentDate: date("payment_date").notNull(),
    reference: varchar("reference", { length: 128 }),
    note: text("note").notNull().default(""),
    revisedInvoiceId: varchar("revised_invoice_id", { length: 36 }),
    createdByUserId: varchar("created_by_user_id", { length: 36 }),
    createdAt: timestamp("created_at").defaultNow().notNull()
  },
  (table) => ({
    invoiceIdx: index("invoicing_invoice_payments_invoice_idx").on(
      table.tenantId,
      table.invoiceId,
      table.createdAt
    )
  })
);

export const invoicingPaymentReminders = mysqlTable(
  "invoicing_payment_reminders",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    invoiceId: varchar("invoice_id", { length: 36 })
      .notNull()
      .references(() => invoicingInvoices.id, { onDelete: "cascade" }),
    reminderKind: varchar("reminder_kind", { length: 16 }).notNull(),
    recipientEmail: varchar("recipient_email", { length: 320 }).notNull(),
    sentAt: timestamp("sent_at").defaultNow().notNull()
  },
  (table) => ({
    invoiceKindUnique: uniqueIndex("invoicing_payment_reminders_invoice_kind_unique").on(
      table.tenantId,
      table.invoiceId,
      table.reminderKind
    )
  })
);

export const invoicingAuditEvents = mysqlTable(
  "invoicing_audit_events",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    eventKind: varchar("event_kind", { length: 64 }).notNull(),
    documentKind: varchar("document_kind", { length: 16 }).notNull(),
    documentId: varchar("document_id", { length: 36 }).notNull(),
    actorUserId: varchar("actor_user_id", { length: 36 }),
    payloadJson: text("payload_json").notNull().default("{}"),
    createdAt: timestamp("created_at").defaultNow().notNull()
  },
  (table) => ({
    tenantDocIdx: index("invoicing_audit_events_tenant_doc_idx").on(
      table.tenantId,
      table.documentKind,
      table.documentId,
      table.createdAt
    )
  })
);

export const tenantUserModuleRoles = mysqlTable(
  "tenant_user_module_roles",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    module: varchar("module", { length: 32 }).notNull(),
    role: varchar("role", { length: 32 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull()
  },
  (table) => ({
    tenantUserModuleUnique: uniqueIndex("tenant_user_module_roles_tenant_user_module_unique").on(
      table.tenantId,
      table.userId,
      table.module
    ),
    tenantUserIdx: index("tenant_user_module_roles_tenant_user_idx").on(table.tenantId, table.userId)
  })
);

/** Stripe webhook dedupe — `stripe_event_id` is the Stripe event id (`evt_...`). */
export const processedStripeEvents = mysqlTable("processed_stripe_events", {
  stripeEventId: varchar("stripe_event_id", { length: 255 }).primaryKey(),
  eventType: varchar("event_type", { length: 128 }).notNull(),
  processedAt: timestamp("processed_at").defaultNow().notNull()
});

export const mailboxInboxes = mysqlTable(
  "mailbox_inboxes",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    ownerScope: varchar("owner_scope", { length: 32 }).notNull().default("user"),
    ownerUserId: varchar("owner_user_id", { length: 36 }),
    /** Set when `owner_scope` is `workforce_agent`; cascades mailbox delete with the employee. */
    ownerEmployeeId: varchar("owner_employee_id", { length: 36 }).references(() => workforceEmployees.id, {
      onDelete: "cascade"
    }),
    displayName: varchar("display_name", { length: 255 }).notNull().default(""),
    color: varchar("color", { length: 32 }).notNull().default("#6366f1"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull()
  },
  (table) => ({
    tenantOwnerIdx: index("mailbox_inboxes_tenant_owner_idx").on(table.tenantId, table.ownerUserId),
    tenantScopeIdx: index("mailbox_inboxes_tenant_scope_idx").on(table.tenantId, table.ownerScope),
    tenantEmployeeIdx: index("mailbox_inboxes_tenant_employee_idx").on(table.tenantId, table.ownerEmployeeId)
  })
);

export const mailboxAccounts = mysqlTable(
  "mailbox_accounts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    mailboxInboxId: varchar("mailbox_inbox_id", { length: 36 })
      .notNull()
      .references(() => mailboxInboxes.id, { onDelete: "cascade" }),
    ownerScope: varchar("owner_scope", { length: 32 }).notNull().default("user"),
    ownerUserId: varchar("owner_user_id", { length: 36 }),
    /** Mirrors inbox ownership for agent-scoped connections. */
    ownerEmployeeId: varchar("owner_employee_id", { length: 36 }).references(() => workforceEmployees.id, {
      onDelete: "cascade"
    }),
    displayName: text("display_name").notNull().default(""),
    emailAddress: text("email_address").notNull().default(""),
    provider: varchar("provider", { length: 32 }).notNull().default("internal"),
    imapHost: varchar("imap_host", { length: 255 }),
    imapPort: int("imap_port"),
    imapSecure: boolean("imap_secure").notNull().default(true),
    smtpHost: varchar("smtp_host", { length: 255 }),
    smtpPort: int("smtp_port"),
    smtpSecure: boolean("smtp_secure").notNull().default(true),
    username: varchar("username", { length: 512 }),
    credentialsEncrypted: text("credentials_encrypted"),
    oauthRefreshTokenEncrypted: text("oauth_refresh_token_encrypted"),
    oauthAccessTokenEncrypted: text("oauth_access_token_encrypted"),
    oauthAccessTokenExpiresAt: timestamp("oauth_access_token_expires_at"),
    syncCursor: text("sync_cursor"),
    syncStatus: varchar("sync_status", { length: 32 }).notNull().default("idle"),
    syncError: text("sync_error"),
    lastSyncedAt: timestamp("last_synced_at"),
    webhookSubscriptionId: varchar("webhook_subscription_id", { length: 512 }),
    color: varchar("color", { length: 32 }).notNull().default("#6366f1"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull()
  },
  (table) => ({
    tenantOwnerIdx: index("mailbox_accounts_tenant_owner_idx").on(table.tenantId, table.ownerUserId),
    tenantScopeIdx: index("mailbox_accounts_tenant_scope_idx").on(table.tenantId, table.ownerScope),
    tenantEmployeeIdx: index("mailbox_accounts_tenant_employee_idx").on(table.tenantId, table.ownerEmployeeId),
    inboxIdx: index("mailbox_accounts_inbox_idx").on(table.tenantId, table.mailboxInboxId)
  })
);

export const mailboxAccountMembers = mysqlTable(
  "mailbox_account_members",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    accountId: varchar("account_id", { length: 36 })
      .notNull()
      .references(() => mailboxAccounts.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 32 }).notNull().default("viewer"),
    createdAt: timestamp("created_at").defaultNow().notNull()
  },
  (table) => ({
    accountUserUnique: uniqueIndex("mailbox_account_members_account_user_uq").on(table.accountId, table.userId),
    userIdx: index("mailbox_account_members_user_idx").on(table.tenantId, table.userId)
  })
);

export const mailboxThreads = mysqlTable(
  "mailbox_threads",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    accountId: varchar("account_id", { length: 36 })
      .notNull()
      .references(() => mailboxAccounts.id, { onDelete: "cascade" }),
    providerThreadId: varchar("provider_thread_id", { length: 512 }),
    subjectNormalized: text("subject_normalized").notNull().default(""),
    snippet: text("snippet").notNull(),
    folder: varchar("folder", { length: 64 }).notNull().default("inbox"),
    previousFolder: varchar("previous_folder", { length: 64 }),
    lastMessageAt: timestamp("last_message_at").defaultNow().notNull(),
    unreadCount: int("unread_count").notNull().default(0),
    isStarred: boolean("is_starred").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull()
  },
  (table) => ({
    accountFolderIdx: index("mailbox_threads_account_folder_idx").on(
      table.tenantId,
      table.accountId,
      table.folder,
      table.lastMessageAt
    ),
    providerThreadIdx: index("mailbox_threads_provider_thread_idx").on(table.accountId, table.providerThreadId)
  })
);

export const mailboxMessages = mysqlTable(
  "mailbox_messages",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    accountId: varchar("account_id", { length: 36 })
      .notNull()
      .references(() => mailboxAccounts.id, { onDelete: "cascade" }),
    threadId: varchar("thread_id", { length: 36 })
      .notNull()
      .references(() => mailboxThreads.id, { onDelete: "cascade" }),
    providerMessageId: varchar("provider_message_id", { length: 512 }),
    direction: varchar("direction", { length: 16 }).notNull().default("inbound"),
    fromJson: text("from_json").notNull(),
    toJson: text("to_json").notNull(),
    ccJson: text("cc_json").notNull(),
    bccJson: text("bcc_json").notNull(),
    subject: text("subject").notNull().default(""),
    snippet: text("snippet").notNull(),
    bodyText: text("body_text"),
    bodyHtml: text("body_html"),
    headersJson: text("headers_json"),
    messageId: varchar("message_id", { length: 512 }),
    inReplyTo: varchar("in_reply_to", { length: 512 }),
    referencesHeader: text("references_header"),
    internalSource: varchar("internal_source", { length: 64 }),
    actionUrl: varchar("action_url", { length: 2048 }),
    relatedEntityKind: varchar("related_entity_kind", { length: 64 }),
    relatedEntityId: varchar("related_entity_id", { length: 36 }),
    receivedAt: timestamp("received_at").defaultNow().notNull(),
    isRead: boolean("is_read").notNull().default(false),
    isDraft: boolean("is_draft").notNull().default(false),
    hasAttachments: boolean("has_attachments").notNull().default(false),
    hasCalendarInvite: boolean("has_calendar_invite").notNull().default(false),
    sentByUserId: varchar("sent_by_user_id", { length: 36 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull()
  },
  (table) => ({
    threadIdx: index("mailbox_messages_thread_idx").on(table.tenantId, table.threadId, table.receivedAt),
    accountReceivedIdx: index("mailbox_messages_account_received_idx").on(
      table.tenantId,
      table.accountId,
      table.receivedAt
    )
  })
);

export const mailboxAttachments = mysqlTable(
  "mailbox_attachments",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    messageId: varchar("message_id", { length: 36 })
      .notNull()
      .references(() => mailboxMessages.id, { onDelete: "cascade" }),
    filename: varchar("filename", { length: 512 }).notNull().default("attachment"),
    mimeType: varchar("mime_type", { length: 255 }).notNull().default("application/octet-stream"),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),
    blobPath: varchar("blob_path", { length: 1024 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull()
  },
  (table) => ({
    messageIdx: index("mailbox_attachments_message_idx").on(table.tenantId, table.messageId)
  })
);

export const mailboxCalendars = mysqlTable(
  "mailbox_calendars",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mailboxAccountId: varchar("mailbox_account_id", { length: 36 }).references(() => mailboxAccounts.id, {
      onDelete: "cascade"
    }),
    name: varchar("name", { length: 255 }).notNull().default("Calendar"),
    color: varchar("color", { length: 32 }).notNull().default("#3b82f6"),
    isPrimary: boolean("is_primary").notNull().default(false),
    source: varchar("source", { length: 32 }).notNull().default("native"),
    providerCalendarId: varchar("provider_calendar_id", { length: 512 }),
    syncCursor: text("sync_cursor"),
    syncStatus: varchar("sync_status", { length: 32 }).notNull().default("idle"),
    syncError: text("sync_error"),
    lastSyncedAt: timestamp("last_synced_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull()
  },
  (table) => ({
    userIdx: index("mailbox_calendars_user_idx").on(table.tenantId, table.userId),
    accountIdx: index("mailbox_calendars_account_idx").on(table.tenantId, table.mailboxAccountId)
  })
);

export const mailboxCalendarEvents = mysqlTable(
  "mailbox_calendar_events",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    calendarId: varchar("calendar_id", { length: 36 })
      .notNull()
      .references(() => mailboxCalendars.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 1024 }).notNull().default(""),
    description: text("description"),
    location: varchar("location", { length: 1024 }),
    startsAt: timestamp("starts_at").notNull(),
    endsAt: timestamp("ends_at").notNull(),
    timezone: varchar("timezone", { length: 64 }).notNull().default("UTC"),
    allDay: boolean("all_day").notNull().default(false),
    status: varchar("status", { length: 32 }).notNull().default("confirmed"),
    organizerJson: text("organizer_json").notNull(),
    sourceMessageId: varchar("source_message_id", { length: 36 }),
    providerEventId: varchar("provider_event_id", { length: 512 }),
    icsUid: varchar("ics_uid", { length: 512 }),
    icsSequence: int("ics_sequence").notNull().default(0),
    recurrenceJson: text("recurrence_json"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull()
  },
  (table) => ({
    calendarIdx: index("mailbox_calendar_events_calendar_idx").on(
      table.tenantId,
      table.calendarId,
      table.startsAt
    )
  })
);

export const mailboxEventAttendees = mysqlTable(
  "mailbox_event_attendees",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    eventId: varchar("event_id", { length: 36 })
      .notNull()
      .references(() => mailboxCalendarEvents.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 320 }).notNull(),
    displayName: varchar("display_name", { length: 512 }),
    response: varchar("response", { length: 32 }).notNull().default("needs_action"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull()
  },
  (table) => ({
    eventIdx: index("mailbox_event_attendees_event_idx").on(table.tenantId, table.eventId)
  })
);

/** Server-side KV cache (Nominatim geocode, WS tickets) when `QUEUE_STRATEGY=local`. */
export const appCacheEntries = mysqlTable(
  "app_cache_entries",
  {
    namespace: varchar("namespace", { length: 64 }).notNull(),
    cacheKey: varchar("cache_key", { length: 128 }).notNull(),
    payload: text("payload").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull()
  },
  (table) => ({
    pk: primaryKey({ columns: [table.namespace, table.cacheKey] }),
    expiresIdx: index("app_cache_entries_expires_idx").on(table.expiresAt)
  })
);

/** Database-backed job queue when `QUEUE_STRATEGY=local` (alternative to BullMQ/Redis). */
export const backgroundJobs = mysqlTable(
  "background_jobs",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    queueName: varchar("queue_name", { length: 128 }).notNull(),
    jobName: varchar("job_name", { length: 128 }).notNull(),
    payload: text("payload").notNull(),
    dedupeKey: varchar("dedupe_key", { length: 256 }),
    status: varchar("status", { length: 32 }).notNull().default("waiting"),
    priority: int("priority").notNull().default(0),
    attempts: int("attempts").notNull().default(0),
    maxAttempts: int("max_attempts").notNull().default(3),
    runAt: timestamp("run_at").notNull(),
    lockedAt: timestamp("locked_at"),
    lockedBy: varchar("locked_by", { length: 128 }),
    result: text("result"),
    error: text("error"),
    processedAt: timestamp("processed_at"),
    finishedAt: timestamp("finished_at"),
    purgeAfter: timestamp("purge_after"),
    completedRetentionSec: int("completed_retention_sec"),
    failedRetentionSec: int("failed_retention_sec"),
    createdAt: timestamp("created_at").defaultNow().notNull()
  },
  (table) => ({
    queueStatusRunPriorityIdx: index("background_jobs_queue_status_run_priority_idx").on(
      table.queueName,
      table.status,
      table.runAt,
      table.priority
    ),
    purgeAfterIdx: index("background_jobs_purge_after_idx").on(table.purgeAfter),
    queueDedupeUnique: uniqueIndex("background_jobs_queue_dedupe_unique").on(table.queueName, table.dedupeKey)
  })
);
