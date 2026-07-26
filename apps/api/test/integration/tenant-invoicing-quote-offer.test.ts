/**
 * Integration tests for invoicing quote-to-offer tenant flows.
 *
 * Requires database; gated by `RUN_INTEGRATION_TESTS`.
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

import {
  authHeader,
  canRunIntegrationTests,
  createIntegrationApp,
  ensureIntegrationMigrations,
  jsonBody
} from "./helpers.js";
import {
  createCrmOrganization,
  enablePlatformModules,
  todayIsoDate
} from "./integration-api-helpers.js";
import { registerTenantAdmin } from "./integration-tenant.js";
import { cleanupTestTenants } from "./test-tenant-cleanup.js";

const describeIntegration = (await canRunIntegrationTests()) ? describe : describe.skip;

describeIntegration("integration: tenant invoicing quote to offer", () => {
  const password = "Password123!";
  let tenantId: string | undefined;

  before(async () => {
    await ensureIntegrationMigrations();
    await enablePlatformModules({ crmEnabled: true, invoicingEnabled: true, selfRegisterEnabled: true });
  });

  after(async () => {
    await cleanupTestTenants(tenantId);
  });

  it("creates a draft quote linked to CRM and promotes it to an offer", async () => {
    const app = await createIntegrationApp();
    try {
      const domain = `inv-${randomUUID().slice(0, 8)}.corp.test`;
      const tenant = await registerTenantAdmin(app, domain, password);
      tenantId = tenant.tenantId;

      const orgId = await createCrmOrganization(app, tenant.accessToken, "Integration Customer Ltd");
      const documentDate = todayIsoDate();

      const quoteRes = await app.inject({
        method: "POST",
        url: "/v1/tenant/invoicing/quotes",
        ...authHeader(tenant.accessToken),
        ...jsonBody({
          crmOrganizationId: orgId,
          currencyCode: "USD",
          documentDate,
          lineItems: [
            {
              description: "Integration consulting day",
              quantity: 1,
              unitLabel: "day",
              unitPriceMinor: 120_000,
              taxRateBps: 0
            }
          ]
        })
      });
      assert.equal(quoteRes.statusCode, 201, quoteRes.body);
      const quoteId = (quoteRes.json() as { quote: { id: string; status: string } }).quote.id;
      assert.equal((quoteRes.json() as { quote: { status: string } }).quote.status, "quote_draft");

      const promoteRes = await app.inject({
        method: "POST",
        url: `/v1/tenant/invoicing/quotes/${quoteId}/promote-to-offer`,
        ...authHeader(tenant.accessToken),
        ...jsonBody({})
      });
      assert.equal(promoteRes.statusCode, 201, promoteRes.body);
      const promoted = promoteRes.json() as { offerId: string; displayDocumentNumber: string };
      assert.ok(promoted.offerId);
      assert.ok(promoted.displayDocumentNumber);

      const offerRes = await app.inject({
        method: "GET",
        url: `/v1/tenant/invoicing/offers/${promoted.offerId}`,
        ...authHeader(tenant.accessToken)
      });
      assert.equal(offerRes.statusCode, 200, offerRes.body);
      assert.equal((offerRes.json() as { offer: { status: string } }).offer.status, "offer_draft");
    } finally {
      await app.close();
    }
  });
});
