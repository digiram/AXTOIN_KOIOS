/**
 * Creates Stripe Customer + persists `psp_customer_id` on a realm subscription when platform Stripe is configured.
 */

import type { SubscriptionRow } from "@starter/db";
import { updateSubscriptionPspPaymentMethodForTenant } from "@starter/db";

import { tryGetStripePlatformContext } from "./stripe-platform.js";

export const syncStripeCustomerForRealmSubscription = async (input: {
  subscription: SubscriptionRow;
  tenantId: string;
  /** Billing contact email (e.g. JWT email). */
  email: string;
  /** Display name on Stripe dashboard (e.g. organization name). */
  displayName?: string | null;
}): Promise<SubscriptionRow> => {
  const { subscription, tenantId, email, displayName } = input;
  if (subscription.pspCustomerId?.trim()) return subscription;

  const ctx = await tryGetStripePlatformContext();
  if (!ctx) return subscription;

  const customer = await ctx.stripe.customers.create({
    email: email.trim() || undefined,
    name: displayName?.trim() || undefined,
    metadata: {
      starter_subscription_id: subscription.id,
      starter_tenant_id: tenantId
    }
  });

  const ok = await updateSubscriptionPspPaymentMethodForTenant(subscription.id, tenantId, {
    pspCustomerId: customer.id
  });
  if (!ok) return subscription;

  return {
    ...subscription,
    pspCustomerId: customer.id
  };
};
