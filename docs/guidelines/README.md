# Coding guidelines (continuous)

**Purpose:** Durable conventions for how we build in this repo — architecture, security, testing, collaboration gates, and golden paths. These apply across features and sessions.

**Not here:** Feature **requirement tracking** (recorded product decisions, phased delivery, acceptance criteria) lives in sibling files under `docs/` — e.g. [`invoicing-quoting-module.md`](../invoicing-quoting-module.md), [`sales-funnel-module.md`](../sales-funnel-module.md). Use those when implementing a specific module; use **this folder** for cross-cutting rules.

| Area | Location |
|------|----------|
| **Guidelines (this folder)** | Architecture, setup, security, testing, vocabulary, collaboration |
| **Module specs** | `docs/*-module.md` — product decisions & delivery scope per feature |
| **ADRs** | [`docs/adr/`](../adr/) — accepted architectural decisions |
| **Runbooks** | [`docs/runbooks/`](../runbooks/) — deploy, production, incident |

**Coding assistants:** start at [`AGENTS.md`](../../AGENTS.md), then this page. Cursor loads [`.cursor/rules/`](../../.cursor/rules/) automatically.

---

## Read order (agents & onboarding)

| Order | Document | Why |
|-------|----------|-----|
| 1 | [`ai-dev-guide.md`](ai-dev-guide.md) | Golden paths, invariants, anti-patterns |
| 2 | [`prompt-principles.md`](prompt-principles.md) | When to ask before building (§1.1 structural, §2 requirements) |
| 3 | [`modules-index.md`](modules-index.md) | URL prefix → route file → repo file |
| 4 | [`glossary.md`](glossary.md) | Canonical terms (tenant, realm, module keys) |
| 5 | [`security.md`](security.md) + [`contributing-security.md`](contributing-security.md) | Hardening checklist |
| 6 | [`testing.md`](testing.md) | `pnpm verify`, integration, E2E |
| 7 | [`source-documentation.md`](source-documentation.md) | In-code file headers and TSDoc on exports |
| 8 | [`.cursor/rules/`](../../.cursor/rules/) | Always-on + scoped web UI rules |

Deep dives as needed: [`architecture.md`](architecture.md), [`best-practices.md`](best-practices.md), [`development.md`](development.md), [`environment.md`](environment.md), [`database.md`](database.md), [`authentication.md`](authentication.md).

---

## How layers stack

| Layer | Role | Primary sources |
|-------|------|-----------------|
| **Entry** | What to read first | [`AGENTS.md`](../../AGENTS.md), this README |
| **Gate** | Ask vs build | [`prompt-principles.md`](prompt-principles.md), [`.cursor/rules/requirement-clarification.mdc`](../../.cursor/rules/requirement-clarification.mdc) |
| **Shape** | Architecture, paths, vocabulary | [`architecture.md`](architecture.md), [`ai-dev-guide.md`](ai-dev-guide.md), [`modules-index.md`](modules-index.md), [`glossary.md`](glossary.md) |
| **Quality** | Security, tests, ops | [`security.md`](security.md), [`contributing-security.md`](contributing-security.md), [`testing.md`](testing.md), [`../runbooks/`](../runbooks/) |
| **UI** | Web consistency | [`.cursor/rules/integration-regression-guards.mdc`](../../.cursor/rules/integration-regression-guards.mdc) + scoped web rules |

**Precedence:** your **current message** wins → **§1.1 structural** + security invariants → everything else. Waiving clarification (§2) does **not** waive structural approval (§1.1) unless you say so for that task.

---

## Guideline clusters (merged index)

Use this table to find the **canonical doc** per concern. Edit the linked file when a rule changes; do not duplicate prose here.

