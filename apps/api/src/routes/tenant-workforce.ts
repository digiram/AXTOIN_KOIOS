/**
 * Tenant workforce API — org chart (units + optional assignees) and employees (no app users).
 */

import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { stat } from "node:fs/promises";

import {
  deleteWorkforceEmployee,
  deleteWorkforceEmployeeDocumentById,
  deleteWorkforceOrgUnit,
  ensurePlatformModuleSettingsRow,
  getWorkforceEmployeeById,
  getWorkforceEmployeeDocumentById,
  getWorkforceOrgUnitById,
  insertWorkforceEmployee,
  insertWorkforceEmployeeDocument,
  insertWorkforceOrgUnit,
  listWorkforceEmployeeDocuments,
  listWorkforceEmployeeSocials,
  countWorkforceEmploymentMembersByOrgUnit,
  listWorkforceEmployees,
  listWorkforceEmployeesByIds,
  listWorkforceOrgUnits,
  setWorkforceEmployeePhotoRelPath,
  updateWorkforceEmployee,
  updateWorkforceOrgUnit
} from "@starter/db";
import {
  workforceEmployeeCreateSchema,
  workforceEmployeeDisplayName,
  workforceEmployeeDocumentParamsSchema,
  workforceEmployeeIdParamsSchema,
  workforceEmployeePatchSchema,
  workforceEmployeesListQuerySchema,
  workforceOrgUnitCreateSchema,
  workforceOrgUnitIdParamsSchema,
  workforceOrgUnitPatchSchema
} from "@starter/shared";

import { resolveModuleRole } from "@starter/shared";

import { requireWorkforceModulePermission } from "../plugins/module-permission.js";
import { requireTenantMember } from "../plugins/tenant-member.js";
import { requireTenantRealm } from "../plugins/tenant-realm.js";
import { requireTenantContext } from "../plugins/tenant.js";
import {
  absPathFromRel,
  deleteEmployeeDocumentFile,
  deleteProfilePhotoFile,
  extForProfilePhotoMime,
  mimeForStoredPhotoName,
  normalizeEmployeeDocumentStorageExt,
  readEmployeeDocumentBytes,
  readProfilePhotoBytes,
  relPathForEmployeeDocument,
  relPathForEmployeePhoto,
  resolveApiFilesRoot,
  assertProfilePhotoUpload,
  writeEmployeeDocumentFile,
  writeProfilePhotoFile
} from "../lib/entity-photo-storage.js";

const iso = (d: Date) => d.toISOString();

const MAX_EMPLOYEE_DOCUMENT_BYTES = 25 * 1024 * 1024;

const serializeEmployeeDocument = (row: NonNullable<Awaited<ReturnType<typeof getWorkforceEmployeeDocumentById>>>) => ({
  id: row.id,
  employeeId: row.employeeId,
  title: row.title,
  originalFilename: row.originalFilename,
  mimeType: row.mimeType,
  byteSize: row.byteSize,
  createdAt: iso(row.createdAt)
});

const documentDownloadFilename = (originalFilename: string) => {
  const base = originalFilename.replace(/\\/g, "/").split("/").pop() ?? "document";
  return base.replace(/[^\w.\- ()[\]]+/g, "_").slice(0, 200) || "document";
};

const serializeEmployeeSocial = (row: Awaited<ReturnType<typeof listWorkforceEmployeeSocials>>[number]) => ({
  id: row.id,
  provider: row.provider,
  profileUrl: row.profileUrl,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt)
});

const serializeEmployee = (r: Awaited<ReturnType<typeof getWorkforceEmployeeById>>) => {
  if (!r) return null;
  const displayName = workforceEmployeeDisplayName(r.firstName, r.lastName);
  return {
    id: r.id,
    tenantId: r.tenantId,
    firstName: r.firstName,
    lastName: r.lastName,
    displayName,
    dateOfEmployment: r.dateOfEmployment,
    personalPhone: r.personalPhone,
    personalEmail: r.personalEmail,
    workPhone: r.workPhone,
    workEmail: r.workEmail,
    personalAddress: r.personalAddress,
    workLocation: r.workLocation,
    employmentOrgUnitId: r.employmentOrgUnitId,
    employmentOrgUnitName: null as string | null,
    jobTitle: r.jobTitle,
    employeeKind: r.employeeKind,
    notes: r.notes,
    hasPhoto: Boolean(r.photoRelPath?.trim()),
    workTimeKind: r.workTimeKind,
    workSchedule: r.workSchedule?.length ? r.workSchedule : null,
    socials: [] as ReturnType<typeof serializeEmployeeSocial>[],
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt)
  };
};

