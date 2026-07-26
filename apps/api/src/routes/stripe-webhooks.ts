/**
 * Stripe webhooks: signature verification (raw body), SetupIntent success (card on file),
 * PaymentIntent success/failure → ledger + subscription dunning fields (architecture d / j).
 */

import type { FastifyInstance } from "fastify";
import rawBody from "fastify-raw-body";
import Stripe from "stripe";

import {
  applySubscriptionBillingPaymentFailedForTenant,
  claimStripeWebhookEvent,
  clearSubscriptionBillingDelinquencyForTenant,
  findPlatformSubscriptionPaymentByPspPaymentIntentId,
  findSubscriptionByPspCustomerId,
  releaseStripeWebhookEvent,
  updatePlatformSubscriptionPaymentPspAndStatus,
  updateSubscriptionPspPaymentMethodForTenant
} from "@starter/db";

import { tryGetStripePlatformContext } from "../lib/stripe-platform.js";

const meta = (obj: Stripe.Metadata | null | undefined, key: string) =>
  (obj && typeof obj[key] === "string" ? obj[key] : undefined) as string | undefined;

const handleSetupIntentSucceeded = async (stripe: Stripe, si: Stripe.SetupIntent) => {
  const subscriptionId = meta(si.metadata, "starter_subscription_id");
  const tenantId = meta(si.metadata, "starter_tenant_id");
  const customerId = typeof si.customer === "string" ? si.customer : si.customer?.id;
  const pmId = typeof si.payment_method === "string" ? si.payment_method : si.payment_method?.id;
  if (!subscriptionId || !tenantId || !customerId || !pmId) return;

  const pm = await stripe.paymentMethods.retrieve(pmId);
  const card = pm.card;
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: pmId }
  });

  await updateSubscriptionPspPaymentMethodForTenant(subscriptionId, tenantId, {
    pspCustomerId: customerId,
    pspDefaultPaymentMethodId: pmId,
    paymentMethodBrand: card?.brand ?? (pm.type !== "card" ? pm.type : null),
    paymentMethodLast4: card?.last4 ?? null,
    paymentMethodExpMonth: card?.exp_month ?? null,
    paymentMethodExpYear: card?.exp_year ?? null
  });
};

const handlePaymentIntentSucceeded = async (pi: Stripe.PaymentIntent) => {
  const link = await findPlatformSubscriptionPaymentByPspPaymentIntentId(pi.id);
  if (link) {
    const chargeId = typeof pi.latest_charge === "string" ? pi.latest_charge : pi.latest_charge?.id ?? null;
    await updatePlatformSubscriptionPaymentPspAndStatus({
      paymentId: link.id,
      pspChargeId: chargeId,
      status: "paid",
      paidAt: new Date()
    });
    if (link.subscriptionId) {
      await clearSubscriptionBillingDelinquencyForTenant(link.subscriptionId, link.tenantId);
    }
    return;
  }
  const subId = meta(pi.metadata, "starter_subscription_id");
  const tenantId = meta(pi.metadata, "starter_tenant_id");
  if (subId && tenantId) {
    await clearSubscriptionBillingDelinquencyForTenant(subId, tenantId);
  }
};

const handlePaymentIntentFailed = async (pi: Stripe.PaymentIntent) => {
  const last =
    pi.last_payment_error?.code ??
    pi.last_payment_error?.decline_code ??
    pi.last_payment_error?.message ??
    null;
  let subscriptionId = meta(pi.metadata, "starter_subscription_id");
  let tenantId = meta(pi.metadata, "starter_tenant_id");
  if (!subscriptionId || !tenantId) {
    const row = await findPlatformSubscriptionPaymentByPspPaymentIntentId(pi.id);
    if (row?.subscriptionId) {
      subscriptionId = row.subscriptionId;
      tenantId = row.tenantId;
    }
  }
  if (!subscriptionId || !tenantId) {
    const cid = typeof pi.customer === "string" ? pi.customer : pi.customer?.id;
    if (cid) {
      const sub = await findSubscriptionByPspCustomerId(cid);
      if (sub) {
        subscriptionId = sub.id;
        tenantId = sub.tenantId;
      }
    }
  }
  if (subscriptionId && tenantId) {
    await applySubscriptionBillingPaymentFailedForTenant(subscriptionId, tenantId, {
      lastErrorCode: last,
      nextRetryAt: null
    });
  }
};

export const registerStripeWebhookRoutes = async (app: FastifyInstance) => {
  await app.register(rawBody, {
    field: "rawBody",
    global: false,
    encoding: false,
    runFirst: true,
    routes: ["/webhooks/stripe"]
  });

  app.post(
    "/webhooks/stripe",
    {
      config: { rawBody: true },
      /** Stripe event payloads are small; cap body size to reduce abuse surface. */
      bodyLimit: 256 * 1024
    },
    async (request, reply) => {
      const ctx = await tryGetStripePlatformContext();
      if (!ctx?.webhookSecret) {
        return reply.code(503).send({ error: "webhook_not_configured", message: "Stripe webhook secret is not set." });
      }
      const sig = request.headers["stripe-signature"];
      if (typeof sig !== "string") {
        return reply.code(400).send({ error: "missing_signature" });
      }
      const raw = request.rawBody;
      if (!Buffer.isBuffer(raw)) {
        return reply.code(400).send({ error: "invalid_body" });
      }
      let event: Stripe.Event;
      try {
        event = ctx.stripe.webhooks.constructEvent(raw, sig, ctx.webhookSecret);
      } catch (err) {
        request.log.warn({ err }, "stripe webhook signature verification failed");
        return reply.code(400).send({ error: "invalid_signature" });
      }

      const claimed = await claimStripeWebhookEvent(event.id, event.type);
      if (!claimed) {
        return reply.send({ received: true, duplicate: true });
      }

      try {
        if (event.type === "setup_intent.succeeded") {
          await handleSetupIntentSucceeded(ctx.stripe, event.data.object as Stripe.SetupIntent);
        } else if (event.type === "payment_intent.succeeded") {
          await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
        } else if (event.type === "payment_intent.payment_failed") {
          await handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
        }
        return reply.send({ received: true });
      } catch (e) {
        await releaseStripeWebhookEvent(event.id);
        request.log.error(e, "stripe webhook handler error");
        return reply.code(500).send({ error: "handler_error" });
      }
    }
  );
};
