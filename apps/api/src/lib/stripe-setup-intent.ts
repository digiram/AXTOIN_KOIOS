/**
 * Stripe SetupIntent for realm subscriptions.
 *
 * Creates a Stripe SetupIntent so tenants can save a default payment method for
 * platform billing (realm subscription / PSP dunning).
 *
 * Responsibilities:
 * - Verify Stripe platform configuration
 * - Sync or create Stripe Customer for the active subscription
 * - Return client secret and publishable key for Stripe.js
 *
 * Security:
 * - Subscription and customer scoped to `tenantId` (and optional `userId`)
 */

import {
  findActiveLikeTenantSubscription,
  findActiveLikeUserSubscription,
  type SubscriptionRow
} from "@starter/db";

import { syncStripeCustomerForRealmSubscription } from "./stripe-customer-sync.js";
import { tryGetStripePlatformContext } from "./stripe-platform.js";

export const createStripeSetupIntentForRealmSubscription = async (opts: {
  tenantId: string;
  userId: string | null;
  email: string;
}): Promise<
  | { ok: true; clientSecret: string; publishableKey: string; subscription: SubscriptionRow }
  | { ok: false; error: string; status: number; message?: string }
> => {
  const ctx = await tryGetStripePlatformContext();
  if (!ctx) {
    return {
      ok: false,
      error: "stripe_not_configured",
      status: 503,
      message: "Stripe is not enabled or API secrets are not configured."
    };
  }
  const sub =
    opts.userId == null
      ? await findActiveLikeTenantSubscription(opts.tenantId)
      : await findActiveLikeUserSubscription(opts.tenantId, opts.userId);
  if (!sub) {
    return { ok: false, error: "no_subscription", status: 404, message: "No active subscription." };
  }

  const synced = await syncStripeCustomerForRealmSubscription({
    subscription: sub,
    tenantId: opts.tenantId,
    email: opts.email
  });
  if (!synced.pspCustomerId?.trim()) {
    return {
      ok: false,
      error: "stripe_customer_missing",
      status: 503,
      message: "Could not create or load Stripe customer for this subscription."
    };
  }

  const si = await ctx.stripe.setupIntents.create({
    customer: synced.pspCustomerId,
    payment_method_types: ["card"],
    usage: "off_session",
    metadata: {
      starter_subscription_id: synced.id,
      starter_tenant_id: opts.tenantId
    }
  });
  const secret = si.client_secret;
  if (!secret) {
    return { ok: false, error: "setup_intent_failed", status: 500, message: "Stripe did not return a client secret." };
  }
  return { ok: true, clientSecret: secret, publishableKey: ctx.publishableKey, subscription: synced };
};
