/**
 * Super-admin: platform payment processor (Stripe XOR Adyen). Secrets encrypted with FIELD_ENCRYPTION_KEY.
 */

import type { FastifyInstance } from "fastify";

import {
  ensurePlatformPaymentSettingsRow,
  sealPlatformPaymentSecretAtRest,
  upsertPlatformPaymentSettingsRow,
  type PaymentProviderId,
  type PlatformPaymentSecretField,
  type PlatformPaymentSettingsRow
} from "@starter/db";
import { platformPaymentPutBodySchema } from "@starter/shared";

import { requireSuperAdmin } from "../plugins/super-admin.js";

const iso = (d: Date) => d.toISOString();

const paymentSettingsToGetResponse = (row: PlatformPaymentSettingsRow) => ({
  paymentsEnabled: row.paymentsEnabled,
  provider: row.provider,
  stripePublishableKey: row.stripePublishableKey,
  hasStripeSecret: Boolean(row.stripeSecretEncrypted?.trim()),
  hasStripeWebhookSecret: Boolean(row.stripeWebhookSecretEncrypted?.trim()),
  adyenMerchantAccount: row.adyenMerchantAccount,
  adyenClientKey: row.adyenClientKey,
  adyenEnvironment: row.adyenEnvironment,
  hasAdyenApiKey: Boolean(row.adyenApiKeyEncrypted?.trim()),
  acceptedPaymentMethods: row.acceptedPaymentMethods,
  updatedAt: iso(row.updatedAt)
});

/** `undefined` = leave unchanged; `""` = clear; non-empty = seal at rest. */
const resolveSecretUpdate = async (
  fieldName: PlatformPaymentSecretField,
  bodyValue: string | undefined,
  existing: string | null
): Promise<{ ok: true; value: string | null } | { ok: false; error: "missing_key" }> => {
  if (bodyValue === undefined) {
    return { ok: true, value: existing };
  }
  if (bodyValue === "") {
    return { ok: true, value: null };
  }
  try {
    return { ok: true, value: await sealPlatformPaymentSecretAtRest(fieldName, bodyValue) };
  } catch {
    return { ok: false, error: "missing_key" };
  }
};

export const registerPlatformPaymentRoutes = async (app: FastifyInstance) => {
  app.get(
    "/integrations/payments",
    { preHandler: requireSuperAdmin },
    async (_request, _reply) => {
      const row = await ensurePlatformPaymentSettingsRow();
      return paymentSettingsToGetResponse(row);
    }
  );

  app.put(
    "/integrations/payments",
    { preHandler: requireSuperAdmin },
    async (request, reply) => {
      const parsed = platformPaymentPutBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
      }
      const b = parsed.data;
      const existing = await ensurePlatformPaymentSettingsRow();

      const stripeSecretRes = await resolveSecretUpdate(
        "stripeSecretEncrypted",
        b.stripeSecretKey,
        existing.stripeSecretEncrypted
      );
      if (!stripeSecretRes.ok) {
        return reply.code(400).send({
          error: "configuration_error",
          message: "Set FIELD_ENCRYPTION_KEY (32-byte base64) before storing API secrets."
        });
      }
      const stripeWebhookRes = await resolveSecretUpdate(
        "stripeWebhookSecretEncrypted",
        b.stripeWebhookSecret,
        existing.stripeWebhookSecretEncrypted
      );
      if (!stripeWebhookRes.ok) {
        return reply.code(400).send({
          error: "configuration_error",
          message: "Set FIELD_ENCRYPTION_KEY (32-byte base64) before storing API secrets."
        });
      }
      const adyenKeyRes = await resolveSecretUpdate(
        "adyenApiKeyEncrypted",
        b.adyenApiKey,
        existing.adyenApiKeyEncrypted
      );
      if (!adyenKeyRes.ok) {
        return reply.code(400).send({
          error: "configuration_error",
          message: "Set FIELD_ENCRYPTION_KEY (32-byte base64) before storing API secrets."
        });
      }

      const stripeSecretEncrypted = stripeSecretRes.value;
      const stripeWebhookSecretEncrypted = stripeWebhookRes.value;
      const adyenApiKeyEncrypted = adyenKeyRes.value;

      const nextAccepted = b.acceptedPaymentMethods ?? existing.acceptedPaymentMethods;
      if (nextAccepted.length === 0) {
        return reply.code(400).send({
          error: "validation_error",
          message: "At least one accepted payment method must remain enabled."
        });
      }

      const provider = b.provider as PaymentProviderId;
      const stripePublishableKey = b.stripePublishableKey.trim();
      const adyenMerchantAccount = b.adyenMerchantAccount.trim();
      const adyenClientKey = b.adyenClientKey.trim();

      if (b.paymentsEnabled) {
        if (provider === "stripe") {
          if (!stripePublishableKey) {
            return reply.code(400).send({
              error: "validation_error",
              message: "Stripe publishable key is required when payments are enabled with Stripe."
            });
          }
          if (!stripeSecretEncrypted?.trim()) {
            return reply.code(400).send({
              error: "validation_error",
              message: "Stripe secret key is required when payments are enabled with Stripe."
            });
          }
        } else {
          if (!adyenMerchantAccount || !adyenClientKey) {
            return reply.code(400).send({
              error: "validation_error",
              message: "Adyen merchant account and client key are required when payments are enabled with Adyen."
            });
          }
          if (!adyenApiKeyEncrypted?.trim()) {
            return reply.code(400).send({
              error: "validation_error",
              message: "Adyen API key is required when payments are enabled with Adyen."
            });
          }
        }
      }

      await upsertPlatformPaymentSettingsRow({
        paymentsEnabled: b.paymentsEnabled,
        provider,
        stripePublishableKey,
        stripeSecretEncrypted,
        stripeWebhookSecretEncrypted,
        adyenMerchantAccount,
        adyenClientKey,
        adyenEnvironment: b.adyenEnvironment,
        adyenApiKeyEncrypted,
        acceptedPaymentMethods: nextAccepted
      });

      const row = await ensurePlatformPaymentSettingsRow();
      return paymentSettingsToGetResponse(row);
    }
  );
};
