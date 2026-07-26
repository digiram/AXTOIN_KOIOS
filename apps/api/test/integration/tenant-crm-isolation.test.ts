/**
 * Integration tests for tenant CRM data isolation (cross-tenant IDOR).
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
import { registerTenantAdmin } from "./integration-tenant.js";
import { cleanupTestTenants } from "./test-tenant-cleanup.js";

const describeIntegration = (await canRunIntegrationTests()) ? describe : describe.skip;

describeIntegration("integration: tenant CRM isolation", () => {
  const domainA = `a-${randomUUID().slice(0, 8)}.corp.test`;
  const domainB = `b-${randomUUID().slice(0, 8)}.corp.test`;
  const password = "Password123!";
  let tenantIdA: string | undefined;
  let tenantIdB: string | undefined;

  before(async () => {
    await ensureIntegrationMigrations();
  });

  after(async () => {
    await cleanupTestTenants(tenantIdA, tenantIdB);
  });

  it("returns 404 when tenant B reads tenant A organization by id", async () => {
    const app = await createIntegrationApp();

    const regABody = await registerTenantAdmin(app, domainA, password);
    tenantIdA = regABody.tenantId;
    const tenantA = regABody.accessToken;

    const regBBody = await registerTenantAdmin(app, domainB, password);
    tenantIdB = regBBody.tenantId;
    const tenantB = regBBody.accessToken;

    const createOrg = await app.inject({
      method: "POST",
      url: "/v1/tenant/crm/organizations",
      ...authHeader(tenantA),
      ...jsonBody({ name: "Secret Org A" })
    });
    assert.equal(createOrg.statusCode, 200, createOrg.body);
    const orgId = (createOrg.json() as { id: string }).id;

    const crossRead = await app.inject({
      method: "GET",
      url: `/v1/tenant/crm/organizations/${orgId}`,
      ...authHeader(tenantB)
    });
    assert.equal(crossRead.statusCode, 404);

    await app.close();
  });
});
