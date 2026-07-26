# Incident response runbook

## Triage

1. **User impact** — auth, billing, CRM, super-admin only?
2. **Probes** — `GET /health` vs `GET /ready`; note which check failed (`database` / `redis`).
3. **Correlation** — use `X-Request-Id` from API responses and client logs.
4. **Metrics** — `GET /metrics` (`starter_http_requests_total` labels: method, route, status).

## Common scenarios

| Symptom | Likely cause | Actions |
|--------|----------------|---------|
| 503 on `/ready` | DB or Redis down | Restore dependency; check `DATABASE_*`, `REDIS_URL` |
| 401 spike after deploy | JWT secret rotated | Re-login users; align `JWT_ACCESS_SECRET` across instances |
| 429 on `/v1/auth/*` | Brute force or misconfigured client | Review `RATE_LIMIT_AUTH_*`; check per-email buckets |
| Stripe duplicates | Webhook retries | Confirm `processed_stripe_events` idempotency; inspect worker logs |
| WS job queue silent | Ticket expired / Redis | Ensure `POST /v1/platform/ws/ticket` succeeds; Redis for ticket store |

## Security

- Rotate `JWT_ACCESS_SECRET` and invalidate sessions (`access_token_version` bump) if token leak suspected.
- Disable `ALLOW_BOOTSTRAP_SUPER_ADMIN` after bootstrap.
- Never enable `ADMIN_PASSWORD_RESET_RETURN_PLAIN` in production except emergency with audit trail.

## Communication

- Record timeline, request IDs, and migration version.
- File a follow-up ADR if the fix changes architecture.
