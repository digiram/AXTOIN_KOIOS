# Company subscriptions module — architecture & phased delivery

**Status:** Phase 1 shipped.

**Related:** [modules-index.md](guidelines/modules-index.md), [architecture.md](guidelines/architecture.md).

Administrative documentation of vendor/SaaS subscriptions (Microsoft 365, Atlassian, etc.). **Not** realm billing — see `subscriptions` / Stripe for platform billing.

---

## Recorded product decisions

| # | Topic | Choice |
|---|--------|--------|
| 1 | Identity | Module key **`company_subscriptions`**; label **Company subscriptions**; API **`/tenant/company-subscriptions/*`** |
| 2 | Feature flag | **Platform only** (`company_subscriptions_enabled` on `platform_module_settings`); **soft disable** — nav/API off, **data persists** |
| 3 | RBAC v1 | Standard **Manager / User / Viewer** (`read` / `write` / `delete`) |
| 4 | Seats | **Optional** — provider/plan may exist with **zero seats** (company-wide); seat rows resolve HRM employee on read when linked |
| 5 | Attachments v1 | **Provider-level** documents only (workforce-style encrypted files) |
| 6 | Notifications | **Phase 2** (renewal/expiry reminders) |
| 7 | Audit v1 | **`created_at` / `updated_at` / `created_by_user_id` / `updated_by_user_id`** only |
| 8 | Delivery | **Phased** (this doc) |
| 9 | HRM | Optional link on owner/seats; manual name/email when workforce off or unlinked |
| 10 | CRM | Vendor contact linkage — **Phase 2** |
| 11 | Costs | **`amount_minor` + `currency_code`** per provider and per plan; locale formatting via account preferences |

---

## Phase 1 — Foundation (current)

| Area | Deliverables |
|------|----------------|
| DB | `company_subscriptions_enabled`; `company_subscription_providers`, `_plans`, `_seats`, `_provider_documents` |
| Shared | Zod schemas, cadence/status enums, billing metadata validation (no raw PAN/CVV) |
| API | Availability; provider/plan/seat CRUD; provider documents; dashboard summary; paginated provider list |
| Super Admin | Company subscriptions toggle on Features |
| Web | `CompanySubscriptionsModuleGate`, nav, overview (filters + stats), hierarchical detail |

---

## Phase 2 — Reminders & CRM

| Area | Deliverables |
|------|----------------|
| Notifications | Upcoming renewal / expiration (email + in-app when framework exists) |
| CRM | Optional `owner_contact_id`, vendor organization linkage |
| Audit | Optional field-level audit events |

---

## Phase 3 — Enhancements

| Area | Deliverables |
|------|----------------|
| UI | Advanced cost rollups, export, mobile polish |
| Permissions | Finer-grained cost visibility if needed |

---

## Data model

```
company_subscription_providers
  └── company_subscription_plans
        └── company_subscription_seats (optional)
  └── company_subscription_provider_documents
```

**Cadence:** `daily` | `weekly` | `monthly` | `quarterly` | `yearly` | `custom` (+ `cadence_interval_count` + `cadence_interval_unit`).

**Provider statuses:** `active`, `trial`, `pending_renewal`, `expired`, `cancelled`.

**Seat statuses:** `active`, `pending`, `disabled`, `removed`.
