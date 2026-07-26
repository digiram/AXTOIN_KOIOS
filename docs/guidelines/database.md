# Database

## Drizzle and dialects

- Schemas and migrations live under **`packages/db`** (`drizzle/pg`, `drizzle/mysql`).
- **`DATABASE_DIALECT`** selects which driver and migration folder apply (`mysql`, `supabase`, or default Postgres).
- **`supabase`** uses the Postgres Drizzle schema and `drizzle/pg` migrations with TLS defaults for hosted Supabase Postgres.

## Baseline schema

Fresh databases apply a single baseline migration (`0000_baseline.sql`) generated from the current Drizzle schema (`pg-schema.ts` / `mysql-schema.ts`). There is no incremental upgrade path from earlier development histories — reset local databases after baseline changes. Runtime seed helpers (`ensurePlatformMailSeed`, `ensurePlatformSubscriptionSettingsRow`, etc.) populate singleton rows after migrate; they are not part of the SQL history.

## Realm subscriptions

- **`subscriptions`** — One row per active (or scheduled/canceled) **realm** subscription: `tenant_id` always set; `user_id` **null** for tenant-wide billing, **set** for per-member billing. Links to **`platform_subscription_plans`**. Status values include `active`, `canceling`, `canceled`. Period boundaries `current_period_start` / `current_period_end` are stored in UTC. **`trial_ends_at`** is set from the plan’s **`trial_days`** at subscribe (calendar days, UTC). **`pending_plan_id`** references the target catalog tier for a **next-period** upgrade/downgrade (cleared when applied by the billing worker).
- **`platform_subscription_plans`** — Catalog tiers with **`trial_days`** (0–365), **`allow_tier_change_next_period`**, and **`disabled`** (omit from subscriber-facing catalog when true; do not delete tiers that have ledger payments).
- **`platform_subscription_payments`** — Internal **ledger** of amounts (outstanding / paid / cancelled / reimbursed, etc.); **not** a substitute for PSP-issued tax invoices or credit notes. **`subscription_id`** optionally ties a row to **`subscriptions`** (nullable for manual lines). **First line at subscribe** is inserted from the API when **`trial_days` is 0**; otherwise the first line is created by the **worker** after **`trial_ends_at`**. **Recurring and batch-generated lines** are expected from **`apps/worker`** (BullMQ); those jobs own **idempotency** and should align rows with **PSP invoices** (correlation in **`description`** until a dedicated external id column exists). See **[architecture.md](architecture.md)** (*Realm subscriptions* → payment ledger).

## Connection URL precedence

Implemented in **`packages/db/src/database-url.ts`**:

1. If **`DATABASE_URL`** is set (non-empty after trim), use it verbatim.
2. Otherwise compose from **`DATABASE_HOST`**, **`DATABASE_NAME`**, **`DATABASE_USER`**, optional **`DATABASE_PASSWORD`**, optional **`DATABASE_PORT`** (defaults: **5432** Postgres, **3306** MySQL).

## Generating and applying migrations

| Action | Postgres / Supabase | MySQL |
|--------|---------------------|-------|
| Generate SQL from schema changes | `pnpm --filter @starter/db db:generate:pg` (or `db:generate:supabase`) | `pnpm --filter @starter/db db:generate:mysql` |
| Apply pending migrations (CLI) | `pnpm --filter @starter/db db:migrate:pg` (or `db:migrate:supabase`) | `pnpm --filter @starter/db db:migrate:mysql` |

After schema changes, regenerate **`0000_baseline.sql`** for fresh installs (v1.0 policy: one baseline, no compatibility migrations).

## API startup migrations

When [environment.md](environment.md) `AUTO_MIGRATE` rules allow, the API runs pending migrations **before** listening (`packages/db` migrate helpers). In production use `AUTO_MIGRATE=off` if you migrate in CI, or `AUTO_MIGRATE=force` to deliberately migrate on boot.

## Identity keys and email storage

`users.identity_key` enforces uniqueness. With **`FIELD_ENCRYPTION_KEY`** set (required in production), it is `{tenantId}:{hmac}` / `SUPER:{hmac}` (no plaintext email in the key). Without that key, local dev may use plaintext `{tenantId}:{emailLower}` / `SUPER:{emailLower}`. Column **`users.email`** holds SFENC1 ciphertext when encryption is enabled. See `packages/db/src/repos.ts` and `packages/db/src/user-email-at-rest.ts`.
