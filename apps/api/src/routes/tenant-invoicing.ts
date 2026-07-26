/**
 * Tenant Invoicing & quoting API — quotes, offers, invoices (not realm PSP billing).
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import {
  archiveQuote,
  archiveInvoice,
  buildInvoicingDocumentAuditTrail,
  deleteQuote,
  acceptOffer,
  rejectOffer,
  demoteOfferToQuote,
  demoteInvoiceToQuote,
  disputeInvoice,
  acknowledgeInvoiceDispute,
  applyDisputeAcknowledgmentDiscount,
  applyDisputeAcknowledgmentFullCredit,
  denyInvoiceDispute,
  markInvoiceAccredited,
  finalizeInvoiceDisputeAcknowledgment,
  getInvoiceDisputeAcknowledgmentFollowUpApplied,
  getInvoiceDisputeResolution,
  getInvoiceCustomerDisputeNote,
  ensureInvoicingTenantConfiguration,
  ensurePlatformModuleSettingsRow,
  sendInvoice,
  getInvoicingConfiguration,
  findInvoiceBySourceOfferId,
  findInvoiceBySourceQuoteId,
  findOfferBySourceQuoteId,
  getInvoiceById,
  getOfferById,
  getQuoteById,
  insertCatalogItem,
  insertQuote,
  listInvoicingCatalogItems,
  listInvoicingDocuments,
  listInvoiceLineItems,
  listInvoicePayments,
  listTenantInvoicePayments,
  listOfferLineItems,
  listQuoteLineItems,
  promoteOfferToInvoice,
  promoteQuoteToInvoice,
  promoteQuoteToOffer,
  purgeInvoicingDocumentsForTenant,
  registerInvoicePayment,
  resolveInvoicingAuditActorLabels,
  sendOffer,
  setInvoicingCompanyLogoRelPath,
  updateInvoicingConfiguration,
  updateQuote
} from "@starter/db";
import {
  invoicingCatalogItemCreateSchema,
  invoicingCatalogListQuerySchema,
  invoicingConfigurationPutSchema,
  defaultInvoicingTermsTextForKind,
  invoicingDemoteToQuoteBodySchema,
  invoicingDisputeInvoiceBodySchema,
  invoicingAcknowledgeInvoiceDisputeBodySchema,
  invoicingDenyInvoiceDisputeBodySchema,
  invoicingDisputeAcknowledgmentDiscountBodySchema,
  invoicingDisputeAcknowledgmentFullCreditBodySchema,
  invoicingAcceptOfferBodySchema,
  invoicingRejectOfferBodySchema,
  invoicingRegisterInvoicePaymentBodySchema,
  invoicingPaymentsListQuerySchema,
  invoicingDocumentsListQuerySchema,
  invoicingInvoiceIdParamsSchema,
  invoicingOfferIdParamsSchema,
  invoicingPromoteToInvoiceBodySchema,
  invoicingSendOfferBodySchema,
  invoicingSendDocumentEmailBodySchema,
  invoicingSendInvoiceBodySchema,
  invoicingPromoteToOfferBodySchema,
  invoicingQuoteCreateSchema,
  invoicingQuoteIdParamsSchema,
  invoicingQuotePatchSchema,
  formatInvoicingOfferDisplayNumber,
  formatInvoicingInvoiceDisplayNumber,
  invoicingAuditEventKindLabel,
  isTenantAdminRole,
  resolveInvoicingIssuerSnapshot,
  resolveInvoicingPaymentTermDays,
  resolveModuleRole,
  isQuoteSoftExpired,
  resolveInvoicingEmailMomentsEnabled,
  serializeInvoicingEmailMomentsForApi,
  type InvoicingDocumentKind,
  type InvoicingIssuerSnapshot
} from "@starter/shared";

import {
  assertProfilePhotoUpload,
  deleteProfilePhotoFile,
  extForProfilePhotoMime,
  mimeForStoredPhotoName,
  readProfilePhotoBytes,
  relPathForInvoicingCompanyLogo,
  resolveApiFilesRoot,
  writeProfilePhotoFile
} from "../lib/entity-photo-storage.js";
import {
  sendInvoicingInvoiceEmail,
  sendInvoicingOfferEmail,
  sendInvoicingQuoteEmail,
  finalizeAndEmailInvoicingInvoice
} from "../lib/send-invoicing-document-email.js";
import { sendInvoicingOfferDecisionEmail } from "../lib/send-invoicing-offer-decision-email.js";
import { sendInvoicingInvoiceDisputeEmail } from "../lib/send-invoicing-invoice-dispute-email.js";
import { sendInvoicingInvoiceDisputeAcknowledgedEmail } from "../lib/send-invoicing-invoice-dispute-acknowledged-email.js";
import { sendInvoicingInvoiceDisputeDeniedEmail } from "../lib/send-invoicing-invoice-dispute-denied-email.js";
import { sendInvoicingInvoiceDisputeFullCreditEmail } from "../lib/send-invoicing-invoice-dispute-full-credit-email.js";
import { sendInvoicingInvoicePaymentReceivedEmail } from "../lib/send-invoicing-invoice-payment-received-email.js";
import { requireInvoicingModulePermission } from "../plugins/module-permission.js";
import { requireTenantMember } from "../plugins/tenant-member.js";
import { requireTenantRealm } from "../plugins/tenant-realm.js";
import { requireTenantContext } from "../plugins/tenant.js";

const iso = (d: Date) => d.toISOString();

const serializeInvoicingConfiguration = (
  row: Awaited<ReturnType<typeof getInvoicingConfiguration>> & object,
  extra?: Record<string, unknown>
) => {
  const { companyLogoRelPath, updatedAt, emailMomentsEnabled, paymentRemindersEnabled, ...rest } = row as NonNullable<
    Awaited<ReturnType<typeof getInvoicingConfiguration>>
  >;
  const resolvedEmailMoments = resolveInvoicingEmailMomentsEnabled({
    emailMomentsEnabled,
    paymentRemindersEnabled
  });
  return {
    ...rest,
    paymentRemindersEnabled: resolvedEmailMoments.payment_reminder,
    emailMoments: serializeInvoicingEmailMomentsForApi(resolvedEmailMoments),
    hasCompanyLogo: Boolean(companyLogoRelPath?.trim()),
    updatedAt: iso(updatedAt),
    ...extra
  };
};

const serializeInvoicingAuditTrail = async (
  tenantId: string,
  documentKind: InvoicingDocumentKind,
  documentId: string
) => {
  const sections = await buildInvoicingDocumentAuditTrail(tenantId, documentKind, documentId);
  if (!sections) return null;
  const allEvents = sections.flatMap((section) => section.events);
  const actorLabels = await resolveInvoicingAuditActorLabels(allEvents);
  return {
    sections: sections.map((section) => ({
      key: section.key,
      title: section.title,
      subtitle: section.subtitle,
      documentKind: section.documentKind,
      documentId: section.documentId,
      pathSegment: section.pathSegment,
      isCurrent: section.isCurrent,
      events: section.events.map((event) => ({
        id: event.id,
        eventKind: event.eventKind,
        eventLabel: invoicingAuditEventKindLabel(event.eventKind),
        documentKind: event.documentKind,
        documentId: event.documentId,
        actorUserId: event.actorUserId,
        actorLabel: event.actorUserId ? (actorLabels.get(event.actorUserId) ?? null) : null,
        payload: event.payload,
        createdAt: iso(event.createdAt)
      }))
    }))
  };
};

const invoicingDocumentDevPurgeEnabled = () => process.env.NODE_ENV === "development";

const requireInvoicingModuleEnabled = async (_request: FastifyRequest, reply: FastifyReply) => {
  const row = await ensurePlatformModuleSettingsRow();
  if (!row.invoicingEnabled) {
    return reply.code(403).send({
      error: "feature_disabled",
      message: "Invoicing & quoting is disabled by the platform administrator."
    });
  }
};

const resolveDocumentIssuerSnapshot = async (
  tenantId: string,
  stored: InvoicingIssuerSnapshot
): Promise<InvoicingIssuerSnapshot> => {
  const cfg = await getInvoicingConfiguration(tenantId);
  return resolveInvoicingIssuerSnapshot(stored, cfg?.issuerSnapshot);
};

const resolveDocumentTermsText = async (
  tenantId: string,
  kind: InvoicingDocumentKind
): Promise<string> => {
  const cfg = await ensureInvoicingTenantConfiguration(tenantId);
  return defaultInvoicingTermsTextForKind(kind, cfg);
};

const serializeQuote = async (tenantId: string, quoteId: string) => {
  const quote = await getQuoteById(tenantId, quoteId);
  if (!quote) return null;
  const lineItems = await listQuoteLineItems(tenantId, quoteId);
  const cfg = await getInvoicingConfiguration(tenantId);
  let sourceOfferDisplayNumber: string | null = null;
  if (quote.sourceOfferId) {
    const sourceOffer = await getOfferById(tenantId, quote.sourceOfferId);
    if (sourceOffer) {
      sourceOfferDisplayNumber = formatInvoicingOfferDisplayNumber(
        sourceOffer.documentNumber,
        sourceOffer.revision
      );
    }
  }
  let promotedOfferId: string | null = null;
  let promotedOfferDisplayNumber: string | null = null;
  if (quote.status === "quote_converted_to_offer") {
    const promotedOffer = await findOfferBySourceQuoteId(tenantId, quoteId);
    if (promotedOffer) {
      promotedOfferId = promotedOffer.id;
      promotedOfferDisplayNumber = formatInvoicingOfferDisplayNumber(
        promotedOffer.documentNumber,
        promotedOffer.revision
      );
    }
  }
  let promotedInvoiceId: string | null = null;
  let promotedInvoiceDisplayNumber: string | null = null;
  if (quote.status === "quote_converted_to_invoice") {
    const promotedInvoice = await findInvoiceBySourceQuoteId(tenantId, quoteId);
    if (promotedInvoice) {
      promotedInvoiceId = promotedInvoice.id;
      promotedInvoiceDisplayNumber = formatInvoicingInvoiceDisplayNumber(
        promotedInvoice.documentNumber,
        promotedInvoice.revision
      );
    }
  }
  return {
    ...quote,
    issuerSnapshot: await resolveDocumentIssuerSnapshot(tenantId, quote.issuerSnapshot),
    documentDate: quote.documentDate,
    quoteExpiryDate: quote.quoteExpiryDate,
    isQuoteExpired:
      (cfg?.quoteExpiryWarningsEnabled ?? true) && isQuoteSoftExpired(quote.quoteExpiryDate),
    paymentTermDays: resolveInvoicingPaymentTermDays(quote.paymentTermDays, cfg?.defaultPaymentTermDays),
    termsText: await resolveDocumentTermsText(tenantId, "quote"),
    sourceOfferDisplayNumber,
    promotedOfferId,
    promotedOfferDisplayNumber,
    promotedInvoiceId,
    promotedInvoiceDisplayNumber,
    archivedAt: quote.archivedAt ? iso(quote.archivedAt) : null,
    createdAt: iso(quote.createdAt),
    updatedAt: iso(quote.updatedAt),
    lineItems
  };
};

const serializeOffer = async (tenantId: string, offerId: string) => {
  const offer = await getOfferById(tenantId, offerId);
  if (!offer) return null;
  const lineItems = await listOfferLineItems(tenantId, offerId);
  let sourceQuoteNumber: string | null = null;
  if (offer.sourceQuoteId) {
    const sourceQuote = await getQuoteById(tenantId, offer.sourceQuoteId);
    if (sourceQuote) {
      sourceQuoteNumber =
        sourceQuote.documentNumber ?? sourceQuote.temporaryReference ?? sourceQuote.id.slice(0, 8);
    }
  }
  let promotedInvoiceId: string | null = null;
  let promotedInvoiceDisplayNumber: string | null = null;
  if (offer.status === "offer_converted_to_invoice") {
    const promotedInvoice = await findInvoiceBySourceOfferId(tenantId, offerId);
    if (promotedInvoice) {
      promotedInvoiceId = promotedInvoice.id;
      promotedInvoiceDisplayNumber = formatInvoicingInvoiceDisplayNumber(
        promotedInvoice.documentNumber,
        promotedInvoice.revision
      );
    }
  }
  return {
    ...offer,
    issuerSnapshot: await resolveDocumentIssuerSnapshot(tenantId, offer.issuerSnapshot),
    termsText: await resolveDocumentTermsText(tenantId, "offer"),
    displayDocumentNumber: formatInvoicingOfferDisplayNumber(offer.documentNumber, offer.revision),
    sourceQuoteNumber,
    promotedInvoiceId,
    promotedInvoiceDisplayNumber,
    archivedAt: offer.archivedAt ? iso(offer.archivedAt) : null,
    createdAt: iso(offer.createdAt),
    updatedAt: iso(offer.updatedAt),
    lineItems
  };
};

const serializeInvoice = async (tenantId: string, invoiceId: string) => {
  const invoice = await getInvoiceById(tenantId, invoiceId);
  if (!invoice) return null;
  const lineItems = await listInvoiceLineItems(tenantId, invoiceId);
  const payments = await listInvoicePayments(tenantId, invoiceId);
  const cfg = await getInvoicingConfiguration(tenantId);
  let sourceOfferDisplayNumber: string | null = null;
  let sourceQuotePaymentTermDays: number | null = null;
  if (invoice.sourceOfferId) {
    const sourceOffer = await getOfferById(tenantId, invoice.sourceOfferId);
    if (sourceOffer) {
      sourceOfferDisplayNumber = formatInvoicingOfferDisplayNumber(
        sourceOffer.documentNumber,
        sourceOffer.revision
      );
    }
  }
  if (invoice.sourceQuoteId) {
    const sourceQuote = await getQuoteById(tenantId, invoice.sourceQuoteId);
    if (sourceQuote) {
      sourceQuotePaymentTermDays = sourceQuote.paymentTermDays;
    }
  }
  const disputeResolution = await getInvoiceDisputeResolution(tenantId, invoiceId);
  const customerDisputeNote = (await getInvoiceCustomerDisputeNote(tenantId, invoiceId)) ?? null;
  const disputeAcknowledgmentFollowUpApplied = await getInvoiceDisputeAcknowledgmentFollowUpApplied(
    tenantId,
    invoiceId
  );
  return {
    ...invoice,
    disputeResolution,
    customerDisputeNote,
    disputeAcknowledgmentFollowUpApplied,
    issuerSnapshot: await resolveDocumentIssuerSnapshot(tenantId, invoice.issuerSnapshot),
    paymentTermDays:
      invoice.paymentTermDays != null
        ? resolveInvoicingPaymentTermDays(invoice.paymentTermDays, cfg?.defaultPaymentTermDays)
        : null,
    dueDate: invoice.dueDate,
    partialPaymentAnchorDate: invoice.partialPaymentAnchorDate,
    termsText: await resolveDocumentTermsText(tenantId, "invoice"),
    displayDocumentNumber: formatInvoicingInvoiceDisplayNumber(invoice.documentNumber, invoice.revision),
    sourceOfferDisplayNumber,
    sourceQuotePaymentTermDays,
    finalizedAt: invoice.finalizedAt ? iso(invoice.finalizedAt) : null,
    archivedAt: invoice.archivedAt ? iso(invoice.archivedAt) : null,
    createdAt: iso(invoice.createdAt),
    updatedAt: iso(invoice.updatedAt),
    lineItems,
    payments: payments.map((payment) => ({
      id: payment.id,
      invoiceId: payment.invoiceId,
      amountMinor: payment.amountMinor,
      paymentDate: payment.paymentDate,
      reference: payment.reference,
      note: payment.note,
      revisedInvoiceId: payment.revisedInvoiceId,
      createdAt: iso(payment.createdAt)
    }))
  };
};

export const registerTenantInvoicingRoutes = async (app: FastifyInstance) => {
  await app.register(
    async (scope) => {
      scope.addHook("preHandler", requireTenantContext);
      scope.addHook("preHandler", requireTenantRealm);
      scope.addHook("preHandler", requireTenantMember);
      scope.get("/availability", async (request) => {
        const row = await ensurePlatformModuleSettingsRow();
        const moduleRole = resolveModuleRole("invoicing", request.role ?? "tenant_user", request.moduleRoles ?? {});
        return {
          invoicingEnabled: row.invoicingEnabled,
          invoicingRole: row.invoicingEnabled ? moduleRole : null
        };
      });
    },
    { prefix: "/invoicing" }
  );

  await app.register(
    async (scope) => {
      scope.addHook("preHandler", requireTenantContext);
      scope.addHook("preHandler", requireTenantRealm);
      scope.addHook("preHandler", requireTenantMember);
      scope.addHook("preHandler", requireInvoicingModuleEnabled);
      scope.addHook("preHandler", requireInvoicingModulePermission);

      scope.get("/documents", async (request, reply) => {
        const parsed = invoicingDocumentsListQuerySchema.safeParse(request.query);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const { items, total } = await listInvoicingDocuments(request.tenantId!, parsed.data);
        return {
          documents: items.map((d) => ({
            kind: d.kind,
            id: d.id,
            status: d.status,
            documentNumber: d.documentNumber,
            temporaryReference: d.temporaryReference,
            customerName: d.customerName,
            contactName: d.contactName,
            currencyCode: d.currencyCode,
            documentDate: d.documentDate,
            totalIncludingTaxMinor: d.totalIncludingTaxMinor,
            updatedAt: iso(d.updatedAt)
          })),
          total,
          limit: parsed.data.limit ?? 50,
          offset: parsed.data.offset ?? 0
        };
      });

      scope.get("/payments", async (request, reply) => {
        const parsed = invoicingPaymentsListQuerySchema.safeParse(request.query);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const { items, total } = await listTenantInvoicePayments(request.tenantId!, parsed.data);
        return {
          payments: items.map((payment) => ({
            id: payment.id,
            invoiceId: payment.invoiceId,
            amountMinor: payment.amountMinor,
            paymentDate: payment.paymentDate,
            reference: payment.reference,
            note: payment.note,
            revisedInvoiceId: payment.revisedInvoiceId,
            createdAt: iso(payment.createdAt),
            invoiceDocumentNumber: payment.invoiceDocumentNumber,
            invoiceDisplayDocumentNumber: payment.invoiceDisplayDocumentNumber,
            invoiceCustomerName: payment.invoiceCustomerName,
            invoiceCurrencyCode: payment.invoiceCurrencyCode,
            invoiceStatus: payment.invoiceStatus
          })),
          total,
          limit: parsed.data.limit ?? 50,
          offset: parsed.data.offset ?? 0
        };
      });

      scope.get("/configuration", async (request) => {
        const tenantId = request.tenantId!;
        const row = await ensureInvoicingTenantConfiguration(tenantId);
        return serializeInvoicingConfiguration(row, {
          devPurgeInvoicingDocumentsEnabled: invoicingDocumentDevPurgeEnabled()
        });
      });

      scope.put("/configuration", async (request, reply) => {
        if (!isTenantAdminRole(request.role ?? "")) {
          return reply.code(403).send({
            error: "forbidden",
            message: "Only tenant administrators can update invoicing configuration."
          });
        }
        const parsed = invoicingConfigurationPutSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const row = await updateInvoicingConfiguration(request.tenantId!, parsed.data);
        return serializeInvoicingConfiguration(row);
      });

      scope.get("/configuration/logo", async (request, reply) => {
        const tenantId = request.tenantId!;
        const cfg = await getInvoicingConfiguration(tenantId);
        const rel = cfg?.companyLogoRelPath?.trim();
        if (!rel) {
          return reply.code(404).send({ error: "not_found", message: "No company logo on file." });
        }
        const filesRoot = resolveApiFilesRoot();
        try {
          const bytes = await readProfilePhotoBytes(filesRoot, rel, { tenantId });
          const name = rel.split("/").pop() ?? "logo.png";
          reply.header("Cache-Control", "private, max-age=300");
          return reply.type(mimeForStoredPhotoName(name)).send(bytes);
        } catch {
          return reply.code(500).send({ error: "logo_read_failed", message: "Could not read company logo." });
        }
      });

      scope.post("/configuration/logo", async (request, reply) => {
        if (!isTenantAdminRole(request.role ?? "")) {
          return reply.code(403).send({
            error: "forbidden",
            message: "Only tenant administrators can update invoicing configuration."
          });
        }
        const tenantId = request.tenantId!;
        const cfg = await ensureInvoicingTenantConfiguration(tenantId);
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
        const rel = relPathForInvoicingCompanyLogo(tenantId, storeExt);
        if (cfg.companyLogoRelPath && cfg.companyLogoRelPath !== rel) {
          await deleteProfilePhotoFile(filesRoot, cfg.companyLogoRelPath);
        }
        await writeProfilePhotoFile(filesRoot, rel, buffer, { tenantId });
        const updated = await setInvoicingCompanyLogoRelPath(tenantId, rel);
        return serializeInvoicingConfiguration(updated);
      });

      scope.delete("/configuration/logo", async (request, reply) => {
        if (!isTenantAdminRole(request.role ?? "")) {
          return reply.code(403).send({
            error: "forbidden",
            message: "Only tenant administrators can update invoicing configuration."
          });
        }
        const tenantId = request.tenantId!;
        const cfg = await getInvoicingConfiguration(tenantId);
        const filesRoot = resolveApiFilesRoot();
        await deleteProfilePhotoFile(filesRoot, cfg?.companyLogoRelPath);
        const updated = await setInvoicingCompanyLogoRelPath(tenantId, null);
        return serializeInvoicingConfiguration(updated);
      });

      scope.get("/catalog/items", async (request, reply) => {
        const parsed = invoicingCatalogListQuerySchema.safeParse(request.query);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const { rows, total } = await listInvoicingCatalogItems(request.tenantId!, parsed.data);
        return {
          items: rows.map((r) => ({
            id: r.id,
            itemKind: r.itemKind,
            sku: r.sku,
            name: r.name,
            description: r.description,
            unitLabel: r.unitLabel,
            unitPriceMinor: r.unitPriceMinor,
            currencyCode: r.currencyCode,
            taxRateBps: r.taxRateBps,
            isActive: r.isActive,
            createdAt: iso(r.createdAt),
            updatedAt: iso(r.updatedAt)
          })),
          total,
          limit: parsed.data.limit ?? 50,
          offset: parsed.data.offset ?? 0
        };
      });

      scope.post("/catalog/items", async (request, reply) => {
        const parsed = invoicingCatalogItemCreateSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const row = await insertCatalogItem(request.tenantId!, request.userId ?? null, parsed.data);
        return reply.code(201).send({
          id: row.id,
          name: row.name,
          unitPriceMinor: row.unitPriceMinor,
          currencyCode: row.currencyCode
        });
      });

      scope.get("/quotes/:quoteId", async (request, reply) => {
        const params = invoicingQuoteIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: "validation_error", message: params.error.message });
        }
        const body = await serializeQuote(request.tenantId!, params.data.quoteId);
        if (!body) return reply.code(404).send({ error: "not_found", message: "Quote not found." });
        const cfg = await getInvoicingConfiguration(request.tenantId!);
        return { quote: body, configuration: cfg ? serializeInvoicingConfiguration(cfg) : null };
      });

      scope.post("/quotes", async (request, reply) => {
        const parsed = invoicingQuoteCreateSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const row = await insertQuote(request.tenantId!, request.userId ?? null, parsed.data);
        const body = await serializeQuote(request.tenantId!, row.id);
        return reply.code(201).send({ quote: body });
      });

      scope.patch("/quotes/:quoteId", async (request, reply) => {
        const params = invoicingQuoteIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: "validation_error", message: params.error.message });
        }
        const parsed = invoicingQuotePatchSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const row = await updateQuote(request.tenantId!, params.data.quoteId, request.userId ?? null, parsed.data);
        if (!row) {
          return reply.code(409).send({ error: "not_editable", message: "Quote cannot be edited in its current status." });
        }
        const body = await serializeQuote(request.tenantId!, row.id);
        return { quote: body };
      });

      scope.post("/quotes/:quoteId/archive", async (request, reply) => {
        const params = invoicingQuoteIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: "validation_error", message: params.error.message });
        }
        const row = await archiveQuote(request.tenantId!, params.data.quoteId, request.userId ?? null);
        if (!row) return reply.code(404).send({ error: "not_found", message: "Quote not found." });
        const body = await serializeQuote(request.tenantId!, row.id);
        return { quote: body };
      });

      scope.delete("/quotes/:quoteId", async (request, reply) => {
        const params = invoicingQuoteIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: "validation_error", message: params.error.message });
        }
        const result = await deleteQuote(request.tenantId!, params.data.quoteId, request.userId ?? null);
        if (result === "not_found") {
          return reply.code(404).send({ error: "not_found", message: "Quote not found." });
        }
        if (result === "not_deletable") {
          return reply.code(409).send({
            error: "not_deletable",
            message: "Only archived quotes can be deleted."
          });
        }
        return { ok: true };
      });

      scope.get("/offers/:offerId", async (request, reply) => {
        const params = invoicingOfferIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: "validation_error", message: params.error.message });
        }
        const body = await serializeOffer(request.tenantId!, params.data.offerId);
        if (!body) return reply.code(404).send({ error: "not_found", message: "Offer not found." });
        const cfg = await getInvoicingConfiguration(request.tenantId!);
        return { offer: body, configuration: cfg ? serializeInvoicingConfiguration(cfg) : null };
      });

      scope.get("/invoices/:invoiceId", async (request, reply) => {
        const params = invoicingInvoiceIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: "validation_error", message: params.error.message });
        }
        const body = await serializeInvoice(request.tenantId!, params.data.invoiceId);
        if (!body) return reply.code(404).send({ error: "not_found", message: "Invoice not found." });
        const cfg = await getInvoicingConfiguration(request.tenantId!);
        return { invoice: body, configuration: cfg ? serializeInvoicingConfiguration(cfg) : null };
      });

      scope.post("/quotes/:quoteId/send-email", async (request, reply) => {
        const params = invoicingQuoteIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: "validation_error", message: params.error.message });
        }
        const parsed = invoicingSendDocumentEmailBodySchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const outcome = await sendInvoicingQuoteEmail({
          tenantId: request.tenantId!,
          quoteId: params.data.quoteId,
          actorUserId: request.userId ?? null,
          body: parsed.data,
          log: request.log
        });
        if (!outcome.ok) {
          return reply.code(outcome.status).send({ error: outcome.error, message: outcome.message });
        }
        return { ok: true };
      });

      scope.post("/quotes/:quoteId/promote-to-offer", async (request, reply) => {
        const params = invoicingQuoteIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: "validation_error", message: params.error.message });
        }
        const parsed = invoicingPromoteToOfferBodySchema.safeParse(request.body ?? {});
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        try {
          const result = await promoteQuoteToOffer(
            request.tenantId!,
            params.data.quoteId,
            request.userId ?? null,
            parsed.data
          );
          if (!result) {
            return reply.code(409).send({
              error: "invalid_state",
              message: "Quote must be a draft with a CRM organization to promote to an offer."
            });
          }
          return reply.code(201).send(result);
        } catch (e) {
          if (e instanceof Error && e.message === "crm_organization_required") {
            return reply.code(400).send({
              error: "crm_required",
              message: "Link a CRM organization before promoting to an offer."
            });
          }
          throw e;
        }
      });

      scope.post("/quotes/:quoteId/promote-to-invoice", async (request, reply) => {
        const params = invoicingQuoteIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: "validation_error", message: params.error.message });
        }
        const parsed = invoicingPromoteToInvoiceBodySchema.safeParse(request.body ?? {});
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const result = await promoteQuoteToInvoice(
          request.tenantId!,
          params.data.quoteId,
          request.userId ?? null,
          parsed.data
        );
        if (!result) {
          return reply.code(409).send({
            error: "invalid_state",
            message:
              "Quote must be a draft with a CRM organization, and direct quote-to-invoice must be enabled in configuration."
          });
        }
        return reply.code(201).send(result);
      });

      scope.post("/offers/:offerId/promote-to-invoice", async (request, reply) => {
        const params = invoicingOfferIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: "validation_error", message: params.error.message });
        }
        const parsed = invoicingPromoteToInvoiceBodySchema.safeParse(request.body ?? {});
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const result = await promoteOfferToInvoice(
          request.tenantId!,
          params.data.offerId,
          request.userId ?? null,
          parsed.data
        );
        if (!result) {
          return reply.code(409).send({
            error: "invalid_state",
            message:
              "Offer must be accepted and linked to a CRM organization before it can be promoted to an invoice."
          });
        }
        return reply.code(201).send(result);
      });

      scope.post("/offers/:offerId/send", async (request, reply) => {
        const params = invoicingOfferIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: "validation_error", message: params.error.message });
        }
        const parsed = invoicingSendOfferBodySchema.safeParse(request.body ?? {});
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const offer = await getOfferById(request.tenantId!, params.data.offerId);
        if (!offer) {
          return reply.code(404).send({ error: "not_found", message: "Offer not found." });
        }
        if (offer.status !== "offer_draft") {
          return reply.code(409).send({
            error: "invalid_state",
            message: "Offer must be a draft to send."
          });
        }
        const to = parsed.data.to?.trim() ?? offer.customerSnapshot.email?.trim();
        if (!to) {
          return reply.code(400).send({
            error: "validation_error",
            message: "Add a customer email address before sending this offer."
          });
        }
        const ok = await sendOffer(request.tenantId!, params.data.offerId, request.userId ?? null, {
          offerExpiryDate: parsed.data.offerExpiryDate
        });
        if (!ok) {
          return reply.code(409).send({
            error: "invalid_state",
            message: "Offer must be a draft to send."
          });
        }
        const emailOutcome = await sendInvoicingOfferEmail({
          tenantId: request.tenantId!,
          offerId: params.data.offerId,
          actorUserId: request.userId ?? null,
          body: {
            to,
            ...(parsed.data.subject?.trim() ? { subject: parsed.data.subject.trim() } : {})
          },
          log: request.log
        });
        if (!emailOutcome.ok) {
          return reply.code(emailOutcome.status).send({
            error: emailOutcome.error,
            message: `${emailOutcome.message} The offer was marked as sent; use Resend offer to try again.`
          });
        }
        return reply.code(204).send();
      });

      scope.post("/offers/:offerId/send-email", async (request, reply) => {
        const params = invoicingOfferIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: "validation_error", message: params.error.message });
        }
        const parsed = invoicingSendDocumentEmailBodySchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const outcome = await sendInvoicingOfferEmail({
          tenantId: request.tenantId!,
          offerId: params.data.offerId,
          actorUserId: request.userId ?? null,
          body: parsed.data,
          log: request.log
        });
        if (!outcome.ok) {
          return reply.code(outcome.status).send({ error: outcome.error, message: outcome.message });
        }
        return { ok: true };
      });

      scope.post("/offers/:offerId/accept", async (request, reply) => {
        const params = invoicingOfferIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: "validation_error", message: params.error.message });
        }
        const parsed = invoicingAcceptOfferBodySchema.safeParse(request.body ?? {});
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const ok = await acceptOffer(
          request.tenantId!,
          params.data.offerId,
          request.userId ?? null,
          parsed.data
        );
        if (!ok) {
          return reply.code(409).send({
            error: "invalid_state",
            message: "Offer must be awaiting a decision (draft or sent) to accept."
          });
        }
        await sendInvoicingOfferDecisionEmail({
          tenantId: request.tenantId!,
          offerId: params.data.offerId,
          decision: "accept",
          channel: "internal",
          actorUserId: request.userId ?? null,
          detailText: parsed.data.acceptanceProof,
          log: request.log
        });
        return reply.code(204).send();
      });

      scope.post("/offers/:offerId/reject", async (request, reply) => {
        const params = invoicingOfferIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: "validation_error", message: params.error.message });
        }
        const parsed = invoicingRejectOfferBodySchema.safeParse(request.body ?? {});
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const ok = await rejectOffer(
          request.tenantId!,
          params.data.offerId,
          request.userId ?? null,
          parsed.data
        );
        if (!ok) {
          return reply.code(409).send({
            error: "invalid_state",
            message: "Offer must be awaiting a decision (draft or sent) to reject."
          });
        }
        await sendInvoicingOfferDecisionEmail({
          tenantId: request.tenantId!,
          offerId: params.data.offerId,
          decision: "reject",
          channel: "internal",
          actorUserId: request.userId ?? null,
          detailText: parsed.data.reason,
          log: request.log
        });
        return reply.code(204).send();
      });

      scope.post("/offers/:offerId/demote-to-quote", async (request, reply) => {
        const params = invoicingOfferIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: "validation_error", message: params.error.message });
        }
        const parsed = invoicingDemoteToQuoteBodySchema.safeParse(request.body ?? {});
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        try {
          const result = await demoteOfferToQuote(
            request.tenantId!,
            params.data.offerId,
            request.userId ?? null,
            parsed.data
          );
          if (!result) {
            return reply.code(409).send({
              error: "invalid_state",
              message:
                "Offer must be a draft with a CRM organization to demote to a quote."
            });
          }
          return reply.code(201).send(result);
        } catch (e) {
          if (e instanceof Error && e.message === "crm_organization_required") {
            return reply.code(400).send({
              error: "crm_required",
              message: "Link a CRM organization before demoting to a quote."
            });
          }
          throw e;
        }
      });

      scope.post("/invoices/:invoiceId/demote-to-quote", async (request, reply) => {
        const params = invoicingInvoiceIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: "validation_error", message: params.error.message });
        }
        const parsed = invoicingDemoteToQuoteBodySchema.safeParse(request.body ?? {});
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        try {
          const result = await demoteInvoiceToQuote(
            request.tenantId!,
            params.data.invoiceId,
            request.userId ?? null,
            parsed.data
          );
          if (!result) {
            return reply.code(409).send({
              error: "invalid_state",
              message: "Invoice must be a draft with a CRM organization to demote to a quote."
            });
          }
          return reply.code(201).send(result);
        } catch (e) {
          if (e instanceof Error && e.message === "crm_organization_required") {
            return reply.code(400).send({
              error: "crm_required",
              message: "Link a CRM organization before demoting to a quote."
            });
          }
          throw e;
        }
      });

      scope.post("/invoices/:invoiceId/send", async (request, reply) => {
        const params = invoicingInvoiceIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: "validation_error", message: params.error.message });
        }
        const parsed = invoicingSendInvoiceBodySchema.safeParse(request.body ?? {});
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const outcome = await finalizeAndEmailInvoicingInvoice({
          tenantId: request.tenantId!,
          invoiceId: params.data.invoiceId,
          actorUserId: request.userId ?? null,
          sendOpts: {
            dueDate: parsed.data.dueDate,
            paymentTermDays: parsed.data.paymentTermDays
          },
          to: parsed.data.to,
          subject: parsed.data.subject,
          log: request.log
        });
        if (!outcome.ok) {
          return reply.code(outcome.status).send({ error: outcome.error, message: outcome.message });
        }
        const body = await serializeInvoice(request.tenantId!, params.data.invoiceId);
        return { ok: true, invoice: body };
      });

      scope.post("/invoices/:invoiceId/send-email", async (request, reply) => {
        const params = invoicingInvoiceIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: "validation_error", message: params.error.message });
        }
        const parsed = invoicingSendDocumentEmailBodySchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const outcome = await sendInvoicingInvoiceEmail({
          tenantId: request.tenantId!,
          invoiceId: params.data.invoiceId,
          actorUserId: request.userId ?? null,
          body: parsed.data,
          log: request.log
        });
        if (!outcome.ok) {
          return reply.code(outcome.status).send({ error: outcome.error, message: outcome.message });
        }
        return { ok: true };
      });

      scope.post("/invoices/:invoiceId/finalize", async (request, reply) => {
        const params = invoicingInvoiceIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: "validation_error", message: params.error.message });
        }
        const parsed = invoicingSendInvoiceBodySchema.safeParse(request.body ?? {});
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const ok = await sendInvoice(
          request.tenantId!,
          params.data.invoiceId,
          request.userId ?? null,
          {
            dueDate: parsed.data.dueDate,
            paymentTermDays: parsed.data.paymentTermDays
          }
        );
        if (!ok) {
          return reply.code(409).send({ error: "invalid_state", message: "Invoice must be a draft to send." });
        }
        const body = await serializeInvoice(request.tenantId!, params.data.invoiceId);
        return { ok: true, invoice: body };
      });

      scope.post("/invoices/:invoiceId/dispute", async (request, reply) => {
        const params = invoicingInvoiceIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: "validation_error", message: params.error.message });
        }
        const parsed = invoicingDisputeInvoiceBodySchema.safeParse(request.body ?? {});
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const invoice = await getInvoiceById(request.tenantId!, params.data.invoiceId);
        if (!invoice) {
          return reply.code(404).send({ error: "not_found", message: "Invoice not found." });
        }
        const to = invoice.customerSnapshot.email?.trim();
        if (!to) {
          return reply.code(400).send({
            error: "validation_error",
            message: "Add a customer email address before marking this invoice as disputed."
          });
        }
        const ok = await disputeInvoice(
          request.tenantId!,
          params.data.invoiceId,
          request.userId ?? null,
          parsed.data
        );
        if (!ok) {
          return reply.code(409).send({
            error: "invalid_state",
            message: "Invoice must be draft or sent (outstanding) to mark as disputed."
          });
        }
        const emailOutcome = await sendInvoicingInvoiceDisputeEmail({
          tenantId: request.tenantId!,
          invoiceId: params.data.invoiceId,
          actorUserId: request.userId ?? null,
          disputedInformation: parsed.data.disputedInformation,
          to,
          log: request.log
        });
        if (!emailOutcome.ok) {
          return reply.code(emailOutcome.status).send({
            error: emailOutcome.error,
            message: `${emailOutcome.message} The invoice was marked as disputed; notify the customer manually if needed.`
          });
        }
        const body = await serializeInvoice(request.tenantId!, params.data.invoiceId);
        return { ok: true, invoice: body };
      });

      scope.post("/invoices/:invoiceId/dispute/acknowledge", async (request, reply) => {
        const params = invoicingInvoiceIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: "validation_error", message: params.error.message });
        }
        const parsed = invoicingAcknowledgeInvoiceDisputeBodySchema.safeParse(request.body ?? {});
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const invoice = await getInvoiceById(request.tenantId!, params.data.invoiceId);
        if (!invoice) {
          return reply.code(404).send({ error: "not_found", message: "Invoice not found." });
        }
        const to = invoice.customerSnapshot.email?.trim();
        if (!to) {
          return reply.code(400).send({
            error: "validation_error",
            message: "Add a customer email address before acknowledging this dispute."
          });
        }
        const ok = await acknowledgeInvoiceDispute(
          request.tenantId!,
          params.data.invoiceId,
          request.userId ?? null,
          parsed.data
        );
        if (!ok) {
          return reply.code(409).send({
            error: "invalid_state",
            message: "This invoice dispute has already been resolved or is not disputed."
          });
        }
        const emailOutcome = await sendInvoicingInvoiceDisputeAcknowledgedEmail({
          tenantId: request.tenantId!,
          invoiceId: params.data.invoiceId,
          actorUserId: request.userId ?? null,
          companyResponse: parsed.data.companyResponse,
          outstandingPaymentPlan: parsed.data.outstandingPaymentPlan,
          to,
          log: request.log
        });
        if (!emailOutcome.ok) {
          return reply.code(emailOutcome.status).send({
            error: emailOutcome.error,
            message: `${emailOutcome.message} The dispute was acknowledged; notify the customer manually if needed.`
          });
        }
        const finalized = await finalizeInvoiceDisputeAcknowledgment(
          request.tenantId!,
          params.data.invoiceId,
          request.userId ?? null
        );
        if (!finalized) {
          return reply.code(409).send({
            error: "invalid_state",
            message: "Could not update the invoice to dispute acknowledged."
          });
        }
        const body = await serializeInvoice(request.tenantId!, params.data.invoiceId);
        return { ok: true, invoice: body };
      });

      scope.post("/invoices/:invoiceId/dispute/acknowledgment/discount", async (request, reply) => {
        const params = invoicingInvoiceIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: "validation_error", message: params.error.message });
        }
        const parsed = invoicingDisputeAcknowledgmentDiscountBodySchema.safeParse(request.body ?? {});
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const invoiceBefore = await getInvoiceById(request.tenantId!, params.data.invoiceId);
        if (!invoiceBefore) {
          return reply.code(404).send({ error: "not_found", message: "Invoice not found." });
        }
        const to = invoiceBefore.customerSnapshot.email?.trim();
        if (!to) {
          return reply.code(400).send({
            error: "validation_error",
            message: "Add a customer email address before applying a dispute discount."
          });
        }
        const outcome = await applyDisputeAcknowledgmentDiscount(
          request.tenantId!,
          params.data.invoiceId,
          request.userId ?? null,
          parsed.data
        );
        if (!outcome) {
          return reply.code(409).send({
            error: "invalid_state",
            message: "This invoice is not ready for a dispute discount adjustment."
          });
        }
        const revised = await getInvoiceById(request.tenantId!, outcome.revisedInvoiceId);
        const sendOutcome = await finalizeAndEmailInvoicingInvoice({
          tenantId: request.tenantId!,
          invoiceId: outcome.revisedInvoiceId,
          actorUserId: request.userId ?? null,
          sendOpts: {
            paymentTermDays: revised?.paymentTermDays ?? invoiceBefore.paymentTermDays
          },
          to,
          log: request.log,
          emailFailureSuffix:
            "The revised invoice was marked as sent; use Resend invoice to try again. The dispute discount revision was created on the original invoice."
        });
        if (!sendOutcome.ok) {
          return reply.code(sendOutcome.status).send({ error: sendOutcome.error, message: sendOutcome.message });
        }
        const body = await serializeInvoice(request.tenantId!, outcome.revisedInvoiceId);
        return { ok: true, outcome, invoice: body };
      });

      scope.post("/invoices/:invoiceId/dispute/acknowledgment/full-credit", async (request, reply) => {
        const params = invoicingInvoiceIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: "validation_error", message: params.error.message });
        }
        const parsed = invoicingDisputeAcknowledgmentFullCreditBodySchema.safeParse(request.body ?? {});
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const invoiceBefore = await getInvoiceById(request.tenantId!, params.data.invoiceId);
        if (!invoiceBefore) {
          return reply.code(404).send({ error: "not_found", message: "Invoice not found." });
        }
        const to = invoiceBefore.customerSnapshot.email?.trim();
        if (!to) {
          return reply.code(400).send({
            error: "validation_error",
            message: "Add a customer email address before crediting this invoice."
          });
        }
        const outcome = await applyDisputeAcknowledgmentFullCredit(
          request.tenantId!,
          params.data.invoiceId,
          request.userId ?? null,
          parsed.data
        );
        if (!outcome) {
          return reply.code(409).send({
            error: "invalid_state",
            message: "This invoice is not ready for a full dispute credit."
          });
        }
        const creditEmailOutcome = await sendInvoicingInvoiceDisputeFullCreditEmail({
          tenantId: request.tenantId!,
          invoiceId: params.data.invoiceId,
          actorUserId: request.userId ?? null,
          creditedAmountMinor: outcome.creditedAmountMinor,
          creditDate: parsed.data.creditDate,
          revisedDisplayNumber: outcome.displayDocumentNumber,
          note: parsed.data.note,
          to,
          log: request.log
        });
        if (!creditEmailOutcome.ok) {
          return reply.code(creditEmailOutcome.status).send({
            error: creditEmailOutcome.error,
            message: `${creditEmailOutcome.message} The full credit was applied; notify the customer manually if needed.`
          });
        }
        const revised = await getInvoiceById(request.tenantId!, outcome.revisedInvoiceId);
        const sendOutcome = await finalizeAndEmailInvoicingInvoice({
          tenantId: request.tenantId!,
          invoiceId: outcome.revisedInvoiceId,
          actorUserId: request.userId ?? null,
          sendOpts: {
            paymentTermDays: revised?.paymentTermDays ?? invoiceBefore.paymentTermDays,
            statusAfterSend: "invoice_accredited"
          },
          to,
          log: request.log,
          emailFailureSuffix:
            "The credited invoice was marked as accredited; use Resend invoice to try again. The full credit was applied on the original invoice."
        });
        if (!sendOutcome.ok) {
          return reply.code(sendOutcome.status).send({ error: sendOutcome.error, message: sendOutcome.message });
        }
        const accredited = await markInvoiceAccredited(
          request.tenantId!,
          params.data.invoiceId,
          request.userId ?? null
        );
        if (!accredited) {
          return reply.code(409).send({
            error: "invalid_state",
            message:
              "The credited invoice was sent, but the original invoice could not be marked accredited. Update it manually if needed."
          });
        }
        const body = await serializeInvoice(request.tenantId!, outcome.revisedInvoiceId);
        return { ok: true, outcome, invoice: body };
      });

      scope.post("/invoices/:invoiceId/dispute/deny", async (request, reply) => {
        const params = invoicingInvoiceIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: "validation_error", message: params.error.message });
        }
        const parsed = invoicingDenyInvoiceDisputeBodySchema.safeParse(request.body ?? {});
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const invoiceBefore = await getInvoiceById(request.tenantId!, params.data.invoiceId);
        if (!invoiceBefore) {
          return reply.code(404).send({ error: "not_found", message: "Invoice not found." });
        }
        const to = invoiceBefore.customerSnapshot.email?.trim();
        if (!to) {
          return reply.code(400).send({
            error: "validation_error",
            message: "Add a customer email address before denying this dispute."
          });
        }
        const ok = await denyInvoiceDispute(
          request.tenantId!,
          params.data.invoiceId,
          request.userId ?? null,
          parsed.data
        );
        if (!ok) {
          return reply.code(409).send({
            error: "invalid_state",
            message: "This invoice dispute has already been resolved or is not disputed."
          });
        }
        const denialEmailOutcome = await sendInvoicingInvoiceDisputeDeniedEmail({
          tenantId: request.tenantId!,
          invoiceId: params.data.invoiceId,
          actorUserId: request.userId ?? null,
          denialReason: parsed.data.denialReason,
          to,
          log: request.log
        });
        if (!denialEmailOutcome.ok) {
          return reply.code(denialEmailOutcome.status).send({
            error: denialEmailOutcome.error,
            message: `${denialEmailOutcome.message} The dispute was denied; notify the customer manually if needed.`
          });
        }
        const emailOutcome = await finalizeAndEmailInvoicingInvoice({
          tenantId: request.tenantId!,
          invoiceId: params.data.invoiceId,
          actorUserId: request.userId ?? null,
          to,
          log: request.log,
          emailFailureSuffix:
            "The dispute was denied and the invoice was reset to draft with a new due date; resend manually if needed."
        });
        if (!emailOutcome.ok) {
          return reply.code(emailOutcome.status).send({
            error: emailOutcome.error,
            message: emailOutcome.message
          });
        }
        const body = await serializeInvoice(request.tenantId!, params.data.invoiceId);
        return { ok: true, invoice: body };
      });

      scope.post("/invoices/:invoiceId/archive", async (request, reply) => {
        const params = invoicingInvoiceIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: "validation_error", message: params.error.message });
        }
        const ok = await archiveInvoice(request.tenantId!, params.data.invoiceId, request.userId ?? null);
        if (!ok) {
          return reply.code(409).send({
            error: "invalid_state",
            message: "Only paid or partially paid invoices can be archived."
          });
        }
        const body = await serializeInvoice(request.tenantId!, params.data.invoiceId);
        return { ok: true, invoice: body };
      });

      scope.post("/invoices/:invoiceId/payments", async (request, reply) => {
        const params = invoicingInvoiceIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: "validation_error", message: params.error.message });
        }
        const parsed = invoicingRegisterInvoicePaymentBodySchema.safeParse(request.body ?? {});
        if (!parsed.success) {
          return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
        }
        const invoiceBeforePayment = await getInvoiceById(request.tenantId!, params.data.invoiceId);
        if (!invoiceBeforePayment) {
          return reply.code(404).send({ error: "not_found", message: "Invoice not found." });
        }
        const willCreateRevision =
          parsed.data.amountMinor > 0 && parsed.data.amountMinor < invoiceBeforePayment.totalIncludingTaxMinor;
        if (willCreateRevision) {
          const to = invoiceBeforePayment.customerSnapshot.email?.trim();
          if (!to) {
            return reply.code(400).send({
              error: "validation_error",
              message:
                "Add a customer email address before registering a partial payment. The revised invoice is sent to the customer automatically."
            });
          }
        }
        const result = await registerInvoicePayment(
          request.tenantId!,
          params.data.invoiceId,
          request.userId ?? null,
          parsed.data
        );
        if (!result) {
          return reply.code(409).send({
            error: "invalid_state",
            message:
              "Payment could not be registered. The invoice must be sent, the amount must not exceed the outstanding total, and the invoice total must be greater than zero."
          });
        }
        if (result.outcome === "partial") {
          const revised = await getInvoiceById(request.tenantId!, result.revisedInvoiceId);
          const sendOutcome = await finalizeAndEmailInvoicingInvoice({
            tenantId: request.tenantId!,
            invoiceId: result.revisedInvoiceId,
            actorUserId: request.userId ?? null,
            sendOpts: {
              paymentTermDays: revised?.paymentTermDays ?? invoiceBeforePayment.paymentTermDays
            },
            to: invoiceBeforePayment.customerSnapshot.email?.trim(),
            log: request.log,
            emailFailureSuffix:
              "The revised invoice was marked as sent; use Resend invoice to try again. Partial payment was registered on the original invoice."
          });
          if (!sendOutcome.ok) {
            return reply.code(sendOutcome.status).send({ error: sendOutcome.error, message: sendOutcome.message });
          }
        } else {
          const emailOutcome = await sendInvoicingInvoicePaymentReceivedEmail({
            tenantId: request.tenantId!,
            invoiceId: result.invoiceId,
            actorUserId: request.userId ?? null,
            amountPaidMinor: parsed.data.amountMinor,
            paymentDate: parsed.data.paymentDate,
            reference: parsed.data.reference,
            to: invoiceBeforePayment.customerSnapshot.email?.trim(),
            log: request.log
          });
          if (!emailOutcome.ok) {
            return reply.code(emailOutcome.status).send({
              error: emailOutcome.error,
              message: `${emailOutcome.message} The payment was registered on the invoice.`
            });
          }
        }
        const invoice = await serializeInvoice(
          request.tenantId!,
          result.outcome === "partial" ? result.revisedInvoiceId : result.invoiceId
        );
        return reply.code(201).send({ ...result, invoice });
      });

      scope.get("/quotes/:quoteId/audit", async (request, reply) => {
        const params = invoicingQuoteIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: "validation_error", message: params.error.message });
        }
        const audit = await serializeInvoicingAuditTrail(request.tenantId!, "quote", params.data.quoteId);
        if (!audit) return reply.code(404).send({ error: "not_found", message: "Quote not found." });
        return { audit };
      });

      scope.get("/offers/:offerId/audit", async (request, reply) => {
        const params = invoicingOfferIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: "validation_error", message: params.error.message });
        }
        const audit = await serializeInvoicingAuditTrail(request.tenantId!, "offer", params.data.offerId);
        if (!audit) return reply.code(404).send({ error: "not_found", message: "Offer not found." });
        return { audit };
      });

      scope.get("/invoices/:invoiceId/audit", async (request, reply) => {
        const params = invoicingInvoiceIdParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: "validation_error", message: params.error.message });
        }
        const audit = await serializeInvoicingAuditTrail(request.tenantId!, "invoice", params.data.invoiceId);
        if (!audit) return reply.code(404).send({ error: "not_found", message: "Invoice not found." });
        return { audit };
      });

      scope.get("/pdf/:kind/:id", async (_request, reply) => {
        return reply.code(501).send({
          error: "not_implemented",
          message: "PDF export is not available in this release."
        });
      });

      scope.post("/testing/purge-documents", async (request, reply) => {
        if (!invoicingDocumentDevPurgeEnabled()) {
          return reply.code(403).send({
            error: "forbidden",
            message: "Purging invoicing documents is only allowed when NODE_ENV is development."
          });
        }
        if (!isTenantAdminRole(request.role ?? "")) {
          return reply.code(403).send({
            error: "forbidden",
            message: "Only tenant administrators can purge invoicing documents."
          });
        }
        const result = await purgeInvoicingDocumentsForTenant(request.tenantId!);
        return result;
      });
    },
    { prefix: "/invoicing" }
  );
};
