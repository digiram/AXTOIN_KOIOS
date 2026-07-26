# Authentication

## Roles

Access JWT `role` is one of:

| Role | Tenant on user row | `tenantId` in JWT |
|------|--------------------|-------------------|
| `super_admin` | **NULL** (platform) | **Omitted** |
| `tenant_admin` | Set | Present |
| `tenant_user` | Set | Present |

## Registration (`POST /auth/register/start` → `POST /auth/register/verify`)

Contracts: **`registerStartSchema`** / **`registerVerifySchema`** in **`packages/shared`**. Legacy **`POST /auth/register`** returns **410**.

1. **Step 1** validates eligibility (platform + realm self-registration flags) and emails a six-digit verification code. Returns a short-lived **`registrationTicket`** JWT (`typ: registration_step`).
2. **Step 2** verifies the code, then creates the tenant/user. **Email ownership is required** before any account exists.
3. **Email domain** is parsed from `email` (part after `@`, lowercased).
4. **Consumer mailbox domains** (Gmail, Outlook, Yahoo, etc.) → deterministic personal tenant per email. New users are **`tenant_user`**.
5. **Corporate domains** → shared realm (`tenants.name` = domain). New verified users default to **`tenant_user`**. Set **`CORPORATE_FIRST_USER_ADMIN=true`** on the API to grant **`tenant_admin`** to the first verified user when the realm has no admins (demo/dev only).
6. Duplicate **same email within the same tenant** → **409** at step 1.
7. Platform **`selfRegisterEnabled`** defaults to **false** — enable in Super Admin → Features for open signup.

**Legacy data:** tenants created before this rule may use a **free-text** `tenants.name` (e.g. “Acme Inc”). New domain-based signups use **`acme.com`** as the key — they **do not** automatically merge with old rows. Migrate or rename tenants manually if you need a single realm.

## Login (`POST /auth/login`)

Contracts live in **`packages/shared`** (`loginSchema`): **`email`** + **`password`** only (no `tenantId`).

1. **Platform** — If a **`super_admin`** row exists for that sign-in string (`findSuperAdminByEmail`), password is verified and tokens are issued **without** a realm (`tenant_id` null). The `email` field accepts a **username-style id** with no `@` when used only for this path.
2. **Realm** — Otherwise the API derives **`tenant_id`** from the **email domain** (consumer vs corporate — same `tenants.name` rules as registration via `resolveTenantIdFromEmailForRealmLogin`), then **`findUserByTenantEmail(tenantId, email)`**. If no tenant exists for that domain, credentials are rejected (**401**).

## Refresh tokens

- Opaque random string returned once to the client; DB stores **SHA-256** hash only.
- **`POST /auth/refresh`** rotates the row (delete old, insert new) and issues a new access JWT. Tenant scope is preserved from the refresh row (`tenant_id` nullable for super admin).

## Bootstrap super admin

Optional API startup (`apps/api/src/lib/bootstrap-super-admin.ts`):

- Set **`BOOTSTRAP_SUPER_ADMIN_EMAIL`** and **`BOOTSTRAP_SUPER_ADMIN_PASSWORD`**.
- **Idempotent:** if a platform user with that email already exists, skip.
- Creates one row: `role = super_admin`, `tenant_id = NULL`.

## Web client notes

- **API base URL:** resolved from repo `.env` (see [development.md](development.md)).
- **`lastTenantId`** in `AuthContext` is a **hint** for the login form; it is **cleared on logout** and after login/refresh when the response has **no** `tenantId`, so platform sign-in is not accidentally sent as realm login with a stale UUID.

## Mobile

Thin client over the same `/auth/*` routes; see `apps/mobile/src/api.ts`.
