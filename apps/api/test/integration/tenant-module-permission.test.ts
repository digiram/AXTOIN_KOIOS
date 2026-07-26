/**
 * Integration tests for per-user optional module permissions.
 *
 * Requires database; gated by `RUN_INTEGRATION_TESTS`.
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

import argon2 from "argon2";

import { insertUser, setUserModuleRole } from "@starter/db";

import {
  authHeader,
  canRunIntegrationTests,
  createIntegrationApp,
  ensureIntegrationMigrations,
  jsonBody
} from "./helpers.js";
import {
  enablePlatformModules,
  loginViaApi,
  todayIsoDate
} from "./integration-api-helpers.js";
import { registerTenantAdmin } from "./integration-tenant.js";
import { cleanupTestTenants } from "./test-tenant-cleanup.js";

const describeIntegration = (await canRunIntegrationTests()) ? describe : describe.skip;

describeIntegration("integration: tenant module permissions", () => {
  const adminPassword = "Password123!";
  const memberPassword = "MemberPass123!";
  let tenantId: string | undefined;

  before(async () => {
    await ensureIntegrationMigrations();
    await enablePlatformModules({ invoicingEnabled: true, selfRegisterEnabled: true });
  });

  after(async () => {
    await cleanupTestTenants(tenantId);
  });

  it("returns 403 when invoicing viewer attempts to create a quote", async () => {
    const app = await createIntegrationApp();
    try {
      const domain = `mod-${randomUUID().slice(0, 8)}.corp.test`;
      const admin = await registerTenantAdmin(app, domain, adminPassword);
      tenantId = admin.tenantId;

      const memberEmail = `viewer@${domain}`;
      const member = await insertUser({
        tenantId: admin.tenantId,
        email: memberEmail,
        passwordHash: await argon2.hash(memberPassword),
        displayName: "Invoicing Viewer",
        role: "tenant_user"
      });
      await setUserModuleRole({
        tenantId: admin.tenantId,
        userId: member.id,
        module: "invoicing",
        role: "viewer"
      });

      const viewerToken = await loginViaApi(app, memberEmail, memberPassword);

      const readRes = await app.inject({
        method: "GET",
        url: "/v1/tenant/invoicing/documents",
        ...authHeader(viewerToken)
      });
      assert.equal(readRes.statusCode, 200, readRes.body);

      const writeRes = await app.inject({
        method: "POST",
        url: "/v1/tenant/invoicing/quotes",
        ...authHeader(viewerToken),
        ...jsonBody({
          currencyCode: "USD",
          documentDate: todayIsoDate(),
          lineItems: [
            {
              description: "Should be forbidden",
              quantity: 1,
              unitLabel: "unit",
              unitPriceMinor: 1000,
              taxRateBps: 0
            }
          ]
        })
      });
      assert.equal(writeRes.statusCode, 403, writeRes.body);
      const body = writeRes.json() as { error: string; message: string };
      assert.equal(body.error, "forbidden");
      assert.match(body.message, /read-only/i);
    } finally {
      await app.close();
    }
  });
});
