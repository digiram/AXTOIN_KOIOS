/**
 * Tenant CRM API — organizations, contacts, relationship types, relationships, activities.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { stat } from "node:fs/promises";

import {
  deleteContact,
  deleteOrganization,
  deleteOrganizationMarketingTag,
  deleteOrganizationMarketSegment,
  deleteRelationship,
  deleteRelationshipType,
  ensurePlatformModuleSettingsRow,
  ensureSystemRelationshipTypesForTenant,
  getContactById,
  getContactEmployerOrganizationId,
  getOrganizationById,
  insertActivity,
  insertContact,
  insertOrganization,
  insertOrganizationMarketingTag,
  insertOrganizationMarketSegment,
  insertRelationship,
  insertRelationshipType,
  listActivitiesForEntity,
  listContacts,
  listOrganizationMarketingTags,
  listOrganizationMarketSegments,
  listOrganizations,
  listRelationshipTypes,
  listRelationshipsForEntity,
  setContactEmployerOrganization,
  setContactPhotoRelPath,
  setOrganizationHoldingOrganization,
  updateContact,
  updateOrganization
} from "@starter/db";
import {
  crmActivitiesQuerySchema,
  crmActivityCreateSchema,
  crmContactCreateSchema,
  crmContactPatchSchema,
  crmIdParamsSchema,
  crmListQuerySchema,
  crmOrganizationCreateSchema,
  crmOrganizationMarketingTagCreateSchema,
  crmOrganizationMarketingTagIdParamsSchema,
  crmOrganizationMarketSegmentCreateSchema,
  crmOrganizationPatchSchema,
  crmOrganizationSegmentIdParamsSchema,
  crmRelationshipCreateSchema,
  crmRelationshipsQuerySchema,
  crmRelationshipTypeCreateSchema,
  formatCrmPrimaryAddressCity,
  formatCrmPrimaryAddressLine,
  isReservedCrmRelationshipTypeName
} from "@starter/shared";

import { resolveModuleRole } from "@starter/shared";

import { requireCrmModulePermission } from "../plugins/crm-permission.js";
import { requireTenantMember } from "../plugins/tenant-member.js";
import { requireTenantRealm } from "../plugins/tenant-realm.js";
import { requireTenantContext } from "../plugins/tenant.js";
import {
  serializeCrmContact,
  serializeCrmOrganizationWithHolding,
  serializeCrmOrganizationsEnrichedList
} from "../serializers/crm.js";
import { registerTenantCrmGeocodeRoutes } from "./tenant-crm-geocode.js";
import {
  absPathFromRel,
  assertProfilePhotoUpload,
  deleteProfilePhotoFile,
  extForProfilePhotoMime,
  mimeForStoredPhotoName,
  readProfilePhotoBytes,
  relPathForContactPhoto,
  resolveApiFilesRoot,
  writeProfilePhotoFile
} from "../lib/entity-photo-storage.js";

const iso = (d: Date) => d.toISOString();

const mapOrganizationMarketSegmentError = (reply: FastifyReply, err: unknown) => {
  const code = err instanceof Error ? err.message : "";
  if (code === "segment_exists") {
    return reply.code(409).send({ error: "conflict", message: "A segment with that name already exists at this level." });
  }
  if (code === "segment_parent_not_found") {
    return reply.code(400).send({ error: "validation_error", message: "Parent segment not found." });
  }
  if (code === "segment_max_depth") {
    return reply.code(400).send({ error: "validation_error", message: "Market segments support at most three layers." });
  }
  if (code === "segment_has_children") {
    return reply.code(409).send({ error: "conflict", message: "Remove child segments before deleting this option." });
  }
  if (code === "segment_in_use") {
    return reply.code(409).send({ error: "conflict", message: "This segment is assigned to one or more organizations." });
  }
  return null;
};

const mapOrganizationMarketingTagError = (reply: FastifyReply, err: unknown) => {
  const code = err instanceof Error ? err.message : "";
  if (code === "marketing_tag_exists") {
    return reply.code(409).send({ error: "conflict", message: "A marketing tag with that name already exists." });
  }
  if (code === "marketing_tag_in_use") {
    return reply.code(409).send({ error: "conflict", message: "This tag is assigned to one or more organizations." });
  }
  return null;
};

const mapOrganizationSegmentAssignmentError = (reply: FastifyReply, err: unknown) => {
  const code = err instanceof Error ? err.message : "";
  if (code === "invalid_market_segment") {
    return reply.code(400).send({ error: "validation_error", message: "Invalid market segment selection." });
  }
  if (code === "invalid_marketing_tag") {
    return reply.code(400).send({ error: "validation_error", message: "One or more marketing tags are invalid." });
  }
  return null;
};

const requireCrmModuleEnabled = async (_request: FastifyRequest, reply: FastifyReply) => {
  const row = await ensurePlatformModuleSettingsRow();
  if (!row.crmEnabled) {
    return reply.code(403).send({
      error: "feature_disabled",
      message: "CRM is disabled by the platform administrator."
    });
  }
};

export const registerTenantCrmRoutes = async (app: FastifyInstance) => {
  await app.register(
    async (scope) => {
      scope.addHook("preHandler", requireTenantContext);
      scope.addHook("preHandler", requireTenantRealm);
      scope.addHook("preHandler", requireTenantMember);
      scope.get("/availability", async (request) => {
        const row = await ensurePlatformModuleSettingsRow();
        const crmRole = resolveModuleRole("crm", request.role ?? "tenant_user", request.moduleRoles ?? {});
        return {
          crmEnabled: row.crmEnabled,
          crmRole: row.crmEnabled ? crmRole : null
        };
      });
    },
    { prefix: "/crm" }
  );

  await registerTenantCrmGeocodeRoutes(app);

  await app.register(
    async (scope) => {
      scope.addHook("preHandler", requireTenantContext);
      scope.addHook("preHandler", requireTenantRealm);
      scope.addHook("preHandler", requireTenantMember);
      scope.addHook("preHandler", requireCrmModuleEnabled);
      scope.addHook("preHandler", requireCrmModulePermission);

      scope.get("/organizations", async (request, reply) => {
        const parsed = crmListQuerySchema.safeParse(request.query);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const tenantId = request.tenantId!;
        const { rows, total } = await listOrganizations(tenantId, parsed.data);
        const organizations = await serializeCrmOrganizationsEnrichedList(tenantId, rows);
        return {
          organizations,
          total,
          page: parsed.data.page,
          pageSize: parsed.data.pageSize
        };
      });

      scope.post("/organizations", async (request, reply) => {
        const parsed = crmOrganizationCreateSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const tenantId = request.tenantId!;
        const { holdingOrganizationId, ...orgInput } = parsed.data;
        let row;
        try {
          row = await insertOrganization(tenantId, orgInput);
        } catch (e) {
          const mapped = mapOrganizationSegmentAssignmentError(reply, e);
          if (mapped) return mapped;
          throw e;
        }
        if (holdingOrganizationId !== undefined && holdingOrganizationId !== null) {
          if (holdingOrganizationId === row.id) {
            return reply.code(400).send({
              error: "validation_error",
              message: "Holding organization cannot be the same as this organization."
            });
          }
          await ensureSystemRelationshipTypesForTenant(tenantId);
          await setOrganizationHoldingOrganization(tenantId, row.id, holdingOrganizationId);
        }
        return serializeCrmOrganizationWithHolding(tenantId, row);
      });

      scope.get("/organizations/:id", async (request, reply) => {
        const params = crmIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: "validation_error", message: params.error.message });
        }
        const tenantId = request.tenantId!;
        const row = await getOrganizationById(tenantId, params.data.id);
        if (!row) return reply.code(404).send({ error: "not_found", message: "Organization not found" });
        return serializeCrmOrganizationWithHolding(tenantId, row);
      });

      scope.patch("/organizations/:id", async (request, reply) => {
        const params = crmIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: "validation_error", message: params.error.message });
        }
        const parsed = crmOrganizationPatchSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const tenantId = request.tenantId!;
        const organizationId = params.data.id;
        const { holdingOrganizationId, ...patch } = parsed.data;
        if (holdingOrganizationId !== undefined && holdingOrganizationId !== null && holdingOrganizationId === organizationId) {
          return reply.code(400).send({
            error: "validation_error",
            message: "Holding organization cannot be the same as this organization."
          });
        }
        let row;
        try {
          row = await updateOrganization(tenantId, organizationId, patch);
        } catch (e) {
          const mapped = mapOrganizationSegmentAssignmentError(reply, e);
          if (mapped) return mapped;
          throw e;
        }
        if (!row) return reply.code(404).send({ error: "not_found", message: "Organization not found" });
        if (holdingOrganizationId !== undefined) {
          await ensureSystemRelationshipTypesForTenant(tenantId);
          await setOrganizationHoldingOrganization(tenantId, organizationId, holdingOrganizationId);
        }
        return serializeCrmOrganizationWithHolding(tenantId, row);
      });

      scope.delete("/organizations/:id", async (request, reply) => {
        const params = crmIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: "validation_error", message: params.error.message });
        }
        const ok = await deleteOrganization(request.tenantId!, params.data.id);
        if (!ok) return reply.code(404).send({ error: "not_found", message: "Organization not found" });
        return { ok: true };
      });

      scope.get("/organization-market-segments", async (request) => {
        const tenantId = request.tenantId!;
        const segments = await listOrganizationMarketSegments(tenantId);
        return {
          segments: segments.map((s) => ({
            id: s.id,
            layer: s.layer,
            parentId: s.parentId,
            name: s.name,
            sortOrder: s.sortOrder,
            createdAt: iso(s.createdAt)
          }))
        };
      });

      scope.post("/organization-market-segments", async (request, reply) => {
        const body = crmOrganizationMarketSegmentCreateSchema.safeParse(request.body);
        if (!body.success) {
          return reply.code(400).send({ error: "validation_error", message: "Invalid request." });
        }
        const tenantId = request.tenantId!;
        try {
          const row = await insertOrganizationMarketSegment(tenantId, body.data);
          return reply.code(201).send({
            segment: {
              id: row.id,
              layer: row.layer,
              parentId: row.parentId,
              name: row.name,
              sortOrder: row.sortOrder,
              createdAt: iso(row.createdAt)
            }
          });
        } catch (e) {
          const mapped = mapOrganizationMarketSegmentError(reply, e);
          if (mapped) return mapped;
          throw e;
        }
      });

      scope.delete("/organization-market-segments/:id", async (request, reply) => {
        const params = crmOrganizationSegmentIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: "validation_error", message: "Invalid id." });
        }
        const tenantId = request.tenantId!;
        try {
          const ok = await deleteOrganizationMarketSegment(tenantId, params.data.id);
          if (!ok) {
            return reply.code(404).send({ error: "not_found", message: "Market segment not found." });
          }
          return reply.code(204).send();
        } catch (e) {
          const mapped = mapOrganizationMarketSegmentError(reply, e);
          if (mapped) return mapped;
          throw e;
        }
      });

      scope.get("/organization-marketing-tags", async (request) => {
        const tenantId = request.tenantId!;
        const tags = await listOrganizationMarketingTags(tenantId);
        return {
          tags: tags.map((t) => ({
            id: t.id,
            name: t.name,
            sortOrder: t.sortOrder,
            usageCount: t.usageCount,
            createdAt: iso(t.createdAt)
          }))
        };
      });

      scope.post("/organization-marketing-tags", async (request, reply) => {
        const body = crmOrganizationMarketingTagCreateSchema.safeParse(request.body);
        if (!body.success) {
          return reply.code(400).send({ error: "validation_error", message: "Invalid request." });
        }
        const tenantId = request.tenantId!;
        try {
          const row = await insertOrganizationMarketingTag(tenantId, body.data);
          return reply.code(201).send({
            tag: {
              id: row.id,
              name: row.name,
              sortOrder: row.sortOrder,
              usageCount: row.usageCount,
              createdAt: iso(row.createdAt)
            }
          });
        } catch (e) {
          const mapped = mapOrganizationMarketingTagError(reply, e);
          if (mapped) return mapped;
          throw e;
        }
      });

      scope.delete("/organization-marketing-tags/:id", async (request, reply) => {
        const params = crmOrganizationMarketingTagIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: "validation_error", message: "Invalid id." });
        }
        const tenantId = request.tenantId!;
        try {
          const ok = await deleteOrganizationMarketingTag(tenantId, params.data.id);
          if (!ok) {
            return reply.code(404).send({ error: "not_found", message: "Marketing tag not found." });
          }
          return reply.code(204).send();
        } catch (e) {
          const mapped = mapOrganizationMarketingTagError(reply, e);
          if (mapped) return mapped;
          throw e;
        }
      });

      scope.get("/contacts", async (request, reply) => {
        const parsed = crmListQuerySchema.safeParse(request.query);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const tenantId = request.tenantId!;
        const { rows, total } = await listContacts(tenantId, parsed.data);
        const contacts = await Promise.all(
          rows.map(async (r) => {
            const base = serializeCrmContact(r)!;
            const first = r.firstName?.trim() ?? "";
            const last = r.lastName?.trim() ?? "";
            const displayName = [first, last].filter(Boolean).join(" ").trim() || base.email || base.id;
            const empId = await getContactEmployerOrganizationId(tenantId, r.id);
            const employer = empId ? await getOrganizationById(tenantId, empId) : null;
            return {
              ...base,
              displayName,
              employerOrganizationId: empId,
              employerOrganizationName: employer?.name ?? null
            };
          })
        );
        return {
          contacts,
          total,
          page: parsed.data.page,
          pageSize: parsed.data.pageSize
        };
      });

      scope.post("/contacts", async (request, reply) => {
        const parsed = crmContactCreateSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const tenantId = request.tenantId!;
        const { employerOrganizationId, ...contactInput } = parsed.data;
        const row = await insertContact(tenantId, contactInput);
        await ensureSystemRelationshipTypesForTenant(tenantId);
        await setContactEmployerOrganization(tenantId, row.id, employerOrganizationId ?? null);
        const employerId = await getContactEmployerOrganizationId(tenantId, row.id);
        const employer = employerId ? await getOrganizationById(tenantId, employerId) : null;
        return {
          ...serializeCrmContact(row)!,
          employerOrganizationId: employerId,
          employerOrganizationName: employer?.name ?? null,
          employerOrganizationPrimaryAddress: employer
            ? formatCrmPrimaryAddressLine(employer).trim() || null
            : null,
          employerOrganizationCity: employer
            ? formatCrmPrimaryAddressCity(employer).trim() || null
            : null
        };
      });

      scope.get("/contacts/:id", async (request, reply) => {
        const params = crmIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: "validation_error", message: params.error.message });
        }
        const tenantId = request.tenantId!;
        const row = await getContactById(tenantId, params.data.id);
        if (!row) return reply.code(404).send({ error: "not_found", message: "Contact not found" });
        const employerOrganizationId = await getContactEmployerOrganizationId(tenantId, row.id);
        const employer = employerOrganizationId ? await getOrganizationById(tenantId, employerOrganizationId) : null;
        return {
          ...serializeCrmContact(row)!,
          employerOrganizationId,
          employerOrganizationName: employer?.name ?? null,
          employerOrganizationPrimaryAddress: employer
            ? formatCrmPrimaryAddressLine(employer).trim() || null
            : null,
          employerOrganizationCity: employer
            ? formatCrmPrimaryAddressCity(employer).trim() || null
            : null
        };
      });

      scope.patch("/contacts/:id", async (request, reply) => {
        const params = crmIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: "validation_error", message: params.error.message });
        }
        const parsed = crmContactPatchSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const tenantId = request.tenantId!;
        const contactId = params.data.id;
        const { employerOrganizationId, ...patch } = parsed.data;
        const row = await updateContact(tenantId, contactId, patch);
        if (!row) return reply.code(404).send({ error: "not_found", message: "Contact not found" });
        if (employerOrganizationId !== undefined) {
          await ensureSystemRelationshipTypesForTenant(tenantId);
          await setContactEmployerOrganization(tenantId, contactId, employerOrganizationId);
        }
        const empId = await getContactEmployerOrganizationId(tenantId, row.id);
        const employer = empId ? await getOrganizationById(tenantId, empId) : null;
        return {
          ...serializeCrmContact(row)!,
          employerOrganizationId: empId,
          employerOrganizationName: employer?.name ?? null,
          employerOrganizationPrimaryAddress: employer
            ? formatCrmPrimaryAddressLine(employer).trim() || null
            : null,
          employerOrganizationCity: employer
            ? formatCrmPrimaryAddressCity(employer).trim() || null
            : null
        };
      });

      scope.delete("/contacts/:id", async (request, reply) => {
        const params = crmIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: "validation_error", message: params.error.message });
        }
        const tenantId = request.tenantId!;
        const existing = await getContactById(tenantId, params.data.id);
        if (!existing) return reply.code(404).send({ error: "not_found", message: "Contact not found" });
        const filesRoot = resolveApiFilesRoot();
        await deleteProfilePhotoFile(filesRoot, existing.photoRelPath);
        const ok = await deleteContact(tenantId, params.data.id);
        if (!ok) return reply.code(404).send({ error: "not_found", message: "Contact not found" });
        return { ok: true };
      });

      scope.get("/contacts/:id/photo", async (request, reply) => {
        const params = crmIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: "validation_error", message: params.error.message });
        }
        const tenantId = request.tenantId!;
        const row = await getContactById(tenantId, params.data.id);
        const rel = row?.photoRelPath?.trim();
        if (!row || !rel) {
          return reply.code(404).send({ error: "not_found", message: "No photo on file." });
        }
        const filesRoot = resolveApiFilesRoot();
        try {
          await stat(absPathFromRel(filesRoot, rel));
        } catch {
          return reply.code(404).send({ error: "not_found", message: "Photo file missing." });
        }
        const name = rel.split("/").pop() ?? "photo.jpg";
        reply.header("Cache-Control", "private, max-age=300");
        try {
          const bytes = await readProfilePhotoBytes(filesRoot, rel, { tenantId });
          return reply.type(mimeForStoredPhotoName(name)).send(bytes);
        } catch {
          return reply.code(500).send({ error: "photo_decrypt_failed", message: "Could not read profile photo." });
        }
      });

      scope.post("/contacts/:id/photo", async (request, reply) => {
        const params = crmIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: "validation_error", message: params.error.message });
        }
        const tenantId = request.tenantId!;
        const contactId = params.data.id;
        const existing = await getContactById(tenantId, contactId);
        if (!existing) return reply.code(404).send({ error: "not_found", message: "Contact not found" });
        const file = await request.file({ limits: { fileSize: 5 * 1024 * 1024 } });
        if (!file) {
          return reply.code(400).send({ error: "no_file", message: "Upload a single image file." });
        }
        const mime = (file.mimetype ?? "").toLowerCase();
        const ext = extForProfilePhotoMime(mime);
        if (!ext) {
          return reply.code(400).send({ error: "invalid_type", message: "Use JPEG, PNG, WebP, or GIF." });
        }
        const storeExt = ext === "jpeg" ? "jpg" : ext;
        const chunks: Buffer[] = [];
        for await (const chunk of file.file) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const buffer = Buffer.concat(chunks);
        if (buffer.length === 0) {
          return reply.code(400).send({ error: "empty_file", message: "Image file was empty." });
        }
        try {
          assertProfilePhotoUpload(buffer, mime);
        } catch (e) {
          const message = e instanceof Error ? e.message : "Invalid image file.";
          return reply.code(400).send({ error: "invalid_type", message });
        }
        const filesRoot = resolveApiFilesRoot();
        const rel = relPathForContactPhoto(tenantId, contactId, storeExt);
        if (existing.photoRelPath && existing.photoRelPath !== rel) {
          await deleteProfilePhotoFile(filesRoot, existing.photoRelPath);
        }
        await writeProfilePhotoFile(filesRoot, rel, buffer, { tenantId });
        const updated = await setContactPhotoRelPath(tenantId, contactId, rel);
        if (!updated) return reply.code(404).send({ error: "not_found", message: "Contact not found" });
        return { ok: true, hasPhoto: true, updatedAt: iso(updated.updatedAt) };
      });

      scope.delete("/contacts/:id/photo", async (request, reply) => {
        const params = crmIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: "validation_error", message: params.error.message });
        }
        const tenantId = request.tenantId!;
        const contactId = params.data.id;
        const existing = await getContactById(tenantId, contactId);
        if (!existing) return reply.code(404).send({ error: "not_found", message: "Contact not found" });
        const filesRoot = resolveApiFilesRoot();
        await deleteProfilePhotoFile(filesRoot, existing.photoRelPath);
        const cleared = await setContactPhotoRelPath(tenantId, contactId, null);
        return { ok: true, hasPhoto: false, updatedAt: iso(cleared?.updatedAt ?? new Date()) };
      });

      scope.get("/relationship-types", async (request, reply) => {
        await ensureSystemRelationshipTypesForTenant(request.tenantId!);
        const rows = await listRelationshipTypes(request.tenantId!);
        return {
          relationshipTypes: rows.map((r) => ({
            id: r.id,
            name: r.name,
            reverseName: r.reverseName,
            sourceEntityKind: r.sourceEntityKind,
            targetEntityKind: r.targetEntityKind,
            isSystem: r.isSystem,
            relationshipUsageCount: r.relationshipUsageCount,
            createdByUserId: r.createdByUserId,
            createdAt: iso(r.createdAt)
          }))
        };
      });

      scope.post("/relationship-types", async (request, reply) => {
        const parsed = crmRelationshipTypeCreateSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const forward = parsed.data.name.trim();
        const reverse = (parsed.data.reverseName ?? parsed.data.name).trim();
        if (isReservedCrmRelationshipTypeName(forward) || isReservedCrmRelationshipTypeName(reverse)) {
          return reply.code(400).send({
            error: "validation_error",
            message: "That name is reserved for a built-in relationship type."
          });
        }
        const userId = request.userId;
        if (!userId) {
          return reply.code(401).send({ error: "unauthorized", message: "Valid access token required" });
        }
        try {
          const row = await insertRelationshipType(request.tenantId!, userId, {
            name: forward,
            reverseName: reverse,
            sourceEntityKind: parsed.data.sourceEntityKind,
            targetEntityKind: parsed.data.targetEntityKind
          });
          return {
            id: row.id,
            name: row.name,
            reverseName: row.reverseName,
            sourceEntityKind: row.sourceEntityKind,
            targetEntityKind: row.targetEntityKind,
            isSystem: row.isSystem,
            relationshipUsageCount: row.relationshipUsageCount,
            createdByUserId: row.createdByUserId,
            createdAt: iso(row.createdAt)
          };
        } catch {
          return reply.code(409).send({
            error: "conflict",
            message: "A relationship type with this name and direction (source → target) already exists."
          });
        }
      });

      scope.delete("/relationship-types/:id", async (request, reply) => {
          const params = crmIdParamsSchema.safeParse(request.params);
          if (!params.success) {
            return reply.code(400).send({ error: "validation_error", message: params.error.message });
          }
          const result = await deleteRelationshipType(request.tenantId!, params.data.id);
          if (!result.ok) {
            if (result.reason === "not_found") {
              return reply.code(404).send({ error: "not_found", message: "Relationship type not found." });
            }
            if (result.reason === "system_type") {
              return reply.code(403).send({
                error: "forbidden",
                message: "Built-in relationship types cannot be deleted."
              });
            }
            if (result.reason === "missing_other_fallback") {
              return reply.code(409).send({
                error: "conflict",
                message:
                  "Could not find the built-in Other type for this direction. Ensure CRM migrations are applied, then retry."
              });
            }
            return reply.code(409).send({
              error: "conflict",
              message: "Could not delete this relationship type."
            });
          }
          return { ok: true };
        }
      );

      scope.get("/relationships", async (request, reply) => {
        const parsed = crmRelationshipsQuerySchema.safeParse(request.query);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const rows = await listRelationshipsForEntity(
          request.tenantId!,
          parsed.data.entityKind,
          parsed.data.entityId
        );
        return {
          relationships: rows.map((r) => ({
            id: r.id,
            relationshipTypeId: r.relationshipTypeId,
            relationshipTypeName: r.relationshipTypeName,
            relationshipTypeReverseName: r.relationshipTypeReverseName,
            sourceId: r.sourceId,
            sourceEntityKind: r.sourceEntityKind,
            targetId: r.targetId,
            targetEntityKind: r.targetEntityKind,
            createdAt: iso(r.createdAt),
            linkedEntityDisplayName: r.linkedEntityDisplayName ?? null
          }))
        };
      });

      scope.post("/relationships", async (request, reply) => {
        const parsed = crmRelationshipCreateSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const row = await insertRelationship(request.tenantId!, parsed.data);
        if (!row) {
          return reply.code(400).send({
            error: "invalid_relationship",
            message:
              "Unknown relationship type, mismatched entity kinds, or missing organization/contact rows."
          });
        }
        return {
          id: row.id,
          relationshipTypeId: row.relationshipTypeId,
          relationshipTypeName: row.relationshipTypeName,
          relationshipTypeReverseName: row.relationshipTypeReverseName,
          sourceId: row.sourceId,
          sourceEntityKind: row.sourceEntityKind,
          targetId: row.targetId,
          targetEntityKind: row.targetEntityKind,
          createdAt: iso(row.createdAt)
        };
      });

      scope.delete("/relationships/:id", async (request, reply) => {
        const params = crmIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: "validation_error", message: params.error.message });
        }
        const ok = await deleteRelationship(request.tenantId!, params.data.id);
        if (!ok) return reply.code(404).send({ error: "not_found", message: "Relationship not found" });
        return { ok: true };
      });

      scope.get("/activities", async (request, reply) => {
        const parsed = crmActivitiesQuerySchema.safeParse(request.query);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const d = parsed.data;
        const rows = await listActivitiesForEntity(request.tenantId!, d.relatedKind, d.relatedId, {
          activityType: d.activityType,
          datePreset: d.datePreset,
          dateField: d.dateField,
          dateFrom: d.dateFrom,
          dateTo: d.dateTo,
          q: d.q
        });
        return {
          activities: rows.map((a) => ({
            id: a.id,
            activityType: a.activityType,
            title: a.title,
            description: a.description,
            relatedEntityId: a.relatedEntityId,
            relatedEntityKind: a.relatedEntityKind,
            scheduledAt: a.scheduledAt ? iso(a.scheduledAt) : null,
            direction: a.direction,
            createdAt: iso(a.createdAt)
          }))
        };
      });

      scope.post("/activities", async (request, reply) => {
        const parsed = crmActivityCreateSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const scheduledAt =
          parsed.data.scheduledAt && parsed.data.scheduledAt.trim().length > 0
            ? new Date(parsed.data.scheduledAt)
            : null;
        const row = await insertActivity(request.tenantId!, {
          activityType: parsed.data.activityType,
          description: parsed.data.description,
          relatedEntityId: parsed.data.relatedEntityId,
          relatedEntityKind: parsed.data.relatedEntityKind,
          scheduledAt,
          direction: parsed.data.direction ?? null
        });
        if (!row) {
          return reply.code(400).send({
            error: "validation_error",
            message: "Related organization or contact not found."
          });
        }
        return {
          id: row.id,
          activityType: row.activityType,
          title: row.title,
          description: row.description,
          relatedEntityId: row.relatedEntityId,
          relatedEntityKind: row.relatedEntityKind,
          scheduledAt: row.scheduledAt ? iso(row.scheduledAt) : null,
          direction: row.direction,
          createdAt: iso(row.createdAt)
        };
      });
    },
    { prefix: "/crm" }
  );
};
