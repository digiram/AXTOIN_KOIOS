# Best practices (starter conventions)

Security-specific guidance lives in **[security.md](security.md)** (including the **Security best practices** checklist).

## Single source of truth for HTTP contracts

- Put **Zod request (and shared) schemas** in **`packages/shared`** so `apps/api`, `apps/web`, and `apps/mobile` cannot drift.
- Infer TypeScript types with `z.infer<typeof schema>` in consumers.

## Validation layering

- **Server:** always validate with the shared schema (or stricter) before touching the DB.
- **Client:** use the same schema for early UX feedback; never assume the client ran validation.
- Treat validation as a **security control**, not only UX — see [security.md](security.md) (tokens, tenant scope, rate limits).

## Background jobs / BullMQ

- **Queue name** must match between producer and consumer. This repo uses **`{prod|dev}-email`** (e.g. `dev-email`). **Do not** put `:` in the queue name — BullMQ rejects it.
- API enqueue: `apps/api/src/lib/email-queue.ts`. Worker: `apps/worker/src/index.ts`.

## Subscription payment generation (BullMQ)

When you add renewal / invoice generation for realm subscriptions:

- **Dedicated queue** — Use a separate queue from email (e.g. **`{prod|dev}-subscription-billing`**) so concurrency, retries, and super-admin inspection stay isolated.
- **Throughput** — Prefer **many small jobs** or **chunked jobs** (~**1000** subscription ids per unit of work is a reasonable default) over one giant job; cap **worker concurrency** (e.g. low single digits) so DB writes and PSP calls stay under rate limits.
- **Idempotency** — Use **`jobId`** (deterministic string per logical invoice) so BullMQ does not enqueue duplicates on retry; still **guard the DB** with a “row already exists for this subscription + period” check or a future **unique** constraint on an external invoice id.
- **PSP** — Charge intent / invoice id should round-trip into **`platform_subscription_payments`** (today: **`description`** as structured metadata; later: nullable **`external_id`** / **`psp_invoice_id`** + unique index). Webhooks that flip **`paid_at`** / status should run in the worker or a payment microservice, not block user HTTP.
- **Observability** — Log **`subscription_id`**, payment **`id`**, and PSP correlation id at **info** on success; **warn** on retryable PSP errors with backoff.
- **Period rollover** — When advancing **`current_period_start` / `current_period_end`**, call **`applyPendingPlanChangeForSubscriptionId`** (`@starter/db`) so **`pending_plan_id`** becomes the active **`plan_id`** before generating the next period’s charge.

## Logging

- Use **`@starter/logger`** in API and worker; avoid `console.log` in new code paths.
- Tune with `LOG_LEVEL`, `VERBOSE`, `LOG_PRETTY`, `LOG_HTTP` (see [environment.md](environment.md)).
- Do **not** log secrets, tokens, or raw PII — [security.md](security.md) (*Security best practices* → Tokens and sessions / Incident readiness).

## Where to document new behavior

1. **File-level module comment** at the top of the route, repo, or plugin you change (what it owns, invariants, env flags).
2. **Cross-cutting or onboarding** updates in this **`docs/`** folder so reviewers can edit Markdown without spelunking the tree.

## Database changes

1. Edit Drizzle schema under `packages/db/src`.
2. Run the correct **`db:generate:*`** for your dialect.
3. Commit generated SQL under `packages/db/drizzle/`.
4. Apply with **`db:migrate:*`** or rely on **`AUTO_MIGRATE`** (`dev` default) in dev; production uses `force` (boot) or `off` (CI).

## Graceful shutdown (API)

- The API handles **SIGINT/SIGTERM** and calls **`app.close()`** so dev (`tsx watch`) and deploys release the listening port cleanly.

## UI / Tailwind

- Prefer **utility-first** patterns consistent with existing shells (`AppShell`, auth card). For product-wide theme changes, centralize tokens or shared components rather than one-off hex in pages.
- **Reuse first:** the UI should **prefer existing components** (or small, intentional **extensions / variants** of them) over new one-off markup in pages — that keeps layout, spacing, and behavior consistent and makes refactors cheaper.

## Test-driven development (TDD) and automated checks

- Follow the **red → green → refactor** loop for deterministic logic (schemas, parsers, crypto, hashing, env-driven helpers). Prefer adding tests in **`packages/shared`** and **`packages/*`** so API routes stay thin orchestrators.
- Run **`pnpm verify`** (typecheck + tests) before opening a PR; use **`pnpm build:ci`** when you need builds after the same gate.
- Full conventions, commands, and where to put tests: **[testing.md](testing.md)**.

## See also

- **[testing.md](testing.md)** — TDD strategy, `verify` / `build:ci`, Vitest vs `node:test`.
- **[security.md](security.md)** — API hardening, secrets, tenant isolation, checklist for shipping and production.
