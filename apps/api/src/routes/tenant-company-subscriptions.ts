/**
 * Tenant Company subscriptions API — vendor/SaaS registry (documentation, not realm billing).
 */

import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import {
  deleteCompanySubscriptionProvider,
  deletePlan,
  deleteProviderDocument,
  deleteSeat,
  ensurePlatformModuleSettingsRow,
  getCompanySubscriptionDashboardSummary,
  getCompanySubscriptionProviderById,
  getPlanById,
  getProviderDocumentById,
  getSeatById,
  getWorkforceEmployeeById,
  insertCompanySubscriptionProvider,
  insertPlan,
  insertProviderDocument,
  insertSeat,
  buildProviderOverviewAggregates,
  listCompanySubscriptionProviders,
  listPlansByProviderId,
  listProviderDocuments,
  listSeatsByPlanId,
  parseCompanySubscriptionBillingMetadataJson,
  updateCompanySubscriptionProvider,
  updatePlan,
  updateSeat,
  type CompanySubscriptionPlanRow,
  type CompanySubscriptionProviderDocumentRow,
  type CompanySubscriptionProviderRow,
  type CompanySubscriptionSeatRow
} from "@starter/db";
import {
  companySubscriptionBillingMetadataSchema,
  companySubscriptionPlanCreateSchema,
  companySubscriptionPlanIdOnlyParamsSchema,
  companySubscriptionPlanParamsSchema,
  companySubscriptionPlanPatchSchema,
  companySubscriptionProviderCreateSchema,
  companySubscriptionProviderDocumentParamsSchema,
  companySubscriptionProviderIdOnlyParamsSchema,
  companySubscriptionProviderIdParamsSchema,
  companySubscriptionProviderPatchSchema,
  companySubscriptionProvidersListQuerySchema,
  companySubscriptionSeatCreateSchema,
  companySubscriptionSeatParamsSchema,
  companySubscriptionSeatPatchSchema,
  resolveModuleRole,
  workforceEmployeeDisplayName
} from "@starter/shared";

import { requireCompanySubscriptionsModulePermission } from "../plugins/module-permission.js";
import { requireTenantMember } from "../plugins/tenant-member.js";
import { requireTenantRealm } from "../plugins/tenant-realm.js";
import { requireTenantContext } from "../plugins/tenant.js";
import {
  deleteCompanySubscriptionProviderDocumentFile,
  normalizeEmployeeDocumentStorageExt,
  readCompanySubscriptionProviderDocumentBytes,
  relPathForCompanySubscriptionProviderDocument,
  resolveApiFilesRoot,
  writeCompanySubscriptionProviderDocumentFile
} from "../lib/entity-photo-storage.js";

const iso = (d: Date) => d.toISOString();
const MAX_PROVIDER_DOCUMENT_BYTES = 25 * 1024 * 1024;

const requireCompanySubscriptionsModuleEnabled = async (_request: FastifyRequest, reply: FastifyReply) => {
  const row = await ensurePlatformModuleSettingsRow();
  if (!row.companySubscriptionsEnabled) {
    return reply.code(403).send({
      error: "feature_disabled",
      message: "Company subscriptions is disabled by the platform administrator."
    });
  }
};

const documentDownloadFilename = (originalFilename: string) => {
  const base = originalFilename.replace(/\\/g, "/").split("/").pop() ?? "document";
  return base.replace(/[^\w.\- ()[\]]+/g, "_").slice(0, 200) || "document";
};

const resolveEmployeeName = async (tenantId: string, employeeId: string | null): Promise<string | null> => {
  if (!employeeId) return null;
  const emp = await getWorkforceEmployeeById(tenantId, employeeId);
  if (!emp) return null;
  return workforceEmployeeDisplayName(emp.firstName, emp.lastName);
};

