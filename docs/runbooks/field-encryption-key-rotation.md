# Field encryption key rotation

`FIELD_ENCRYPTION_KEY` is the root secret for AES-256-GCM envelope encryption (`@starter/crypto`). In production it wraps per-tenant DEKs and protects registered sensitive columns and blob uploads.

## Before rotation

1. Schedule a maintenance window — reads/writes during rotation should use the same key version.
2. Export a current database backup.
3. Generate a new 32-byte key: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
4. Document the old key in your secret manager as `FIELD_ENCRYPTION_KEY_v{N}` (never commit).

## Rotation procedure (high level)

1. **Deploy dual-read support** (product fork): extend `@starter/crypto` key provider to accept `FIELD_ENCRYPTION_KEY_PREVIOUS` for decrypt-only while writes use the new key.
2. **Re-wrap tenant DEKs**: for each row in `tenant_encryption_keys`, decrypt `encrypted_dek` with the old KEK and re-encrypt with the new KEK (script using `packages/crypto` key provider).
3. **Re-encrypt field ciphertexts** (if KEK change without DEK re-wrap path): batch through field encryption middleware for every registered column — plan hours/days for large tenants.
4. **Re-encrypt blobs** under `API_FILES_ROOT` / S3 with the new tenant DEK material.
5. **Swap env**: set `FIELD_ENCRYPTION_KEY` to the new value, keep previous in `FIELD_ENCRYPTION_KEY_PREVIOUS` until backfill completes.
6. **Verify**: spot-check login, mailbox OAuth tokens, invoicing PDFs, CRM PII search (blind indexes derive from the root secret — re-index if root secret changes).
7. **Remove** `FIELD_ENCRYPTION_KEY_PREVIOUS` after validation.

## Blind search indexes

Blind indexes (`packages/crypto/src/blind-index.ts`) use an HKDF subkey from `FIELD_ENCRYPTION_KEY`. Changing the root secret **invalidates existing blind indexes** unless you retain the old secret for lookup during migration. Plan to rebuild `identity_key` / searchable hash columns when rotating the root key.

## Operational notes

- Prefer a cloud KMS (AWS KMS, GCP KMS, Azure Key Vault) to wrap DEKs in production rather than storing the root key only in `.env`.
- JWT signing secrets (`JWT_ACCESS_SECRET`) rotate independently — bumping field encryption does not invalidate sessions.
- Test the full procedure against a staging clone before production.

See also [`docs/guidelines/security.md`](../guidelines/security.md) and [`docs/guidelines/environment.md`](../guidelines/environment.md).
