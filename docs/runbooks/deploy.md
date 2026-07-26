# Deploy runbook

## Preconditions

- Postgres and Redis reachable from API and worker.
- `NODE_ENV=production`, `JWT_ACCESS_SECRET` (≥32 chars), `FIELD_ENCRYPTION_KEY` (32-byte base64).
- `AUTO_MIGRATE=force` only if you intentionally migrate on boot; otherwise leave it `off` and run `pnpm db:migrate` in CI/CD before traffic.
- `ALLOW_BOOTSTRAP_SUPER_ADMIN` unset unless creating the first platform admin in a controlled window.

## Steps

1. Build: `pnpm build:ci` (or workspace-specific production build).
2. Migrate: `pnpm db:migrate` against the target database.
3. Deploy API (`apps/api`), worker (`apps/worker`), and static web (`apps/web` dist).
4. Configure load balancer health checks on **`GET /health`** (liveness) and **`GET /ready`** (DB + Redis).
5. Set `VITE_API_BASE_URL` at web build time to the public API origin (clients call **`/v1`** under that origin).
6. Stripe: point webhooks to **`https://<api>/webhooks/stripe`**; verify signature secret in platform settings.
7. **Metrics:** expose `GET /metrics` only on an internal network (VPC, sidecar, or authenticated scrape path). Do not publish it on the public internet.

## Post-deploy checks

- `curl -sS https://<api>/ready | jq .status` → `ready`
- `curl -sS https://<api>/health | jq '{cspMode,cspHttpHeaderBytes}'` → `cspMode: "meta-only"`, `cspHttpHeaderBytes: 0` on Hostinger production (unless `CSP_IN_META=off`)
- Confirm the site returns **200**, not **503**, after restarting Node in hPanel
- Confirm API response headers do **not** include `Content-Security-Policy` (ignore Hostinger error pages on 503)
- View SPA page source — confirm `<meta http-equiv="Content-Security-Policy"` appears early in `<head>`
- `curl -sS https://<api>/metrics` returns Prometheus text (protect in production).
- Sign in via SPA; confirm CRM list loads (`/v1/tenant/...`).
- Worker: platform job queues show activity; subscription billing queue processing if enabled.

## Rollback

- Revert container/image to previous tag.
- Do **not** roll back DB migrations without a planned down migration — prefer forward-fix.
