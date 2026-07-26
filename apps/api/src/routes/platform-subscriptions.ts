/**
 * Super-admin: subscription module — settings toggle, plan catalog, payment ledger listing.
 */

import type { FastifyInstance } from "fastify";

import {
  countPlatformSubscriptionPaymentsFiltered,
  deletePlatformSubscriptionPaymentById,
  deletePlatformSubscriptionPlanById,
  ensurePlatformSubscriptionSettingsRow,
  existsSubscriptionPaymentForPlanId,
  existsSubscriptionPaymentLinkedToPlan,
  existsSubscriptionReferencesPlanId,
  getPlatformSubscriptionPlanById,
  insertPlatformSubscriptionPlan,
  insertPlatformSubscriptionPlanAuditLog,
  listPlatformSubscriptionPaymentsJoined,
  listPlatformSubscriptionPlanAuditLogsPaginated,
  listPlatformSubscriptionPlanIdsWithPayments,
  listPlatformSubscriptionPlans,
  setPlatformSubscriptionPlanDisabled,
  type ListPlatformSubscriptionPaymentsFilters,
  updateAllPlatformSubscriptionPlanCurrencies,
  updatePlatformSubscriptionPlanById,
  upsertPlatformSubscriptionSettingsRow
} from "@starter/db";
import {
  type PlatformSubscriptionPaymentsExportQueryInput,
  type PlatformSubscriptionPaymentsListQueryInput,
  platformSubscriptionPaymentsExportQuerySchema,
  platformSubscriptionPaymentsListQuerySchema,
  platformSubscriptionPlanAuditListQuerySchema,
  platformSubscriptionPlanCreateBodySchema,
  platformSubscriptionPlanIdParamsSchema,
  platformSubscriptionPaymentIdParamsSchema,
  platformSubscriptionPlanSetDisabledBodySchema,
  platformSubscriptionPlanUpdateBodySchema,
  platformSubscriptionSettingsPutBodySchema
} from "@starter/shared";

import { requireSuperAdmin } from "../plugins/super-admin.js";
import { buildCsv } from "../lib/csv.js";

const iso = (d: Date) => d.toISOString();

const PAYMENT_EXPORT_ROW_CAP = 10_000;

const subscriptionPaymentDevDeleteEnabled = () => process.env.NODE_ENV === "development";

const paymentFiltersFromListQuery = (
  q: PlatformSubscriptionPaymentsListQueryInput
): { ok: true; filters: ListPlatformSubscriptionPaymentsFilters } | { ok: false; message: string } => {
  const filters: ListPlatformSubscriptionPaymentsFilters = {};
  if (q.tenantId) filters.tenantId = q.tenantId;
  if (q.status) filters.status = q.status;
  if (q.createdFrom?.trim()) {
    const d = new Date(q.createdFrom.trim());
    if (Number.isNaN(d.getTime())) return { ok: false, message: "Invalid createdFrom (use ISO 8601)." };
    filters.createdFrom = d;
  }
  if (q.createdTo?.trim()) {
    const d = new Date(q.createdTo.trim());
    if (Number.isNaN(d.getTime())) return { ok: false, message: "Invalid createdTo (use ISO 8601)." };
    filters.createdTo = d;
  }
  return { ok: true, filters };
};

const paymentFiltersFromExportQuery = (
  q: PlatformSubscriptionPaymentsExportQueryInput
): { ok: true; filters: ListPlatformSubscriptionPaymentsFilters } | { ok: false; message: string } =>
  paymentFiltersFromListQuery({ ...q, limit: 50, offset: 0 });

const planRowToJson = (
  p: Awaited<ReturnType<typeof listPlatformSubscriptionPlans>>[number],
  ledgerAffected: boolean
) => ({
  id: p.id,
  tierName: p.tierName,
  durationUnit: p.durationUnit,
  durationCount: p.durationCount,
  priceCents: p.priceCents,
  currencyCode: p.currencyCode,
  allowCancelAnytime: p.allowCancelAnytime,
  trialDays: p.trialDays,
  allowTierChangeNextPeriod: p.allowTierChangeNextPeriod,
  billingScope: p.billingScope,
  sortOrder: p.sortOrder,
  disabled: p.disabled,
  createdAt: iso(p.createdAt),
  updatedAt: iso(p.updatedAt),
  ledgerAffected
});

