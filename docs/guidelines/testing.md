# Testing and TDD

This repo uses **automated tests** at multiple layers: pure domain helpers (`packages/shared`, `packages/crypto`), infrastructure helpers (`packages/db`, `packages/logger`), HTTP-adjacent utilities (`apps/api`), **Vitest** for the Vite web app, and **Node’s built-in test runner** (`node:test`) everywhere else.

## Commands (from repository root)

| Command | Purpose |
|---------|---------|
| `pnpm test` | Runs **`pnpm -r test`** — every workspace package that defines a `test` script. |
| `pnpm test:watch` | **Web only:** Vitest watch (`pnpm --filter @starter/web test:watch`) while editing UI or contracts. |
| `pnpm typecheck` | TypeScript **`tsc --noEmit`** across packages (fast static gate). |
| `pnpm build:packages` | Compile workspace `packages/*` to `dist/` (required before tests resolve `@starter/db` et al.). |
| `pnpm verify` | **`typecheck` → `build:packages` → `test`** — recommended before a PR or release. |
| `pnpm build:ci` | **`verify` then `pnpm --filter ./apps/* build`** — CI-style pipeline. |
| `pnpm build` | Production builds only (does **not** run tests; use `build:ci` when you need the full gate). |

Per-package examples: `pnpm --filter @starter/shared test`, `pnpm --filter @starter/api test`.

## Test-driven development (TDD) strategy

Use TDD when behavior is **deterministic**, **easy to specify**, and **cheap to run** — validation rules, parsers, hashing, queue naming contracts, and repository logic behind small seams.

1. **Red** — Write a failing test that expresses the desired behavior (or bug). Prefer examples from real domains (`packages/shared` Zod shapes, `extractEmailDomain`, token hashing).
2. **Green** — Implement the smallest change that satisfies the test. Keep logic in **`packages/*`** or focused modules under **`apps/api/src/lib`** so Fastify routes stay thin.
3. **Refactor** — Improve names and structure with tests still green. Update **[`glossary.md`](glossary.md)** or route comments if ubiquitous language shifts.

**When to write the test first**

- New pure functions or schema constraints in **`@starter/shared`** (single source of truth for HTTP contracts).
- Security-sensitive helpers (e.g. **`hashRefreshToken`** in `apps/api`).
- Regressions: always add a test that would have failed before the fix.
- **Database schema vs SQL migrations:** when you add or rename a Drizzle column, ship matching SQL under `packages/db/drizzle/{pg,mysql}/` and update both `_journal.json` files. **`packages/db/test/crm-activities-schema-alignment.test.ts`** checks CRM activity tables, migration `0011`, and journals stay aligned — run **`pnpm verify`** before handing off CRM DB changes.

**When not to insist on strict TDD**

- One-off UI polish with no new logic.
- Exploratory spikes — but **before merge**, add tests for behavior you keep, or delete the spike.

**Integration / E2E**

- API integration tests (`apps/api/test/integration/*`) register tenants with `*.corp.test` / `int-*.test` domains and **delete them in `after` hooks** when `RUN_INTEGRATION_TESTS=1`.
- Playwright E2E registers `e2e-*.corp.test` tenants and removes them in a `finally` block.
- Orphaned fixture users in a dev DB: **`pnpm db:purge-test-fixtures`** (matches tenant names like `%.corp.test`, `int-%.test`, `bill-%`, `e2e-%.corp.test`).

## End-to-end (Playwright)

From repository root (API + web must be reachable — `pnpm dev:all` or Playwright `webServer` config):

| Command | Purpose |
|---------|---------|
| `pnpm test:e2e:install` | Install Chromium for Playwright |
| `pnpm test:e2e` | Run `e2e/*.spec.ts` |

E2E registers disposable tenants (`e2e-*.corp.test`) and removes them in test teardown (`e2e/db-cleanup.ts`). Super-admin bootstrap uses `E2E_SUPER_ADMIN_EMAIL` / `E2E_SUPER_ADMIN_PASSWORD` (see `e2e/helpers.ts`, `playwright.config.ts`).

## OpenAPI

After changing route contracts: `pnpm --filter @starter/api openapi:sync` — updates committed `apps/api/openapi/openapi.json`.

## Where tests live

| Area | Runner | Typical location |
|------|--------|------------------|
| `packages/shared`, `packages/db`, `packages/logger`, `packages/crypto` | `node:test` + **tsx** import | `test/**/*.test.ts` at package root |
| `apps/api`, `apps/worker`, `apps/mobile` | `node:test` + **tsx** | `test/**/*.test.ts` |
| `apps/web` | **Vitest** | `src/**/*.test.ts` (co-located near modules) |

**TypeScript on Node tests:** scripts use `node --test --import tsx` so `.ts` files run without a separate compile step. **`apps/web`** uses **Vitest** so `import.meta` and Vite-style aliases match the dev server.

## CI and pre-push

- Prefer **`pnpm verify`** on every PR (or **`pnpm build:ci`** before tagging releases).
- Keep tests **fast** and **hermetic** where possible (no real Redis/DB in unit tests; use fakes or env toggles for integration suites).

## See also

- **[best-practices.md](best-practices.md)** — contracts, validation layering (tests reinforce server-first validation).
- **[architecture.md](architecture.md)** — where domain logic should live so it stays testable.
- **[security.md](security.md)** — what must never appear in logs or fixtures.
