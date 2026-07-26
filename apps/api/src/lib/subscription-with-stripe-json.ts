/**
 * Realm subscription JSON serializer.
 *
 * Maps `SubscriptionRow` to the wire format returned by tenant/account billing APIs,
 * including Stripe PSP fields and dunning metadata.
 *
 * Responsibilities:
 * - ISO-format date fields for API consumers
 * - Nest Stripe card and billing retry state under structured keys
 */

import type { SubscriptionRow } from "@starter/db";

const iso = (d: Date) => d.toISOString();

/** Realm subscription JSON for tenant/account APIs including PSP + dunning fields (architecture d / j). */
export const subscriptionWithStripeJson = (
  s: SubscriptionRow,
  opts: { stripePublishableKey: string | null }
) => ({
  id: s.id,
  tenantId: s.tenantId,
  userId: s.userId,
  planId: s.planId,
  pendingPlanId: s.pendingPlanId,
  status: s.status,
  startedAt: iso(s.startedAt),
  currentPeriodStart: iso(s.currentPeriodStart),
  currentPeriodEnd: iso(s.currentPeriodEnd),
  cancelAtPeriodEnd: s.cancelAtPeriodEnd,
  canceledAt: s.canceledAt ? iso(s.canceledAt) : null,
  cancelEffectiveMode: s.cancelEffectiveMode,
  effectiveEndAt: s.effectiveEndAt ? iso(s.effectiveEndAt) : null,
  trialEndsAt: s.trialEndsAt ? iso(s.trialEndsAt) : null,
  createdAt: iso(s.createdAt),
  updatedAt: iso(s.updatedAt),
  stripe: {
    publishableKey: opts.stripePublishableKey,
    /** True when Stripe.js can collect a card (publishable key + Stripe Customer exist). */
    setupIntentAvailable: Boolean(opts.stripePublishableKey?.trim() && s.pspCustomerId?.trim()),
    pspCustomerId: s.pspCustomerId,
    pspSubscriptionId: s.pspSubscriptionId,
    defaultPaymentMethodId: s.pspDefaultPaymentMethodId,
    card:
      s.paymentMethodLast4 != null
        ? {
            brand: s.paymentMethodBrand,
            last4: s.paymentMethodLast4,
            expMonth: s.paymentMethodExpMonth,
            expYear: s.paymentMethodExpYear
          }
        : null
  },
  billing: {
    pastDueSince: s.billingPastDueSince ? iso(s.billingPastDueSince) : null,
    failedChargeCount: s.billingFailedChargeCount,
    lastPaymentErrorCode: s.billingLastPaymentErrorCode,
    nextRetryAt: s.billingNextRetryAt ? iso(s.billingNextRetryAt) : null
  }
});
