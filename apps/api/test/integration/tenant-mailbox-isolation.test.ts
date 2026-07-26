/**
 * Integration tests for tenant mailbox data isolation.
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
import { enablePlatformModules } from "./integration-api-helpers.js";
import { registerTenantAdmin } from "./integration-tenant.js";
import { cleanupTestTenants } from "./test-tenant-cleanup.js";

const describeIntegration = (await canRunIntegrationTests()) ? describe : describe.skip;

describeIntegration("integration: tenant mailbox isolation", () => {
  const password = "Password123!";
  let tenantIdA: string | undefined;
  let tenantIdB: string | undefined;

  before(async () => {
    await ensureIntegrationMigrations();
    await enablePlatformModules({ mailboxEnabled: true, selfRegisterEnabled: true });
  });

  after(async () => {
    await cleanupTestTenants(tenantIdA, tenantIdB);
  });

  it("returns 404 when tenant B deletes tenant A shared mailbox account", async () => {
    const app = await createIntegrationApp();
    try {
      const suffix = randomUUID().slice(0, 8);
      const tenantA = await registerTenantAdmin(app, `mba-${suffix}.corp.test`, password);
      const tenantB = await registerTenantAdmin(app, `mbb-${suffix}.corp.test`, password);
      tenantIdA = tenantA.tenantId;
      tenantIdB = tenantB.tenantId;

      const createRes = await app.inject({
        method: "POST",
        url: "/v1/tenant/mailbox/accounts/shared",
        ...authHeader(tenantA.accessToken),
        ...jsonBody({
          displayName: "Shared Support",
          emailAddress: `support@${tenantA.domain}`
        })
      });
      assert.equal(createRes.statusCode, 201, createRes.body);

      const listRes = await app.inject({
        method: "GET",
        url: "/v1/tenant/mailbox/accounts",
        ...authHeader(tenantA.accessToken)
      });
      assert.equal(listRes.statusCode, 200, listRes.body);
      const accounts = (listRes.json() as {
        accounts: { connections: { id: string; emailAddress: string }[] }[];
      }).accounts;
      const connection = accounts.flatMap((row) => row.connections).find((c) => c.emailAddress.includes("support@"));
      assert.ok(connection?.id, "expected shared mailbox connection id");

      const crossDelete = await app.inject({
        method: "DELETE",
        url: `/v1/tenant/mailbox/accounts/${connection.id}`,
        ...authHeader(tenantB.accessToken)
      });
      assert.equal(crossDelete.statusCode, 404, crossDelete.body);
    } finally {
      await app.close();
    }
  });
});
