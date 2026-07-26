# Security

## API surface (`apps/api/src/index.ts`)

- **Helmet** — sensible HTTP headers via `apps/api/src/lib/helmet-config.ts`. In **production on Hostinger** (default), CSP is **meta-only** — see below; Helmet omits the `Content-Security-Policy` HTTP header.
- **Response-header budget** — an `onSend` guard (`apps/api/src/lib/response-header-budget.ts`) warns when a response's serialized headers exceed `RESPONSE_HEADER_MAX_BYTES` (default 8 KB); a CI test (`apps/api/test/response-header-budget.test.ts`) fails on regression.
- **CORS** — browser clients; in **`NODE_ENV=production`** the API **denies cross-origin** CORS unless **`CORS_ORIGINS`** is set to a non-empty allowlist — see [environment.md](environment.md).
- **Rate limiting** — global bucket (100 req/min per IP for most routes; **8000/min** for `/webhooks/*`); **`/auth/*`** has an additional **40 requests / 15 minutes** per IP on the same child scope. Tune before high-traffic production.

## Credentials

- **Passwords:** Argon2 hashes only (`password_hash` column).
- **Refresh tokens:** random opaque string to the client once; **SHA-256** stored in `refresh_tokens`; rotation on `/auth/refresh`.

## Field encryption

- **`@starter/crypto`** — AES-256-GCM with optional AAD bound to `tenantId` for ciphertexts.
- **`FIELD_ENCRYPTION_KEY`** — base64-encoded 32-byte key; rotate with a re-encryption strategy in real products.

## Secrets hygiene

- Never commit **`.env`**.
- Use strong **`JWT_ACCESS_SECRET`** (and any future signing secrets) in every non-local environment.
- Review default dev secrets before any shared/staging deploy.

## Tenant isolation

Protected routes resolve the tenant (or platform) from the JWT and repositories scope SQL by `tenant_id` where applicable. Add new tables with a `tenant_id` foreign key unless the data is truly global.

---

## Security best practices

Use this as a **living checklist** when shipping features or hardening environments. Details for auth flows: [authentication.md](authentication.md); env vars: [environment.md](environment.md).

### Transport and deployment

