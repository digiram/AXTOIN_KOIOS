# AI / developer onboarding guide

Short, canonical pointers so agents and humans land in the right place without loading the whole tree.

**Start here for agents:** [`../AGENTS.md`](../AGENTS.md)

## Golden paths

| Task | Start here | Then |
|------|------------|------|
| Add an HTTP route | `apps/api/src/routes/` — pick the closest module; register in **`apps/api/src/app-routes.ts`** (mounted as `/v1/*` from `app.ts`) | Validate with Zod from `@starter/shared`; call `@starter/db` repos; keep handlers thin |
| Add optional tenant module | See [`company-subscriptions-module.md`](../company-subscriptions-module.md) or [`sales-funnel-module.md`](../sales-funnel-module.md) | Platform flag → schema/repos → `TENANT_MODULE_KEYS` → API routes → `*ModuleGate` → `AdminLayout` nav → module doc |
| Add a DB table + migration | `packages/db/src/pg-schema.ts` and `mysql-schema.ts` (keep in sync) | SQL under `packages/db/drizzle/{pg,mysql}/` + both `_journal.json`; `pnpm db:migrate` |
| Add a shared contract | `packages/shared/` — Zod first, export types via `z.infer` | Import from API + web + mobile |
| Change auth behavior | `apps/api/src/routes/auth.ts`, `apps/api/src/plugins/tenant*.ts`, `issue-tokens.ts` | Access JWTs must include `typ: "access"`; MFA tickets are `typ: "mfa_step"` only |
| CRM / geocode | `tenant-crm.ts`, `tenant-crm-geocode.ts`, `packages/db/src/crm-repos*.ts` | Egress: `nominatim-geocode.ts` + allowlisted base URL |
| Company subscriptions | [`company-subscriptions-module.md`](../company-subscriptions-module.md), `tenant-company-subscriptions.ts` | Vendor registry — not realm billing (`tenant-subscriptions.ts`) |
| Product AI / LLM (future) | [`ai-harness-checklist.md`](ai-harness-checklist.md) | §1.1 approval first; no runtime AI or Cursor API in app today |
| OpenAPI sync | `pnpm --filter @starter/api openapi:sync` | Updates `apps/api/openapi/openapi.json` |

## Invariants (do not break silently)

1. **Tenant scope** — Realm routes must use `request.tenantId` from JWT + repos that filter by `tenant_id`. Never trust client-supplied tenant ids for authorization.
2. **Secrets** — Production requires strong `JWT_ACCESS_SECRET`; CORS requires explicit `CORS_ORIGINS` for browser access. See [`environment.md`](environment.md).
3. **Queues** — BullMQ queue names must match between `apps/api` and `apps/worker`; no `:` in names.
4. **Dual dialect** — Postgres and MySQL migrations both exist under `packages/db/drizzle/`.
5. **Access vs MFA JWT** — `requireTenantContext` rejects tokens where `typ !== "access"`.
6. **Lean response headers / Hostinger CSP** — On Hostinger production, **never** send `Content-Security-Policy` as an HTTP header from Node (503 risk). Default: meta-only CSP in the web HTML shell (`packages/shared/src/content-security-policy.ts`, `apps/web/src/document/RootDocumentHead.tsx`). Opt out with `CSP_IN_META=off` on other hosts. Keep other response headers small; budget guard: `response-header-budget.ts` + CI test.

## Anti-patterns

- User-controlled strings into `sql.raw()` or string-concatenated SQL.
- Returning generated passwords in JSON in production (admin reset: **`admin-password-reset-flow.ts`** + `buildAdminPasswordResetResponse` for emergency plain JSON only).
- Registering a super-admin screen without router + sidebar (see `.cursor/rules/integration-regression-guards.mdc`).
- Duplicating page titles under `AppShell` (layout meta carries title/subtitle).
- Bloating response headers — reinstating helmet's verbose default CSP, sending **`Content-Security-Policy` HTTP headers on Hostinger production** (use meta-only CSP instead), or piling on custom/`set-cookie` headers.

## Security & testing

- PR checklist: [`contributing-security.md`](contributing-security.md)
- Full hardening guide: [`security.md`](security.md)
- Tests: [`testing.md`](testing.md) — `pnpm verify`, integration (`RUN_INTEGRATION_TESTS=1`), E2E (`pnpm test:e2e`)

## Deferred / product decisions

- **Refresh token in `httpOnly` cookies** — Improves XSS resilience but requires a deliberate policy for **cross-origin** SPAs (cookie `Domain`, `SameSite=None` + `Secure`, `credentials: 'include'`, and CSRF for cookie-backed POSTs). See [`security.md`](security.md). The web app currently stores refresh in `sessionStorage` by design until that policy is chosen.
