# Production checklist

Use before first production traffic and after material config changes.

## Secrets and auth

- [ ] `NODE_ENV=production`
- [ ] `JWT_ACCESS_SECRET` — at least 32 characters, unique per environment
- [ ] `FIELD_ENCRYPTION_KEY` — base64-encoded 32-byte AES key
- [ ] `BOOTSTRAP_SUPER_ADMIN_*` unset, or `ALLOW_BOOTSTRAP_SUPER_ADMIN=true` only for intentional one-time seeding
- [ ] `REFRESH_TOKEN_IN_COOKIE=true` on API and `VITE_REFRESH_TOKEN_IN_COOKIE` on web production builds (unless you accept sessionStorage refresh and document the XSS threat model)
- [ ] `CORS_ORIGINS` lists every browser origin; `CORS_CREDENTIALS=true` when using cookie refresh

## Data and jobs

- [ ] `AUTO_MIGRATE=off` in production (run `pnpm db:migrate` in CI/CD before deploy), or `AUTO_MIGRATE=force` to migrate on boot deliberately
- [ ] Postgres and Redis reachable from API and worker
- [ ] Stripe webhook URL: `https://<api-host>/webhooks/stripe` (not under `/v1`)

## Storage and scale

- [ ] `BLOB_STORAGE_BACKEND=s3` with bucket and credentials when running **more than one** API instance
- [ ] Or `ALLOW_LOCAL_BLOB_STORAGE=true` only for deliberate single-node deploys

## Observability and edge

- [ ] Load balancer: `GET /health` (liveness), `GET /ready` (readiness)
- [ ] `GET /metrics` **not** exposed on the public internet (scrape from private network only — see [deploy.md](./deploy.md))
- [ ] Clients use **`/v1`** only (legacy unprefixed routes removed in template vNext)

## Verification

- [ ] `pnpm build:ci` green on release commit
- [ ] Sign-in, CRM, and billing smoke-tested on staging
- [ ] WebSocket job queues use `POST /v1/platform/ws/ticket` (not JWT query params)