- **HTTPS everywhere** in non-local environments; terminate TLS at the edge or load balancer and avoid mixed content for the SPA.
- **Harden Helmet** for production; review defaults when adding third-party scripts.
- **Hostinger / LiteSpeed CSP (non-negotiable on that host).** The LiteSpeed proxy can return **HTTP 503** and mark the Node upstream unhealthy when the app sends a **`Content-Security-Policy` HTTP response header** — even a relatively small policy (~250 bytes). The Node process often logs nothing; the failure is at the proxy.
  - **Never** emit `Content-Security-Policy` as an HTTP response header from Node in production on Hostinger (default: `shouldUseMetaCspOnly()` in `packages/shared/src/content-security-policy.ts`).
  - **Always** emit CSP via `<meta http-equiv="Content-Security-Policy" content="…">` in the web HTML `<head>`, as early as possible (`apps/web/index.html` via the Vite plugin in `vite.config.ts` + `RootDocumentHead.tsx`).
  - **Always** send **`X-Frame-Options: DENY`** as an HTTP header (`frame-ancestors` is ignored in meta CSP).
  - Safe HTTP headers from Node in production: `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, `Strict-Transport-Security` — see `securityHeaders()` in the shared module.
  - Opt out on non-Hostinger hosts: **`CSP_IN_META=off`** (restores CSP on HTTP headers; no meta CSP in the HTML shell).
  - **`GET /health`** in production exposes `cspMode` (`meta-only` | `http-header`) and `cspHttpHeaderBytes` (0 in meta-only mode).
  - After deploy: confirm **200** (not 503), no app `Content-Security-Policy` response header, and meta CSP present in page source. See [runbooks/deploy.md](../runbooks/deploy.md).
- **Keep response headers lean (host header-size limits).** Some hosts enforce a **hard per-response header size limit** and will drop or 5xx bloated headers. This app ships a **byte-budget guard** (`apps/api/src/lib/response-header-budget.ts`, warn-only `onSend`; tune with `RESPONSE_HEADER_MAX_BYTES`, default 8 KB) backed by a CI test. When adding headers/cookies: keep them few and small; re-run `apps/api/test/response-header-budget.test.ts`.
- **CORS:** in production, **`CORS_ORIGINS`** must list every web origin that may call the API (unset = deny cross-origin). In non-production, unset uses reflect mode for local dev.

### Tokens and sessions

- **Access JWT:** keep **short TTL** (this starter uses ~15 minutes); rotate signing keys with a key-version plan if you run at scale.
- **Secrets:** generate long random **`JWT_ACCESS_SECRET`** values per environment; never reuse dev secrets in staging/production.
- **Refresh tokens:** keep treating them as **bearer secrets** — only over HTTPS. In **production**, refresh tokens default to an **HttpOnly cookie** (`REFRESH_TOKEN_IN_COOKIE` defaults on when `NODE_ENV=production`; set `REFRESH_TOKEN_IN_COOKIE=false` to opt out). The web SPA keeps the **access JWT in memory only** (not `sessionStorage` / `localStorage`). In development, refresh may live in `sessionStorage` when cookie mode is off.
- **HttpOnly refresh cookies:** align API + web builds in production (`REFRESH_TOKEN_IN_COOKIE` on API; web production build defaults cookie mode unless `VITE_REFRESH_TOKEN_IN_COOKIE=false`). Requires **SPA + API** cookie/CORS policy (`CORS_CREDENTIALS=true`, explicit `CORS_ORIGINS`, CSRF double-submit). See [adr/002-refresh-cookie-csrf.md](../adr/002-refresh-cookie-csrf.md).
- **Admin password reset:** in production the API emails the temporary password when **platform SMTP** is enabled and the user has an email; JSON omits the password. Emergency JSON plaintext: **`ADMIN_PASSWORD_RESET_RETURN_PLAIN=true`** (see [environment.md](environment.md)).
- **Never log** access tokens, refresh tokens, passwords, or `FIELD_ENCRYPTION_KEY` material (see logging guidance in [best-practices.md](best-practices.md)).

### Authentication and abuse

- **Rate limiting:** dedicated **`/auth`** scope limits login/register/refresh/MFA traffic; review **`GLOBAL` vs `auth-public`** namespaces under load (see API `index.ts`).
- **Account enumeration:** use **generic** error messages on login/register where product policy allows (this starter returns validation vs invalid credentials — review copy for your threat model).
- **Bootstrap (`BOOTSTRAP_SUPER_ADMIN_*`):** disable or remove in production if accounts are provisioned another way; treat env-based seeding as **high privilege**.

### Multi-tenancy and data

- **Never trust** a client-supplied `tenantId` alone — scope work from the **JWT** (or refresh row) after verification.
- **Every new tenant-owned table** should include **`tenant_id`** (or a strict parent FK to tenant-scoped data) and queries should go through repos or explicit `where` clauses.
- **Use parameterized queries** via Drizzle; avoid string-concatenated SQL.

### Secrets and configuration

- **`.env`** is gitignored — use a **secret manager** or sealed CI vars in deployed environments; rotate on incident or schedule.
- **`FIELD_ENCRYPTION_KEY`:** protect like a root secret; plan **rotation** (re-encrypt columns) before large-scale PII.

### Dependencies and supply chain

- Run **`pnpm audit`** (or your org’s scanner) regularly; patch transitive vulnerabilities on a cadence you can sustain.
- Pin **`packageManager`** and lockfile discipline; review major upgrades for breaking security behavior.

### Worker and Redis

- **Redis:** network-isolate in production; require auth/TLS where your provider supports it; BullMQ queues should not be world-writable.
- **Job payloads:** treat as **untrusted**; validate inside the worker before side effects (same invariants as API handlers where they overlap).

### Incident readiness (lightweight)

- Document **who rotates JWT secrets** and **how DB credentials are revoked**.
- Keep enough **request correlation** in structured logs to investigate abuse without storing PII in log lines unnecessarily.

---

## Open security items (template backlog)

Track remediations here when hardening the template for production forks.

| Priority | Item | Notes |
|----------|------|--------|
| ~~Critical~~ | ~~MFA step JWT accepted as access token~~ | **Fixed:** access tokens use `typ: "access"`; `requireTenantContext` rejects other `typ` values. |
| ~~High~~ | ~~Refresh tokens survive password change~~ | **Fixed:** `updateUserPasswordHashById` deletes all `refresh_tokens` for the user. |
| ~~High~~ | ~~Super-admin login has no MFA~~ | **Fixed:** optional platform-operator MFA from Settings → Security; enforced at login only when enrolled. |
| ~~Medium~~ | ~~Public `/docs` and `/openapi.json` in production~~ | **Fixed:** routes not registered when `NODE_ENV=production` unless `OPENAPI_DOCS_ENABLED=true`. |
| ~~Medium~~ | ~~Unverified corporate-domain signup → tenant admin~~ | **Fixed:** two-step email verification; corporate first user defaults to `tenant_user`. |
| ~~Medium~~ | ~~Account geocode not tenant-rate-limited~~ | **Fixed:** per-user `account-geocode` rate limit (60/min default). |
| ~~Medium~~ | ~~Blob storage without `FIELD_ENCRYPTION_KEY`~~ | **Fixed:** `blob-crypto-policy.ts` refuses writes without key unless `ALLOW_PLAINTEXT_BLOB_STORAGE=true` (blocked in production). |
| ~~Low~~ | ~~`/ready` returns dependency error strings~~ | **Fixed:** production `/ready` omits internal error strings from probe responses. |

Contributor PR checklist: [contributing-security.md](contributing-security.md).
