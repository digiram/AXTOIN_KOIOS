# Invoicing & quoting module — architecture & delivery

**Status:** Approved direction (tenant-only). **Implementation in progress.**

**Related:** [modules-index.md](guidelines/modules-index.md), [architecture.md](guidelines/architecture.md) (realm subscription billing stays on PSP), [prompt-principles.md](guidelines/prompt-principles.md).

Tenant-facing **commercial document** workflow: **Quote → Offer → Invoice**, with optional **Quote → Invoice** when configured. Separate from **platform/realm subscriptions** and PSP ledger rows.

---

## Recorded product decisions

| Row | Topic | Choice |
|-----|--------|--------|
| **1** | Delivery scope | **Full v1** — all acceptance criteria in the product amendment |
| **2** | PSP / realm billing | **Fully separate** — PSP remains for platform subscription billing only |
| **3** | Identity | Module key **`invoicing`**; label **Invoicing & quoting**; API **`/tenant/invoicing/*`**; web **`/admin/invoicing`** |
| **4** | Data model | **Three tables** per document type (`invoicing_quotes`, `invoicing_offers`, `invoicing_invoices`) + line-item tables + shared catalog & configuration |
| **5** | Quote statuses (v1) | **Minimum:** `quote_draft`, `quote_converted_to_offer`, `quote_converted_to_invoice`, `quote_archived` |
| **6** | Quote versioning | **Deferred** — no version columns in v1 |
| **7** | PDF | **Deferred** — endpoints return not-implemented / UI “coming soon” |
| **8** | Permissions | **Broad** scopes mapped to standard module roles (`read` / `write` / `delete`) on module key **`invoicing`**; transition rules enforced server-side |

**Tenant scope:** All data is **tenant-scoped**. Super-admin only toggles the platform flag and does not edit tenant commercial documents.

---

## Lifecycle

```text
Quote → Offer → Invoice   (default)
Quote → Invoice           (optional; `allow_direct_quote_to_invoice` on tenant invoicing configuration)
```

Promotion **copies** line items and snapshots (customer, issuer, amounts, tax) into the target table. Source rows remain immutable for audit; converted quotes/offers are not edited in place.

---

## Permissions (v1 mapping)

| Broad scope | Module role |
|-------------|-------------|
| `invoicing.view` | `read` |
| `invoicing.create`, `invoicing.edit`, `invoicing.promote`, `invoicing.finalize` | `write` |
| `invoicing.configure`, `invoicing.catalog.manage`, `invoicing.numbering.manage` | `write` + **tenant_admin** for configuration PUT |
| Archive / destructive | `delete` where applicable |

---

## Numbering

Separate sequences per tenant:

- Quotes — e.g. `QUO-2026-0001`
- Offers — e.g. `OFF-2026-0001`
- Invoices — e.g. `INV-2026-0001`

Configurable prefix, yearly reset, padding; concurrency-safe allocation via `invoicing_number_sequences`.

---

## CRM

- Customer = **CRM organization** (required for promotion); optional **CRM contact**.
- Snapshots stored on promote and on finalize so catalog/CRM changes do not alter issued documents.

---

## Implementation slices (full v1)

| Slice | Deliverables |
|-------|----------------|
| **A** | DB migration, schemas, platform flag, module roles, audit table |
| **B** | Shared Zod, repos, numbering, totals calculation |
| **C** | API: quotes CRUD, archive, promote-to-offer, promote-to-invoice (gated), configuration, catalog |
| **D** | API: offers, invoices, finalize, unified document list + filters |
| **E** | Web: gate, nav, overview, quote editor, detail/promotion flows |
| **F** | Web: offer/invoice detail, configuration, catalog admin |
| **G** | PDF stubs; audit event emission on all mutations |

---

## Out of scope (v1)

- Payment processing, accounting GL, PSP invoice replacement for realm subscriptions.
- Quote versioning UI/columns.
- Stored PDF generation (deferred per **7a**).

---

## Acceptance criteria

Tracked against the product amendment checklist (17 items). Slice **G** closes PDF-related items as “deferred / stub” unless product owner reopens **7**.