const serializeProvider = async (tenantId: string, row: CompanySubscriptionProviderRow) => ({
  id: row.id,
  tenantId: row.tenantId,
  name: row.name,
  vendorName: row.vendorName,
  category: row.category,
  description: row.description,
  status: row.status,
  subscriptionKind: row.subscriptionKind,
  ownerEmployeeId: row.ownerEmployeeId,
  ownerEmployeeName: await resolveEmployeeName(tenantId, row.ownerEmployeeId),
  renewalDate: row.renewalDate,
  contractStartDate: row.contractStartDate,
  contractEndDate: row.contractEndDate,
  cadenceKind: row.cadenceKind,
  cadenceIntervalCount: row.cadenceIntervalCount,
  cadenceIntervalUnit: row.cadenceIntervalUnit,
  amountMinor: row.amountMinor,
  currencyCode: row.currencyCode,
  billingMetadata: parseCompanySubscriptionBillingMetadataJson(row.billingMetadataJson),
  notes: row.notes,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt)
});

const serializePlan = (row: CompanySubscriptionPlanRow) => ({
  id: row.id,
  tenantId: row.tenantId,
  providerId: row.providerId,
  name: row.name,
  sku: row.sku,
  seatCount: row.seatCount,
  amountMinor: row.amountMinor,
  currencyCode: row.currencyCode,
  cadenceKind: row.cadenceKind,
  cadenceIntervalCount: row.cadenceIntervalCount,
  cadenceIntervalUnit: row.cadenceIntervalUnit,
  startDate: row.startDate,
  endDate: row.endDate,
  renewalDate: row.renewalDate,
  autoRenew: row.autoRenew,
  notes: row.notes,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt)
});

const serializeSeat = async (tenantId: string, row: CompanySubscriptionSeatRow) => ({
  id: row.id,
  tenantId: row.tenantId,
  planId: row.planId,
  employeeId: row.employeeId,
  employeeDisplayName: await resolveEmployeeName(tenantId, row.employeeId),
  displayName: row.displayName,
  email: row.email,
  seatType: row.seatType,
  status: row.status,
  startDate: row.startDate,
  endDate: row.endDate,
  notes: row.notes,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt)
});

const loadProviderDetail = async (tenantId: string, providerId: string) => {
  const provider = await getCompanySubscriptionProviderById(tenantId, providerId);
  if (!provider) return null;
  const planRows = await listPlansByProviderId(tenantId, providerId);
  const plans = await Promise.all(
    planRows.map(async (plan) => {
      const seatRows = await listSeatsByPlanId(tenantId, plan.id);
      const seats = await Promise.all(seatRows.map((seat) => serializeSeat(tenantId, seat)));
      return { plan: serializePlan(plan), seats };
    })
  );
  return { provider: await serializeProvider(tenantId, provider), plans };
};

const serializeDocument = (row: CompanySubscriptionProviderDocumentRow) => ({
  id: row.id,
  providerId: row.providerId,
  title: row.title,
  originalFilename: row.originalFilename,
  mimeType: row.mimeType,
  byteSize: row.byteSize,
  createdAt: iso(row.createdAt)
});

const assertProviderInTenant = async (tenantId: string, providerId: string, reply: FastifyReply) => {
  const provider = await getCompanySubscriptionProviderById(tenantId, providerId);
  if (!provider) {
    reply.code(404).send({ error: "not_found", message: "Provider not found." });
    return null;
  }
  return provider;
};

const assertPlanInProvider = async (
  tenantId: string,
  providerId: string,
  planId: string,
  reply: FastifyReply
) => {
  const provider = await assertProviderInTenant(tenantId, providerId, reply);
  if (!provider) return null;
  const plan = await getPlanById(tenantId, planId);
  if (!plan || plan.providerId !== providerId) {
    reply.code(404).send({ error: "not_found", message: "Plan not found." });
    return null;
  }
  return plan;
};

const assertSeatInPlan = async (
  tenantId: string,
  providerId: string,
  planId: string,
  seatId: string,
  reply: FastifyReply
) => {
  const plan = await assertPlanInProvider(tenantId, providerId, planId, reply);
  if (!plan) return null;
  const seat = await getSeatById(tenantId, seatId);
  if (!seat || seat.planId !== planId) {
    reply.code(404).send({ error: "not_found", message: "Seat not found." });
    return null;
  }
  return seat;
};

