# ADR 001: HTTP API versioning (`/v1`)

## Status

Accepted

## Context

Clients, integration tests, and the Vite dev proxy need a stable contract boundary as routes evolve.

## Decision

- Mount all application JSON routes under **`/v1`** via `registerApplicationRoutes` in `apps/api/src/app-routes.ts`.
- Keep **operational** endpoints unversioned: `/health`, `/ready`, `/metrics`, `/openapi.json`, `/webhooks/*`.
- Point the SPA at **`/v1`** through `API_BASE_URL` in `apps/web/src/lib/api.ts`.

## Consequences

- New clients and tests must use `/v1/...` paths.
- OpenAPI documents the versioned surface; expand the spec as shared Zod contracts are exported.

See also [ADR 003](003-v1-only-api.md).
