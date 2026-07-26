# Canonical glossary

**Purpose:** One vocabulary for product copy, docs, APIs, and code comments so “the same idea” always has the **same name**. When you introduce a new concept, **add a row here** (or update an existing one) before spreading alternate wording across the repo.

**How to use**

- Prefer these **Preferred term** strings in UI and new Markdown unless a technical identifier (column name, JWT claim) requires the exact code spelling.
- **Code / schema** column shows the literal symbol when it differs from product language.
- If two words mean the same thing here, we call that out so we don’t invent a third.

---

## Tenant & organization

| Preferred term | Meaning | Code / schema |
|----------------|---------|----------------|
| **Tenant** | One customer organization in the multi-tenant model: a row in `tenants` plus all data scoped by its id. | Table: `tenants`. FK column: `tenant_id` (UUID). |
| **Tenant id** | The UUID that identifies a tenant everywhere (login, JWT, URLs). | `tenantId` in JSON/JWT; `tenant_id` in SQL. |
| **Email domain** | The DNS host part of a signup/login email (`user@acme.com` → `acme.com`). **Corporate** signups use it as the shared realm key. | Stored as `tenants.name` for corporate realms; see `extractEmailDomain` in `@starter/shared`. |
| **Consumer mailbox domain** | A public provider domain (Gmail, Outlook, …) where each address gets a **personal** realm, not a shared company tenant. | `CONSUMER_EMAIL_PROVIDER_DOMAINS` + `isConsumerEmailProviderDomain` in `@starter/shared`; personal tenant `name` prefix `personal:` (see API `register-tenant.ts`). |
| **Organization** | Legacy product wording for “the company”; **signup no longer sends a separate org name** — the realm is keyed by **email domain** (or a personal key). | `tenants.name` |
| **Realm** | **Product synonym for tenant** in auth and UI copy (“realm login”, “realm administrator”). Not a separate table. | `tenant_id` is a UUID in the database and JWT; **users are not asked for it at login** (realm comes from the email domain). |

---

## People & access

| Preferred term | Meaning | Code / schema |
|----------------|---------|----------------|
| **Platform** | The operator plane **without** a tenant: global super user, no `tenant_id`. | `tenant_id IS NULL` on `users`. |
| **Platform administrator** / **Super admin** | Same role: first-line operator for the whole product install. | JWT `role`: `super_admin`. Route area (web): `/super-admin`. |
| **Tenant administrator** | Admin of **one** tenant; provisioned by platform operator or promoted by policy — not granted by unverified signup. Optional **`CORPORATE_FIRST_USER_ADMIN=true`** grants `tenant_admin` to the first **verified** corporate-domain user when a realm has no admins. **Never** on consumer-mailbox personal realms. | JWT `role`: `tenant_admin`. Web: `/admin`. |
| **Tenant user** | Member of a tenant without org-wide admin powers. | JWT `role`: `tenant_user`. Web: `/user`. |
| **Session** | Browser (or client) holding access + refresh tokens and derived user claims—not server-side HTTP sessions. | `sessionStorage` keys in web; `AuthContext` “user”. |

---

## Authentication actions

| Preferred term | Meaning | Code / API |
|----------------|---------|------------|
| **Realm login** | Sign-in with **email + password**; realm is inferred from the **email domain** (no separate tenant id in the request). | `POST /auth/login`; `resolveTenantIdFromEmailForRealmLogin` in API. |
| **Platform login** | Same **`email` + `password`** request as realm login; API matches **`super_admin`** first (no tenant). | `POST /auth/login`; `email` is a **sign-in id** (see below). |
| **Sign-in id** | The logical email / id used at login—**RFC email** for realm users; **any** allowed platform id for super admin (e.g. `admin`). | Column `users.email` holds SFENC1 ciphertext when `FIELD_ENCRYPTION_KEY` is set. |
| **Bootstrap (super admin)** | Optional one-time API startup creation of the platform super admin from env vars. | `BOOTSTRAP_SUPER_ADMIN_*`; `bootstrapSuperAdmin()`. |
| **Access token** | Short-lived JWT for API authorization. | `accessToken` in JSON; JWT claims `sub`, `email`, `role`, optional `tenantId`. |
| **Refresh token** | Opaque secret returned once; server stores **hash** only; rotated on refresh. | `POST /auth/refresh`; table `refresh_tokens`. |

---

## Data model

