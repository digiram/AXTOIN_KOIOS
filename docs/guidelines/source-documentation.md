# Source file documentation standards

Canonical rules for **in-code** documentation across the monorepo. Markdown under `docs/guidelines/` covers cross-cutting architecture and process; **this guide** covers what belongs at the top of every source file and on every significant export.

**Audience:** human maintainers and coding assistants. When you change behavior, update the nearest file header and exported symbol docs in the same PR.

---

## Goals

A new developer should open **any** source file and immediately understand:

- why the file exists
- how it fits the application
- what significant exports do (including security and side effects)
- where to extend safely

---

## File header (required)

Every `.ts`, `.tsx`, `.js`, and `.jsx` source file (including tests) must begin with a block comment **before imports**:

```ts
/**
 * Short file title (PascalCase for modules, or descriptive phrase).
 *
 * One-paragraph purpose — what problem this file solves in the product.
 *
 * Responsibilities:
 * - Bullet list of main duties (2–6 items)
 *
 * Depends on:
 * - Key modules/packages (when non-obvious)
 *
 * Related:
 * - Route, repo, or guideline links when useful
 *
 * Security:
 * - Authorization, encryption, tenant scope, rate limits (when applicable)
 *
 * Notes:
 * - Assumptions, limitations, extension points
 */
```

### Header rules

| Rule | Detail |
|------|--------|
| **Placement** | First non-empty lines in the file; then imports |
| **Length** | Prefer 8–25 lines; longer only for large route/repo modules |
| **Accuracy** | Must match current code — remove stale TODOs and historical notes |
| **Tests** | Test files document *what behavior* is asserted and *which module* is under test |
| **Config** | `vite.config.ts`, `playwright.config.ts`, etc. document what they wire and env assumptions |

Skip re-stating obvious filenames ("this is `foo.ts`"). State **why** and **how it fits**.

**Trap:** Do not put glob patterns like `src/**/*.test.ts` inside a `/** */` file header — the `*/` sequence closes the comment early. Describe globs in prose instead.

---

## Exported and significant symbols

Document every **exported** and **security-sensitive internal**:

- classes, interfaces, types, enums
- functions, methods, hooks, components
- services, repositories, middleware, constants, config objects

Use TSDoc/JSDoc:

```ts
/**
 * Issues short-lived access JWTs after successful password verification.
 *
 * @param user - Realm user row; `tenant_id` must match the login realm.
 * @returns Signed access token payload (not the wire string).
 * @throws When MFA step-up is required (`MfaRequiredError`).
 *
 * Security: Never embed refresh tokens in the access JWT.
 */
```

### What to include

| Field | When |
|-------|------|
| **Purpose / why** | Always for non-trivial symbols |
| **Parameters** | Public functions, hooks, components (`@param`) |
| **Returns** | `@returns` or described return type |
| **Throws** | Expected error paths |
| **Side effects** | DB writes, queue enqueue, cookies, storage, network |
| **Security** | Tenant scope, authz, encryption, sanitization |
| **Performance** | Caching, N+1, batching — only when non-obvious |

Do **not** document trivial getters/setters or one-line wrappers unless they encode non-obvious policy.

---

## By artifact type

| Kind | Document |
|------|----------|
| **React component** | Purpose, props, state, side effects, a11y notes if non-default |
| **Hook** | Inputs, return shape, when it refetches, tenant/auth assumptions |
| **Repository** | Tables touched, tenant filter, transactions, encryption boundaries |
| **Route module** | URL prefix, auth guard, validation entrypoints, related repos |
| **Zod schema / type** | Domain meaning, invariants, consumers (API vs web) |
| **Worker job** | Queue name, idempotency, retry semantics |

---

## Security documentation

Whenever code touches auth, tenancy, secrets, or PII:

- **why** validation or authorization runs (not only that it runs)
- encryption choices (field vs blob, AAD binding)
- what must never be logged or returned to clients
- rate limiting or audit logging intent

Cross-check [`security.md`](security.md) and [`authentication.md`](authentication.md).

---

## Remove and avoid

- Outdated or misleading comments
- Obsolete `TODO` / `FIXME` without an owner or issue
- Commented-out dead code
- Duplicate prose (header vs every function saying the same thing)
- Comments that restate the code (`// increment i`)

---

## Consistency

- Terminology: [`glossary.md`](glossary.md) (tenant, realm, module keys)
- Capitalization: sentence case in prose; `code` for identifiers
- Format: TSDoc tags (`@param`, `@returns`, `@throws`) for exports; `/** */` block headers for files
- Match existing style in the nearest sibling file when adding new docs

---

## Verification before merge

1. Every touched source file has an accurate file header.
2. New or changed exports are documented.
3. Security-sensitive paths mention scope and failure modes.
4. No stale comments left in edited files.
5. `pnpm verify` still passes (docs-only changes should not break types).

---

## Where prose lives

| Layer | Location |
|-------|----------|
| File purpose & exports | Source file headers + TSDoc (this guide) |
| Golden paths & invariants | [`ai-dev-guide.md`](ai-dev-guide.md), [`AGENTS.md`](../../AGENTS.md) |
| Module product rules | `docs/*-module.md` |
| Operator / onboarding hub | [`../index.html`](../index.html) |

When a rule applies repo-wide, update the **guideline** once; when it applies to one module, prefer the **file header** and module doc.
