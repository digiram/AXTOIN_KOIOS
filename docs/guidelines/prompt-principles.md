# Prompt principles (human ↔ assistant)

Use this file to **align how we work** in this repository. Edit it anytime; treat it as living guidance for you and for coding assistants.

---

## 1. Involve me in technical design decisions

When a choice has **meaningful trade-offs** (architecture, libraries, data modeling, API shape, security model, performance strategy, migration approach, UX flows, etc.) **or** when it matches a **§1.1 structural trigger**, **stop and ask me before implementing** (a short written proposal or options list is fine; **do not** merge scaffolding, scripts, proxies, or new apps until I’ve had a chance to approve or steer).

**Do:**

- Name the decision in plain language and offer **2–3 concise options** when helpful (pros/cons or constraints).
- Call out **risks, reversibility, and what you’re assuming** if I stay silent.
- Prefer a **short, direct question** over a long essay.
- If I already said “just integrate X” but **§1.1** applies, still **surface the fork** (e.g. in-app vs iframe vs separate app) and wait for a pick unless I explicitly waived **§1.1** for this task.

**Don’t:**

- Pick a non-trivial design path silently because it “seems obvious” — **including** scaffolding directories, new `package.json` apps, `pnpm`/workspace boundaries, dev proxies, or `concurrently` multi-process scripts.
- Bury the decision inside a large change without surfacing it first.

*Fine-tune:* I want to be **pulled into** design forks, not only informed after the fact.

### 1.1 Structural triggers — consult before building

These are **high-impact repo and runtime shapes**. **Do not implement** them (beyond a one-paragraph proposal with options) until I **explicitly approve** a direction or waive this section for the current task.

| Trigger | Why it needs my sign-off |
|--------|---------------------------|
| **Second bundler / app entry** (e.g. another Vite/Webpack app, `tools/*` app, nested lockfile) | New dev mental model, CI, ownership, drift from main app. |
| **Second major framework/runtime version** (e.g. React 18 app alongside React 19) | Duplicated deps, type/DOM/event quirks, upgrade tax. |
| **Extra always-on dev process** (e.g. `concurrently` second server, mandatory second port) | Everyone must run N terminals; docs and onboarding change. |
| **Dev proxy / path rewrite** to another origin for a feature | Hides production vs dev differences; security/CORS assumptions. |
| **Iframe + `postMessage` (or similar) embedding** of a separate UI | Security sandbox, auth, sizing, and long-term maintainability. |
| **New deployable, Docker service, or queue** | Ops cost, not just code. |

If I answer “yes, integrate library X” **without** choosing shape, **default to the smallest in-repo change** (e.g. same Vite app, same React major) and **still ask** if the honest integration path hits any row in this table.

---

## 2. Clarify requirements until they are crystal clear

When I state a **requirement** (feature, bugfix, refactor scope, acceptance criteria), **keep asking follow-up questions** until there is no important ambiguity left. **Bias toward over-clarifying** rather than shipping a clever guess about product intent, security, or compatibility.

**Do:**

- Ask about **scope** (in/out), **users/roles**, **environments**, **data**, **compatibility**, **deadlines**, and **definition of done**.
- If something is underspecified, say what you’re **about to assume** and ask me to confirm or correct.
- When you spot **ambiguity or gaps** (even if I didn’t ask for “options” or “a table”), **take initiative**: offer **forced-choice multiple choice** (A / B / C, short trade-off per option). Use a **markdown table** when several independent dimensions need a pick at once (e.g. rows = topics, columns = options). I don’t have to request that format first.
- Prefer **one focused question at a time** or a **small numbered list** if several clarifications are needed at once.

**Don’t:**

- Start a large implementation on a vague one-liner without clarifying.
- Pretend the requirement is clear to avoid “bothering” me — ambiguity costs more later.

*Fine-tune:* **Continuous clarification** until the requirement is **crystal clear** to both of us — including **pushback** when a request is internally inconsistent or would silently violate an earlier constraint.

### 2.1 Hard stops — clarify before coding

Do **not** start implementation (beyond trivial one-file fixes) until these are settled or explicitly waived by me:

| Trigger | What to ask / surface |
|--------|------------------------|
| **No definition of done** | How will we know it’s correct? Tests, screenshots, API contract, rollout flag? |
| **Scope fuzzy** | What is explicitly *out* of scope? What must not change? |
| **User / tenant / role unclear** | Who can do this? On behalf of which actor? Super-admin vs tenant vs anonymous? |
| **Data lifecycle unclear** | Create/update/delete? Idempotency? Backfill? Migration? |
| **Compatibility / version** | Browsers, Node, DB dialect, mobile, React major, third-party API limits? |
| **Security / PII / compliance** | Authz, encryption, retention, audit logs, rate limits? |
| **UX ambiguous** | Exact flows, empty states, errors, copy tone, accessibility bar? |
| **“Similar to X” / inspiration only** | Which behaviours are mandatory vs nice-to-have? What must differ from X? |
| **Conflict with repo reality** | If my request contradicts existing patterns, **quote the conflict** and ask which side wins. |
| **Repo topology / dual stack** (see **§1.1**) | Second app, React major fork, extra dev server, proxy/iframe embed, nested workspace — **approval before scaffolding**. |

