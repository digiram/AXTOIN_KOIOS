# Deploy runbook

## Preconditions

- Postgres reachable from API and worker. Redis required only when `QUEUE_STRATEGY=external` (default); use `QUEUE_STRATEGY=local` for SQL-backed jobs/cache without Redis.
- `NODE_ENV=production`, `JWT_ACCESS_SECRET` (≥32 chars), `FIELD_ENCRYPTION_KEY` (32-byte base64).
- `AUTO_MIGRATE=force` only if you intentionally migrate on boot; otherwise leave it `off` and run `pnpm db:migrate` in CI/CD before traffic.
- `ALLOW_BOOTSTRAP_SUPER_ADMIN` unset unless creating the first platform admin in a controlled window.

## Steps (generic)

1. Build: `pnpm build:ci` (or workspace-specific production build).
2. Migrate: `pnpm db:migrate` against the target database.
3. Deploy API (`apps/api`), worker (`apps/worker`), and static web (`apps/web` dist).
4. Configure load balancer health checks on **`GET /health`** (liveness) and **`GET /ready`** (DB + Redis/local-queue skip).
5. Set `VITE_API_BASE_URL` at web build time to the public API origin (clients call **`/v1`** under that origin).
6. Stripe: point webhooks to **`https://<api>/webhooks/stripe`**; verify signature secret in platform settings.
7. **Metrics:** expose `GET /metrics` only on an internal network (VPC, sidecar, or authenticated scrape path). Do not publish it on the public internet.

## Hostinger — three Web App slots (one repo)

Deploy the **same Git branch** three times as separate Node.js Web Apps. Keep **root directory = repository root** on every slot (pnpm workspaces need the monorepo root; do not set root to `apps/api` alone).

Pick the role with **build / start scripts** (or entry file) in hPanel — do not hardcode hostnames in code.

| Slot | Example hostname | Build command | Start / entry | Output directory |
|------|------------------|---------------|---------------|------------------|
| Backend | `api.<your-domain>` | `build:api` | `start:api` or entry `apps/api/dist/index.js` | _(none / N/A for server)_ |
| Frontend | `os.<your-domain>` | `build:web` | _(none — static)_ | `apps/web/dist` |
| Worker | `jobs.<your-domain>` | `build:worker` | `start:worker` or entry `apps/worker/dist/index.js` | _(none / N/A for server)_ |

Package manager: **pnpm** (detected from `pnpm-lock.yaml`). Node: **20** or **22** (`engines.node` in root `package.json`).

### Per-slot environment (examples — use your real origins)

Set secrets and URLs in each Web App’s **Environment variables** (injected at build and runtime). Domains stay config-only.

**Backend (`api.*`)**

- `NODE_ENV=production`
- `API_PORT` optional — Hostinger’s `PORT` is used when `API_PORT` is unset
- `CORS_ORIGINS=https://os.<your-domain>` (exact SPA origin)
- `JWT_ACCESS_SECRET`, `FIELD_ENCRYPTION_KEY`, DB vars, `QUEUE_STRATEGY` (+ `REDIS_URL` if external)
- `API_PUBLIC_ORIGIN=https://api.<your-domain>`
- `WEB_PUBLIC_ORIGIN=https://os.<your-domain>`

**Frontend (`os.*`)**

- `VITE_API_BASE_URL=https://api.<your-domain>` (**required at build time**)
- Framework: Vite / static; output `apps/web/dist`

**Worker (`jobs.*`)**

- Same DB + `QUEUE_STRATEGY` (+ `REDIS_URL` if external) as the API
- Hostinger `PORT` enables `GET /health` on the worker (keep-alive / liveness). Optional override: `WORKER_PORT`
- No need to duplicate SPA CORS / Vite vars

### Local development unchanged

Continue using repo-root pnpm scripts:

```bash
pnpm install
pnpm dev:all    # web + API + worker
pnpm stop
pnpm verify
```

Worker health HTTP is **off** locally unless you set `WORKER_PORT` or `PORT`.

## Post-deploy checks

- `curl -sS https://<api>/ready | jq .status` → `ready`
- `curl -sS https://<api>/health | jq '{cspMode,cspHttpHeaderBytes}'` → `cspMode: "meta-only"`, `cspHttpHeaderBytes: 0` on Hostinger production (unless `CSP_IN_META=off`)
- `curl -sS https://<jobs>/health` → `{"status":"ok","service":"@starter/worker"}`
- Confirm the site returns **200**, not **503**, after restarting Node in hPanel
- Confirm API response headers do **not** include `Content-Security-Policy` (ignore Hostinger error pages on 503)
- View SPA page source — confirm `<meta http-equiv="Content-Security-Policy"` appears early in `<head>`
- `curl -sS https://<api>/metrics` returns Prometheus text (protect in production).
- Sign in via SPA; confirm CRM list loads (`/v1/tenant/...`).
- Worker: platform job queues show activity; subscription billing queue processing if enabled.

## Rollback

- Revert container/image to previous tag (or redeploy previous Git commit on Hostinger).
- Do **not** roll back DB migrations without a planned down migration — prefer forward-fix.
