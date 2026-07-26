/**
 * Integration tests for auth registration and login (`/v1/auth/*`).
 *
 * Requires database; gated by `RUN_INTEGRATION_TESTS`.
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

import { cleanupTestTenants } from "./test-tenant-cleanup.js";

import {
  authHeader,
  canRunIntegrationTests,
  createIntegrationApp,
  ensureIntegrationMigrations,
  jsonBody
} from "./helpers.js";
import { ensureSelfRegistrationOpen, registerUserViaApi } from "./registration-helpers.js";

const describeIntegration = (await canRunIntegrationTests()) ? describe : describe.skip;

describeIntegration("integration: auth", () => {
  const domain = `int-${randomUUID().slice(0, 8)}.test`;
  const email = `admin@${domain}`;
  const password = "Password123!";
  let tenantId: string | undefined;

  before(async () => {
    await ensureIntegrationMigrations();
  });

  after(async () => {
    await cleanupTestTenants(tenantId);
  });

  it("register, login, and refresh rotation", async () => {
    const app = await createIntegrationApp();
    await ensureSelfRegistrationOpen();

    const reg = await registerUserViaApi(app, { name: "Integration Admin", email, password });
    assert.ok(reg.accessToken);
    assert.ok(reg.refreshToken);
    assert.ok(reg.tenantId);
    tenantId = reg.tenantId;

    const refresh1 = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      ...jsonBody({ refreshToken: reg.refreshToken })
    });
    assert.equal(refresh1.statusCode, 200, refresh1.body);
    const ref = refresh1.json() as { accessToken: string; refreshToken: string };
    assert.notEqual(ref.refreshToken, reg.refreshToken);

    const stale = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      ...jsonBody({ refreshToken: reg.refreshToken })
    });
    assert.equal(stale.statusCode, 401);

    const crmAvailability = await app.inject({
      method: "GET",
      url: "/v1/tenant/crm/availability",
      ...authHeader(ref.accessToken)
    });
    assert.equal(crmAvailability.statusCode, 200, crmAvailability.body);

    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      ...jsonBody({ email, password })
    });
    assert.equal(login.statusCode, 200, login.body);

    await app.close();
  });
});
