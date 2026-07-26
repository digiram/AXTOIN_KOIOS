# Environment variables

Canonical template: **`.env.example`** at the repo root (copy to **`.env`**).

## Where `.env` is read

- **API:** `apps/api/src/env-bootstrap.ts` — loads repo-root `.env` first, then optional `<cwd>/.env` overlay.
- **Worker:** Same pattern under `apps/worker`.

**Startup validation:** After env load, API and worker call `assertMinimalBootEnv` (`packages/db/src/boot-env.ts`) — database URL/parts must resolve; `QUEUE_STRATEGY=local` must use a supported `DATABASE_DIALECT`; production + external queue requires `REDIS_URL`. The API additionally runs `assertProductionBootConfig` and JWT secret checks in production.
- **Vite (web):** `apps/web/vite.config.ts` uses `loadEnv` from the **repo root** so `API_PORT`, legacy `PORT`, and `VITE_*` stay in one file.

## Core variables

| Variable | Purpose |
|----------|---------|
| `NODE_ENV` | `development` vs `production`; affects defaults (e.g. `AUTO_MIGRATE`, BullMQ queue prefix). Swagger UI at `/docs` and `GET /openapi.json` are **off** in production unless `OPENAPI_DOCS_ENABLED=true`. |
| `API_PORT` | **Preferred:** TCP port for the Fastify API (default **3000** if unset and legacy `PORT` is unset). Vite dev proxy targets this port when `VITE_API_BASE_URL` is unset. See `resolveApiListenPort` in `packages/shared`. |
| `PORT` | **Legacy alias** for `API_PORT` — read only when `API_PORT` is unset or empty. Prefer `API_PORT` in new `.env` files. |
| `CORS_ORIGINS` | Comma-separated browser origins allowed to call the API (e.g. `http://localhost:5173`). **Required for browser access in production:** when `NODE_ENV` is `production` and this is unset or empty after parsing, CORS is **off** (`Access-Control-Allow-Origin` is not issued for cross-origin requests). When unset in non-production, the API uses **reflect** mode for local dev convenience. |
| `CORS_CREDENTIALS` | Set to `true` only if the SPA uses credentialed requests (cookies); requires explicit `CORS_ORIGINS` (no wildcard). |
| `CORS_ALLOWED_HEADERS` | Optional comma-separated `Access-Control-Allow-Headers` list (lowercase). Defaults include `authorization` and `content-type` for JSON + JWT. |
| `RESPONSE_HEADER_MAX_BYTES` | Byte budget for serialized **response** headers; the `onSend` guard (`apps/api/src/lib/response-header-budget.ts`) logs a warning when exceeded. Default **8192**; values below 512 or non-numeric fall back to the default. Lower it to match a strict host's per-response header limit. Keeping headers lean (compact CSP, small cookies) is the actual fix — see [security.md](security.md). |
| `CSP_IN_META` | **Hostinger / LiteSpeed production default:** CSP is **meta-only** (`<meta http-equiv="Content-Security-Policy">` in the web HTML shell; **no** `Content-Security-Policy` HTTP header from Node). Set to **`off`** / **`false`** / **`0`** on non-Hostinger hosts to restore CSP on HTTP headers instead. See `packages/shared/src/content-security-policy.ts`. |
| `VITE_CSP_CONNECT_SRC_EXTRA` | Optional comma-separated hostnames (no scheme) added to `connect-src` in the web SPA meta CSP at build time. |
| `VITE_CSP_IMG_SRC_EXTRA` | Optional comma-separated hostnames added to `img-src` in the web SPA meta CSP at build time. |
| `DATABASE_DIALECT` | `mysql` selects MySQL + `drizzle/mysql` migrations; `supabase` selects hosted Supabase Postgres (same schema/migrations as Postgres, TLS defaults); otherwise **Postgres**. |
| `DATABASE_URL` | If non-empty after trim, used **verbatim** (SSL params, IPv6, hosted URLs). |
| `SUPABASE_DATABASE_URL` | When `DATABASE_DIALECT=supabase` and `DATABASE_URL` is unset, used before composing from `SUPABASE_PROJECT_REF` / `SUPABASE_DB_PASSWORD` / region or host. |
| `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `SUPABASE_DB_REGION`, `SUPABASE_DB_POOLER` | Compose a Supabase Postgres URI when `DATABASE_URL` and `SUPABASE_DATABASE_URL` are unset. Host/port/user/db are derived from the project ref + pooler mode (`transaction` default, `session`, `direct`); `direct` needs no region. For full control use `SUPABASE_DATABASE_URL` / `DATABASE_URL`. See `packages/db/src/database-url.ts`. |
| `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USER`, `DATABASE_PASSWORD`, `DATABASE_NAME` | Composed into a URL when `DATABASE_URL` is unset. See `packages/db/src/database-url.ts`. |
| `QUEUE_STRATEGY` | **Single switch for the job queue *and* cache.** `external` (default) = BullMQ + Redis (`REDIS_URL`); `local` = SQL `background_jobs` + `app_cache_entries` (no Redis), for low-load / single-node hosts on **Postgres, Supabase, or MySQL**. Poll interval, retention, GC, and concurrency use built-in defaults (`DATABASE_QUEUE_DEFAULTS` in `packages/shared`). With Supabase, prefer `SUPABASE_DB_POOLER=session` or `direct` so job-lock transactions are session-pinned. |
| `REDIS_URL` | BullMQ / ioredis connection used when `QUEUE_STRATEGY=external` (default). Ignored when `local`. **Required in production** when using the external queue (API and worker validate at boot via `packages/db/src/boot-env.ts`). |
| `NOMINATIM_CACHE_TTL_SECONDS` | Geocode cache TTL (default ~180 days). Applies to whichever cache `QUEUE_STRATEGY` selects. |
| `JWT_ACCESS_SECRET` | Signs short-lived access JWTs (`@fastify/jwt`). When **`NODE_ENV` is `production`**, the API **exits on boot** unless this value is set and at least **32** non-whitespace characters. In other environments, if unset, a fixed development default is used (with a warning log). Access JWTs include claim **`v`** (integer string), which must match **`users.access_token_version`** (bumped on password change and admin MFA enrollment reset). |
| `JWT_REFRESH_SECRET` | Present in `.env.example` for future use; **this starter** stores refresh tokens as opaque **hashes** in SQL — extend code if you need this secret. |
| `FIELD_ENCRYPTION_KEY` | Base64 **32-byte** root secret for envelope encryption (`@starter/crypto`): wraps per-tenant DEKs, encrypts registered sensitive fields, and (via HKDF) powers blind search indexes. **Required in production.** When unset, local dev may store some fields in plaintext for convenience. Defaults baked into code: DEK cache TTL **10 min**, search n-gram length **3**. Advanced overrides (`SEARCH_INDEX_KEY`, `FIELD_ENCRYPTION_DEK_CACHE_TTL_MS`, `FIELD_ENCRYPTION_NGRAM_SIZE`) exist for rare rotation/tuning — not required in `.env`. |
| `AUTO_MIGRATE` | Migration-on-boot switch. **`NODE_ENV=development`** (or unset) → always migrate (this var is ignored). **Production:** `force`/`always` = migrate on boot; `off`/unset = migrate in CI/CD only. **Other non-production** (e.g. `test`): `off` = never; unset = migrate. Ambiguous truthy values (`true`/`1`/`yes`/`on`) are rejected in production — use `force` or `off`. |
| `BOOTSTRAP_SUPER_ADMIN_EMAIL` | Optional sign-in id (1–320 chars, trimmed); persisted like other users (encrypted when `FIELD_ENCRYPTION_KEY` is set) with `tenant_id` NULL. **Not** required to be RFC email format. |
| `BOOTSTRAP_SUPER_ADMIN_PASSWORD` | Optional; min 8 characters; trimmed when hashing. |
| `NOMINATIM_ALLOWED_HOSTS` | Comma-separated **hostnames** allowed for the super-admin Nominatim **base URL** (server-side `fetch`). Default: `nominatim.openstreetmap.org`. Private / link-local / metadata-style hosts are rejected even if listed. For a **self-hosted** Nominatim instance, list its hostname here and set the platform geolocation base URL in the super-admin UI; internal runbooks can be linked from your own docs. |
| `ADMIN_PASSWORD_RESET_RETURN_PLAIN` | When **`true`** and `NODE_ENV=production`, admin **reset password** may return `temporaryPassword` in JSON if email delivery is not used (emergency only). In production, the default path emails the temporary password via **platform SMTP** when SMTP is enabled and the user has an email. Non-production keeps JSON plaintext for local DX. |
| `RATE_LIMIT_GLOBAL_MAX` | Optional. Global `@fastify/rate-limit` **max** requests per window (excluding `/auth/*`, which has its own limit). Default **100**. |
| `RATE_LIMIT_GLOBAL_WINDOW` | Optional. Global window in **milliseconds**. Default **60000** (1 minute). Minimum **1000**. |
| `RATE_LIMIT_WEBHOOK_MAX` | Optional. Max requests per global window for URLs under **`/webhooks/`**. Default **8000**. |
| `RATE_LIMIT_AUTH_MAX` | Optional. Max requests per auth window for **`/auth/*`**. Default **40**. |
| `RATE_LIMIT_AUTH_WINDOW` | Optional. Auth window in **milliseconds**. Default **900000** (15 minutes). Minimum **1000**. |
| `RATE_LIMIT_CRM_GEOCODE_MAX` | Optional. Max CRM geocode requests per tenant per window (`/tenant/crm/geocode/*`). Default **60**. |
| `RATE_LIMIT_CRM_GEOCODE_WINDOW` | Optional. CRM geocode window in **milliseconds**. Default **60000**. Minimum **1000**. |
| `OPENAPI_DOCS_ENABLED` | When `true`, registers Swagger UI at `/docs` and `GET /openapi.json` even if `NODE_ENV=production`. Default: on in non-production, off in production. |
| `REFRESH_TOKEN_IN_COOKIE` | HttpOnly refresh cookie + CSRF double-submit. **Default:** `true` in production, `false` in development. Set `false`/`0` to opt out in production. See [adr/002-refresh-cookie-csrf.md](../adr/002-refresh-cookie-csrf.md). |
| `METRICS_BEARER_TOKEN` | When `NODE_ENV=production`, `GET /metrics` is **not registered** unless this is set. Scrapers must send `Authorization: Bearer <token>`. Dev/test always expose `/metrics` without auth. |

## Logging (API + worker)

| Variable | Purpose |
|----------|---------|
| `LOG_LEVEL` | Pino level (`trace` … `silent`). |
| `VERBOSE` | `true` / `1` → debug when `LOG_LEVEL` unset. |
| `LOG_PRETTY` | `false` → JSON lines even in development. |
| `LOG_HTTP` | `false` on API → disable Fastify per-request access logs. |

## Frontends

- **Vite:** only vars prefixed `VITE_` are exposed to the client bundle; **`VITE_API_BASE_URL`** is injected at build/dev time from root `.env` (see [development.md](development.md)).
- **Expo:** use `EXPO_PUBLIC_*` for public config (see `apps/mobile`).
