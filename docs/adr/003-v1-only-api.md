# ADR 003: v1-only HTTP API (legacy mounts removed)

## Status

Accepted (Phase 3)

## Context

Phase 2 introduced `/v1` while keeping unprefixed routes for migration. Dual mounts increase attack surface and documentation drift.

## Decision

- Register application routes **only** under `/v1`.
- Remove WebSocket `?accessToken=`; require `?ticket=` from `POST /v1/platform/ws/ticket`.
- Update web, mobile, integration tests, and E2E to use `/v1`.

## Consequences

- External clients on unprefixed paths must migrate.
- Operational routes stay at root: `/health`, `/ready`, `/metrics`, `/openapi.json`, `/webhooks/*`.
