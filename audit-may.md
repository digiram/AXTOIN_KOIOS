# Repository audit — May 2026

Structured audit covering security, performance, and AI/codebase ergonomics. Evidence from targeted inspection of the API entrypoint, auth/CORS/JWT, Stripe webhooks, geocoding, tenant plugins, web token storage, migration policy, and large modules—not an exhaustive line-by-line review of every file.

**Remediation note:** Items in the original severity tables below that are **addressed in repo** are called out inline; see **section 4** for the implementation trail.

---

## 1. Security findings (by severity)

### Critical

| Item | Location | Status |
|------|----------|--------|
| Missing `JWT_ACCESS_SECRET` falls back to fixed dev secret | `apps/api/src/lib/jwt-secret.ts` + `index.ts` | **Addressed** — production requires ≥32 char secret; boot fails otherwise |

### High

| Item | Location | Status |
|------|----------|--------|
| CORS reflects origin when `CORS_ORIGINS` unset in production | `apps/api/src/lib/cors-config.ts` | **Addressed** — production uses `origin: false` when unset |
| Admin password reset returns plaintext temp password | `platform.ts`, `tenant.ts` + web modals | **Addressed** — production omits `temporaryPassword` unless `ADMIN_PASSWORD_RESET_RETURN_PLAIN=true` |

### Medium

| Item | Location | Status |
|------|----------|--------|
| Global rate limit only; auth not specially throttled | `apps/api/src/index.ts` | **Addressed** — `/auth` child scope 40 req / 15 min per IP |
| `/webhooks/*` unlimited vs global | `apps/api/src/index.ts` | **Addressed** — dynamic `max` 8000/min for `/webhooks/*`; Stripe route `bodyLimit` 256 KiB |
| Configurable Nominatim base URL → SSRF | `nominatim-base-url.ts` + `nominatim-geocode.ts` | **Addressed** — HTTPS (or localhost http), private host block, `NOMINATIM_ALLOWED_HOSTS` |
| JWT role trusted until expiry | `apps/api/src/plugins/tenant.ts` | Open — token version / re-fetch on sensitive routes (future) |

### Low

| Item | Location | Status |
|------|----------|--------|
| `MFA_OTP_PEPPER` fallback | `auth.ts` | Open |
| Refresh + access in `sessionStorage` | `AuthContext.tsx` | **Deferred** — httpOnly needs cookie/CORS/CSRF product policy (see `docs/security.md`, `docs/ai-dev-guide.md`) |
| `AUTO_MIGRATE` in production | `migrate.ts` | Open (operational) |
| Dependency hygiene | workspace | **Partial** — `pnpm audit` run; Drizzle ORM bumped to ^0.45.2 (GHSA); 3 moderate transitive (see snapshot) |

---

## 2. Performance findings (by impact)

| Impact | Item | Location | Suggestion |
|--------|------|----------|------------|
| High | Very large `crm-repos.ts` | `packages/db/src/crm-repos.ts` | **Partial** — extracted `crm-repos-query-helpers.ts`; further split by domain still recommended |
| Medium | Nominatim cold-cache / upstream | `nominatim-geocode.ts` | Single-flight; debounce client |
| Medium | Geocode concurrent load | `tenant-crm.ts` | Per-tenant rate limits |
| Low | Lazy Redis singleton in geocode | `nominatim-geocode.ts` | Central Redis factory |
| Low | Web bundle size | `apps/web` | Route-level split; lazy Stripe on billing pages |

---

## 3. AI / structural improvements

| Category | Recommendation | Status |
|----------|------------------|--------|
| Token efficiency | Split `crm-repos.ts` further | Partial (helpers extracted) |
| Structure | Split dense route files (`tenant-crm`, `auth`) | Open |
| Documentation | `docs/ai-dev-guide.md`, `docs/modules-index.md` | **Done** |
| Documentation | `docs/data-flow.md` | Open (optional) |
| Navigation | `apps/api/src/routes/README.md` | Open |

---

## 4. Priority fix list (top 10) — **progress**

| # | Item | Status |
|---|------|--------|
| 1 | Fail boot if production lacks `JWT_ACCESS_SECRET` | **Completed** |
| 2 | Default CORS deny in production; require explicit `CORS_ORIGINS` | **Completed** |
| 3 | Tight per-route rate limits on `/auth/*` | **Completed** |
| 4 | Re-rate-limit `/webhooks/*` + body size limits | **Completed** |
| 5 | Validate / allowlist Nominatim base URL | **Completed** |
| 6 | Remove plaintext `temporaryPassword` in production | **Completed** (override env documented) |
| 7 | Split `crm-repos.ts` | **Partial** (`crm-repos-query-helpers.ts`) |
| 8 | Add `docs/ai-dev-guide.md` + `docs/modules-index.md` | **Completed** |
| 9 | httpOnly refresh cookie (+ CSRF) | **Deferred** — requires deployment/cookie policy decisions |
| 10 | `pnpm audit` + upgrade policy | **Completed** (see snapshot; root script `pnpm audit`) |

### Detailed progress table

| # | Description | Status | Notes |
|---|-------------|--------|-------|
| 1 | JWT production secret | Completed | `jwt-secret.ts`, tests, docs |
| 2 | CORS production default | Completed | `cors-config.ts`, tests, docs |
| 3 | Auth rate limits | Completed | Encapsulated `/auth` + `rateLimit` 40 / 15 min (`nameSpace: auth-public`) |
| 4 | Webhook limits | Completed | Global `max` function: 8000/min for `/webhooks/*`; `bodyLimit` on Stripe POST |
| 5 | Nominatim SSRF guard | Completed | `nominatim-base-url.ts`, tests, `NOMINATIM_ALLOWED_HOSTS` |
| 6 | Admin temp password | Completed | `admin-password-reset-response.ts`, platform + tenant routes, Admin/Super users UI |
| 7 | crm-repos split | Partial | `packages/db/src/crm-repos-query-helpers.ts` |
| 8 | AI docs | Completed | `docs/ai-dev-guide.md`, `docs/modules-index.md`, README + index.html links |
| 9 | httpOnly refresh | Deferred | Documented in `security.md` + `ai-dev-guide.md` |
| 10 | pnpm audit | Completed | Drizzle ORM ^0.45.2; snapshot below; run `pnpm audit` in CI |

---

## 5. `pnpm audit` snapshot (post-Drizzle bump)

Run: `pnpm audit` (May 2026). **High** Drizzle ORM identifier-escaping issue addressed by bumping **`drizzle-orm`** to **`^0.45.2`** in `packages/db/package.json`.

**Remaining (moderate, transitive):**

1. **esbuild** (via `drizzle-kit` → `@esbuild-kit/*`) — dev-time dev-server exposure; track `drizzle-kit` upgrades.
2. **uuid** (via `apps/mobile` → Expo) — buffer bounds in v3/v5/v6; upstream Expo bump when available.
3. **postcss** (via Expo metro) — XSS in CSS stringify; upstream Expo/postcss resolution.

**Policy:** Run `pnpm audit` on a schedule (e.g. weekly) and before releases; prioritize **high** in runtime deps; accept or override **moderate** dev-only findings with documented risk.

---

## Assumptions

- Drizzle query builders used without user string concatenation for SQL; recommend SAST on `sql.raw` / dynamic SQL.
- Audit snapshot is point-in-time; re-run after dependency changes.