export const registerTenantCompanySubscriptionsRoutes = async (app: FastifyInstance) => {
  await app.register(
    async (scope) => {
      scope.addHook("preHandler", requireTenantContext);
      scope.addHook("preHandler", requireTenantRealm);
      scope.addHook("preHandler", requireTenantMember);
      scope.get("/availability", async (request) => {
        const row = await ensurePlatformModuleSettingsRow();
        const moduleRole = resolveModuleRole(
          "company_subscriptions",
          request.role ?? "tenant_user",
          request.moduleRoles ?? {}
        );
        return {
          companySubscriptionsEnabled: row.companySubscriptionsEnabled,
          companySubscriptionsRole: row.companySubscriptionsEnabled ? moduleRole : null
        };
      });
    },
    { prefix: "/company-subscriptions" }
  );

  await app.register(
    async (scope) => {
      scope.addHook("preHandler", requireTenantContext);
      scope.addHook("preHandler", requireTenantRealm);
      scope.addHook("preHandler", requireTenantMember);
      scope.addHook("preHandler", requireCompanySubscriptionsModuleEnabled);
      scope.addHook("preHandler", requireCompanySubscriptionsModulePermission);

      scope.get("/dashboard-summary", async (request) => {
        const tenantId = request.tenantId!;
        const summary = await getCompanySubscriptionDashboardSummary(tenantId);
        return {
          activeCount: summary.activeProviderCount,
          totalSeats: summary.totalSeatCount,
          upcomingRenewals: summary.upcomingRenewals30d,
          expiringSoon: summary.expiring30d,
          estimatedRecurringCostMinor: summary.estimatedRecurringCostMinor
        };
      });

      scope.get("/providers", async (request, reply) => {
        const parsed = companySubscriptionProvidersListQuerySchema.safeParse(request.query);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const tenantId = request.tenantId!;
        const { rows, total } = await listCompanySubscriptionProviders({ tenantId, ...parsed.data });
        const overviewById = await buildProviderOverviewAggregates(tenantId, rows);
        const serialized = await Promise.all(
          rows.map(async (r) => {
            const base = await serializeProvider(tenantId, r);
            const overview = overviewById.get(r.id);
            return {
              ...base,
              planCount: overview?.planCount ?? 0,
              seatCount: overview?.seatCount ?? 0,
              monthlyCostMinor: overview?.monthlyCostMinor ?? null
            };
          })
        );
        return {
          providers: serialized,
          total,
          limit: parsed.data.limit ?? 50,
          offset: parsed.data.offset ?? 0
        };
      });

      scope.post("/providers", async (request, reply) => {
        const parsed = companySubscriptionProviderCreateSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        if (parsed.data.billingMetadata != null) {
          const billing = companySubscriptionBillingMetadataSchema.safeParse(parsed.data.billingMetadata);
          if (!billing.success) {
            return reply.code(400).send({ error: "validation_error", message: billing.error.message });
          }
        }
        const tenantId = request.tenantId!;
        const out = await insertCompanySubscriptionProvider(tenantId, parsed.data, request.userId ?? null);
        if ("error" in out) {
          return reply.code(400).send({ error: "invalid_employee", message: "Owner employee not found in this tenant." });
        }
        return reply.code(201).send({ provider: await serializeProvider(tenantId, out) });
      });

      scope.get("/providers/:id", async (request, reply) => {
        const parsed = companySubscriptionProviderIdParamsSchema.safeParse(request.params);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const tenantId = request.tenantId!;
        const detail = await loadProviderDetail(tenantId, parsed.data.id);
        if (!detail) return reply.code(404).send({ error: "not_found", message: "Provider not found." });
        return detail;
      });

      scope.patch("/providers/:id", async (request, reply) => {
        const paramsParsed = companySubscriptionProviderIdParamsSchema.safeParse(request.params);
        if (!paramsParsed.success) {
          return reply.code(400).send({ error: "validation_error", message: paramsParsed.error.message });
        }
        const bodyParsed = companySubscriptionProviderPatchSchema.safeParse(request.body);
        if (!bodyParsed.success) {
          return reply.code(400).send({ error: "validation_error", message: bodyParsed.error.message });
        }
        if (bodyParsed.data.billingMetadata != null) {
          const billing = companySubscriptionBillingMetadataSchema.safeParse(bodyParsed.data.billingMetadata);
          if (!billing.success) {
            return reply.code(400).send({ error: "validation_error", message: billing.error.message });
          }
        }
        const tenantId = request.tenantId!;
        const out = await updateCompanySubscriptionProvider(
          tenantId,
          paramsParsed.data.id,
          bodyParsed.data,
          request.userId ?? null
        );
        if ("error" in out) {
          if (out.error === "not_found") {
            return reply.code(404).send({ error: "not_found", message: "Provider not found." });
          }
          return reply.code(400).send({ error: "invalid_employee", message: "Owner employee not found in this tenant." });
        }
        return { provider: await serializeProvider(tenantId, out) };
      });

      scope.delete("/providers/:id", async (request, reply) => {
        const parsed = companySubscriptionProviderIdParamsSchema.safeParse(request.params);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const tenantId = request.tenantId!;
        const out = await deleteCompanySubscriptionProvider(tenantId, parsed.data.id);
        if (!out.ok) return reply.code(404).send({ error: "not_found", message: "Provider not found." });
        return { ok: true };
      });

      scope.get("/providers/:providerId/plans", async (request, reply) => {
        const parsed = companySubscriptionProviderIdOnlyParamsSchema.safeParse(request.params);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const tenantId = request.tenantId!;
        const provider = await assertProviderInTenant(tenantId, parsed.data.providerId, reply);
        if (!provider) return;
        const rows = await listPlansByProviderId(tenantId, parsed.data.providerId);
        return { plans: rows.map(serializePlan) };
      });

      scope.post("/providers/:providerId/plans", async (request, reply) => {
        const paramsParsed = companySubscriptionProviderIdOnlyParamsSchema.safeParse(request.params);
        if (!paramsParsed.success) {
          return reply.code(400).send({ error: "validation_error", message: paramsParsed.error.message });
        }
        const bodyParsed = companySubscriptionPlanCreateSchema.safeParse(request.body);
        if (!bodyParsed.success) {
          return reply.code(400).send({ error: "validation_error", message: bodyParsed.error.message });
        }
        const tenantId = request.tenantId!;
        const out = await insertPlan(
          tenantId,
          paramsParsed.data.providerId,
          bodyParsed.data,
          request.userId ?? null
        );
        if ("error" in out) {
          return reply.code(404).send({ error: "not_found", message: "Provider not found." });
        }
        return reply.code(201).send({ plan: serializePlan(out) });
      });

      scope.get("/providers/:providerId/plans/:id", async (request, reply) => {
        const parsed = companySubscriptionPlanParamsSchema.safeParse(request.params);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const tenantId = request.tenantId!;
        const plan = await assertPlanInProvider(tenantId, parsed.data.providerId, parsed.data.id, reply);
        if (!plan) return;
        return { plan: serializePlan(plan) };
      });

      scope.patch("/providers/:providerId/plans/:id", async (request, reply) => {
        const paramsParsed = companySubscriptionPlanParamsSchema.safeParse(request.params);
        if (!paramsParsed.success) {
          return reply.code(400).send({ error: "validation_error", message: paramsParsed.error.message });
        }
        const bodyParsed = companySubscriptionPlanPatchSchema.safeParse(request.body);
        if (!bodyParsed.success) {
          return reply.code(400).send({ error: "validation_error", message: bodyParsed.error.message });
        }
        const tenantId = request.tenantId!;
        const existing = await assertPlanInProvider(
          tenantId,
          paramsParsed.data.providerId,
          paramsParsed.data.id,
          reply
        );
        if (!existing) return;
        const out = await updatePlan(tenantId, paramsParsed.data.id, bodyParsed.data, request.userId ?? null);
        if ("error" in out) {
          return reply.code(404).send({ error: "not_found", message: "Plan not found." });
        }
        return { plan: serializePlan(out) };
      });

      scope.delete("/providers/:providerId/plans/:id", async (request, reply) => {
        const parsed = companySubscriptionPlanParamsSchema.safeParse(request.params);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const tenantId = request.tenantId!;
        const existing = await assertPlanInProvider(tenantId, parsed.data.providerId, parsed.data.id, reply);
        if (!existing) return;
        const out = await deletePlan(tenantId, parsed.data.id);
        if (!out.ok) return reply.code(404).send({ error: "not_found", message: "Plan not found." });
        return { ok: true };
      });

      scope.get("/providers/:providerId/plans/:planId/seats", async (request, reply) => {
        const parsed = companySubscriptionPlanIdOnlyParamsSchema.safeParse(request.params);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const tenantId = request.tenantId!;
        const plan = await assertPlanInProvider(tenantId, parsed.data.providerId, parsed.data.planId, reply);
        if (!plan) return;
        const rows = await listSeatsByPlanId(tenantId, parsed.data.planId);
        const seats = await Promise.all(rows.map((r) => serializeSeat(tenantId, r)));
        return { seats };
      });

      scope.post("/providers/:providerId/plans/:planId/seats", async (request, reply) => {
        const paramsParsed = companySubscriptionPlanIdOnlyParamsSchema.safeParse(request.params);
        if (!paramsParsed.success) {
          return reply.code(400).send({ error: "validation_error", message: paramsParsed.error.message });
        }
        const bodyParsed = companySubscriptionSeatCreateSchema.safeParse(request.body);
        if (!bodyParsed.success) {
          return reply.code(400).send({ error: "validation_error", message: bodyParsed.error.message });
        }
        const tenantId = request.tenantId!;
        const plan = await assertPlanInProvider(
          tenantId,
          paramsParsed.data.providerId,
          paramsParsed.data.planId,
          reply
        );
        if (!plan) return;
        const out = await insertSeat(tenantId, paramsParsed.data.planId, bodyParsed.data, request.userId ?? null);
        if ("error" in out) {
          if (out.error === "plan_not_found") {
            return reply.code(404).send({ error: "not_found", message: "Plan not found." });
          }
          return reply.code(400).send({ error: "invalid_employee", message: "Employee not found in this tenant." });
        }
        return reply.code(201).send({ seat: await serializeSeat(tenantId, out) });
      });

      scope.get("/providers/:providerId/plans/:planId/seats/:id", async (request, reply) => {
        const parsed = companySubscriptionSeatParamsSchema.safeParse(request.params);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const tenantId = request.tenantId!;
        const seat = await assertSeatInPlan(
          tenantId,
          parsed.data.providerId,
          parsed.data.planId,
          parsed.data.id,
          reply
        );
        if (!seat) return;
        return { seat: await serializeSeat(tenantId, seat) };
      });

      scope.patch("/providers/:providerId/plans/:planId/seats/:id", async (request, reply) => {
        const paramsParsed = companySubscriptionSeatParamsSchema.safeParse(request.params);
        if (!paramsParsed.success) {
          return reply.code(400).send({ error: "validation_error", message: paramsParsed.error.message });
        }
        const bodyParsed = companySubscriptionSeatPatchSchema.safeParse(request.body);
        if (!bodyParsed.success) {
          return reply.code(400).send({ error: "validation_error", message: bodyParsed.error.message });
        }
        const tenantId = request.tenantId!;
        const existing = await assertSeatInPlan(
          tenantId,
          paramsParsed.data.providerId,
          paramsParsed.data.planId,
          paramsParsed.data.id,
          reply
        );
        if (!existing) return;
        const out = await updateSeat(tenantId, paramsParsed.data.id, bodyParsed.data, request.userId ?? null);
        if ("error" in out) {
          if (out.error === "not_found") {
            return reply.code(404).send({ error: "not_found", message: "Seat not found." });
          }
          return reply.code(400).send({ error: "invalid_employee", message: "Employee not found in this tenant." });
        }
        return { seat: await serializeSeat(tenantId, out) };
      });

      scope.delete("/providers/:providerId/plans/:planId/seats/:id", async (request, reply) => {
        const parsed = companySubscriptionSeatParamsSchema.safeParse(request.params);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const tenantId = request.tenantId!;
        const existing = await assertSeatInPlan(
          tenantId,
          parsed.data.providerId,
          parsed.data.planId,
          parsed.data.id,
          reply
        );
        if (!existing) return;
        const out = await deleteSeat(tenantId, parsed.data.id);
        if (!out.ok) return reply.code(404).send({ error: "not_found", message: "Seat not found." });
        return { ok: true };
      });

      scope.get("/providers/:providerId/documents", async (request, reply) => {
        const parsed = companySubscriptionProviderIdOnlyParamsSchema.safeParse(request.params);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const tenantId = request.tenantId!;
        const provider = await assertProviderInTenant(tenantId, parsed.data.providerId, reply);
        if (!provider) return;
        const rows = await listProviderDocuments(tenantId, parsed.data.providerId);
        return { documents: rows.map(serializeDocument) };
      });

      scope.post("/providers/:providerId/documents", async (request, reply) => {
        const parsed = companySubscriptionProviderIdOnlyParamsSchema.safeParse(request.params);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const tenantId = request.tenantId!;
        const provider = await assertProviderInTenant(tenantId, parsed.data.providerId, reply);
        if (!provider) return;

        const file = await request.file({ limits: { fileSize: MAX_PROVIDER_DOCUMENT_BYTES } });
        if (!file) {
          return reply.code(400).send({ error: "no_file", message: "Upload a document file." });
        }

        const originalFilename = (file.filename ?? "document").trim().slice(0, 512) || "document";
        const titleField = file.fields?.title;
        let title = originalFilename;
        if (titleField && typeof titleField === "object" && "value" in titleField) {
          const v = String((titleField as { value?: unknown }).value ?? "").trim();
          if (v.length > 0) title = v.slice(0, 512);
        }

        const chunks: Buffer[] = [];
        for await (const chunk of file.file) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const buffer = Buffer.concat(chunks);
        if (buffer.length === 0) {
          return reply.code(400).send({ error: "empty_file", message: "File was empty." });
        }
        if (buffer.length > MAX_PROVIDER_DOCUMENT_BYTES) {
          return reply.code(400).send({ error: "file_too_large", message: "Maximum file size is 25 MB." });
        }

        const documentId = randomUUID();
        const storageExt = normalizeEmployeeDocumentStorageExt(originalFilename);
        const rel = relPathForCompanySubscriptionProviderDocument(
          tenantId,
          parsed.data.providerId,
          documentId,
          storageExt
        );
        const filesRoot = resolveApiFilesRoot();
        await writeCompanySubscriptionProviderDocumentFile(filesRoot, rel, buffer, { tenantId });

        const mime = (file.mimetype ?? "").trim() || null;
        const row = await insertProviderDocument({
          tenantId,
          providerId: parsed.data.providerId,
          title,
          originalFilename,
          mimeType: mime,
          storageRelPath: rel,
          byteSize: buffer.length
        });
        if (!row) {
          await deleteCompanySubscriptionProviderDocumentFile(filesRoot, rel);
          return reply.code(500).send({ error: "persist_failed", message: "Could not save document metadata." });
        }
        return reply.code(201).send({ document: serializeDocument(row) });
      });

      scope.get("/providers/:providerId/documents/:id", async (request, reply) => {
        const parsed = companySubscriptionProviderDocumentParamsSchema.safeParse(request.params);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const tenantId = request.tenantId!;
        const row = await getProviderDocumentById(tenantId, parsed.data.providerId, parsed.data.id);
        if (!row) return reply.code(404).send({ error: "not_found", message: "Document not found." });
        const filesRoot = resolveApiFilesRoot();
        try {
          const bytes = await readCompanySubscriptionProviderDocumentBytes(filesRoot, row.storageRelPath, { tenantId });
          const name = documentDownloadFilename(row.originalFilename);
          reply.header("Cache-Control", "private, no-store");
          reply.header("Content-Disposition", `attachment; filename="${name.replace(/"/g, "")}"`);
          return reply.type(row.mimeType?.trim() || "application/octet-stream").send(bytes);
        } catch {
          return reply.code(500).send({ error: "document_decrypt_failed", message: "Could not read document." });
        }
      });

      scope.delete("/providers/:providerId/documents/:id", async (request, reply) => {
        const parsed = companySubscriptionProviderDocumentParamsSchema.safeParse(request.params);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const tenantId = request.tenantId!;
        const row = await deleteProviderDocument(tenantId, parsed.data.providerId, parsed.data.id);
        if (!row) return reply.code(404).send({ error: "not_found", message: "Document not found." });
        const filesRoot = resolveApiFilesRoot();
        await deleteCompanySubscriptionProviderDocumentFile(filesRoot, row.storageRelPath);
        return { ok: true };
      });
    },
    { prefix: "/company-subscriptions" }
  );
};
