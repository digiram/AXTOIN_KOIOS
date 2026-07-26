/**
 * Playwright E2E test runner configuration.
 *
 * Starts API and web dev servers for browser tests under `e2e/`, with CI-aware
 * retries, parallelism, and fixture env for super-admin bootstrap.
 *
 * Responsibilities:
 * - Point tests at `http://127.0.0.1:${PLAYWRIGHT_WEB_PORT}` (default 5173)
 * - Boot API on `PLAYWRIGHT_API_PORT` (default 3500) with migrations and E2E creds
 * - Proxy web to API via shared `API_PORT` env on the Vite dev server
 *
 * Environment:
 * - `PLAYWRIGHT_WEB_PORT`, `PLAYWRIGHT_API_PORT` — override default ports
 * - `E2E_SUPER_ADMIN_EMAIL`, `E2E_SUPER_ADMIN_PASSWORD` — super-admin login fixtures
 * - `CI` — enables `forbidOnly`, retries, GitHub reporter, single worker
 *
 * Related:
 * - [`docs/guidelines/testing.md`](docs/guidelines/testing.md)
 */

import { defineConfig, devices } from "@playwright/test";

const webPort = process.env.PLAYWRIGHT_WEB_PORT ?? "5173";
const apiPort = process.env.PLAYWRIGHT_API_PORT ?? "3500";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    trace: "on-first-retry"
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm --filter @starter/api dev",
      url: `http://127.0.0.1:${apiPort}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        NODE_ENV: "development",
        API_PORT: apiPort,
        AUTO_MIGRATE: "force",
        BOOTSTRAP_SUPER_ADMIN_EMAIL: process.env.E2E_SUPER_ADMIN_EMAIL ?? "e2e-superadmin",
        BOOTSTRAP_SUPER_ADMIN_PASSWORD: process.env.E2E_SUPER_ADMIN_PASSWORD ?? "E2eSuperAdmin123!",
        DEV_ONLY_REGISTRATION_EXPOSE_VERIFICATION_CODE: "true"
      }
    },
    {
      command: "pnpm --filter @starter/web dev",
      url: `http://127.0.0.1:${webPort}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        API_PORT: apiPort
      }
    }
  ]
});