If I waive clarification (“just ship something”), still state **assumptions in one short block** so I can correct them later. **Waiving §2 does not waive §1.1** unless I say so explicitly for this task.

### 2.2 Q&A discipline (“grill me”)

Treat requirement gathering like a **short discovery interview**, not a single permission question.

**Do:**

- Ask **blocking** questions before **nice-to-have** polish questions.
- **Proactively** use **multiple choice** when specs are unclear or incomplete — **even if I never said** “give me options,” “forced choice,” or “use a table.” Don’t wait for permission to structure the question that way; surface the fork and ask me to pick.
- When there are real forks, offer **forced-choice** options (A / B / C) with **one-line trade-off each**, not an open-ended “what do you think?” For several topics at once, a **markdown table** (numbered rows + option columns) keeps answers compact (e.g. “row 1 → B”).
- Separate **facts I must supply** from **decisions I must own** (e.g. “default is X unless you pick Y”).
- If I answer only part of a multi-part question, **re-ask the missing parts** before proceeding.
- Use the **AskQuestion** tool (or an explicit numbered list in chat) when options are enumerable — reduces back-and-forth noise.

**Don’t:**

- Collapse multiple unknowns into one vague “does that work for you?”
- Accept “you decide” on **product-visible** choices without listing what you will pick and inviting a one-line veto.

### 2.3 “Clear enough” checklist (assistant self-gate)

Before writing non-trivial code, confirm (mentally or in-reply) **all** that apply:

1. **Goal** — One sentence outcome I would agree with.
2. **Scope** — In / out / must-not-break listed.
3. **Interfaces** — APIs, routes, events, DB tables touched (or “none”).
4. **Failure modes** — Errors, empty data, partial permissions — expected behaviour stated or assumed and flagged.
5. **Verification** — How this will be tested or manually checked.

If any item is missing and isn’t trivial, **ask** — do not fill the gap silently when it affects behaviour users see or data we persist.

### 2.4 When lightweight clarification is enough

You may skip a full grill only when **all** hold:

- Change is **localized** (e.g. one component, one handler, typo, obvious bug with clear repro).
- **No** new user-facing behaviour, **no** schema/API change, **no** security or cross-tenant boundary.
- Existing tests or typecheck are sufficient **definition of done**.

Otherwise, apply **§2.1–2.3**.

### 2.5 Option lettering (cross-question reference)

When one reply contains **more than one question** (or more than one independent fork), each with its own **a / b / c …** style options, **continue the alphabet across questions** in that reply instead of restarting at `a` for each question.

**Do:**

- First question’s options: **`a`**, **`b`**, **`c`**, … as needed (there is **no** requirement to use exactly three letters per question).
- Next question’s options: continue with **`d`**, **`e`**, **`f`**, … then **`g`**, **`h`**, … for later forks.
- Keep a **visible letter** next to each option (table cell, list prefix, or inline) so a later message can say e.g. “take **b** and **e**” without ambiguity.

**Rationale:** Reusing `a` / `b` / `c` for every question makes picks ambiguous (“option B — which topic?”). One sequential run per reply keeps references short and stable.

**Don’t:**

- Reset to `a` for each new question **in the same reply** unless I explicitly ask for isolated blocks (e.g. “label each section A/B/C separately”).

---

## 3. How this doc is used

- **You:** Add more principles as bullet sections (same pattern: *Do / Don’t / Fine-tune*).
- **Assistants:** Treat **§1 (especially §1.1)** as mandatory for structural/repo decisions, and **§2 (especially §2.1–2.3)** as mandatory when requirements are non-trivial — including **§2.2**: use **initiative** with **multiple choice** (and tables when helpful) whenever gaps or ambiguity remain, and **§2.5** when lettering options across several questions in one reply. Cursor rules: `.cursor/rules/guidelines-hub.mdc`, `.cursor/rules/requirement-clarification.mdc`; the **full protocol** lives in this file under **`docs/guidelines/`**.

If anything here conflicts with a **specific instruction in the current message**, the **current message wins**.

---

## 4. Shared vocabulary

Use **[glossary.md](glossary.md)** for canonical names (tenant vs realm, platform login, packages, queues). When a requirement introduces a **new concept**, add it to the glossary (or extend an existing row) so wording stays consistent across UI, docs, and code comments.
