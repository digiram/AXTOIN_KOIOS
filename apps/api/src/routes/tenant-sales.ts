/**
 * Tenant Sales funnel API — pipeline config, BDR leads, Sales deals (phases 1–3).
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import {
  addSalesFunnelBdrLeadNote,
  addSalesFunnelManualActivity,
  addSalesFunnelSalesDealNote,
  ensurePlatformModuleSettingsRow,
  getSalesFunnelBdrBoard,
  getSalesFunnelBdrLeadById,
  getSalesFunnelBdrLeadContacts,
  getSalesFunnelPipelineConfig,
  getSalesFunnelSalesBoard,
  getSalesFunnelSalesDealById,
  getSalesFunnelSalesDealContacts,
  insertSalesFunnelBdrLead,
  insertSalesFunnelSalesDeal,
  listSalesFunnelActivities,
  listSalesFunnelBdrLeads,
  listSalesFunnelSalesDeals,
  moveSalesFunnelBdrLeadStage,
  moveSalesFunnelSalesDealStage,
  promoteSalesFunnelBdrLeadToDeal,
  getSalesFunnelSalesDealByPromotedLeadId,
  listSalesFunnelPromotedDealIdsByLead,
  updateSalesFunnelBdrLead,
  reactivateSalesFunnelBdrLead,
  deleteSalesFunnelBdrLeadPermanently,
  deleteSalesFunnelSalesDealPermanently,
  deleteSalesFunnelStage,
  insertSalesFunnelStage,
  reorderSalesFunnelStages,
  updateSalesFunnelPipelineConfig,
  updateSalesFunnelStage,
  updateSalesFunnelSalesDeal,
  reactivateSalesFunnelSalesDeal,
  getContactById,
  listTenantUsers,
  deleteSalesFunnelContactRole,
  insertSalesFunnelContactRole,
  listSalesFunnelContactRoles,
  type SalesFunnelActivityRow,
  type SalesFunnelBdrLeadRow,
  type SalesFunnelSalesDealRow,
  type SalesFunnelStageRow
} from "@starter/db";
import {
  isSalesFunnelModuleAvailable,
  salesFunnelBdrLeadCreateSchema,
  salesFunnelBdrLeadIdParamsSchema,
  salesFunnelBdrLeadNoteSchema,
  salesFunnelManualActivitySchema,
  salesFunnelBdrLeadPromoteSchema,
  salesFunnelBdrLeadPatchSchema,
  salesFunnelBdrLeadStagePatchSchema,
  salesFunnelBdrLeadsListQuerySchema,
  salesFunnelPipelineStagesPatchSchema,
  salesFunnelSalesDealCreateSchema,
  salesFunnelSalesDealIdParamsSchema,
  salesFunnelSalesDealNoteSchema,
  salesFunnelSalesDealPatchSchema,
  salesFunnelSalesDealStagePatchSchema,
  salesFunnelSalesDealsListQuerySchema,
  salesFunnelStageCreateSchema,
  salesFunnelStageIdParamsSchema,
  salesFunnelStagePatchSchema,
  salesFunnelStageReorderSchema,
  salesFunnelContactRoleCreateSchema,
  salesFunnelContactRoleIdParamsSchema
} from "@starter/shared";

import { resolveModuleRole } from "@starter/shared";

import { requireSalesModulePermission } from "../plugins/module-permission.js";
import { requireTenantMember } from "../plugins/tenant-member.js";
import { requireTenantRealm } from "../plugins/tenant-realm.js";
import { requireTenantContext } from "../plugins/tenant.js";
import {
  buildSalesActivityContactLabels,
  serializeSalesActivity,
  serializeSalesBdrLead,
  serializeSalesDeal,
  serializeSalesStage,
  type FunnelContactLink
} from "../serializers/sales.js";

const iso = (d: Date) => d.toISOString();

const salesModuleAvailable = async (): Promise<boolean> => {
  const row = await ensurePlatformModuleSettingsRow();
  return isSalesFunnelModuleAvailable({
    crmEnabled: row.crmEnabled,
    salesFunnelEnabled: row.salesFunnelEnabled
  });
};

const requireSalesModuleEnabled = async (_request: FastifyRequest, reply: FastifyReply) => {
  if (!(await salesModuleAvailable())) {
    return reply.code(403).send({
      error: "feature_disabled",
      message: "Sales is disabled or requires the CRM module to be enabled."
    });
  }
};


const mapLeadError = (reply: FastifyReply, e: unknown) => {
  const msg = e instanceof Error ? e.message : "";
  if (msg === "not_found") return reply.code(404).send({ error: "not_found", message: "Lead not found." });
  if (msg === "archived") {
    return reply.code(409).send({ error: "archived", message: "Archived leads cannot be edited." });
  }
  if (msg === "not_archived") {
    return reply.code(409).send({
      error: "not_archived",
      message: "Only archived leads can be permanently deleted."
    });
  }
  if (msg === "already_active") {
    return reply.code(409).send({
      error: "already_active",
      message: "This lead is already active on the pipeline board."
    });
  }
  if (msg === "promoted") {
    return reply.code(409).send({
      error: "promoted",
      message: "Promoted leads cannot be reactivated. Open the linked Sales deal instead."
    });
  }
  if (msg === "invalid_stage") {
    return reply.code(400).send({ error: "invalid_stage", message: "Unknown BDR stage." });
  }
  if (msg === "owner_not_found") {
    return reply.code(400).send({ error: "owner_not_found", message: "Owner user not found in this tenant." });
  }
  if (msg === "contact_not_found") {
    return reply.code(400).send({ error: "contact_not_found", message: "CRM contact not found." });
  }
  if (msg === "contact_not_on_record") {
    return reply.code(400).send({
      error: "contact_not_on_record",
      message: "Choose a contact linked to this lead."
    });
  }
  if (msg === "already_promoted") {
    return reply.code(409).send({
      error: "already_promoted",
      message: "This lead has already been promoted to the Sales pipeline."
    });
  }
  if (msg === "inactive") {
    return reply.code(409).send({
      error: "inactive",
      message: "This lead is inactive and cannot be promoted again."
    });
  }
  if (msg === "not_ready_for_sales") {
    return reply.code(409).send({
      error: "not_ready_for_sales",
      message: "Move the lead to the Ready for Sales lane before promoting."
    });
  }
  if (msg === "organization_not_found") {
    return reply.code(400).send({
      error: "organization_not_found",
      message: "CRM organization not found."
    });
  }
  if (msg === "invalid_contact_role") {
    return reply.code(400).send({
      error: "invalid_contact_role",
      message: "Choose a contact role defined under Sales → Settings."
    });
  }
  return null;
};

const mapContactRoleError = (reply: FastifyReply, e: unknown) => {
  const msg = e instanceof Error ? e.message : "";
  if (msg === "contact_role_exists") {
    return reply.code(409).send({ error: "contact_role_exists", message: "That role name already exists." });
  }
  if (msg === "contact_role_in_use") {
    return reply.code(409).send({
      error: "contact_role_in_use",
      message: "This role is assigned to leads or deals and cannot be deleted."
    });
  }
  return null;
};

const mapStageError = (reply: FastifyReply, e: unknown) => {
  const msg = e instanceof Error ? e.message : "";
  if (msg === "not_found") return reply.code(404).send({ error: "not_found", message: "Stage not found." });
  if (msg === "stage_not_empty") {
    return reply.code(409).send({
      error: "stage_not_empty",
      message: "Move or remove all cards from this lane before deleting it."
    });
  }
  if (msg === "last_stage") {
    return reply.code(409).send({
      error: "last_stage",
      message: "Each pipeline must have at least one lane."
    });
  }
  if (msg === "invalid_reorder") {
    return reply.code(400).send({ error: "invalid_reorder", message: "Invalid lane order." });
  }
  if (msg === "close_chance_sales_only") {
    return reply.code(400).send({
      error: "close_chance_sales_only",
      message: "Close chance applies to Sales pipeline lanes only."
    });
  }
  if (msg === "ready_for_sales_bdr_only") {
    return reply.code(400).send({
      error: "ready_for_sales_bdr_only",
      message: "Ready for Sales applies to BDR pipeline lanes only."
    });
  }
  return null;
};

const mapDealError = (reply: FastifyReply, e: unknown) => {
  const msg = e instanceof Error ? e.message : "";
  if (msg === "not_found") return reply.code(404).send({ error: "not_found", message: "Deal not found." });
  if (msg === "archived") {
    return reply.code(409).send({ error: "archived", message: "Archived deals cannot be edited." });
  }
  if (msg === "not_archived") {
    return reply.code(409).send({
      error: "not_archived",
      message: "Only archived deals can be permanently deleted."
    });
  }
  if (msg === "already_active") {
    return reply.code(409).send({
      error: "already_active",
      message: "This deal is already active on the pipeline board."
    });
  }
  if (msg === "invalid_stage") {
    return reply.code(400).send({ error: "invalid_stage", message: "Unknown Sales stage." });
  }
  if (msg === "owner_not_found") {
    return reply.code(400).send({ error: "owner_not_found", message: "Owner user not found in this tenant." });
  }
  if (msg === "contact_not_found") {
    return reply.code(400).send({ error: "contact_not_found", message: "CRM contact not found." });
  }
  if (msg === "contact_not_on_record") {
    return reply.code(400).send({
      error: "contact_not_on_record",
      message: "Choose a contact linked to this deal."
    });
  }
  if (msg === "organization_not_found") {
    return reply.code(400).send({
      error: "organization_not_found",
      message: "CRM organization not found."
    });
  }
  if (msg === "lead_not_found") {
    return reply.code(400).send({ error: "lead_not_found", message: "Source BDR lead not found." });
  }
  if (msg === "invalid_contact_role") {
    return reply.code(400).send({
      error: "invalid_contact_role",
      message: "Choose a contact role defined under Sales → Settings."
    });
  }
  return null;
};

export const registerTenantSalesRoutes = async (app: FastifyInstance) => {
  await app.register(
    async (scope) => {
      scope.addHook("preHandler", requireTenantContext);
      scope.addHook("preHandler", requireTenantRealm);
      scope.addHook("preHandler", requireTenantMember);

      scope.get("/availability", async (request) => {
        const row = await ensurePlatformModuleSettingsRow();
        const salesFunnelEnabled = isSalesFunnelModuleAvailable({
          crmEnabled: row.crmEnabled,
          salesFunnelEnabled: row.salesFunnelEnabled
        });
        const salesRole = resolveModuleRole(
          "sales",
          request.role ?? "tenant_user",
          request.moduleRoles ?? {}
        );
        return {
          salesFunnelEnabled,
          crmEnabled: row.crmEnabled,
          platformSalesFunnelEnabled: row.salesFunnelEnabled,
          salesRole: salesFunnelEnabled ? salesRole : null
        };
      });
    },
    { prefix: "/sales" }
  );

  await app.register(
    async (scope) => {
      scope.addHook("preHandler", requireTenantContext);
      scope.addHook("preHandler", requireTenantRealm);
      scope.addHook("preHandler", requireTenantMember);
      scope.addHook("preHandler", requireSalesModuleEnabled);
      scope.addHook("preHandler", requireSalesModulePermission);

      scope.get("/pipeline-config", async (request) => {
        const tenantId = request.tenantId!;
        const config = await getSalesFunnelPipelineConfig(tenantId);
        return {
          bdrStages: config.bdrStages.map(serializeSalesStage),
          salesStages: config.salesStages.map(serializeSalesStage)
        };
      });

      scope.get("/assignees", async (request) => {
        const tenantId = request.tenantId!;
        const result = await listTenantUsers({
          tenantId,
          page: 1,
          pageSize: 200,
          sort: "displayName",
          order: "asc"
        });
        return {
          users: result.rows.map((row) => ({
            id: row.id,
            displayName: row.displayName,
            email: row.email,
            role: row.role
          }))
        };
      });

      scope.get("/contact-roles", async (request) => {
        const tenantId = request.tenantId!;
        const roles = await listSalesFunnelContactRoles(tenantId);
        return {
          roles: roles.map((r) => ({
            id: r.id,
            label: r.label,
            sortOrder: r.sortOrder,
            usageCount: r.usageCount,
            createdAt: iso(r.createdAt)
          }))
        };
      });

      scope.post("/contact-roles", async (request, reply) => {
        const body = salesFunnelContactRoleCreateSchema.safeParse(request.body);
        if (!body.success) {
          return reply.code(400).send({ error: "validation_error", message: "Invalid request." });
        }
        const tenantId = request.tenantId!;
        try {
          const row = await insertSalesFunnelContactRole(tenantId, body.data);
          return reply.code(201).send({
            role: {
              id: row.id,
              label: row.label,
              sortOrder: row.sortOrder,
              usageCount: row.usageCount,
              createdAt: iso(row.createdAt)
            }
          });
        } catch (e) {
          const mapped = mapContactRoleError(reply, e);
          if (mapped) return mapped;
          throw e;
        }
      });

      scope.delete("/contact-roles/:id", async (request, reply) => {
        const params = salesFunnelContactRoleIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: "validation_error", message: "Invalid id." });
        }
        const tenantId = request.tenantId!;
        try {
          const ok = await deleteSalesFunnelContactRole(tenantId, params.data.id);
          if (!ok) {
            return reply.code(404).send({ error: "not_found", message: "Contact role not found." });
          }
          return reply.code(204).send();
        } catch (e) {
          const mapped = mapContactRoleError(reply, e);
          if (mapped) return mapped;
          throw e;
        }
      });

      scope.get("/bdr/board", async (request, reply) => {
        const parsed = salesFunnelBdrLeadsListQuerySchema.safeParse(request.query);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const tenantId = request.tenantId!;
        const board = await getSalesFunnelBdrBoard(tenantId, { ...parsed.data, onlyPipelineActive: true });
        const promotedByLead = await listSalesFunnelPromotedDealIdsByLead(tenantId);
        const contactIdsByLead = await Promise.all(
          board.leads.map(async (lead) => ({
            leadId: lead.id,
            contacts: await getSalesFunnelBdrLeadContacts(tenantId, lead.id)
          }))
        );
        const contactMap = new Map(contactIdsByLead.map((x) => [x.leadId, x.contacts]));
        return {
          stages: board.stages.map(serializeSalesStage),
          leads: board.leads.map((l) =>
            serializeSalesBdrLead(l, contactMap.get(l.id) ?? [], promotedByLead.get(l.id) ?? null)
          )
        };
      });

      scope.get("/bdr/leads", async (request, reply) => {
        const parsed = salesFunnelBdrLeadsListQuerySchema.safeParse(request.query);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const tenantId = request.tenantId!;
        const leads = await listSalesFunnelBdrLeads(tenantId, parsed.data);
        return { leads: leads.map((l) => serializeSalesBdrLead(l)) };
      });

      scope.get("/bdr/leads/:id", async (request, reply) => {
        const params = salesFunnelBdrLeadIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: "validation_error", message: "Invalid id." });
        }
        const tenantId = request.tenantId!;
        const row = await getSalesFunnelBdrLeadById(tenantId, params.data.id);
        if (!row) {
          return reply.code(404).send({ error: "not_found", message: "Lead not found." });
        }
        const contacts = await getSalesFunnelBdrLeadContacts(tenantId, row.id);
        const promoted = await getSalesFunnelSalesDealByPromotedLeadId(tenantId, row.id);
        return { lead: serializeSalesBdrLead(row, contacts, promoted?.id ?? null) };
      });

      scope.get("/bdr/leads/:id/activities", async (request, reply) => {
        const params = salesFunnelBdrLeadIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: "validation_error", message: "Invalid id." });
        }
        const tenantId = request.tenantId!;
        const row = await getSalesFunnelBdrLeadById(tenantId, params.data.id);
        if (!row) {
          return reply.code(404).send({ error: "not_found", message: "Lead not found." });
        }
        const activities = await listSalesFunnelActivities(tenantId, "bdr_lead", params.data.id);
        const contactLabels = await buildSalesActivityContactLabels(tenantId, activities, getContactById);
        return { activities: activities.map((a) => serializeSalesActivity(a, contactLabels)) };
      });

      scope.get("/deals/board", async (request, reply) => {
        const parsed = salesFunnelSalesDealsListQuerySchema.safeParse(request.query);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const tenantId = request.tenantId!;
        const board = await getSalesFunnelSalesBoard(tenantId, { ...parsed.data, onlyPipelineActive: true });
        const contactsByDeal = await Promise.all(
          board.deals.map(async (deal) => ({
            dealId: deal.id,
            contacts: await getSalesFunnelSalesDealContacts(tenantId, deal.id)
          }))
        );
        const contactMap = new Map(contactsByDeal.map((x) => [x.dealId, x.contacts]));
        return {
          stages: board.stages.map(serializeSalesStage),
          deals: board.deals.map((d) => serializeSalesDeal(d, contactMap.get(d.id) ?? []))
        };
      });

      scope.get("/deals", async (request, reply) => {
        const parsed = salesFunnelSalesDealsListQuerySchema.safeParse(request.query);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const tenantId = request.tenantId!;
        const deals = await listSalesFunnelSalesDeals(tenantId, parsed.data);
        return { deals: deals.map((d) => serializeSalesDeal(d)) };
      });

      scope.get("/deals/:id", async (request, reply) => {
        const params = salesFunnelSalesDealIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: "validation_error", message: "Invalid id." });
        }
        const tenantId = request.tenantId!;
        const row = await getSalesFunnelSalesDealById(tenantId, params.data.id);
        if (!row) {
          return reply.code(404).send({ error: "not_found", message: "Deal not found." });
        }
        const contacts = await getSalesFunnelSalesDealContacts(tenantId, row.id);
        return { deal: serializeSalesDeal(row, contacts) };
      });

      scope.get("/deals/:id/activities", async (request, reply) => {
        const params = salesFunnelSalesDealIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: "validation_error", message: "Invalid id." });
        }
        const tenantId = request.tenantId!;
        const row = await getSalesFunnelSalesDealById(tenantId, params.data.id);
        if (!row) {
          return reply.code(404).send({ error: "not_found", message: "Deal not found." });
        }
        const activities = await listSalesFunnelActivities(tenantId, "sales_deal", params.data.id);
        const contactLabels = await buildSalesActivityContactLabels(tenantId, activities, getContactById);
        return { activities: activities.map((a) => serializeSalesActivity(a, contactLabels)) };
      });
    },
    { prefix: "/sales" }
  );

  await app.register(
    async (scope) => {
      scope.addHook("preHandler", requireTenantContext);
      scope.addHook("preHandler", requireTenantRealm);
      scope.addHook("preHandler", requireTenantMember);
      scope.addHook("preHandler", requireSalesModuleEnabled);
      scope.addHook("preHandler", requireSalesModulePermission);

      scope.patch("/pipeline-config", async (request, reply) => {
        const parsed = salesFunnelPipelineStagesPatchSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const tenantId = request.tenantId!;
        const config = await updateSalesFunnelPipelineConfig(tenantId, parsed.data);
        return {
          bdrStages: config.bdrStages.map(serializeSalesStage),
          salesStages: config.salesStages.map(serializeSalesStage)
        };
      });

      scope.post("/bdr/leads", async (request, reply) => {
        const parsed = salesFunnelBdrLeadCreateSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const tenantId = request.tenantId!;
        try {
          const row = await insertSalesFunnelBdrLead(tenantId, parsed.data, request.userId ?? null);
          const contacts = await getSalesFunnelBdrLeadContacts(tenantId, row.id);
          return reply.code(201).send({ lead: serializeSalesBdrLead(row, contacts) });
        } catch (e) {
          const mapped = mapLeadError(reply, e);
          if (mapped) return mapped;
          throw e;
        }
      });

      scope.patch("/bdr/leads/:id", async (request, reply) => {
        const params = salesFunnelBdrLeadIdParamsSchema.safeParse(request.params);
        const body = salesFunnelBdrLeadPatchSchema.safeParse(request.body);
        if (!params.success || !body.success) {
          return reply.code(400).send({ error: "validation_error", message: "Invalid request." });
        }
        const tenantId = request.tenantId!;
        try {
          const row = await updateSalesFunnelBdrLead(
            tenantId,
            params.data.id,
            body.data,
            request.userId ?? null
          );
          const contacts = await getSalesFunnelBdrLeadContacts(tenantId, row.id);
          return { lead: serializeSalesBdrLead(row, contacts) };
        } catch (e) {
          const mapped = mapLeadError(reply, e);
          if (mapped) return mapped;
          throw e;
        }
      });

      scope.delete("/bdr/leads/:id", async (request, reply) => {
        const params = salesFunnelBdrLeadIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: "validation_error", message: "Invalid request." });
        }
        const tenantId = request.tenantId!;
        try {
          await deleteSalesFunnelBdrLeadPermanently(tenantId, params.data.id);
          return reply.code(204).send();
        } catch (e) {
          const mapped = mapLeadError(reply, e);
          if (mapped) return mapped;
          throw e;
        }
      });

      scope.post("/bdr/leads/:id/stage", async (request, reply) => {
        const params = salesFunnelBdrLeadIdParamsSchema.safeParse(request.params);
        const body = salesFunnelBdrLeadStagePatchSchema.safeParse(request.body);
        if (!params.success || !body.success) {
          return reply.code(400).send({ error: "validation_error", message: "Invalid request." });
        }
        const tenantId = request.tenantId!;
        try {
          const row = await moveSalesFunnelBdrLeadStage(
            tenantId,
            params.data.id,
            body.data.stageKey,
            request.userId ?? null
          );
          const contacts = await getSalesFunnelBdrLeadContacts(tenantId, row.id);
          return { lead: serializeSalesBdrLead(row, contacts) };
        } catch (e) {
          const mapped = mapLeadError(reply, e);
          if (mapped) return mapped;
          throw e;
        }
      });

      scope.post("/bdr/leads/:id/reactivate", async (request, reply) => {
        const params = salesFunnelBdrLeadIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: "validation_error", message: "Invalid request." });
        }
        const tenantId = request.tenantId!;
        try {
          const row = await reactivateSalesFunnelBdrLead(
            tenantId,
            params.data.id,
            request.userId ?? null
          );
          const contacts = await getSalesFunnelBdrLeadContacts(tenantId, row.id);
          const promoted = await getSalesFunnelSalesDealByPromotedLeadId(tenantId, row.id);
          return { lead: serializeSalesBdrLead(row, contacts, promoted?.id ?? null) };
        } catch (e) {
          const mapped = mapLeadError(reply, e);
          if (mapped) return mapped;
          throw e;
        }
      });

      scope.post("/bdr/leads/:id/promote", async (request, reply) => {
        const params = salesFunnelBdrLeadIdParamsSchema.safeParse(request.params);
        const body = salesFunnelBdrLeadPromoteSchema.safeParse(request.body ?? {});
        if (!params.success || !body.success) {
          return reply.code(400).send({ error: "validation_error", message: "Invalid request." });
        }
        const tenantId = request.tenantId!;
        try {
          const deal = await promoteSalesFunnelBdrLeadToDeal(
            tenantId,
            params.data.id,
            body.data,
            request.userId ?? null
          );
          const contacts = await getSalesFunnelSalesDealContacts(tenantId, deal.id);
          return reply.code(201).send({ deal: serializeSalesDeal(deal, contacts) });
        } catch (e) {
          const mapped = mapLeadError(reply, e);
          if (mapped) return mapped;
          throw e;
        }
      });

      scope.post("/bdr/leads/:id/notes", async (request, reply) => {
        const params = salesFunnelBdrLeadIdParamsSchema.safeParse(request.params);
        const body = salesFunnelBdrLeadNoteSchema.safeParse(request.body);
        if (!params.success || !body.success) {
          return reply.code(400).send({ error: "validation_error", message: "Invalid request." });
        }
        const tenantId = request.tenantId!;
        try {
          const activity = await addSalesFunnelBdrLeadNote(
            tenantId,
            params.data.id,
            body.data.body,
            request.userId ?? null
          );
          return reply.code(201).send({ activity: serializeSalesActivity(activity) });
        } catch (e) {
          const mapped = mapLeadError(reply, e);
          if (mapped) return mapped;
          throw e;
        }
      });

      scope.post("/bdr/leads/:id/activities", async (request, reply) => {
        const params = salesFunnelBdrLeadIdParamsSchema.safeParse(request.params);
        const body = salesFunnelManualActivitySchema.safeParse(request.body);
        if (!params.success || !body.success) {
          return reply.code(400).send({ error: "validation_error", message: "Invalid request." });
        }
        const tenantId = request.tenantId!;
        try {
          const activity = await addSalesFunnelManualActivity({
            tenantId,
            entityType: "bdr_lead",
            entityId: params.data.id,
            activityType: body.data.activityType,
            body: body.data.body,
            actorUserId: request.userId ?? null,
            direction: body.data.direction ?? null,
            scheduledAt: body.data.scheduledAt ?? null,
            contactIds: body.data.contactIds ?? []
          });
          const contactLabels = await buildSalesActivityContactLabels(tenantId, [activity], getContactById);
          return reply.code(201).send({ activity: serializeSalesActivity(activity, contactLabels) });
        } catch (e) {
          const mapped = mapLeadError(reply, e);
          if (mapped) return mapped;
          throw e;
        }
      });

      scope.post("/deals", async (request, reply) => {
        const parsed = salesFunnelSalesDealCreateSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const tenantId = request.tenantId!;
        try {
          const row = await insertSalesFunnelSalesDeal(tenantId, parsed.data, request.userId ?? null);
          const contacts = await getSalesFunnelSalesDealContacts(tenantId, row.id);
          return reply.code(201).send({ deal: serializeSalesDeal(row, contacts) });
        } catch (e) {
          const mapped = mapDealError(reply, e);
          if (mapped) return mapped;
          throw e;
        }
      });

      scope.patch("/deals/:id", async (request, reply) => {
        const params = salesFunnelSalesDealIdParamsSchema.safeParse(request.params);
        const body = salesFunnelSalesDealPatchSchema.safeParse(request.body);
        if (!params.success || !body.success) {
          return reply.code(400).send({ error: "validation_error", message: "Invalid request." });
        }
        const tenantId = request.tenantId!;
        try {
          const row = await updateSalesFunnelSalesDeal(
            tenantId,
            params.data.id,
            body.data,
            request.userId ?? null
          );
          const contacts = await getSalesFunnelSalesDealContacts(tenantId, row.id);
          return { deal: serializeSalesDeal(row, contacts) };
        } catch (e) {
          const mapped = mapDealError(reply, e);
          if (mapped) return mapped;
          throw e;
        }
      });

      scope.delete("/deals/:id", async (request, reply) => {
        const params = salesFunnelSalesDealIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: "validation_error", message: "Invalid request." });
        }
        const tenantId = request.tenantId!;
        try {
          await deleteSalesFunnelSalesDealPermanently(tenantId, params.data.id);
          return reply.code(204).send();
        } catch (e) {
          const mapped = mapDealError(reply, e);
          if (mapped) return mapped;
          throw e;
        }
      });

      scope.post("/deals/:id/stage", async (request, reply) => {
        const params = salesFunnelSalesDealIdParamsSchema.safeParse(request.params);
        const body = salesFunnelSalesDealStagePatchSchema.safeParse(request.body);
        if (!params.success || !body.success) {
          return reply.code(400).send({ error: "validation_error", message: "Invalid request." });
        }
        const tenantId = request.tenantId!;
        try {
          const row = await moveSalesFunnelSalesDealStage(
            tenantId,
            params.data.id,
            body.data.stageKey,
            request.userId ?? null
          );
          const contacts = await getSalesFunnelSalesDealContacts(tenantId, row.id);
          return { deal: serializeSalesDeal(row, contacts) };
        } catch (e) {
          const mapped = mapDealError(reply, e);
          if (mapped) return mapped;
          throw e;
        }
      });

      scope.post("/deals/:id/reactivate", async (request, reply) => {
        const params = salesFunnelSalesDealIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: "validation_error", message: "Invalid request." });
        }
        const tenantId = request.tenantId!;
        try {
          const row = await reactivateSalesFunnelSalesDeal(
            tenantId,
            params.data.id,
            request.userId ?? null
          );
          const contacts = await getSalesFunnelSalesDealContacts(tenantId, row.id);
          return { deal: serializeSalesDeal(row, contacts) };
        } catch (e) {
          const mapped = mapDealError(reply, e);
          if (mapped) return mapped;
          throw e;
        }
      });

      scope.post("/deals/:id/notes", async (request, reply) => {
        const params = salesFunnelSalesDealIdParamsSchema.safeParse(request.params);
        const body = salesFunnelSalesDealNoteSchema.safeParse(request.body);
        if (!params.success || !body.success) {
          return reply.code(400).send({ error: "validation_error", message: "Invalid request." });
        }
        const tenantId = request.tenantId!;
        try {
          const activity = await addSalesFunnelSalesDealNote(
            tenantId,
            params.data.id,
            body.data.body,
            request.userId ?? null
          );
          return reply.code(201).send({ activity: serializeSalesActivity(activity) });
        } catch (e) {
          const mapped = mapDealError(reply, e);
          if (mapped) return mapped;
          throw e;
        }
      });

      scope.post("/deals/:id/activities", async (request, reply) => {
        const params = salesFunnelSalesDealIdParamsSchema.safeParse(request.params);
        const body = salesFunnelManualActivitySchema.safeParse(request.body);
        if (!params.success || !body.success) {
          return reply.code(400).send({ error: "validation_error", message: "Invalid request." });
        }
        const tenantId = request.tenantId!;
        try {
          const activity = await addSalesFunnelManualActivity({
            tenantId,
            entityType: "sales_deal",
            entityId: params.data.id,
            activityType: body.data.activityType,
            body: body.data.body,
            actorUserId: request.userId ?? null,
            direction: body.data.direction ?? null,
            scheduledAt: body.data.scheduledAt ?? null,
            contactIds: body.data.contactIds ?? []
          });
          const contactLabels = await buildSalesActivityContactLabels(tenantId, [activity], getContactById);
          return reply.code(201).send({ activity: serializeSalesActivity(activity, contactLabels) });
        } catch (e) {
          const mapped = mapDealError(reply, e);
          if (mapped) return mapped;
          throw e;
        }
      });

      scope.post("/stages", async (request, reply) => {
        const parsed = salesFunnelStageCreateSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const tenantId = request.tenantId!;
        try {
          const row = await insertSalesFunnelStage(tenantId, parsed.data.pipeline, parsed.data.name);
          return reply.code(201).send({ stage: serializeSalesStage(row) });
        } catch (e) {
          const mapped = mapStageError(reply, e);
          if (mapped) return mapped;
          throw e;
        }
      });

      scope.patch("/stages/reorder", async (request, reply) => {
        const parsed = salesFunnelStageReorderSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const tenantId = request.tenantId!;
        try {
          const stages = await reorderSalesFunnelStages(
            tenantId,
            parsed.data.pipeline,
            parsed.data.stageIds
          );
          return { stages: stages.map(serializeSalesStage) };
        } catch (e) {
          const mapped = mapStageError(reply, e);
          if (mapped) return mapped;
          throw e;
        }
      });

      scope.patch("/stages/:id", async (request, reply) => {
        const params = salesFunnelStageIdParamsSchema.safeParse(request.params);
        const body = salesFunnelStagePatchSchema.safeParse(request.body);
        if (!params.success || !body.success) {
          return reply.code(400).send({ error: "validation_error", message: "Invalid request." });
        }
        const tenantId = request.tenantId!;
        try {
          const row = await updateSalesFunnelStage(tenantId, params.data.id, body.data);
          return { stage: serializeSalesStage(row) };
        } catch (e) {
          const mapped = mapStageError(reply, e);
          if (mapped) return mapped;
          throw e;
        }
      });

      scope.delete("/stages/:id", async (request, reply) => {
        const params = salesFunnelStageIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: "validation_error", message: "Invalid id." });
        }
        const tenantId = request.tenantId!;
        try {
          await deleteSalesFunnelStage(tenantId, params.data.id);
          return reply.code(204).send();
        } catch (e) {
          const mapped = mapStageError(reply, e);
          if (mapped) return mapped;
          throw e;
        }
      });
    },
    { prefix: "/sales" }
  );
};