| Preferred term | Meaning | Code / schema |
|----------------|---------|----------------|
| **Identity key** | Stable unique string per user; with encryption enabled, embeds an **HMAC** of tenant + normalized id (no plaintext email in the key). | Column `identity_key`; helpers in `user-email-at-rest.ts` / `computeIdentityKey`. |
| **Realm hint** | Client memory of last **`tenant_id`** returned by the API (e.g. after signup), not used for the login form anymore. | `lastTenantId` in `AuthContext`. |
| **Subscription (realm)** | First-class billing subject for a **tenant** (`user_id` null) or **member** (`user_id` set) on a **catalog plan**; rolling **monthly** periods and timestamps in **UTC** (v1). | Table `subscriptions`; APIs under `/tenant/subscription/*` (org) and `/account/subscription/*` (per-user). |
| **Company subscription (vendor registry)** | Tenant **documentation** of vendor/SaaS spend (Microsoft 365, Atlassian, etc.) — **not** PSP billing. | Module `company_subscriptions`; tables `company_subscription_*`; see [company-subscriptions-module.md](../company-subscriptions-module.md). |
| **Catalog plan** | Platform-defined tier (price, cadence, billing scope, optional **trial days**, **tier change next period**, **`disabled`**) in `platform_subscription_plans`; v1 subscriber flows only expose **monthly / count 1** enabled plans. | Super-admin UI + `GET …/subscription/catalog`. |
| **Pending plan (subscription)** | `subscriptions.pending_plan_id` — target catalog tier scheduled to replace `plan_id` at the next period boundary (worker). | `POST …/subscription/schedule-plan-change`, `DELETE …/subscription/scheduled-plan-change`. |
| **Subscription payment row** | Ledger line for an amount owed or settled; may reference `subscription_id` when generated from a realm subscription. | `platform_subscription_payments.subscription_id`. |
| **Tax & invoicing (B2B)** | VAT/GST IDs, invoice PDFs, sequential invoice numbers, formal credit notes — **deferred to the PSP**; this repo models **plans**, **subscriptions**, and **internal ledger rows** only. | [architecture.md](architecture.md) (*Realm subscriptions* → tax & invoicing). |
| **Subscription billing queue** (planned) | BullMQ queue for **renewal / invoice generation** and batch backfill of `platform_subscription_payments`; separate from the email queue. | Name pattern like **`{prod\|dev}-subscription-billing`**; producer + worker must match (see [best-practices.md](best-practices.md)). |
| **Ledger idempotency key** (logical) | Stable identifier so a worker never creates two rows for the same subscription period / PSP invoice (e.g. `subscription_id` + period start, or PSP invoice id). | Enforced in job + DB until a unique column exists; see [architecture.md](architecture.md). |

---

## Apps & packages (names we use in conversation)

| Preferred term | Points to |
|----------------|-----------|
| **API** | `apps/api` — Fastify HTTP server. |
| **Web** | `apps/web` — Vite + React SPA. |
| **Worker** | `apps/worker` — BullMQ consumer process. |
| **Mobile** | `apps/mobile` — Expo app. |
| **Shared package** | `packages/shared` — Zod + TS types crossing the wire. |
| **DB package** | `packages/db` — Drizzle schemas, repos, migrations. |
| **Crypto package** | `packages/crypto` — field encryption helpers. |
| **Logger package** | `packages/logger` — Pino factory. |

---

## User interface controls

| Preferred term | Meaning | Code / notes |
|----------------|---------|----------------|
| **Toggle** | A **binary** control: one setting is either on or off (like a physical toggle). **Use this word in UI copy** for the Integrations enable control and similar. | Same control in HTML uses **`role="switch"`** for accessibility (screen readers expect “switch” in the accessibility tree even when the visible label says **toggle** or **On/Off**). |
| **Switch** (spoken / ARIA) | In code, “switch” usually refers to the **ARIA role** (`role="switch"`), not a separate product concept. **Avoid** writing “switch” in visible labels if **toggle** or **On/Off** is clearer for users. | `role="switch"`, `aria-checked` on Integrations **Geolocation services** control (`SuperIntegrationsPage.tsx`). |
| **Toggle (visual)** | Product toggles should follow the same **track + sliding thumb + focus ring** pattern as Tailwind Plus form toggles (short toggle). | See [Tailwind Plus — Toggles](https://tailwindcss.com/plus/ui-blocks/application-ui/forms/toggles) for the reference layout; our implementation mirrors that structure in utility classes (no paid asset copy). |

---

## Background jobs

| Preferred term | Meaning | Code |
|----------------|---------|------|
| **Email queue** | BullMQ queue for welcome / async email jobs. | Name pattern **`{prod\|dev}-email`** (e.g. `dev-email`). API producer and worker **must** match. |
| **Subscription billing jobs** | BullMQ jobs that create or update subscription **ledger** rows and interact with the PSP; not part of the shipped worker until you register a second queue in `apps/worker`. | [architecture.md](architecture.md), [best-practices.md](best-practices.md). |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-05-19 | **Company subscriptions module** (vendor registry) — glossary row; distinct from realm billing. |
| 2026-05-19 | **Finance module removed** from template (region-specific bookkeeping). |
| 2026-05-03 | **Realm billing:** subscription billing queue / jobs / ledger idempotency key rows; links to architecture + best-practices for BullMQ payment generation. |
| 2026-05-02 | Added **User interface controls** (toggle vs ARIA `role="switch"`), plus **Toggle (visual)** row linking Tailwind Plus toggles reference. |
| *(add rows when you rename concepts)* | |
