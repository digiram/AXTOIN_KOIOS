# Development

## Prerequisites

- **Node.js** — LTS recommended (ESM TypeScript throughout).
- **pnpm** — Version pinned in root `packageManager`; use `corepack enable` or install from [pnpm.io](https://pnpm.io/installation).
- **Git**
- **Optional:** Docker (or compatible) for Redis + database via Compose.
- **Mobile:** Expo tooling when working on `apps/mobile`.

## First-time install

1. Clone the repo; work from the **repository root** for env and pnpm commands.
2. Copy environment template and edit secrets:
   ```bash
   cp .env.example .env
   ```
   The API and worker load **repo-root** `.env` even when you run scripts from `apps/api` or `apps/worker` (see `apps/api/src/env-bootstrap.ts` and the worker’s equivalent).
3. Install dependencies:
   ```bash
   pnpm install
   ```
4. Run **Postgres or MySQL** and **Redis** (Compose profiles or your own installs) and align `DATABASE_*` / `REDIS_URL` in `.env`.
5. Start apps (see table below).

TDD, CI gates, and runner details: **[testing.md](testing.md)**.

## Common commands

| Command | Purpose |
|---------|---------|
| `pnpm dev:all` | **Web + API + worker** in parallel (`pnpm --parallel --filter …`) |
| `pnpm stop` | Stop dev processes: graceful shutdown for PIDs registered from `pnpm run`, or interactive kill for other discovered app processes |
| `pnpm stop --all` | Non-interactive: gracefully stop all registered dev processes (`--yes` to skip confirm) |
| `pnpm dev` | API only (alias for `--filter @starter/api dev`) |
| `pnpm --filter @starter/web dev` | Vite dev server (default **5173**) |
| `pnpm --filter @starter/api dev` | Fastify with `tsx watch` |
| `pnpm --filter @starter/worker dev` | BullMQ worker |
| `pnpm --filter @starter/mobile start` | Expo |
| `pnpm -r typecheck` | Typecheck all workspace packages |
| `pnpm -r test` / `pnpm -r lint` / `pnpm -r build` | As named |
| `pnpm verify` | **Typecheck + test** all packages (recommended before PRs) |
| `pnpm build:ci` | **`verify`** then **`pnpm -r build`** (CI-style full gate) |
| `pnpm build:api` / `build:web` / `build:worker` | Production builds for Hostinger Web App slots (repo root; see [deploy runbook](../runbooks/deploy.md)) |
| `pnpm start:api` / `start:worker` | Run compiled API or worker from repo root (after the matching `build:*`) |
| `pnpm test:watch` | Vitest watch mode for **`@starter/web`** (same as `--filter @starter/web test:watch`) |

## Web app → API URL

- **`apps/web/vite.config.ts`** loads env from the **repo root** and sets `import.meta.env.VITE_API_BASE_URL` to **`VITE_API_BASE_URL`** if set, otherwise **`http://localhost:<API_PORT>`** using root `.env` **`API_PORT`** (legacy **`PORT`** if `API_PORT` is unset).
- So you usually **do not** need a separate `VITE_API_BASE_URL` unless the API is not on localhost or uses a nonstandard host.

## Database migrations on startup

The API runs Drizzle migrations **before** `listen`:

- **`NODE_ENV=development`** (or unset) → **always** migrate on boot (`AUTO_MIGRATE` is ignored).
- **Production** → `force` / `always` = migrate on boot; `off` / unset = migrate out-of-band (CI/CD).
- **Other non-production** (e.g. `test`) → `off` = never; `force` = always; unset = migrate.

In production, ambiguous truthy values (`true`/`1`/`yes`/`on`) are rejected at boot — use `force` or `off`. Manual CLI: see [database.md](database.md).

## Docker Compose

`docker-compose.yml` defines Redis, optional Postgres/MySQL (**profiles**), and images for API/worker. Enable a DB profile that matches `DATABASE_DIALECT` and credentials in `.env`.

## API process / ports

- The API listens on **`API_PORT`** (legacy: **`PORT`**; code default **3000** if both unset); `.env.example` sets **`API_PORT`** (e.g. **3500**).
- The API registers **SIGINT/SIGTERM** handlers to `close()` Fastify so dev restarts release the port; if you see **EADDRINUSE**, another Node process still holds that port — stop it or pick a free **`API_PORT`**.

## Config file map (tooling)

| File | Purpose |
|------|---------|
| `pnpm-workspace.yaml` | Workspace globs |
| `package.json` (root) | Aggregated scripts |
| `tsconfig.base.json` | Shared TS options; packages extend |
| `prettier.config.cjs` / `.eslintrc.cjs` | Formatting / lint |
| `apps/web/vite.config.ts` | Vite + React; workspace alias for `@starter/shared` |
| `apps/web/tailwind.config.js` | Tailwind `content` paths |
| `packages/db/drizzle.config.*.ts` | Drizzle Kit targets |
