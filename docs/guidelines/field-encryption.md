# Field encryption

Envelope field encryption infrastructure lives in `@starter/crypto` and `packages/db/src/field-encryption/`. Business code stays plaintext; repos call middleware at the persistence boundary.

## Covered surfaces

| Area | Tables / fields |
|------|-----------------|
| Tenants | `tenants.name` (+ `name_lookup_key` for exact realm resolution); platform-scoped SFENC1 |
| CRM | `crm_contacts`, `crm_organizations`, `crm_activities` — names, channels, addresses, notes; blind-index search |
| Users | `users` — `displayName`, home address, `email` (SFENC1), MFA secrets, tax id |
| Workforce | `workforce_employees`, `workforce_org_units` |
| Invoicing | Quotes, offers, invoices, tenant configuration snapshots and text fields; `invoicing_audit_events.payload` |
| Mailbox | Accounts, threads, messages (bodies, `from_json`, `to_json`), credentials |
| Sales funnel | `sales_funnel_bdr_leads`, `sales_funnel_sales_deals` — title and description (searchable) |
| Company subscriptions | `company_subscription_seats.email` (searchable) |
| Secrets | Tenant/platform SMTP (`host`, `username`, password), platform payment settings |
| Blobs | `tenant_blob_payload` via `SFP2` + SFENC1 |

New tenants receive a wrapped DEK on first encrypted write via field-encryption middleware (lazy provisioning).

## Adding a table

1. Widen encrypted column types to `text` if needed (SFENC1 payloads exceed varchar limits).
2. Add entry to `FIELD_ENCRYPTION_REGISTRY`.
3. Call `encryptForWrite` / `decryptForRead` in the repo module.
4. Replace plaintext search with `findEntityIdsByMultiFieldContains` (or field-specific helpers).
5. Add integration tests for encrypt/decrypt round-trip.

## Key rotation (future ops)

- **KEK rotation**: bump `EnvKeyProvider` active version; re-wrap `tenants.encrypted_dek` (no field re-encryption).
- **DEK rotation**: new DEK + re-encrypt all tenant fields (batch worker).
- **Field read/write**: envelope `kv` selects unwrap key; writes always use latest.

See also [`environment.md`](environment.md) for env vars and [`security.md`](security.md) for invariants.
