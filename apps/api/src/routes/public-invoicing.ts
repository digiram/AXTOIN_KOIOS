/**
 * Anonymous customer-facing invoicing routes (token-gated; no JWT).
 */

import type { FastifyInstance, FastifyReply } from "fastify";

import {
  acceptOfferFromCustomerLink,
  ensureInvoicingTenantConfiguration,
  findInvoicingOfferResponseTokenBySecret,
  getInvoicingConfiguration,
  listOfferLineItems,
  rejectOfferFromCustomerLink,
  type InvoicingOfferRow
} from "@starter/db";
import {
  defaultInvoicingTermsTextForKind,
  formatInvoicingOfferDisplayNumber,
  invoicingPublicOfferDecisionBodySchema,
  invoicingPublicOfferResponseTokenParamsSchema,
  isInvoicingOfferCustomerResponseAllowed,
  resolveInvoicingIssuerSnapshot
} from "@starter/shared";

import {
  mimeForStoredPhotoName,
  readProfilePhotoBytes,
  resolveApiFilesRoot
} from "../lib/entity-photo-storage.js";
import { sendInvoicingOfferDecisionEmail } from "../lib/send-invoicing-offer-decision-email.js";

const LINK_UNAVAILABLE_MESSAGE = "This offer response link is no longer available.";

const linkUnavailable = (reply: FastifyReply) =>
  reply.code(410).send({ error: "link_unavailable", message: LINK_UNAVAILABLE_MESSAGE });

const serializePublicOffer = async (tenantId: string, offer: InvoicingOfferRow) => {
  const lineItems = await listOfferLineItems(tenantId, offer.id);
  const cfg = await ensureInvoicingTenantConfiguration(tenantId);
  const issuerSnapshot = resolveInvoicingIssuerSnapshot(offer.issuerSnapshot, cfg.issuerSnapshot);
  const { internalNotes: _internalNotes, ...rest } = offer;
  return {
    ...rest,
    issuerSnapshot,
    termsText: offer.termsText?.trim() ? offer.termsText : defaultInvoicingTermsTextForKind("offer", cfg),
    displayDocumentNumber: formatInvoicingOfferDisplayNumber(offer.documentNumber, offer.revision),
    lineItems
  };
};

const serializePublicConfiguration = async (tenantId: string) => {
  const cfg = await getInvoicingConfiguration(tenantId);
  if (!cfg) return null;
  const { companyLogoRelPath, updatedAt, ...rest } = cfg;
  return {
    taxRateOptions: rest.taxRateOptions,
    documentThemeColor: rest.documentThemeColor,
    hasCompanyLogo: Boolean(companyLogoRelPath?.trim()),
    updatedAt: updatedAt.toISOString()
  };
};

export const registerPublicInvoicingRoutes = async (app: FastifyInstance): Promise<void> => {
  app.get("/offers/respond/:token", async (request, reply) => {
    const params = invoicingPublicOfferResponseTokenParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: "validation_error", message: params.error.message });
    }
    const match = await findInvoicingOfferResponseTokenBySecret(params.data.token);
    if (!match) return linkUnavailable(reply);
    const { offer } = match;
    const responseAllowed = isInvoicingOfferCustomerResponseAllowed(offer.status, offer.offerExpiryDate);
    if (!responseAllowed) return linkUnavailable(reply);
    const [serializedOffer, configuration] = await Promise.all([
      serializePublicOffer(offer.tenantId, offer),
      serializePublicConfiguration(offer.tenantId)
    ]);
    return {
      responseAllowed: true,
      offer: serializedOffer,
      configuration
    };
  });

  app.post("/offers/respond/:token", async (request, reply) => {
    const params = invoicingPublicOfferResponseTokenParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: "validation_error", message: params.error.message });
    }
    const parsedBody = invoicingPublicOfferDecisionBodySchema.safeParse(request.body ?? {});
    if (!parsedBody.success) {
      return reply.code(400).send({ error: "validation_error", message: parsedBody.error.message });
    }
    const match = await findInvoicingOfferResponseTokenBySecret(params.data.token);
    if (!match) return linkUnavailable(reply);
    const { offer, tokenRow } = match;
    if (!isInvoicingOfferCustomerResponseAllowed(offer.status, offer.offerExpiryDate)) {
      return linkUnavailable(reply);
    }

    const { decision, responderName, comment } = parsedBody.data;
    const ok =
      decision === "accept"
        ? await acceptOfferFromCustomerLink(offer.tenantId, tokenRow.offerId, { responderName, comment })
        : await rejectOfferFromCustomerLink(offer.tenantId, tokenRow.offerId, { responderName, comment });
    if (!ok) return linkUnavailable(reply);
    await sendInvoicingOfferDecisionEmail({
      tenantId: offer.tenantId,
      offerId: tokenRow.offerId,
      decision,
      channel: "public_offer_link",
      actorUserId: null,
      responderName,
      detailText: comment,
      log: request.log
    });
    return { ok: true, decision };
  });

  app.get("/offers/respond/:token/logo", async (request, reply) => {
    const params = invoicingPublicOfferResponseTokenParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: "validation_error", message: params.error.message });
    }
    const match = await findInvoicingOfferResponseTokenBySecret(params.data.token);
    if (!match) return reply.code(404).send({ error: "not_found", message: "Logo not available." });
    const { offer } = match;
    if (!isInvoicingOfferCustomerResponseAllowed(offer.status, offer.offerExpiryDate)) {
      return reply.code(404).send({ error: "not_found", message: "Logo not available." });
    }
    const cfg = await getInvoicingConfiguration(offer.tenantId);
    const rel = cfg?.companyLogoRelPath?.trim();
    if (!rel) {
      return reply.code(404).send({ error: "not_found", message: "No company logo on file." });
    }
    try {
      const bytes = await readProfilePhotoBytes(resolveApiFilesRoot(), rel, { tenantId: offer.tenantId });
      const name = rel.split("/").pop() ?? "logo.png";
      return reply.type(mimeForStoredPhotoName(name)).send(bytes);
    } catch {
      return reply.code(500).send({ error: "logo_read_failed", message: "Could not read company logo." });
    }
  });
};