| Cluster | What it governs | Canonical doc(s) |
|---------|-----------------|------------------|
| **Before building** | §1.1 structural approval, requirement hard stops, Q&A discipline, self-gate, when to skip grill | [`prompt-principles.md`](prompt-principles.md) |
| **Product AI (future)** | Runtime harness requirements when adding in-app LLM — not shipped today | [`ai-harness-checklist.md`](ai-harness-checklist.md), [ADR 004](../adr/004-ai-harness.md) |
| **Repo shape & DDD** | Monorepo roles, bounded contexts, multi-tenancy, `/v1` API, optional modules | [`architecture.md`](architecture.md), [`ai-dev-guide.md`](ai-dev-guide.md), [`../adr/`](../adr/) |
| **Golden paths** | Routes, Zod contracts, DB migrations, auth, OpenAPI, logging, anti-patterns | [`ai-dev-guide.md`](ai-dev-guide.md), [`best-practices.md`](best-practices.md), [`modules-index.md`](modules-index.md), [`source-documentation.md`](source-documentation.md) |
| **Vocabulary** | Tenant/realm, roles, billing vs vendor registry; new terms → glossary | [`glossary.md`](glossary.md) |
| **Security & tenancy** | JWT scope, CSP/headers (Hostinger), CORS, encryption, PR checklist | [`security.md`](security.md), [`contributing-security.md`](contributing-security.md), [`authentication.md`](authentication.md) |
| **Data** | Dual dialect, migrations, email at rest, subscription ledger | [`database.md`](database.md), [`environment.md`](environment.md) |
| **Background jobs** | BullMQ naming, email queue, subscription billing idempotency | [`best-practices.md`](best-practices.md), [`architecture.md`](architecture.md) (realm subscriptions) |
| **Local dev & env** | Install, commands, ports, `.env`, Docker | [`development.md`](development.md), [`environment.md`](environment.md) |
| **Testing & handoff** | TDD, runners, fixtures, `pnpm verify` / `build:ci` | [`testing.md`](testing.md) |
| **Deploy & production** | Secrets, migrate in CI, health checks, CSP post-deploy, **Hostinger 3-slot** (`build:api` / `build:web` / `build:worker`) | [`../runbooks/deploy.md`](../runbooks/deploy.md), [`../runbooks/`](../runbooks/) |
| **Web UI shell** | Route + sidebar + title, AppShell, React peers, tables/forms/icons | [`.cursor/rules/`](../../.cursor/rules/) |

**Module-specific behaviour** (statuses, permissions, data model for one feature) → the relevant `docs/*-module.md`, not this index.

---

## Maintainer map

| If you change… | Edit this file | Cursor rule (if any) |
|----------------|----------------|----------------------|
| When to ask vs build | [`prompt-principles.md`](prompt-principles.md) | `requirement-clarification.mdc` (thin pointer) |
| Product AI / LLM (future) | [`ai-harness-checklist.md`](ai-harness-checklist.md) | `ai-harness-development.mdc` |
| Repo map, invariants, read order | [`AGENTS.md`](../../AGENTS.md) | `guidelines-hub.mdc` |
| Golden paths & anti-patterns | [`ai-dev-guide.md`](ai-dev-guide.md) | — |
| System shape, billing architecture | [`architecture.md`](architecture.md) | — |
| Contracts, validation, jobs, UI reuse | [`best-practices.md`](best-practices.md) | — |
| Env vars | [`environment.md`](environment.md) + `.env.example` | [`field-encryption.md`](field-encryption.md) |
| Hostinger / production deploy | [`../runbooks/deploy.md`](../runbooks/deploy.md), [`../runbooks/production-checklist.md`](../runbooks/production-checklist.md) | — |
| Auth flows | [`authentication.md`](authentication.md) | — |
| Security & CSP | [`security.md`](security.md) | — |
| PR security gates | [`contributing-security.md`](contributing-security.md) | — |
| Tests & CI | [`testing.md`](testing.md) | — |
| DB & migrations | [`database.md`](database.md) | — |
| Route → file map | [`modules-index.md`](modules-index.md) | — |
| Terms | [`glossary.md`](glossary.md) | — |
| Nav / React peers / previews | — | `integration-regression-guards.mdc` |
| Tables / forms / icons | — | respective `.mdc` under `.cursor/rules/` |
| **Feature requirements** | `docs/*-module.md` (parent folder) | — |

---

## All files in this folder

| File | Contents |
|------|----------|
| [`architecture.md`](architecture.md) | Monorepo, DDD, system diagram, realm subscriptions & billing |
| [`ai-dev-guide.md`](ai-dev-guide.md) | Golden paths, invariants, anti-patterns |
| [`ai-harness-checklist.md`](ai-harness-checklist.md) | Future in-app LLM harness requirements (not shipped) |
| [`best-practices.md`](best-practices.md) | Shared contracts, validation, queues, logging, TDD pointer |
| [`prompt-principles.md`](prompt-principles.md) | Collaboration: structural approval, requirement Q&A |
| [`authentication.md`](authentication.md) | Roles, login/register, refresh, bootstrap |
| [`development.md`](development.md) | Prerequisites, commands, tooling map |
| [`environment.md`](environment.md) | Environment variables reference |
| [`database.md`](database.md) | Drizzle, dialects, migrations |
| [`security.md`](security.md) | API hardening, CSP, tenant isolation, checklist |
| [`contributing-security.md`](contributing-security.md) | Short PR security checklist |
| [`testing.md`](testing.md) | TDD, `verify` / `build:ci`, Vitest vs `node:test` |
| [`glossary.md`](glossary.md) | Canonical vocabulary |
| [`modules-index.md`](modules-index.md) | HTTP prefix → route file → repo file |
| [`source-documentation.md`](source-documentation.md) | In-code file headers, TSDoc, security notes in source |

Browser hub: [`../index.html`](../index.html).
