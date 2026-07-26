/**
 * Realm subscription HTTP contracts (platform bills the tenant).
 *
 * Zod schemas for tenant-admin subscription lifecycle: subscribe to a catalog plan,
 * cancel (immediate or at period end), and schedule plan changes.
 *
 * Responsibilities:
 * - Validate `/tenant/subscription` create, cancel, and plan-change bodies
 * - Export status and cancel-effective enums shared by API and web billing UI
 *
 * Related:
 * - `docs/company-subscriptions-module.md` (realm vs company subscriptions glossary)
 * - `subscription-billing.ts` for period math; `platform-subscriptions.ts` for catalog
 *
 * Security:
 * - Tenant scope enforced in API routes; schemas do not carry `tenant_id`.
 */
import { z } from "zod";

/** Active billing row, pending cancel at period end, or fully canceled. */
export const subscriptionStatusSchema = z.enum(["active", "canceling", "canceled"]);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

/** Whether cancel takes effect now or after the current paid period. */
export const subscriptionCancelEffectiveSchema = z.enum(["immediate", "period_end"]);
export type SubscriptionCancelEffective = z.infer<typeof subscriptionCancelEffectiveSchema>;

/** Body for `POST /tenant/subscription` — assign a platform catalog plan. */
export const realmSubscriptionCreateBodySchema = z
  .object({
    planId: z.string().uuid()
  })
  .strict();

/** Body for canceling the realm subscription (`POST /tenant/subscription/cancel`). */
export const realmSubscriptionCancelBodySchema = z
  .object({
    effective: subscriptionCancelEffectiveSchema
  })
  .strict();

/** Body for scheduling a plan change at the next renewal boundary. */
export const realmSubscriptionSchedulePlanChangeBodySchema = z
  .object({
    planId: z.string().uuid()
  })
  .strict();

export type RealmSubscriptionCreateBodyInput = z.infer<typeof realmSubscriptionCreateBodySchema>;
export type RealmSubscriptionCancelBodyInput = z.infer<typeof realmSubscriptionCancelBodySchema>;
export type RealmSubscriptionSchedulePlanChangeBodyInput = z.infer<
  typeof realmSubscriptionSchedulePlanChangeBodySchema
>;
