# Agent guide (coding assistants)

Read this file first when working in this repository. It points to canonical docs and invariants so you do not have to infer structure from the tree alone.

## Coding assistants vs product AI

| Layer | Purpose | Where |
|-------|---------|--------|
| **IDE development** (this file, Cursor rules) | How assistants help you **build** the app safely | `AGENTS.md`, `.cursor/rules/`, `docs/guidelines/prompt-principles.md` |
| **Product AI** (future) | In-app LLM features for **tenants** — **not shipped today** | [`ai-harness-checklist.md`](docs/guidelines/ai-harness-checklist.md) when approved |

**Do not** expose the Cursor API or other LLM provider SDKs through tenant HTTP routes unless you explicitly approve product AI per §1.1.

## Read order

| Order | Document | Why |
|-------|----------|-----|
| 0 | [`docs/guidelines/README.md`](docs/guidelines/README.md) | Guidelines hub — what is continuous guidance vs module requirement tracking |
| 1 | [`docs/guidelines/ai-dev-guide.md`](docs/guidelines/ai-dev-guide.md) | Golden paths, invariants, anti-patterns |
| 2 | [`docs/guidelines/prompt-principles.md`](docs/guidelines/prompt-principles.md) | When to ask before building (§1.1 structural, §2 requirements) |
| 3 | [`docs/guidelines/modules-index.md`](docs/guidelines/modules-index.md) | URL prefix → route file → repo file |
| 4 | [`docs/guidelines/glossary.md`](docs/guidelines/glossary.md) | Canonical terms (tenant, realm, module keys) |
| 5 | [`docs/guidelines/security.md`](docs/guidelines/security.md) + [`docs/guidelines/contributing-security.md`](docs/guidelines/contributing-security.md) | Hardening checklist |
| 6 | [`docs/guidelines/testing.md`](docs/guidelines/testing.md) | `pnpm verify`, integration tests, E2E |
| 7 | [`.cursor/rules/`](.cursor/rules/) | Always-on and web UI rules (Cursor loads these automatically) |
| 8 | [`docs/guidelines/source-documentation.md`](docs/guidelines/source-documentation.md) | In-code file headers and TSDoc on exports |

**Continuous guidelines** live under **`docs/guidelines/`**. **Feature requirement tracking** (recorded product decisions, delivery scope) lives in **`docs/*-module.md`** — read those only when working on that module:

- [`docs/sales-funnel-module.md`](docs/sales-funnel-module.md)
- [`docs/company-subscriptions-module.md`](docs/company-subscriptions-module.md)
- [`docs/invoicing-quoting-module.md`](docs/invoicing-quoting-module.md)
- [`docs/mailbox-module.md`](docs/mailbox-module.md)

Browser hub (operators + developers): [`docs/index.html`](docs/index.html)

## Repository map

```
apps/
  api/       Fastify HTTP API — routes in src/routes/, register in src/app-routes.ts
  web/       Vite + React SPA — tenant admin /admin, super-admin /super-admin
  worker/    BullMQ consumer (email queue; extend for billing jobs)
  mobile/    Expo (optional)
packages/
  shared/    Zod schemas + types (single source of truth for HTTP contracts)
  db/        Drizzle schema, migrations (pg + mysql), repositories
  crypto/    Field encryption helpers
  logger/    Pino factory
```

**API versioning:** HTTP handlers mount under `/v1` from `apps/api/src/app.ts` via `registerApplicationRoutes` in `apps/api/src/app-routes.ts` (not `index.ts`).

## Golden paths (short)

| Task | Where |
|------|--------|
| New tenant HTTP surface | `apps/api/src/routes/tenant-*.ts` → register in `app-routes.ts` under `/tenant` |
| New optional module | Platform flag → repos → `@starter/shared` → `TENANT_MODULE_KEYS` → `*ModuleGate` + nav → `docs/*-module.md` (requirement doc) |
| New table | `packages/db/src/pg-schema.ts` + `mysql-schema.ts` → SQL in `packages/db/drizzle/{pg,mysql}/` → both `_journal.json` → repos → `pnpm db:migrate` |
| Shared request body | Zod in `packages/shared/src/` → export from `index.ts` → use in route + web |
| Product AI / LLM (future) | [`ai-harness-checklist.md`](docs/guidelines/ai-harness-checklist.md) + §1.1 approval — no runtime AI shipped today |
| OpenAPI artifact | `pnpm --filter @starter/api openapi:sync` after route/schema changes |
| Hostinger deploy (3 slots) | Same repo/branch; root `build:api` / `build:web` / `build:worker` + `start:api` / `start:worker`; see [`docs/runbooks/deploy.md`](docs/runbooks/deploy.md) |

## Non-negotiable invariants

1. **Tenant scope** — Realm data queries filter by `tenant_id` from JWT (`request.tenantId`). Never authorize from client-supplied tenant ids.
2. **Nav shell consistency** — New primary screens need route + sidebar + shell meta (see `.cursor/rules/integration-regression-guards.mdc`).
3. **Dual dialect** — Postgres and MySQL migrations stay in sync.
4. **Module permissions** — Optional modules use `tenant_user_module_roles` + `require*ModulePermission` hooks.
5. **Test fixture cleanup** — Integration/E2E tenants use disposable domains; tear down via `test-tenant-cleanup.ts` / `pnpm db:purge-test-fixtures`.
6. **Lean response headers / Hostinger CSP** — On Hostinger production, **never** send `Content-Security-Policy` as an HTTP header from Node (LiteSpeed can 503). Default: meta-only CSP via the web HTML shell (`packages/shared/src/content-security-policy.ts`). Opt out with `CSP_IN_META=off`. Keep headers lean; budget guard in `response-header-budget.ts` + CI test. Do **not** restore helmet's verbose default CSP or add CSP HTTP headers on Hostinger.

## Verification before handoff

```bash
pnpm verify          # typecheck + build:packages + test (all packages)
pnpm db:migrate      # after schema changes
pnpm test:e2e        # optional; Playwright (see docs/guidelines/testing.md)
pnpm lint:tests      # ESLint on test + E2E sources (CI gate)
pnpm lint:src        # ESLint on app/package source (51 legacy violations remain)
```

## Naming traps

| Term in UI/docs | Means | Not |
|-----------------|-------|-----|
| **Realm subscription** / billing | Platform bills the tenant (`subscriptions`, Stripe) | Company vendor subscriptions |
| **Company subscriptions** | Vendor/SaaS registry module (`company_subscription_*`) | Stripe / PSP billing |

See [`docs/guidelines/glossary.md`](docs/guidelines/glossary.md).