const serializeEmployeeWithOrgUnit = async (
  tenantId: string,
  r: NonNullable<Awaited<ReturnType<typeof getWorkforceEmployeeById>>>
) => {
  const base = serializeEmployee(r)!;
  const socials = await listWorkforceEmployeeSocials(tenantId, r.id);
  base.socials = socials.map(serializeEmployeeSocial);
  if (!base.employmentOrgUnitId) return base;
  const ou = await getWorkforceOrgUnitById(tenantId, base.employmentOrgUnitId);
  return { ...base, employmentOrgUnitName: ou?.name.trim() ?? null };
};

const requireHrmModuleEnabled = async (_request: FastifyRequest, reply: FastifyReply) => {
  const row = await ensurePlatformModuleSettingsRow();
  if (!row.hrmEnabled) {
    return reply.code(403).send({
      error: "feature_disabled",
      message: "Workforce is disabled by the platform administrator."
    });
  }
};

export const registerTenantWorkforceRoutes = async (app: FastifyInstance) => {
  await app.register(
    async (scope) => {
      scope.addHook("preHandler", requireTenantContext);
      scope.addHook("preHandler", requireTenantRealm);
      scope.addHook("preHandler", requireTenantMember);
      scope.get("/availability", async (request) => {
        const row = await ensurePlatformModuleSettingsRow();
        const workforceRole = resolveModuleRole(
          "workforce",
          request.role ?? "tenant_user",
          request.moduleRoles ?? {}
        );
        return {
          hrmEnabled: row.hrmEnabled,
          workforceRole: row.hrmEnabled ? workforceRole : null
        };
      });
    },
    { prefix: "/workforce" }
  );

  await app.register(
    async (scope) => {
      scope.addHook("preHandler", requireTenantContext);
      scope.addHook("preHandler", requireTenantRealm);
      scope.addHook("preHandler", requireTenantMember);
      scope.addHook("preHandler", requireHrmModuleEnabled);
      scope.addHook("preHandler", requireWorkforceModulePermission);

      const serializeOrgUnit = async (tenantId: string, row: Awaited<ReturnType<typeof listWorkforceOrgUnits>>[0]) => {
        let assignee: ReturnType<typeof serializeEmployee> = null;
        if (row.assignedEmployeeId) {
          const emp = await getWorkforceEmployeeById(tenantId, row.assignedEmployeeId);
          assignee = serializeEmployee(emp ?? undefined);
        }
        return {
          id: row.id,
          tenantId: row.tenantId,
          name: row.name,
          parentOrgUnitId: row.parentOrgUnitId,
          assignedEmployeeId: row.assignedEmployeeId,
          assignee: assignee,
          onOrgChart: row.onOrgChart,
          createdAt: iso(row.createdAt),
          updatedAt: iso(row.updatedAt)
        };
      };

      scope.get("/org-units", async (request) => {
        const tenantId = request.tenantId!;
        const rows = await listWorkforceOrgUnits(tenantId);
        const assigneeIds = rows.map((r) => r.assignedEmployeeId).filter((x): x is string => Boolean(x));
        const [empMap, employmentCounts] = await Promise.all([
          listWorkforceEmployeesByIds(tenantId, assigneeIds),
          countWorkforceEmploymentMembersByOrgUnit(tenantId)
        ]);
        return {
          orgUnits: rows.map((r) => {
            const emp = r.assignedEmployeeId ? empMap.get(r.assignedEmployeeId) : undefined;
            return {
              id: r.id,
              tenantId: r.tenantId,
              name: r.name,
              parentOrgUnitId: r.parentOrgUnitId,
              assignedEmployeeId: r.assignedEmployeeId,
              assignee: emp ? serializeEmployee(emp) : null,
              employmentMemberCount: employmentCounts.get(r.id) ?? 0,
              onOrgChart: r.onOrgChart,
              createdAt: iso(r.createdAt),
              updatedAt: iso(r.updatedAt)
            };
          })
        };
      });

      scope.post("/org-units", async (request, reply) => {
        const parsed = workforceOrgUnitCreateSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const tenantId = request.tenantId!;
        const out = await insertWorkforceOrgUnit(tenantId, parsed.data);
        if ("error" in out) {
          if (out.error === "invalid_employee") {
            return reply.code(400).send({ error: "invalid_employee", message: "Assignee not found in this tenant." });
          }
          return reply.code(400).send({ error: "invalid_parent", message: "Parent org unit not found in this tenant." });
        }
        return { orgUnit: await serializeOrgUnit(tenantId, out) };
      });

      scope.patch("/org-units/:id", async (request, reply) => {
        const paramsParsed = workforceOrgUnitIdParamsSchema.safeParse(request.params);
        if (!paramsParsed.success) {
          return reply.code(400).send({ error: "validation_error", message: paramsParsed.error.message });
        }
        const bodyParsed = workforceOrgUnitPatchSchema.safeParse(request.body);
        if (!bodyParsed.success) {
          return reply.code(400).send({ error: "validation_error", message: bodyParsed.error.message });
        }
        const tenantId = request.tenantId!;
        const out = await updateWorkforceOrgUnit(tenantId, paramsParsed.data.id, bodyParsed.data);
        if ("error" in out) {
          if (out.error === "not_found") {
            return reply.code(404).send({ error: "not_found", message: "Org unit not found." });
          }
          if (out.error === "cycle") {
            return reply.code(400).send({ error: "cycle", message: "That parent would create a cycle in the org tree." });
          }
          if (out.error === "invalid_employee") {
            return reply.code(400).send({ error: "invalid_employee", message: "Assignee not found in this tenant." });
          }
          return reply.code(400).send({ error: "invalid_parent", message: "Parent org unit not found in this tenant." });
        }
        return { orgUnit: await serializeOrgUnit(tenantId, out) };
      });

      scope.delete("/org-units/:id", async (request, reply) => {
        const parsed = workforceOrgUnitIdParamsSchema.safeParse(request.params);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const tenantId = request.tenantId!;
        const out = await deleteWorkforceOrgUnit(tenantId, parsed.data.id);
        if (!out.ok) {
          if (out.error === "not_found") {
            return reply.code(404).send({ error: "not_found", message: "Org unit not found." });
          }
          return reply.code(409).send({
            error: "has_children",
            message: "Remove or reassign child org units before deleting this one."
          });
        }
        return { ok: true };
      });

      scope.get("/employees", async (request, reply) => {
        const parsed = workforceEmployeesListQuerySchema.safeParse(request.query);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const tenantId = request.tenantId!;
        const q = parsed.data;
        const { rows, total } = await listWorkforceEmployees({
          tenantId,
          page: q.page,
          pageSize: q.pageSize,
          q: q.q
        });
        const orgUnitNameById = new Map(
          (await listWorkforceOrgUnits(tenantId)).map((ou) => [ou.id, ou.name.trim()] as const)
        );
        return {
          employees: rows.map((r) => {
            const base = serializeEmployee(r)!;
            const employmentOrgUnitName = base.employmentOrgUnitId
              ? orgUnitNameById.get(base.employmentOrgUnitId) ?? null
              : null;
            return { ...base, employmentOrgUnitName };
          }),
          total,
          page: q.page,
          pageSize: q.pageSize
        };
      });

      scope.get("/employees/:id", async (request, reply) => {
        const parsed = workforceEmployeeIdParamsSchema.safeParse(request.params);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const tenantId = request.tenantId!;
        const row = await getWorkforceEmployeeById(tenantId, parsed.data.id);
        if (!row) {
          return reply.code(404).send({ error: "not_found", message: "Employee not found." });
        }
        return serializeEmployeeWithOrgUnit(tenantId, row);
      });

      scope.post("/employees", async (request, reply) => {
        const parsed = workforceEmployeeCreateSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const tenantId = request.tenantId!;
        const out = await insertWorkforceEmployee(tenantId, parsed.data);
        if ("error" in out) {
          if (out.error === "invalid_org_unit") {
            return reply.code(400).send({
              error: "invalid_org_unit",
              message: "Organizational unit not found in this tenant."
            });
          }
          return reply.code(400).send({ error: "validation_error", message: "Could not create employee." });
        }
        return { employee: await serializeEmployeeWithOrgUnit(tenantId, out) };
      });

      scope.patch("/employees/:id", async (request, reply) => {
        const paramsParsed = workforceEmployeeIdParamsSchema.safeParse(request.params);
        if (!paramsParsed.success) {
          return reply.code(400).send({ error: "validation_error", message: paramsParsed.error.message });
        }
        const bodyParsed = workforceEmployeePatchSchema.safeParse(request.body);
        if (!bodyParsed.success) {
          return reply.code(400).send({ error: "validation_error", message: bodyParsed.error.message });
        }
        const tenantId = request.tenantId!;
        const out = await updateWorkforceEmployee(tenantId, paramsParsed.data.id, bodyParsed.data);
        if ("error" in out) {
          if (out.error === "invalid_org_unit") {
            return reply.code(400).send({
              error: "invalid_org_unit",
              message: "Organizational unit not found in this tenant."
            });
          }
          return reply.code(404).send({ error: "not_found", message: "Employee not found." });
        }
        return { employee: await serializeEmployeeWithOrgUnit(tenantId, out) };
      });

      scope.delete("/employees/:id", async (request, reply) => {
        const parsed = workforceEmployeeIdParamsSchema.safeParse(request.params);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const tenantId = request.tenantId!;
        const existing = await getWorkforceEmployeeById(tenantId, parsed.data.id);
        if (!existing) return reply.code(404).send({ error: "not_found", message: "Employee not found." });
        const filesRoot = resolveApiFilesRoot();
        const docs = await listWorkforceEmployeeDocuments(tenantId, parsed.data.id);
        for (const doc of docs) {
          await deleteEmployeeDocumentFile(filesRoot, doc.storageRelPath);
        }
        await deleteProfilePhotoFile(filesRoot, existing.photoRelPath);
        const out = await deleteWorkforceEmployee(tenantId, parsed.data.id);
        if (!out.ok) {
          return reply.code(404).send({ error: "not_found", message: "Employee not found." });
        }
        return { ok: true };
      });

      scope.get("/employees/:id/documents", async (request, reply) => {
        const parsed = workforceEmployeeIdParamsSchema.safeParse(request.params);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const tenantId = request.tenantId!;
        const employeeId = parsed.data.id;
        const emp = await getWorkforceEmployeeById(tenantId, employeeId);
        if (!emp) return reply.code(404).send({ error: "not_found", message: "Employee not found." });
        const rows = await listWorkforceEmployeeDocuments(tenantId, employeeId);
        return { documents: rows.map(serializeEmployeeDocument) };
      });

      scope.post("/employees/:id/documents", async (request, reply) => {
        const parsed = workforceEmployeeIdParamsSchema.safeParse(request.params);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const tenantId = request.tenantId!;
        const employeeId = parsed.data.id;
        const emp = await getWorkforceEmployeeById(tenantId, employeeId);
        if (!emp) return reply.code(404).send({ error: "not_found", message: "Employee not found." });

        const file = await request.file({ limits: { fileSize: MAX_EMPLOYEE_DOCUMENT_BYTES } });
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
        if (buffer.length > MAX_EMPLOYEE_DOCUMENT_BYTES) {
          return reply.code(400).send({ error: "file_too_large", message: "Maximum file size is 25 MB." });
        }

        const documentId = randomUUID();
        const storageExt = normalizeEmployeeDocumentStorageExt(originalFilename);
        const rel = relPathForEmployeeDocument(tenantId, employeeId, documentId, storageExt);
        const filesRoot = resolveApiFilesRoot();
        await writeEmployeeDocumentFile(filesRoot, rel, buffer, { tenantId });

        const mime = (file.mimetype ?? "").trim() || null;
        const row = await insertWorkforceEmployeeDocument({
          tenantId,
          employeeId,
          title,
          originalFilename,
          mimeType: mime,
          storageRelPath: rel,
          byteSize: buffer.length
        });
        if (!row) {
          await deleteEmployeeDocumentFile(filesRoot, rel);
          return reply.code(500).send({ error: "persist_failed", message: "Could not save document metadata." });
        }
        return reply.code(201).send({ document: serializeEmployeeDocument(row) });
      });

      scope.get("/employees/:id/documents/:docId", async (request, reply) => {
        const parsed = workforceEmployeeDocumentParamsSchema.safeParse(request.params);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const tenantId = request.tenantId!;
        const { id: employeeId, docId } = parsed.data;
        const row = await getWorkforceEmployeeDocumentById(tenantId, employeeId, docId);
        if (!row) return reply.code(404).send({ error: "not_found", message: "Document not found." });
        const filesRoot = resolveApiFilesRoot();
        try {
          const bytes = await readEmployeeDocumentBytes(filesRoot, row.storageRelPath, { tenantId });
          const name = documentDownloadFilename(row.originalFilename);
          reply.header("Cache-Control", "private, no-store");
          reply.header("Content-Disposition", `attachment; filename="${name.replace(/"/g, "")}"`);
          return reply.type(row.mimeType?.trim() || "application/octet-stream").send(bytes);
        } catch {
          return reply.code(500).send({ error: "document_decrypt_failed", message: "Could not read document." });
        }
      });

      scope.delete("/employees/:id/documents/:docId", async (request, reply) => {
        const parsed = workforceEmployeeDocumentParamsSchema.safeParse(request.params);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const tenantId = request.tenantId!;
        const { id: employeeId, docId } = parsed.data;
        const row = await getWorkforceEmployeeDocumentById(tenantId, employeeId, docId);
        if (!row) return reply.code(404).send({ error: "not_found", message: "Document not found." });
        const filesRoot = resolveApiFilesRoot();
        await deleteEmployeeDocumentFile(filesRoot, row.storageRelPath);
        const ok = await deleteWorkforceEmployeeDocumentById(tenantId, employeeId, docId);
        if (!ok) return reply.code(404).send({ error: "not_found", message: "Document not found." });
        return { ok: true };
      });

      scope.get("/employees/:id/photo", async (request, reply) => {
        const parsed = workforceEmployeeIdParamsSchema.safeParse(request.params);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const tenantId = request.tenantId!;
        const row = await getWorkforceEmployeeById(tenantId, parsed.data.id);
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

      scope.post("/employees/:id/photo", async (request, reply) => {
        const parsed = workforceEmployeeIdParamsSchema.safeParse(request.params);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const tenantId = request.tenantId!;
        const employeeId = parsed.data.id;
        const existing = await getWorkforceEmployeeById(tenantId, employeeId);
        if (!existing) return reply.code(404).send({ error: "not_found", message: "Employee not found." });
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
        const rel = relPathForEmployeePhoto(tenantId, employeeId, storeExt);
        if (existing.photoRelPath && existing.photoRelPath !== rel) {
          await deleteProfilePhotoFile(filesRoot, existing.photoRelPath);
        }
        await writeProfilePhotoFile(filesRoot, rel, buffer, { tenantId });
        const updated = await setWorkforceEmployeePhotoRelPath(tenantId, employeeId, rel);
        if (!updated) return reply.code(404).send({ error: "not_found", message: "Employee not found." });
        return { ok: true, hasPhoto: true, updatedAt: iso(updated.updatedAt) };
      });

      scope.delete("/employees/:id/photo", async (request, reply) => {
        const parsed = workforceEmployeeIdParamsSchema.safeParse(request.params);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const tenantId = request.tenantId!;
        const employeeId = parsed.data.id;
        const existing = await getWorkforceEmployeeById(tenantId, employeeId);
        if (!existing) return reply.code(404).send({ error: "not_found", message: "Employee not found." });
        const filesRoot = resolveApiFilesRoot();
        await deleteProfilePhotoFile(filesRoot, existing.photoRelPath);
        const cleared = await setWorkforceEmployeePhotoRelPath(tenantId, employeeId, null);
        return { ok: true, hasPhoto: false, updatedAt: iso(cleared?.updatedAt ?? new Date()) };
      });
    },
    { prefix: "/workforce" }
  );
};
