# Sales funnel module — architecture & phased delivery

**Status:** Phases 1–4 implemented.

**Related:** [modules-index.md](guidelines/modules-index.md), [architecture.md](guidelines/architecture.md).

---

## Recorded product decisions

| # | Topic | Choice |
|---|--------|--------|
| 1 | Tenant enable | **Platform flag only** — soft disable (data persists); see [company-subscriptions-module.md](company-subscriptions-module.md) |
| 2 | RBAC v1 | **`tenant_admin`** full access; **`tenant_user`** read pipeline config only |
| 3 | First tranche scope | **BDR + Sales** boards + promotion (phased after foundation) |
| 4 | Pipeline UX | **Virtualized lanes + DnD** when boards ship |
| 5 | Promotion | **Copy** lead → deal; `promoted_from_lead_id`; preserve links in later phases |
| 6 | CRM delete | **Unlink** contacts; keep sales history |
| 7 | Ownership | **Primary owner = `users.id`** |
| 8 | Attachments | **Workforce-style encrypted files** (post-foundation) |
| 9 | Nav | **Sales** → `/admin/sales/*` |
| — | CRM dependency | **Sales platform flag requires CRM enabled**; disabling CRM forces Sales off |

---

## Phase 1 — Foundation (shipped)

| Area | Deliverables |
|------|----------------|
| DB | `sales_funnel_enabled` on `platform_module_settings`; `sales_funnel_stages` per tenant |
| API | `GET /tenant/sales/availability`; legacy `GET/PATCH /tenant/sales/pipeline-config` (bulk rename; boards preferred) |
| Super Admin | Sales toggle on Features (disabled until CRM on) |
| Web | `SalesModuleGate`, nav **Sales**, tabs BDR / Sales; pipeline lanes on boards |

**Default stages:** BDR — New, Contacting, Qualified, Disqualified, Ready for Sales. Sales — Discovery, Proposal, Negotiation, Contract Review, Won, Lost.

---

## Phase 2 — BDR leads & Kanban (shipped)

| Area | Deliverables |
|------|----------------|
| DB | `sales_funnel_bdr_leads`, `sales_funnel_lead_contacts`, `sales_funnel_activities` (migration `0048`) |
| API | Board + CRUD leads; stage move; notes → activity timeline (`tenant_admin` mutates; `tenant_user` read) |
| Web | BDR Kanban (`@dnd-kit` + virtualized lanes), filters, lead detail drawer, notes |

---

## Phase 3 — Sales deals pipeline (shipped)

| Area | Deliverables |
|------|----------------|
| DB | `sales_funnel_sales_deals` (incl. `promoted_from_lead_id`), `sales_funnel_deal_contacts` (migration `0049`) |
| API | Board + CRUD deals; stage move; notes → activity timeline (`entity_type` `sales_deal`) |
| Web | Sales pipeline Kanban (same UX as BDR); promoted badge when linked to a BDR lead |

---

## Phase 4 — BDR → Sales promotion (shipped)

| Area | Deliverables |
|------|----------------|
| API | `POST /tenant/sales/bdr/leads/:id/promote` — copies lead → deal, CRM contacts, `promoted_from_lead_id`; one deal per lead |
| API | Lead payloads include `promotedDealId` when already promoted |
| Web | **Promote to Sales** on BDR lead detail; link to Sales pipeline after promotion |

---

## Custom pipelines (shipped)

| Area | Deliverables |
|------|----------------|
| API | `POST /tenant/sales/stages`, `PATCH …/stages/reorder`, `PATCH …/stages/:id`, `DELETE …/stages/:id` (tenant admin) |
| Behaviour | Two pipelines (`bdr`, `sales`); new lanes get a UUID `stageKey`; delete blocked if lane has cards or is the last lane |
| Web | Add lane, drag lane headers to reorder, delete empty lanes on BDR and Sales boards; Settings retains bulk rename |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-05-15 | Custom pipelines — per-tenant lanes, reorder, add/delete on boards. |
| 2026-05-15 | Phase 4 — BDR → Sales promotion (copy lead, contacts, activity timeline). |
| 2026-05-15 | Phase 3 — Sales deals pipeline, Kanban, activities API + UI. |
| 2026-05-15 | Phase 2 — BDR leads, Kanban, activities API + UI. |
| 2026-05-15 | Phase 1; decisions 1a,2a,3b,4c,5a,6a,7a,8b,9a; CRM dependency for platform flag. |
