# Security checklist for contributors

Use this before opening a PR that touches auth, tenant data, uploads, or new HTTP surfaces. Full detail: [`security.md`](security.md).

## New tenant-scoped feature

- [ ] Every query filters by `tenant_id` from JWT context (repos take `tenantId` as first arg).
- [ ] Cross-tenant ID by UUID returns **404** (not 403) where applicable.
- [ ] Zod schemas use `.strict()` — no unvalidated body fields.
- [ ] Module routes use `requireTenantContext` → `requireTenantRealm` → `requireTenantMember` (+ module permission if optional module).
- [ ] Integration test proves isolation or uses fixture cleanup (`apps/api/test/integration/test-tenant-cleanup.ts`).

## New public or authenticated route

- [ ] Rate limit appropriate bucket (`/auth/*`, `/tenant/*`, or global).
- [ ] No secrets, stack traces, or internal errors in JSON responses.
- [ ] Super-admin-only routes use `requireSuperAdmin`.

## File uploads

- [ ] Storage path validated (`apps/api/src/lib/blob-paths.ts`) and registered in blob backends (`local-fs-storage.ts`, `s3-storage.ts`).
- [ ] Size limits aligned with `@fastify/multipart` global cap in `apps/api/src/app.ts`.
- [ ] Download requires auth + tenant scope; `Content-Disposition: attachment` for documents.

## Auth / sessions

- [ ] Access JWTs use `typ: "access"`; never accept `mfa_step` tickets on protected routes.
- [ ] Password change or role revocation bumps `access_token_version` and revokes refresh tokens when applicable.

## Secrets & production

- [ ] No credentials in source, logs, or fixtures committed to git.
- [ ] Production relies on `production-boot-guards.ts` (`JWT_ACCESS_SECRET`, `FIELD_ENCRYPTION_KEY`, etc.) — see [`runbooks/production-checklist.md`](../runbooks/production-checklist.md).

## Known hardening backlog

See **Open security items** in [`security.md`](security.md).
