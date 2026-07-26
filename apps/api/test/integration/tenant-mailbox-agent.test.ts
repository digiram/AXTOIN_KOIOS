/**
 * Integration tests for workforce agent mailbox ownership.
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

describeIntegration("integration: workforce agent mailbox", () => {
  const password = "Password123!";
  let tenantId: string | undefined;

  before(async () => {
    await ensureIntegrationMigrations();
    await enablePlatformModules({
      mailboxEnabled: true,
      hrmEnabled: true,
      selfRegisterEnabled: true
    });
  });

  after(async () => {
    await cleanupTestTenants(tenantId);
  });

  it("connects IMAP to an agent and lists it for tenant admin", async () => {
    const app = await createIntegrationApp();
    try {
      const suffix = randomUUID().slice(0, 8);
      const tenant = await registerTenantAdmin(app, `agm-${suffix}.corp.test`, password);
      tenantId = tenant.tenantId;

      const createEmp = await app.inject({
        method: "POST",
        url: "/v1/tenant/workforce/employees",
        ...authHeader(tenant.accessToken),
        ...jsonBody({
          firstName: "Metis",
          lastName: "Bot",
          employeeKind: "agent"
        })
      });
      assert.equal(createEmp.statusCode, 201, createEmp.body);
      const employeeId = (createEmp.json() as { employee: { id: string } }).employee.id;
      assert.ok(employeeId, createEmp.body);

      const personEmp = await app.inject({
        method: "POST",
        url: "/v1/tenant/workforce/employees",
        ...authHeader(tenant.accessToken),
        ...jsonBody({
          firstName: "Human",
          lastName: "Person",
          employeeKind: "person"
        })
      });
      assert.equal(personEmp.statusCode, 201, personEmp.body);
      const personId = (personEmp.json() as { employee: { id: string } }).employee.id;
      assert.ok(personId);

      const personImap = await app.inject({
        method: "POST",
        url: `/v1/tenant/mailbox/agents/${personId}/accounts/imap`,
        ...authHeader(tenant.accessToken),
        ...jsonBody({
          emailAddress: `person@${tenant.domain}`,
          imapHost: "imap.example.com",
          smtpHost: "smtp.example.com",
          username: `person@${tenant.domain}`,
          password: "app-password"
        })
      });
      assert.equal(personImap.statusCode, 404, personImap.body);

      const connect = await app.inject({
        method: "POST",
        url: `/v1/tenant/mailbox/agents/${employeeId}/accounts/imap`,
        ...authHeader(tenant.accessToken),
        ...jsonBody({
          emailAddress: `agent@${tenant.domain}`,
          imapHost: "imap.example.com",
          smtpHost: "smtp.example.com",
          username: `agent@${tenant.domain}`,
          password: "app-password"
        })
      });
      assert.equal(connect.statusCode, 201, connect.body);

      const agentList = await app.inject({
        method: "GET",
        url: `/v1/tenant/mailbox/agents/${employeeId}/accounts`,
        ...authHeader(tenant.accessToken)
      });
      assert.equal(agentList.statusCode, 200, agentList.body);
      const agentJson = agentList.json() as {
        inbox: { ownerScope: string; ownerEmployeeId: string } | null;
        connections: { emailAddress: string; provider: string }[];
      };
      assert.equal(agentJson.inbox?.ownerScope, "workforce_agent");
      assert.equal(agentJson.inbox?.ownerEmployeeId, employeeId);
      assert.ok(agentJson.connections.some((c) => c.provider === "imap"));
      assert.ok(agentJson.connections.some((c) => c.provider === "internal"));

      const overview = await app.inject({
        method: "GET",
        url: "/v1/tenant/mailbox/accounts",
        ...authHeader(tenant.accessToken)
      });
      assert.equal(overview.statusCode, 200, overview.body);
      const accounts = (overview.json() as {
        accounts: { ownerScope?: string; ownerEmployeeId?: string | null; connections: { emailAddress: string }[] }[];
      }).accounts;
      const agentInbox = accounts.find((a) => a.ownerScope === "workforce_agent" && a.ownerEmployeeId === employeeId);
      assert.ok(agentInbox, "expected agent inbox in mailbox overview");
    } finally {
      await app.close();
    }
  });
});
