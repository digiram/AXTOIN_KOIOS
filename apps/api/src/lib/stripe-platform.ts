/**
 * Stripe SDK for platform payment settings (super-admin Integrations → Payments).
 * Returns null when Stripe is not configured so callers can degrade gracefully.
 */

import Stripe from "stripe";

import {
  ensurePlatformPaymentSettingsRow,
  openPlatformPaymentSecretAtRest
} from "@starter/db";

export type StripePlatformContext = {
  stripe: Stripe;
  publishableKey: string;
  webhookSecret: string | null;
};

export const tryGetStripePlatformContext = async (): Promise<StripePlatformContext | null> => {
  const row = await ensurePlatformPaymentSettingsRow();
  if (!row.paymentsEnabled || row.provider !== "stripe") return null;
  if (!row.stripeSecretEncrypted?.trim()) return null;
  let sk: string;
  try {
    sk = (await openPlatformPaymentSecretAtRest("stripeSecretEncrypted", row.stripeSecretEncrypted)).trim();
  } catch {
    return null;
  }
  if (!sk) return null;
  const pk = row.stripePublishableKey?.trim();
  if (!pk) return null;
  const stripe = new Stripe(sk);
  let webhookSecret: string | null = null;
  if (row.stripeWebhookSecretEncrypted?.trim()) {
    try {
      webhookSecret =
        (await openPlatformPaymentSecretAtRest(
          "stripeWebhookSecretEncrypted",
          row.stripeWebhookSecretEncrypted
        )).trim() || null;
    } catch {
      webhookSecret = null;
    }
  }
  return { stripe, publishableKey: pk, webhookSecret };
};
