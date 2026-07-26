# Module index (API ↔ packages)

Route prefixes are registered in **`apps/api/src/app-routes.ts`** (mounted under `/v1` from `app.ts`). This table maps **URL prefix** to the primary route module and data layer.

| Prefix | Route module (`apps/api/src/routes/`) | Notes |
|--------|----------------------------------------|--------|
| `/auth` | `auth.ts` | Public login, register, refresh, MFA; stricter rate limit (scoped plugin) |
| `/profile` | `profile.ts` | Authenticated profile |
| `/account` | `account.ts`, `account-mfa.ts`, `account-subscription.ts` | User-scoped account + MFA + per-user subscription |
| `/platform` | `platform.ts`, `platform-mail.ts`, `platform-payments.ts`, `platform-subscriptions.ts` | Super-admin; payments include encrypted PSP secrets |
| `/tenant` | `tenant.ts`, `tenant-subscriptions.ts`, `tenant-crm.ts`, `tenant-workforce.ts`, `tenant-sales.ts`, `tenant-company-subscriptions.ts`, `tenant-invoicing.ts`, `tenant-mailbox.ts` | Realm tenant admin / members; CRM; workforce; **sales**; **company subscriptions**; **mailbox** — see [mailbox-module.md](../mailbox-module.md) |
| `/webhooks/stripe` | `stripe-webhooks.ts` | Raw body + signature verification; higher global rate limit bucket |

## `@starter/db` repository files (non-exhaustive)

| File | Domain |
|------|--------|
| `repos.ts` | Core users, tenants, refresh tokens, auth helpers |
| `crm-repos.ts` | CRM entities (large file; query helpers in `crm-repos-query-helpers.ts`) |
| `subscription-repos.ts` | Realm `subscriptions` rows |
| `platform-subscription-repos.ts` | Catalog, ledger, platform subscription admin |
| `platform-payment-settings-repos.ts` | Stripe/Adyen integration rows |
| `mfa-repos.ts` | MFA challenges / enrollment |
| `company-subscription-repos.ts` | Vendor/SaaS subscription registry (`company_subscription_*`) |
| `migrate.ts` | Startup migration policy |

## `@starter/shared`

Zod schemas and shared types for API + clients — single source of truth for request bodies and many DTOs.
