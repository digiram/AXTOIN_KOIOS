/**
 * Realm member: **per-user** subscription (billing_scope **user**), v1 monthly catalog only.
 */

import type { FastifyInstance } from "fastify";

import {
  cancelSubscriptionForTenant,
  clearSubscriptionScheduledPlanChangeForTenant,
  findActiveLikeUserSubscription,
  findUserSubscriptionForSettingsView,
  getPlatformPaymentSettingsRow,
  getPlatformSubscriptionPlanById,
  getPlatformSubscriptionSettingsRow,
  insertSubscriptionWithFirstPayment,
  listV1CatalogPlansForBillingScope,
  scheduleSubscriptionPlanChangeForTenant,
  type SubscriptionRow
} from "@starter/db";
import {
  isV1SubscriberPlan,
  realmSubscriptionCancelBodySchema,
  realmSubscriptionCreateBodySchema,
  realmSubscriptionSchedulePlanChangeBodySchema
} from "@starter/shared";

import { requireTenantContext } from "../plugins/tenant.js";
import { createStripeSetupIntentForRealmSubscription } from "../lib/stripe-setup-intent.js";
import { syncStripeCustomerForRealmSubscription } from "../lib/stripe-customer-sync.js";
import { subscriptionWithStripeJson } from "../lib/subscription-with-stripe-json.js";

const planJson = (p: Awaited<ReturnType<typeof listV1CatalogPlansForBillingScope>>[number]) => ({
  id: p.id,
  tierName: p.tierName,
  durationUnit: p.durationUnit,
  durationCount: p.durationCount,
  priceCents: p.priceCents,
  currencyCode: p.currencyCode,
  allowCancelAnytime: p.allowCancelAnytime,
  trialDays: p.trialDays,
  allowTierChangeNextPeriod: p.allowTierChangeNextPeriod,
  disabled: p.disabled,
  billingScope: p.billingScope,
  sortOrder: p.sortOrder
});

const stripePkForClient = async (): Promise<string | null> => {
  const p = await getPlatformPaymentSettingsRow();
  if (!p?.paymentsEnabled || p.provider !== "stripe") return null;
  const k = p.stripePublishableKey?.trim();
  return k || null;
};

const subscriptionDto = async (s: SubscriptionRow | undefined) => {
  if (!s) return null;
  const pk = await stripePkForClient();
  return subscriptionWithStripeJson(s, { stripePublishableKey: pk });
};

const jwtEmail = (request: { user?: unknown }) =>
  String((request.user as { email?: string } | undefined)?.email ?? "").trim();

