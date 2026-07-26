/**
 * Platform singleton: payment processor (Stripe XOR Adyen).
 */

import {
  DEFAULT_PLATFORM_ACCEPTED_PAYMENT_METHODS,
  parseAcceptedPaymentMethodsJson,
  serializeAcceptedPaymentMethods,
  type PlatformPaymentMethodId
} from "@starter/shared";
import { eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { getDb } from "./client.js";
import * as mysql from "./mysql-schema.js";
import * as pg from "./pg-schema.js";
import { dialectFromEnv } from "./schema.js";
import { decryptSecretAtBoundary, encryptSecretAtBoundary } from "./field-encryption/secret-boundary.js";

const PAYMENT_TABLE_KEY = "platform_payment_settings";

export type PlatformPaymentSecretField =
  | "stripeSecretEncrypted"
  | "stripeWebhookSecretEncrypted"
  | "adyenApiKeyEncrypted";

export const sealPlatformPaymentSecretAtRest = async (
  fieldName: PlatformPaymentSecretField,
  plaintext: string
): Promise<string> =>
  encryptSecretAtBoundary({
    tableKey: PAYMENT_TABLE_KEY,
    tenantId: null,
    fieldName,
    plaintext
  });

export const openPlatformPaymentSecretAtRest = async (
  fieldName: PlatformPaymentSecretField,
  stored: string
): Promise<string> =>
  decryptSecretAtBoundary({
    tableKey: PAYMENT_TABLE_KEY,
    tenantId: null,
    fieldName,
    stored
  });

const mysqlDb = (): MySql2Database<typeof mysql> => getDb() as MySql2Database<typeof mysql>;
const pgDb = (): NodePgDatabase<typeof pg> => getDb() as NodePgDatabase<typeof pg>;

export const PLATFORM_PAYMENT_SETTINGS_ROW_ID = "00000000-0000-0000-0000-000000000005";

export type PaymentProviderId = "stripe" | "adyen";
export type AdyenEnvironmentId = "test" | "live";

export type PlatformPaymentSettingsRow = {
  id: string;
  paymentsEnabled: boolean;
  provider: PaymentProviderId;
  stripePublishableKey: string;
  stripeSecretEncrypted: string | null;
  stripeWebhookSecretEncrypted: string | null;
  adyenMerchantAccount: string;
  adyenClientKey: string;
  adyenEnvironment: AdyenEnvironmentId;
  adyenApiKeyEncrypted: string | null;
  acceptedPaymentMethods: PlatformPaymentMethodId[];
  updatedAt: Date;
};

const mapRow = (row: {
  paymentsEnabled: boolean;
  provider: string;
  stripePublishableKey: string;
  stripeSecretEncrypted: string | null;
  stripeWebhookSecretEncrypted: string | null;
  adyenMerchantAccount: string;
  adyenClientKey: string;
  adyenEnvironment: string;
  adyenApiKeyEncrypted: string | null;
  acceptedPaymentMethodsJson: string | null;
  updatedAt: Date;
  id: string;
}): PlatformPaymentSettingsRow => ({
  id: row.id,
  paymentsEnabled: Boolean(row.paymentsEnabled),
  provider: row.provider === "adyen" ? "adyen" : "stripe",
  stripePublishableKey: row.stripePublishableKey,
  stripeSecretEncrypted: row.stripeSecretEncrypted,
  stripeWebhookSecretEncrypted: row.stripeWebhookSecretEncrypted,
  adyenMerchantAccount: row.adyenMerchantAccount,
  adyenClientKey: row.adyenClientKey,
  adyenEnvironment: row.adyenEnvironment === "live" ? "live" : "test",
  adyenApiKeyEncrypted: row.adyenApiKeyEncrypted,
  acceptedPaymentMethods: parseAcceptedPaymentMethodsJson(row.acceptedPaymentMethodsJson),
  updatedAt: row.updatedAt
});

export const getPlatformPaymentSettingsRow = async (): Promise<PlatformPaymentSettingsRow | undefined> => {
  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    const rows = await db
      .select()
      .from(mysql.platformPaymentSettings)
      .where(eq(mysql.platformPaymentSettings.id, PLATFORM_PAYMENT_SETTINGS_ROW_ID))
      .limit(1);
    const row = rows[0];
    if (!row) return undefined;
    return mapRow(row);
  }
  const db = pgDb();
  const rows = await db
    .select()
    .from(pg.platformPaymentSettings)
    .where(eq(pg.platformPaymentSettings.id, PLATFORM_PAYMENT_SETTINGS_ROW_ID))
    .limit(1);
  const row = rows[0];
  if (!row) return undefined;
  return mapRow(row);
};

