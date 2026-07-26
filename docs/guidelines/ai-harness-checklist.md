# AI harness checklist (development reference)

**Purpose:** This repo does **not** ship runtime LLM/AI in the product today. Use this checklist when **planning or implementing** product AI (summaries, drafting, agents, RAG, etc.) so features do not bypass governance.

**Not this doc:** Cursor IDE rules (`.cursor/rules/`), `AGENTS.md`, and `prompt-principles.md` govern **coding-assistant** collaboration — not in-app LLM calls.

**Cursor rule:** [`.cursor/rules/ai-harness-development.mdc`](../../.cursor/rules/ai-harness-development.mdc)

---

## Before you start (mandatory gates)

1. **§1.1 structural approval** ([`prompt-principles.md`](prompt-principles.md)) — new package, provider SDK, worker pipeline, or HTTP AI surface needs explicit approval.
2. **Define done** — which users/roles, tenant scope, data sources, failure UX, and whether outputs affect persisted data.
3. **No direct provider calls** — plan a single harness entry point; routes/workers must not import OpenAI/Anthropic/Cursor SDKs directly.

---

## Harness architecture checklist

When implementing product AI, verify:

| Area | Requirement |
|------|-------------|
| **Centralized access** | One module (e.g. `packages/ai`) owns all provider calls |
| **Provider abstraction** | Interface + config-driven implementation(s); stub for tests |
| **Prompt governance** | Versioned registry; no inline prompt strings in routes |
| **Context** | JWT-scoped `tenantId` / `userId`; never trust client tenant id alone |
| **Token budget** | Max input length, trimming strategy documented |
| **Structured outputs** | Zod validation; bounded retry on parse failure |
| **Input guardrails** | Sanitize user content; delimiter separation from system instructions |
| **Output guardrails** | Schema validation; sanitize before persisting or rendering HTML |
| **Secrets** | Provider keys server-only; never in client bundle or logs |
| **Master switch** | `AI_ENABLED` (or equivalent) off by default in production until ready |
| **Observability** | Structured logs: provider, model, latency, prompt version, tenant correlation |
| **Reliability** | Timeouts, retry policy, graceful degradation when provider down |
| **Authorization** | AI output cannot bypass module permissions or tenant isolation |
| **Tests** | Stub provider in CI; no live API keys in `pnpm verify` |

---

## Suggested layout (when approved)

```
packages/ai/           @starter/ai — harness facade, providers, prompt registry
apps/api/              Thin routes; call harness only
apps/worker/           Long-running AI jobs via harness
packages/shared/       Zod output schemas shared with API + web (if needed)
docs/adr/              ADR for provider choice, streaming, tenant data boundaries
.env.example           Document AI_* vars (server-only)
```

---

## Audit prompt (reuse for reviews)

Copy this when reviewing AI-related PRs or planning a feature:

> Inspect whether every LLM call passes through a single harness, prompts are versioned and not duplicated, tenant context comes from JWT, outputs are schema-validated, secrets are server-only, failures are logged with correlation ids, and no route imports a provider SDK directly.

---

## Current status

| Item | Status |
|------|--------|
| Runtime AI harness | **Not implemented** (intentional) |
| Cursor API in app | **Not wanted** — Cursor is for IDE development only |
| Coding-assistant governance | **Active** — `AGENTS.md`, `.cursor/rules/`, `prompt-principles.md` |
| Workforce `employeeKind: agent` | Product taxonomy + **agent mailbox** connect (no LLM) |

---

## Anti-patterns

- Exposing Cursor API / `@cursor/sdk` through tenant HTTP routes
- Inline prompts in `apps/api/src/routes/*`
- Storing API keys in `VITE_*` or mobile public env
- Logging full prompts/responses with PII
- Adding AI endpoints without module permission design

---

## When ready to implement

1. Get §1.1 approval for package location and provider(s).
2. Scaffold `@starter/ai` with stub provider + tests first.
3. Add ADR documenting decisions.
4. Wire one internal feature behind `AI_ENABLED` before broad rollout.