const paymentRowToJson = (p: Awaited<ReturnType<typeof listPlatformSubscriptionPaymentsJoined>>[number]) => ({
  id: p.id,
  planId: p.planId,
  tenantId: p.tenantId,
  userId: p.userId,
  amountCents: p.amountCents,
  currencyCode: p.currencyCode,
  status: p.status,
  dueAt: p.dueAt ? iso(p.dueAt) : null,
  paidAt: p.paidAt ? iso(p.paidAt) : null,
  cancelledAt: p.cancelledAt ? iso(p.cancelledAt) : null,
  reimbursedAt: p.reimbursedAt ? iso(p.reimbursedAt) : null,
  description: p.description,
  pspInvoiceId: p.pspInvoiceId,
  pspPaymentIntentId: p.pspPaymentIntentId,
  pspChargeId: p.pspChargeId,
  createdAt: iso(p.createdAt),
  updatedAt: iso(p.updatedAt),
  tenantName: p.tenantName,
  userEmail: p.userEmail,
  tierName: p.tierName
});

const auditRowToJson = (r: Awaited<ReturnType<typeof listPlatformSubscriptionPlanAuditLogsPaginated>>["rows"][number]) => ({
  id: r.id,
  createdAt: iso(r.createdAt),
  action: r.action,
  planId: r.planId,
  actorUserId: r.actorUserId,
  summary: r.summary,
  detailJson: r.detailJson
});

