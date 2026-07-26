# Cursor rules index

Rules in this folder guide AI assistants and humans in Cursor.

| Rule | Scope | Purpose |
|------|--------|---------|
| [`guidelines-hub.mdc`](guidelines-hub.mdc) | Always | Entry to **`docs/guidelines/`** vs feature `*-module.md` requirement tracking |
| [`requirement-clarification.mdc`](requirement-clarification.mdc) | Always | Structural approval (§1.1), requirement Q&A before non-trivial work |
| [`integration-regression-guards.mdc`](integration-regression-guards.mdc) | Always | Route + sidebar + AppShell consistency; React peer compatibility |
| [`dev-only-env-prefix.mdc`](dev-only-env-prefix.mdc) | Always | `DEV_ONLY_*` naming for non-production env vars |
| [`ai-harness-development.mdc`](ai-harness-development.mdc) | AI-related paths | Gate for **future in-app** LLM work — read harness checklist first |
| [`tables-ui-behaviour.mdc`](tables-ui-behaviour.mdc) | `apps/web/**` | Table sort, pagination, layout |
| [`forms-validation-save-buttons.mdc`](forms-validation-save-buttons.mdc) | `apps/web/**` | Form validation and save button states |
| [`ui-icons-lucide.mdc`](ui-icons-lucide.mdc) | `apps/web/**` | Prefer Lucide icons over ad-hoc SVG |

Human-readable onboarding: [`../docs/guidelines/README.md`](../docs/guidelines/README.md), [`../docs/guidelines/ai-dev-guide.md`](../docs/guidelines/ai-dev-guide.md), [`../AGENTS.md`](../AGENTS.md).