export const upsertPlatformPaymentSettingsRow = async (input: {
  paymentsEnabled: boolean;
  provider: PaymentProviderId;
  stripePublishableKey: string;
  stripeSecretEncrypted: string | null;
  stripeWebhookSecretEncrypted: string | null;
  adyenMerchantAccount: string;
  adyenClientKey: string;
  adyenEnvironment: AdyenEnvironmentId;
  adyenApiKeyEncrypted: string | null;
  acceptedPaymentMethods: PlatformPaymentMethodId[];
}): Promise<void> => {
  const existing = await getPlatformPaymentSettingsRow();
  const now = new Date();
  const methodsJson = serializeAcceptedPaymentMethods(input.acceptedPaymentMethods);

  if (dialectFromEnv() === "mysql") {
    const db = mysqlDb();
    if (!existing) {
      await db.insert(mysql.platformPaymentSettings).values({
        id: PLATFORM_PAYMENT_SETTINGS_ROW_ID,
        paymentsEnabled: input.paymentsEnabled,
        provider: input.provider,
        stripePublishableKey: input.stripePublishableKey,
        stripeSecretEncrypted: input.stripeSecretEncrypted,
        stripeWebhookSecretEncrypted: input.stripeWebhookSecretEncrypted,
        adyenMerchantAccount: input.adyenMerchantAccount,
        adyenClientKey: input.adyenClientKey,
        adyenEnvironment: input.adyenEnvironment,
        adyenApiKeyEncrypted: input.adyenApiKeyEncrypted,
        acceptedPaymentMethodsJson: methodsJson,
        updatedAt: now
      });
      return;
    }
    await db
      .update(mysql.platformPaymentSettings)
      .set({
        paymentsEnabled: input.paymentsEnabled,
        provider: input.provider,
        stripePublishableKey: input.stripePublishableKey,
        stripeSecretEncrypted: input.stripeSecretEncrypted,
        stripeWebhookSecretEncrypted: input.stripeWebhookSecretEncrypted,
        adyenMerchantAccount: input.adyenMerchantAccount,
        adyenClientKey: input.adyenClientKey,
        adyenEnvironment: input.adyenEnvironment,
        adyenApiKeyEncrypted: input.adyenApiKeyEncrypted,
        acceptedPaymentMethodsJson: methodsJson,
        updatedAt: now
      })
      .where(eq(mysql.platformPaymentSettings.id, PLATFORM_PAYMENT_SETTINGS_ROW_ID));
    return;
  }

  const db = pgDb();
  if (!existing) {
    await db.insert(pg.platformPaymentSettings).values({
      id: PLATFORM_PAYMENT_SETTINGS_ROW_ID,
      paymentsEnabled: input.paymentsEnabled,
      provider: input.provider,
      stripePublishableKey: input.stripePublishableKey,
      stripeSecretEncrypted: input.stripeSecretEncrypted,
      stripeWebhookSecretEncrypted: input.stripeWebhookSecretEncrypted,
      adyenMerchantAccount: input.adyenMerchantAccount,
      adyenClientKey: input.adyenClientKey,
      adyenEnvironment: input.adyenEnvironment,
      adyenApiKeyEncrypted: input.adyenApiKeyEncrypted,
      acceptedPaymentMethodsJson: methodsJson,
      updatedAt: now
    });
    return;
  }
  await db
    .update(pg.platformPaymentSettings)
    .set({
      paymentsEnabled: input.paymentsEnabled,
      provider: input.provider,
      stripePublishableKey: input.stripePublishableKey,
      stripeSecretEncrypted: input.stripeSecretEncrypted,
      stripeWebhookSecretEncrypted: input.stripeWebhookSecretEncrypted,
      adyenMerchantAccount: input.adyenMerchantAccount,
      adyenClientKey: input.adyenClientKey,
      adyenEnvironment: input.adyenEnvironment,
      adyenApiKeyEncrypted: input.adyenApiKeyEncrypted,
      acceptedPaymentMethodsJson: methodsJson,
      updatedAt: now
    })
    .where(eq(pg.platformPaymentSettings.id, PLATFORM_PAYMENT_SETTINGS_ROW_ID));
};

export const ensurePlatformPaymentSettingsRow = async (): Promise<PlatformPaymentSettingsRow> => {
  const row = await getPlatformPaymentSettingsRow();
  if (row) return row;
  await upsertPlatformPaymentSettingsRow({
    paymentsEnabled: false,
    provider: "stripe",
    stripePublishableKey: "",
    stripeSecretEncrypted: null,
    stripeWebhookSecretEncrypted: null,
    adyenMerchantAccount: "",
    adyenClientKey: "",
    adyenEnvironment: "test",
    adyenApiKeyEncrypted: null,
    acceptedPaymentMethods: DEFAULT_PLATFORM_ACCEPTED_PAYMENT_METHODS
  });
  const created = await getPlatformPaymentSettingsRow();
  if (!created) throw new Error("ensurePlatformPaymentSettingsRow failed");
  return created;
};