export const registerPlatformSubscriptionRoutes = async (app: FastifyInstance) => {
  app.get(
    "/subscriptions/settings",
    { preHandler: requireSuperAdmin },
    async (_request, _reply) => {
      const row = await ensurePlatformSubscriptionSettingsRow();
      const subscriptionCurrencyLocked = await existsSubscriptionPaymentLinkedToPlan();
      return {
        subscriptionsEnabled: row.subscriptionsEnabled,
        subscriptionCurrencyCode: row.subscriptionCurrencyCode,
        subscriptionCurrencyLocked,
        updatedAt: iso(row.updatedAt)
      };
    }
  );

  app.put(
    "/subscriptions/settings",
    { preHandler: requireSuperAdmin },
    async (request, reply) => {
      const parsed = platformSubscriptionSettingsPutBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
      }
      const b = parsed.data;
      const row = await ensurePlatformSubscriptionSettingsRow();
      const locked = await existsSubscriptionPaymentLinkedToPlan();
      if (b.subscriptionCurrencyCode !== undefined) {
        const next = b.subscriptionCurrencyCode.trim().toUpperCase();
        if (locked && next !== row.subscriptionCurrencyCode.toUpperCase()) {
          return reply.code(400).send({
            error: "currency_locked",
            message:
              "Subscription currency cannot be changed after a subscription payment has been generated for a tier. Use your payment provider for shopper currency conversion."
          });
        }
      }
      await upsertPlatformSubscriptionSettingsRow({
        ...(b.subscriptionsEnabled !== undefined ? { subscriptionsEnabled: b.subscriptionsEnabled } : {}),
        ...(b.subscriptionCurrencyCode !== undefined ? { subscriptionCurrencyCode: b.subscriptionCurrencyCode } : {})
      });
      if (b.subscriptionCurrencyCode !== undefined) {
        const next = b.subscriptionCurrencyCode.trim().toUpperCase();
        if (next !== row.subscriptionCurrencyCode.toUpperCase()) {
          await updateAllPlatformSubscriptionPlanCurrencies(next);
        }
      }
      const row2 = await ensurePlatformSubscriptionSettingsRow();
      const subscriptionCurrencyLocked = await existsSubscriptionPaymentLinkedToPlan();
      return {
        subscriptionsEnabled: row2.subscriptionsEnabled,
        subscriptionCurrencyCode: row2.subscriptionCurrencyCode,
        subscriptionCurrencyLocked,
        updatedAt: iso(row2.updatedAt)
      };
    }
  );

  app.get(
    "/subscriptions/plans",
    { preHandler: requireSuperAdmin },
    async (_request, _reply) => {
      const plans = await listPlatformSubscriptionPlans();
      const ledgerPlanIds = await listPlatformSubscriptionPlanIdsWithPayments();
      return { plans: plans.map((p) => planRowToJson(p, ledgerPlanIds.has(p.id))) };
    }
  );

  app.get(
    "/subscriptions/plans/audit",
    { preHandler: requireSuperAdmin },
    async (request, reply) => {
      const parsed = platformSubscriptionPlanAuditListQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
      }
      const { limit, offset } = parsed.data;
      const { rows, total } = await listPlatformSubscriptionPlanAuditLogsPaginated(limit, offset);
      return { entries: rows.map(auditRowToJson), total, limit, offset };
    }
  );

  app.post(
    "/subscriptions/plans",
    { preHandler: requireSuperAdmin },
    async (request, reply) => {
      const parsed = platformSubscriptionPlanCreateBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
      }
      const b = parsed.data;
      const settings = await ensurePlatformSubscriptionSettingsRow();
      const id = await insertPlatformSubscriptionPlan({
        tierName: b.tierName,
        durationUnit: b.durationUnit,
        durationCount: b.durationCount,
        priceCents: b.priceCents,
        currencyCode: settings.subscriptionCurrencyCode,
        allowCancelAnytime: b.allowCancelAnytime,
        trialDays: b.trialDays ?? 0,
        allowTierChangeNextPeriod: b.allowTierChangeNextPeriod ?? true,
        billingScope: b.billingScope,
        sortOrder: b.sortOrder ?? 0
      });
      await insertPlatformSubscriptionPlanAuditLog({
        action: "plan_created",
        planId: id,
        actorUserId: request.userId ?? null,
        summary: `Created tier "${b.tierName}"`,
        detailJson: JSON.stringify({
          tierName: b.tierName,
          durationUnit: b.durationUnit,
          durationCount: b.durationCount,
          priceCents: b.priceCents,
          billingScope: b.billingScope,
          trialDays: b.trialDays ?? 0,
          allowTierChangeNextPeriod: b.allowTierChangeNextPeriod ?? true,
          allowCancelAnytime: b.allowCancelAnytime,
          sortOrder: b.sortOrder ?? 0
        })
      });
      const plans = await listPlatformSubscriptionPlans();
      const created = plans.find((p) => p.id === id);
      return reply.code(201).send({
        plan: created ? planRowToJson(created, false) : { id }
      });
    }
  );

  app.put(
    "/subscriptions/plans/:planId",
    { preHandler: requireSuperAdmin },
    async (request, reply) => {
      const parsedParams = platformSubscriptionPlanIdParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.code(400).send({ error: "validation_error", message: parsedParams.error.message });
      }
      const parsed = platformSubscriptionPlanUpdateBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
      }
      const b = parsed.data;
      if (await existsSubscriptionPaymentForPlanId(parsedParams.data.planId)) {
        return reply.code(409).send({
          error: "plan_ledger_locked",
          message:
            "This tier cannot be edited after subscription payment rows have been generated for it. Add a new tier for different pricing or cadence."
        });
      }
      const settings = await ensurePlatformSubscriptionSettingsRow();
      const ok = await updatePlatformSubscriptionPlanById(parsedParams.data.planId, {
        tierName: b.tierName,
        durationUnit: b.durationUnit,
        durationCount: b.durationCount,
        priceCents: b.priceCents,
        currencyCode: settings.subscriptionCurrencyCode,
        allowCancelAnytime: b.allowCancelAnytime,
        trialDays: b.trialDays ?? 0,
        allowTierChangeNextPeriod: b.allowTierChangeNextPeriod ?? true,
        billingScope: b.billingScope,
        sortOrder: b.sortOrder ?? 0
      });
      if (!ok) {
        return reply.code(404).send({ error: "not_found", message: "Plan not found." });
      }
      await insertPlatformSubscriptionPlanAuditLog({
        action: "plan_updated",
        planId: parsedParams.data.planId,
        actorUserId: request.userId ?? null,
        summary: `Updated tier "${b.tierName}"`,
        detailJson: JSON.stringify({
          tierName: b.tierName,
          durationUnit: b.durationUnit,
          durationCount: b.durationCount,
          priceCents: b.priceCents,
          billingScope: b.billingScope,
          trialDays: b.trialDays ?? 0,
          allowTierChangeNextPeriod: b.allowTierChangeNextPeriod ?? true,
          allowCancelAnytime: b.allowCancelAnytime,
          sortOrder: b.sortOrder ?? 0
        })
      });
      const plans = await listPlatformSubscriptionPlans();
      const updated = plans.find((p) => p.id === parsedParams.data.planId);
      return {
        plan: updated ? planRowToJson(updated, await existsSubscriptionPaymentForPlanId(updated.id)) : null
      };
    }
  );

  app.post(
    "/subscriptions/plans/:planId/disabled",
    { preHandler: requireSuperAdmin },
    async (request, reply) => {
      const parsedParams = platformSubscriptionPlanIdParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.code(400).send({ error: "validation_error", message: parsedParams.error.message });
      }
      const parsedBody = platformSubscriptionPlanSetDisabledBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.code(400).send({ error: "validation_error", message: parsedBody.error.message });
      }
      const ok = await setPlatformSubscriptionPlanDisabled(parsedParams.data.planId, parsedBody.data.disabled);
      if (!ok) {
        return reply.code(404).send({ error: "not_found", message: "Plan not found." });
      }
      const plans = await listPlatformSubscriptionPlans();
      const updated = plans.find((p) => p.id === parsedParams.data.planId);
      await insertPlatformSubscriptionPlanAuditLog({
        action: "plan_disabled_changed",
        planId: parsedParams.data.planId,
        actorUserId: request.userId ?? null,
        summary: `Tier "${updated?.tierName ?? parsedParams.data.planId}": ${parsedBody.data.disabled ? "disabled" : "enabled"}`,
        detailJson: JSON.stringify({ disabled: parsedBody.data.disabled })
      });
      return {
        plan: updated ? planRowToJson(updated, await existsSubscriptionPaymentForPlanId(updated.id)) : null
      };
    }
  );

  app.delete(
    "/subscriptions/plans/:planId",
    { preHandler: requireSuperAdmin },
    async (request, reply) => {
      const parsedParams = platformSubscriptionPlanIdParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.code(400).send({ error: "validation_error", message: parsedParams.error.message });
      }
      const planId = parsedParams.data.planId;
      if (await existsSubscriptionPaymentForPlanId(planId)) {
        return reply.code(409).send({
          error: "plan_cannot_delete_has_ledger",
          message:
            "This tier has subscription payment rows. Disable it instead of deleting so ledger rows keep a stable plan reference."
        });
      }
      if (await existsSubscriptionReferencesPlanId(planId)) {
        return reply.code(409).send({
          error: "plan_in_use",
          message: "This tier is referenced by one or more subscriptions. Disable it or migrate subscribers first."
        });
      }
      const existing = await getPlatformSubscriptionPlanById(planId);
      const ok = await deletePlatformSubscriptionPlanById(planId);
      if (!ok) {
        return reply.code(404).send({ error: "not_found", message: "Plan not found." });
      }
      await insertPlatformSubscriptionPlanAuditLog({
        action: "plan_deleted",
        planId,
        actorUserId: request.userId ?? null,
        summary: `Deleted tier "${existing?.tierName ?? planId}"`,
        detailJson: existing
          ? JSON.stringify({
              tierName: existing.tierName,
              durationUnit: existing.durationUnit,
              durationCount: existing.durationCount,
              priceCents: existing.priceCents,
              billingScope: existing.billingScope
            })
          : null
      });
      return reply.code(204).send();
    }
  );

  app.get(
    "/subscriptions/payments",
    { preHandler: requireSuperAdmin },
    async (request, reply) => {
      const parsed = platformSubscriptionPaymentsListQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
      }
      const fp = paymentFiltersFromListQuery(parsed.data);
      if (!fp.ok) {
        return reply.code(400).send({ error: "validation_error", message: fp.message });
      }
      const { limit, offset } = parsed.data;
      const [total, rows] = await Promise.all([
        countPlatformSubscriptionPaymentsFiltered(fp.filters),
        listPlatformSubscriptionPaymentsJoined(fp.filters, limit, offset)
      ]);
      return {
        payments: rows.map(paymentRowToJson),
        total,
        limit,
        offset,
        devDeleteSubscriptionPaymentsEnabled: subscriptionPaymentDevDeleteEnabled()
      };
    }
  );

  app.get(
    "/subscriptions/payments/export",
    { preHandler: requireSuperAdmin },
    async (request, reply) => {
      const parsed = platformSubscriptionPaymentsExportQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
      }
      const fp = paymentFiltersFromExportQuery(parsed.data);
      if (!fp.ok) {
        return reply.code(400).send({ error: "validation_error", message: fp.message });
      }
      const filters = fp.filters;
      const pageSize = 200;
      const collected: Awaited<ReturnType<typeof listPlatformSubscriptionPaymentsJoined>> = [];
      for (let off = 0; off < PAYMENT_EXPORT_ROW_CAP; off += pageSize) {
        const chunk = await listPlatformSubscriptionPaymentsJoined(filters, pageSize, off);
        collected.push(...chunk);
        if (chunk.length < pageSize) break;
        if (collected.length >= PAYMENT_EXPORT_ROW_CAP) break;
      }
      const header = [
        "id",
        "plan_id",
        "tenant_id",
        "tenant_name",
        "user_id",
        "user_email",
        "status",
        "amount_cents",
        "currency_code",
        "due_at",
        "paid_at",
        "cancelled_at",
        "reimbursed_at",
        "description",
        "psp_invoice_id",
        "psp_payment_intent_id",
        "psp_charge_id",
        "created_at",
        "updated_at",
        "tier_name"
      ];
      const rows = collected.map((p) => [
        p.id,
        p.planId ?? "",
        p.tenantId,
        p.tenantName,
        p.userId ?? "",
        p.userEmail ?? "",
        p.status,
        p.amountCents,
        p.currencyCode,
        p.dueAt ? iso(p.dueAt) : "",
        p.paidAt ? iso(p.paidAt) : "",
        p.cancelledAt ? iso(p.cancelledAt) : "",
        p.reimbursedAt ? iso(p.reimbursedAt) : "",
        p.description ?? "",
        p.pspInvoiceId ?? "",
        p.pspPaymentIntentId ?? "",
        p.pspChargeId ?? "",
        iso(p.createdAt),
        iso(p.updatedAt),
        p.tierName ?? ""
      ]);
      const body = buildCsv(header, rows);
      const filename = `subscription-payments-${new Date().toISOString().slice(0, 10)}.csv`;
      return reply
        .header("content-type", "text/csv; charset=utf-8")
        .header("content-disposition", `attachment; filename="${filename}"`)
        .send(body);
    }
  );

  app.delete(
    "/subscriptions/payments/:paymentId",
    { preHandler: requireSuperAdmin },
    async (request, reply) => {
      if (!subscriptionPaymentDevDeleteEnabled()) {
        return reply.code(403).send({
          error: "forbidden",
          message: "Deleting subscription payments is only allowed when NODE_ENV is development."
        });
      }
      const parsedParams = platformSubscriptionPaymentIdParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.code(400).send({ error: "validation_error", message: parsedParams.error.message });
      }
      const ok = await deletePlatformSubscriptionPaymentById(parsedParams.data.paymentId);
      if (!ok) {
        return reply.code(404).send({ error: "not_found", message: "Payment not found." });
      }
      return reply.code(204).send();
    }
  );
};
