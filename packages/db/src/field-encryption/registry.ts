/**
 * Declarative registry of encrypted fields per table.
 *
 * Only registered tables/fields pass through {@link FieldEncryptionMiddleware}.
 */

export type FieldEncryptionDef = {
  /** Field holds user-supplied sensitive data. */
  sensitive: boolean;
  /** Field participates in blind-index search. */
  searchable?: boolean;
  /** Override default n-gram size for this field. */
  ngramSize?: number;
};

export type TableEncryptionConfig = {
  /** DB table name (snake_case). */
  tableName: string;
  /** Drizzle property name for tenant id column. */
  tenantColumn: string;
  /** Drizzle property name for primary key. */
  entityIdColumn: string;
  fields: Record<string, FieldEncryptionDef>;
};

export const FIELD_ENCRYPTION_REGISTRY: Record<string, TableEncryptionConfig> = {
  tenants: {
    tableName: "tenants",
    tenantColumn: "id",
    entityIdColumn: "id",
    fields: {
      /** Platform KEK scope (`tenantId` null) — realm key must be searchable before tenant id exists. */
      name: { sensitive: true, searchable: true }
    }
  },
  crm_contacts: {
    tableName: "crm_contacts",
    tenantColumn: "tenantId",
    entityIdColumn: "id",
    fields: {
      firstName: { sensitive: true, searchable: true },
      lastName: { sensitive: true, searchable: true },
      salutation: { sensitive: true, searchable: true },
      title: { sensitive: true, searchable: true },
      email: { sensitive: true, searchable: true },
      phone: { sensitive: true, searchable: true },
      addressLine1: { sensitive: true, searchable: true },
      addressLine2: { sensitive: true, searchable: true },
      postalCode: { sensitive: true, searchable: true },
      city: { sensitive: true, searchable: true },
      state: { sensitive: true, searchable: true },
      country: { sensitive: true, searchable: true }
    }
  },
  crm_organizations: {
    tableName: "crm_organizations",
    tenantColumn: "tenantId",
    entityIdColumn: "id",
    fields: {
      name: { sensitive: true, searchable: true },
      email: { sensitive: true, searchable: true },
      phone: { sensitive: true, searchable: true },
      emailsJson: { sensitive: true },
      phonesJson: { sensitive: true },
      addressesJson: { sensitive: true },
      addressLine1: { sensitive: true, searchable: true },
      addressLine2: { sensitive: true, searchable: true },
      postalCode: { sensitive: true, searchable: true },
      city: { sensitive: true, searchable: true },
      state: { sensitive: true, searchable: true },
      country: { sensitive: true, searchable: true }
    }
  },
  crm_activities: {
    tableName: "crm_activities",
    tenantColumn: "tenantId",
    entityIdColumn: "id",
    fields: {
      title: { sensitive: true, searchable: true },
      description: { sensitive: true, searchable: true }
    }
  },
  users: {
    tableName: "users",
    tenantColumn: "tenantId",
    entityIdColumn: "id",
    fields: {
      email: { sensitive: true, searchable: true },
      displayName: { sensitive: true, searchable: true },
      homeAddressLine1: { sensitive: true, searchable: true },
      homeAddressLine2: { sensitive: true, searchable: true },
      homePostalCode: { sensitive: true, searchable: true },
      homeCity: { sensitive: true, searchable: true },
      homeState: { sensitive: true, searchable: true },
      homeCountry: { sensitive: true, searchable: true },
      encryptedTaxId: { sensitive: true },
      mfaTotpSecretEncrypted: { sensitive: true },
      mfaTotpPendingSecretEncrypted: { sensitive: true }
    }
  },
  workforce_employees: {
    tableName: "workforce_employees",
    tenantColumn: "tenantId",
    entityIdColumn: "id",
    fields: {
      firstName: { sensitive: true, searchable: true },
      lastName: { sensitive: true, searchable: true },
      personalPhone: { sensitive: true, searchable: true },
      personalEmail: { sensitive: true, searchable: true },
      workPhone: { sensitive: true, searchable: true },
      workEmail: { sensitive: true, searchable: true },
      personalAddress: { sensitive: true, searchable: true },
      workLocation: { sensitive: true, searchable: true },
      notes: { sensitive: true, searchable: true },
      workScheduleJson: { sensitive: true }
    }
  },
  workforce_org_units: {
    tableName: "workforce_org_units",
    tenantColumn: "tenantId",
    entityIdColumn: "id",
    fields: {
      name: { sensitive: true, searchable: true }
    }
  },
  workforce_employee_socials: {
    tableName: "workforce_employee_socials",
    tenantColumn: "tenantId",
    entityIdColumn: "id",
    fields: {
      profileUrl: { sensitive: true }
    }
  },
  invoicing_quotes: {
    tableName: "invoicing_quotes",
    tenantColumn: "tenantId",
    entityIdColumn: "id",
    fields: {
      customerSnapshotJson: { sensitive: true },
      issuerSnapshotJson: { sensitive: true },
      notes: { sensitive: true },
      internalNotes: { sensitive: true },
      termsText: { sensitive: true },
      footerText: { sensitive: true }
    }
  },
  invoicing_offers: {
    tableName: "invoicing_offers",
    tenantColumn: "tenantId",
    entityIdColumn: "id",
    fields: {
      customerSnapshotJson: { sensitive: true },
      issuerSnapshotJson: { sensitive: true },
      notes: { sensitive: true },
      internalNotes: { sensitive: true },
      termsText: { sensitive: true },
      footerText: { sensitive: true }
    }
  },
  invoicing_invoices: {
    tableName: "invoicing_invoices",
    tenantColumn: "tenantId",
    entityIdColumn: "id",
    fields: {
      customerSnapshotJson: { sensitive: true },
      issuerSnapshotJson: { sensitive: true },
      notes: { sensitive: true },
      internalNotes: { sensitive: true },
      termsText: { sensitive: true },
      footerText: { sensitive: true }
    }
  },
  invoicing_tenant_configuration: {
    tableName: "invoicing_tenant_configuration",
    tenantColumn: "tenantId",
    entityIdColumn: "tenantId",
    fields: {
      issuerSnapshotJson: { sensitive: true },
      defaultQuoteTermsText: { sensitive: true },
      defaultOfferTermsText: { sensitive: true },
      defaultInvoiceTermsText: { sensitive: true },
      defaultFooterText: { sensitive: true }
    }
  },
  mailbox_accounts: {
    tableName: "mailbox_accounts",
    tenantColumn: "tenantId",
    entityIdColumn: "id",
    fields: {
      displayName: { sensitive: true },
      emailAddress: { sensitive: true },
      credentialsEncrypted: { sensitive: true },
      oauthRefreshTokenEncrypted: { sensitive: true },
      oauthAccessTokenEncrypted: { sensitive: true }
    }
  },
  mailbox_threads: {
    tableName: "mailbox_threads",
    tenantColumn: "tenantId",
    entityIdColumn: "id",
    fields: {
      subjectNormalized: { sensitive: true, searchable: true },
      snippet: { sensitive: true, searchable: true }
    }
  },
  mailbox_messages: {
    tableName: "mailbox_messages",
    tenantColumn: "tenantId",
    entityIdColumn: "id",
    fields: {
      fromJson: { sensitive: true },
      toJson: { sensitive: true },
      subject: { sensitive: true },
      snippet: { sensitive: true },
      headersJson: { sensitive: true },
      bodyText: { sensitive: true },
      bodyHtml: { sensitive: true }
    }
  },
  sales_funnel_bdr_leads: {
    tableName: "sales_funnel_bdr_leads",
    tenantColumn: "tenantId",
    entityIdColumn: "id",
    fields: {
      title: { sensitive: true, searchable: true },
      description: { sensitive: true, searchable: true }
    }
  },
  sales_funnel_sales_deals: {
    tableName: "sales_funnel_sales_deals",
    tenantColumn: "tenantId",
    entityIdColumn: "id",
    fields: {
      title: { sensitive: true, searchable: true },
      description: { sensitive: true, searchable: true }
    }
  },
  company_subscription_seats: {
    tableName: "company_subscription_seats",
    tenantColumn: "tenantId",
    entityIdColumn: "id",
    fields: {
      email: { sensitive: true, searchable: true }
    }
  },
  invoicing_audit_events: {
    tableName: "invoicing_audit_events",
    tenantColumn: "tenantId",
    entityIdColumn: "id",
    fields: {
      payloadJson: { sensitive: true }
    }
  },
  tenant_smtp_settings: {
    tableName: "tenant_smtp_settings",
    tenantColumn: "tenantId",
    entityIdColumn: "tenantId",
    fields: {
      passwordEncrypted: { sensitive: true }
    }
  },
  platform_smtp_settings: {
    tableName: "platform_smtp_settings",
    tenantColumn: "tenantId",
    entityIdColumn: "id",
    fields: {
      host: { sensitive: true },
      username: { sensitive: true },
      passwordEncrypted: { sensitive: true }
    }
  },
  platform_payment_settings: {
    tableName: "platform_payment_settings",
    tenantColumn: "tenantId",
    entityIdColumn: "id",
    fields: {
      stripeSecretEncrypted: { sensitive: true },
      stripeWebhookSecretEncrypted: { sensitive: true },
      adyenApiKeyEncrypted: { sensitive: true }
    }
  },
  tenant_blob_payload: {
    tableName: "tenant_blob_payload",
    tenantColumn: "tenantId",
    entityIdColumn: "id",
    fields: {
      data: { sensitive: true }
    }
  }
};

/** Blind-index scope id: realm tenants use their id; platform rows use `platform`. */
export const blindIndexScopeId = (tenantId: string | null | undefined): string =>
  tenantId?.trim() ? tenantId : "platform";

/** Returns searchable field names for a registered table. */
export const searchableFieldsForTable = (tableKey: string): string[] => {
  const cfg = FIELD_ENCRYPTION_REGISTRY[tableKey];
  if (!cfg) return [];
  return Object.entries(cfg.fields)
    .filter(([, def]) => def.searchable)
    .map(([name]) => name);
};

/** Returns sensitive field names for a registered table. */
export const sensitiveFieldsForTable = (tableKey: string): string[] => {
  const cfg = FIELD_ENCRYPTION_REGISTRY[tableKey];
  if (!cfg) return [];
  return Object.entries(cfg.fields)
    .filter(([, def]) => def.sensitive)
    .map(([name]) => name);
};