export const registerAccountSubscriptionRoutes = (app: FastifyInstance) => {
  app.get(
    "/subscription/catalog",
    { preHandler: requireTenantContext },
    async (request, reply) => {
      if (!request.tenantId || !request.userId) {
        return reply.code(403).send({ error: "forbidden", message: "Realm session required." });
      }
      const plans = await listV1CatalogPlansForBillingScope("user");
      return { plans: plans.map(planJson) };
    }
  );

  app.get(
    "/subscription",
    { preHandler: requireTenantContext },
    async (request, reply) => {
      if (!request.tenantId || !request.userId) {
        return reply.code(403).send({ error: "forbidden", message: "Realm session required." });
      }
      const tenantId = request.tenantId;
      const userId = request.userId;
      const [sub, settings] = await Promise.all([
        findUserSubscriptionForSettingsView(tenantId, userId),
        getPlatformSubscriptionSettingsRow()
      ]);
      return {
        subscription: await subscriptionDto(sub),
        subscriptionsEnabled: settings?.subscriptionsEnabled === true
      };
    }
  );

  app.post(
    "/subscription/stripe/setup-intent",
    { preHandler: requireTenantContext },
    async (request, reply) => {
      if (!request.tenantId || !request.userId) {
        return reply.code(403).send({ error: "forbidden", message: "Realm session required." });
      }
      const r = await createStripeSetupIntentForRealmSubscription({
        tenantId: request.tenantId,
        userId: request.userId,
        email: jwtEmail(request)
      });
      if (!r.ok) {
        return reply.code(r.status).send({ error: r.error, message: r.message ?? r.error });
      }
      return {
        clientSecret: r.clientSecret,
        publishableKey: r.publishableKey,
        subscription: await subscriptionDto(r.subscription)
      };
    }
  );

  app.post(
    "/subscription",
    { preHandler: requireTenantContext },
    async (request, reply) => {
      if (!request.tenantId || !request.userId) {
        return reply.code(403).send({ error: "forbidden", message: "Realm session required." });
      }
      const parsed = realmSubscriptionCreateBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
      }
      const tenantId = request.tenantId;
      const userId = request.userId;
      const settings = await getPlatformSubscriptionSettingsRow();
      if (!settings?.subscriptionsEnabled) {
        return reply.code(403).send({
          error: "subscriptions_disabled",
          message: "Platform operator has disabled new subscription billing."
        });
      }
      const existing = await findActiveLikeUserSubscription(tenantId, userId);
      if (existing) {
        return reply.code(409).send({
          error: "subscription_exists",
          message: "You already have an active subscription."
        });
      }
      const plan = await getPlatformSubscriptionPlanById(parsed.data.planId);
      if (!plan || plan.billingScope !== "user" || !isV1SubscriberPlan(plan.durationUnit, plan.durationCount)) {
        return reply.code(400).send({
          error: "invalid_plan",
          message: "Choose a per-user monthly catalog plan."
        });
      }
      if (plan.disabled) {
        return reply.code(400).send({
          error: "plan_disabled",
          message: "This catalog tier is disabled and cannot be used for new subscriptions."
        });
      }
      const { subscription } = await insertSubscriptionWithFirstPayment({
        tenantId,
        userId,
        planId: plan.id,
        priceCents: plan.priceCents,
        currencyCode: plan.currencyCode,
        trialDays: plan.trialDays
      });
      let next = subscription;
      try {
        next = await syncStripeCustomerForRealmSubscription({
          subscription,
          tenantId,
          email: jwtEmail(request)
        });
      } catch (e) {
        request.log.warn({ err: e }, "stripe customer sync failed after user subscribe");
      }
      const fresh = (await findActiveLikeUserSubscription(tenantId, userId)) ?? next;
      return reply.code(201).send({ subscription: await subscriptionDto(fresh) });
    }
  );

  app.post(
    "/subscription/schedule-plan-change",
    { preHandler: requireTenantContext },
    async (request, reply) => {
      if (!request.tenantId || !request.userId) {
        return reply.code(403).send({ error: "forbidden", message: "Realm session required." });
      }
      const parsed = realmSubscriptionSchedulePlanChangeBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
      }
      const tenantId = request.tenantId;
      const userId = request.userId;
      const active = await findActiveLikeUserSubscription(tenantId, userId);
      if (!active) {
        return reply.code(404).send({ error: "not_found", message: "No active subscription." });
      }
      const result = await scheduleSubscriptionPlanChangeForTenant(active.id, tenantId, parsed.data.planId);
      if (!result.ok) {
        const map: Record<typeof result.error, { code: string; status: number; message: string }> = {
          not_found: { code: "not_found", status: 404, message: "Subscription not found." },
          inactive: { code: "inactive", status: 400, message: "Subscription is not active." },
          same_plan: { code: "same_plan", status: 400, message: "That is already your current plan." },
          tier_change_not_allowed: {
            code: "tier_change_not_allowed",
            status: 403,
            message: "This tier does not allow scheduling a change for the next billing period."
          },
          scope_mismatch: { code: "scope_mismatch", status: 400, message: "Target plan billing scope does not match." },
          invalid_plan: { code: "invalid_plan", status: 400, message: "Invalid or ineligible target plan." },
          plan_disabled: {
            code: "plan_disabled",
            status: 400,
            message: "That catalog tier is disabled and cannot be selected."
          }
        };
        const m = map[result.error];
        return reply.code(m.status).send({ error: m.code, message: m.message });
      }
      return { subscription: await subscriptionDto(result.subscription) };
    }
  );

  app.delete(
    "/subscription/scheduled-plan-change",
    { preHandler: requireTenantContext },
    async (request, reply) => {
      if (!request.tenantId || !request.userId) {
        return reply.code(403).send({ error: "forbidden", message: "Realm session required." });
      }
      const tenantId = request.tenantId;
      const userId = request.userId;
      const active = await findActiveLikeUserSubscription(tenantId, userId);
      if (!active) {
        return reply.code(404).send({ error: "not_found", message: "No active subscription." });
      }
      const result = await clearSubscriptionScheduledPlanChangeForTenant(active.id, tenantId);
      if (!result.ok) {
        return reply.code(404).send({ error: "not_found", message: "Subscription not found." });
      }
      return { subscription: await subscriptionDto(result.subscription) };
    }
  );

  app.post(
    "/subscription/cancel",
    { preHandler: requireTenantContext },
    async (request, reply) => {
      if (!request.tenantId || !request.userId) {
        return reply.code(403).send({ error: "forbidden", message: "Realm session required." });
      }
      const parsed = realmSubscriptionCancelBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
      }
      const tenantId = request.tenantId;
      const userId = request.userId;
      const active = await findActiveLikeUserSubscription(tenantId, userId);
      if (!active) {
        return reply.code(404).send({ error: "not_found", message: "No active subscription." });
      }
      const plan = await getPlatformSubscriptionPlanById(active.planId);
      if (!plan) {
        return reply.code(404).send({ error: "not_found", message: "Plan not found." });
      }
      const eff = parsed.data.effective;
      if (!plan.allowCancelAnytime && eff === "immediate") {
        return reply.code(400).send({
          error: "immediate_cancel_not_allowed",
          message: "This plan only allows cancellation at the end of the current billing period."
        });
      }
      const result = await cancelSubscriptionForTenant(active.id, tenantId, eff, plan.allowCancelAnytime);
      if (!result.ok) {
        if (result.error === "immediate_not_allowed") {
          return reply
            .code(400)
            .send({ error: "immediate_cancel_not_allowed", message: "Immediate cancel is not allowed for this plan." });
        }
        return reply.code(404).send({ error: "not_found", message: "Subscription not found." });
      }
      return { subscription: await subscriptionDto(result.subscription) };
    }
  );
};
