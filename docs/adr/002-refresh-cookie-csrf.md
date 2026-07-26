# ADR 002: Optional HttpOnly refresh cookies + CSRF

## Status

Accepted (Phase 2)

## Context

Storing refresh tokens in `sessionStorage` is simple for SPAs but increases XSS blast radius. HttpOnly cookies reduce JavaScript access at the cost of CSRF on cookie-authenticated mutating requests.

## Decision

- **Opt-in** via `REFRESH_TOKEN_IN_COOKIE=true` on the API and `VITE_REFRESH_TOKEN_IN_COOKIE=true` on the web build.
- Set refresh in **`starter_refresh`** (HttpOnly, `SameSite=Lax`, `Secure` in production).
- Issue a readable **`starter_csrf`** cookie and require matching **`X-CSRF-Token`** on unsafe methods when cookie mode is enabled (`apps/api/src/plugins/csrf.ts`).
- Omit `refreshToken` from JSON auth responses when cookie mode is on; `/auth/refresh` accepts cookie or body.
- Require **`CORS_CREDENTIALS=true`** and explicit **`CORS_ORIGINS`** (no `*`) for cross-origin SPAs.

## Consequences

- Default remains sessionStorage refresh tokens (no CSRF double-submit).
- Production cookie mode needs aligned CORS and HTTPS (`COOKIE_SECURE` / `NODE_ENV=production`).
