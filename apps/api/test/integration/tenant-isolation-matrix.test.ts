/**
 * Integration tests for tenant isolation matrix (IDOR across modules).
 *
 * Requires database; gated by `RUN_INTEGRATION_TESTS`.
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

import { upsertPlatformModuleSettingsRow } from "@starter/db";

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

describeIntegration("integration: tenant isolation matrix (IDOR)", () => {
  const password = "Password123!";
  let tenantIdA: string | undefined;
  let tenantIdB: string | undefined;

  before(async () => {
    await ensureIntegrationMigrations();
    await upsertPlatformModuleSettingsRow({
      crmEnabled: true,
      hrmEnabled: true,
      salesFunnelEnabled: true,
      selfRegisterEnabled: true
    });
  });

  after(async () => {
    await cleanupTestTenants(tenantIdA, tenantIdB);
  });

  it("cross-tenant reads return 404 across CRM, workforce, sales, platform", async () => {
    const app = await createIntegrationApp();
    const suffix = randomUUID().slice(0, 8);
    const tenantA = await registerTenantAdmin(app, `ida-${suffix}.corp.test`, password);
    const tenantB = await registerTenantAdmin(app, `idb-${suffix}.corp.test`, password);
    tenantIdA = tenantA.tenantId;
    tenantIdB = tenantB.tenantId;

    const orgRes = await app.inject({
      method: "POST",
      url: "/v1/tenant/crm/organizations",
      ...authHeader(tenantA.accessToken),
      ...jsonBody({ name: "Tenant A Org" })
    });
    assert.equal(orgRes.statusCode, 200, orgRes.body);
    const orgId = (orgRes.json() as { id: string }).id;

    const contactRes = await app.inject({
      method: "POST",
      url: "/v1/tenant/crm/contacts",
      ...authHeader(tenantA.accessToken),
      ...jsonBody({
        firstName: "Ada",
        lastName: "Lovelace",
        employerOrganizationId: orgId
      })
    });
    assert.equal(contactRes.statusCode, 200, contactRes.body);
    const contactId = (contactRes.json() as { id: string }).id;

    const employeeRes = await app.inject({
      method: "POST",
      url: "/v1/tenant/workforce/employees",
      ...authHeader(tenantA.accessToken),
      ...jsonBody({ firstName: "Sam", lastName: "Worker" })
    });
    assert.equal(employeeRes.statusCode, 200, employeeRes.body);
    const employeeId = (employeeRes.json() as { employee: { id: string } }).employee.id;

    const leadRes = await app.inject({
      method: "POST",
      url: "/v1/tenant/sales/bdr/leads",
      ...authHeader(tenantA.accessToken),
      ...jsonBody({ title: "Tenant A lead" })
    });
    assert.equal(leadRes.statusCode, 201, leadRes.body);
    const leadId = (leadRes.json() as { lead: { id: string } }).lead.id;

    const cases: { label: string; method: "GET"; url: string }[] = [
      { label: "CRM organization", method: "GET", url: `/v1/tenant/crm/organizations/${orgId}` },
      { label: "CRM contact", method: "GET", url: `/v1/tenant/crm/contacts/${contactId}` },
      { label: "Workforce employee", method: "GET", url: `/v1/tenant/workforce/employees/${employeeId}` },
      { label: "Sales BDR lead", method: "GET", url: `/v1/tenant/sales/bdr/leads/${leadId}` }
    ];

    for (const c of cases) {
      const cross = await app.inject({
        method: c.method,
        url: c.url,
        ...authHeader(tenantB.accessToken)
      });
      assert.equal(cross.statusCode, 404, `${c.label}: expected 404, got ${cross.statusCode} ${cross.body}`);
    }

    const platformAsTenant = await app.inject({
      method: "GET",
      url: "/v1/platform/job-queues",
      ...authHeader(tenantB.accessToken)
    });
    assert.equal(platformAsTenant.statusCode, 403, platformAsTenant.body);

    await app.close();
  });
});
