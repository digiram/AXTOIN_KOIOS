/**
 * Playwright E2E specs for optional module gates and happy paths.
 *
 * Asserts platform-off messaging when invoicing is disabled and verifies invoicing
 * and mailbox seeded data appears in tenant admin UI after API setup.
 *
 * Depends on:
 * - `./helpers.js` for module toggles and seed data, `./db-cleanup.js` for teardown
 */

import { expect, test } from "@playwright/test";

import { deleteE2eTestTenant } from "./db-cleanup.js";
import {
  E2E_TENANT_PASSWORD,
  enableE2eTenantModules,
  loginSuperAdminViaApi,
  loginTenantViaApi,
  registerTenantViaApi,
  seedInvoicingOfferViaApi,
  seedSharedMailboxViaApi,
  setPlatformModulesViaApi,
  tenantLoginAndGo
} from "./helpers.js";

test.describe("module gates", () => {
  test.describe.configure({ mode: "serial" });

  test("tenant admin sees platform-off message when invoicing is disabled", async ({ page }) => {
    await enableE2eTenantModules();
    const domain = `e2e-gate-${Date.now()}.corp.test`;
    const { email, tenantId } = await registerTenantViaApi(domain);
    const superToken = await loginSuperAdminViaApi();

    await setPlatformModulesViaApi(superToken, { invoicingEnabled: false });

    try {
      await tenantLoginAndGo(page, email, E2E_TENANT_PASSWORD);
      await page.goto("/admin/invoicing");
      await expect(page.getByRole("heading", { name: /invoicing & quoting is turned off/i })).toBeVisible({
        timeout: 30_000
      });
    } finally {
      await deleteE2eTestTenant(tenantId);
      await setPlatformModulesViaApi(superToken, {
        invoicingEnabled: true,
        crmEnabled: true,
        mailboxEnabled: true,
        selfRegisterEnabled: true
      });
    }
  });
});

test.describe("optional module happy paths", () => {
  test.beforeAll(async () => {
    await enableE2eTenantModules();
  });

  test("tenant admin sees promoted offer on invoicing hub", async ({ page }) => {
    const domain = `e2e-inv-${Date.now()}.corp.test`;
    const { email, tenantId } = await registerTenantViaApi(domain);
    const accessToken = await loginTenantViaApi(email, E2E_TENANT_PASSWORD);
    const seeded = await seedInvoicingOfferViaApi(accessToken);

    try {
      await tenantLoginAndGo(page, email, E2E_TENANT_PASSWORD);
      await page.goto("/admin/invoicing");
      await expect(page.getByRole("link", { name: /new quote/i })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(seeded.customerName)).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(seeded.displayDocumentNumber)).toBeVisible();
    } finally {
      await deleteE2eTestTenant(tenantId);
    }
  });

  test("tenant admin sees shared mailbox on accounts settings", async ({ page }) => {
    const domain = `e2e-mail-${Date.now()}.corp.test`;
    const { email, tenantId } = await registerTenantViaApi(domain);
    const accessToken = await loginTenantViaApi(email, E2E_TENANT_PASSWORD);
    const mailbox = await seedSharedMailboxViaApi(accessToken, domain, "E2E Shared Inbox");

    try {
      await tenantLoginAndGo(page, email, E2E_TENANT_PASSWORD);
      await page.goto("/admin/mailbox/accounts");
      await expect(page.getByRole("heading", { name: /connected accounts/i })).toBeVisible({
        timeout: 30_000
      });
      await expect(page.getByText(mailbox.displayName)).toBeVisible();
      await expect(page.getByText(mailbox.emailAddress)).toBeVisible();
    } finally {
      await deleteE2eTestTenant(tenantId);
    }
  });
});
