/**
 * Core Playwright E2E flows (tenant CRM and super-admin smoke paths).
 *
 * Exercises registration via API helpers, tenant admin CRM create, super-admin job
 * queues UI, and unauthenticated route guards. Tenants are deleted in `finally` blocks.
 *
 * Depends on:
 * - `./helpers.js` for API seeding, `./db-cleanup.js` for fixture teardown
 */

import { expect, test } from "@playwright/test";

import {
  E2E_SUPER_ADMIN_EMAIL,
  E2E_SUPER_ADMIN_PASSWORD,
  E2E_TENANT_PASSWORD,
  registerTenantViaApi
} from "./helpers.js";
import { deleteE2eTestTenant } from "./db-cleanup.js";

test.describe("E2E flows (3C)", () => {
  test("tenant admin: login, create CRM organization, sees it in list", async ({ page }) => {
    const domain = `e2e-${Date.now()}.corp.test`;
    const { email, tenantId } = await registerTenantViaApi(domain);
    const orgName = `E2E Org ${Date.now()}`;

    try {
      await page.goto("/login");
      await page.getByLabel(/email or username/i).fill(email);
      await page.getByLabel(/^password$/i).fill(E2E_TENANT_PASSWORD);
      await page.getByRole("button", { name: /^sign in$/i }).click();

      await expect(page).toHaveURL(/\/admin/, { timeout: 30_000 });

      await page.goto("/admin/crm/organizations");
      await expect(page.getByRole("button", { name: /add organization/i })).toBeVisible({ timeout: 30_000 });

      await page.getByRole("button", { name: /add organization/i }).click();
      await expect(page.getByRole("heading", { name: /add organization/i })).toBeVisible();

      await page.locator("#crm-modal-org-name").fill(orgName);
      await page.getByRole("button", { name: /save organization/i }).click();

      await expect(page).toHaveURL(/\/admin\/crm\/organizations\/[0-9a-f-]{36}$/i, { timeout: 30_000 });
      await expect(page.getByText(orgName)).toBeVisible();
    } finally {
      await deleteE2eTestTenant(tenantId);
    }
  });

  test("super admin: login and open job queues", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email or username/i).fill(E2E_SUPER_ADMIN_EMAIL);
    await page.getByLabel(/^password$/i).fill(E2E_SUPER_ADMIN_PASSWORD);
    await page.getByRole("button", { name: /^sign in$/i }).click();

    await expect(page).toHaveURL(/\/super-admin/, { timeout: 30_000 });

    await page.goto("/super-admin/jobs");
    await expect(page.getByText(/queue/i).first()).toBeVisible({ timeout: 30_000 });
  });
});

test.describe("smoke", () => {
  test("login page renders", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /sign in to your workspace/i })).toBeVisible();
  });

  test("signup page renders", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: /create your account/i })).toBeVisible();
  });

  test("unauthenticated user cannot open super-admin", async ({ page }) => {
    await page.goto("/super-admin");
    await expect(page).toHaveURL(/\/login/);
  });
});
