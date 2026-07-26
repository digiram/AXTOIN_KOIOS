# ADR 004: Product AI harness — deferred

## Status

Accepted (deferred implementation)

## Context

An architectural audit asked whether the codebase has a centralized **runtime** AI harness for in-app LLM features. The repo had none. An initial implementation added `@starter/ai` with `@cursor/sdk`, but that was **not** the intended goal:

- **Cursor** is used for **IDE-assisted development** (rules, agents, skills) — not as a tenant-facing API inside the SaaS app.
- The desired outcome is **development-time governance**: a checklist and Cursor rule so future product AI is built safely when needed.

## Decision

1. **Do not** ship runtime AI or Cursor API integration in the product until explicitly approved (§1.1).
2. Maintain **[ai-harness-checklist.md](../guidelines/ai-harness-checklist.md)** as the living reference for harness requirements.
3. Load **[`.cursor/rules/ai-harness-development.mdc`](../../.cursor/rules/ai-harness-development.mdc)** when adding AI-related code paths.
4. When product AI is approved later, scaffold `@starter/ai` (or equivalent) per the checklist — **without** `@cursor/sdk` unless there is a specific server-side Cursor use case.

## Consequences

- No `packages/ai`, no `AI_*` env vars, no provider SDKs in the monorepo today.
- PRs that add LLM routes or provider imports should be reviewed against the checklist.
- Coding-assistant governance (`AGENTS.md`, `prompt-principles.md`, `.cursor/rules/`) remains separate from product AI.

## Alternatives considered

| Option | Rejected because |
|--------|------------------|
| Runtime `@starter/ai` + Cursor SDK now | Exposes wrong abstraction; user does not want Cursor API in the app |
| No documentation | Future AI features would repeat the same architectural gaps |
