# Mailbox module — architecture & phased delivery

**Status:** Phase A–E in progress.

**Related:** [modules-index.md](guidelines/modules-index.md), [architecture.md](guidelines/architecture.md).

Hybrid per-user and shared-tenant inboxes with internal system notifications, external account sync (Gmail API, Microsoft Graph, generic IMAP/SMTP), and calendar events from meeting invites. **Not** realm transactional SMTP — see `tenant_smtp_settings` for MFA, welcome, and invoicing outbound mail.

---

## Recorded product decisions

| # | Topic | Choice |
|---|--------|--------|
| 1 | Identity | Module key **`mailbox`**; label **Mailbox**; API **`/tenant/mailbox/*`**; web **`/admin/mailbox/*`** |
| 2 | Feature flag | **Platform only** (`mailbox_enabled` on `platform_module_settings`); **soft disable** — nav/API off, **data persists** |
| 3 | RBAC v1 | Standard **Manager / User / Viewer** (`read` / `write` / `delete`) |
| 4 | Ownership | **Hybrid** — personal per-user **mailbox (inbox)** + optional **tenant-shared** mailboxes with explicit membership + **workforce agent** inboxes (`owner_scope: workforce_agent`, `owner_employee_id`) |
| 4b | Connections | Each inbox has one or more **connections** (`gmail`, `microsoft`, `imap`, `internal`); threads from all connections merge in the inbox |
| 4c | Agent mailboxes | Connect from agent employee detail (Mailbox card). **No app user** for the agent. Requires **mailbox + workforce** platform flags. Access: **`tenant_admin` always**, plus explicit `mailbox_account_members` (`viewer` / `sender` / `admin`). Cascade-delete inbox when the agent employee is deleted. |
| 5 | Shared mailbox roles | **`viewer`** (read), **`sender`** (read + send), **`admin`** (manage members + send) — same roles for agent members |
| 6 | Internal mail | Lazy **system notifications** connection per personal **and agent** inbox (`notifications@internal`); always on, not removable |
| 7 | External v1 | **Gmail API**, **Microsoft Graph**, and **generic IMAP/SMTP** behind one connector abstraction |
| 8 | Sync v1 | BullMQ **`mail-sync`** queue; poll-based delta sync (**inbox + sent**); reconciles read/star/folder from provider; **pushes** read/star/move/delete back via connector; push webhooks deferred |
| 9 | Calendar | Native **`mailbox_calendar_*`** tables; ICS ingest from inbound mail; **Gmail / Outlook calendar sync** on OAuth connect; RSVP via connector. Agent OAuth calendars are linked under the **connecting operator’s** `user_id` (calendar table still requires a user). |
| 10 | Transactional SMTP | **Unchanged** — invoicing/MFA/welcome keep using `tenant_smtp_settings`; optional internal notify on send |

---

## RBAC matrix

| Action | Viewer | User | Manager |
|--------|--------|------|---------|
| Read own + shared (if member) mail | Yes | Yes | Yes |
| Mark read / star / move folder | No | Yes | Yes |
| Compose / reply / forward | No | Yes | Yes |
| Connect personal external account | No | Yes | Yes |
| Create shared mailbox | No | No | Yes |
| Manage shared mailbox members | No | No | Yes (shared `admin` also) |
| Delete messages / disconnect accounts | No | No | Yes |

**Shared mailbox membership** is enforced in addition to module RBAC.

---

## OAuth setup (operators)

### Google (Gmail API)

1. Create a Google Cloud project → enable **Gmail API**.
2. Configure OAuth consent screen (External or Internal for Workspace).
3. Create OAuth 2.0 **Web application** credentials.
4. Authorized redirect URI: `{API_ORIGIN}/v1/tenant/mailbox/oauth/google/callback`
5. Scopes: `gmail.readonly`, `gmail.send`, `gmail.modify`, `calendar.readonly`, and `userinfo.email` (requested automatically by the app).
6. Enable **Gmail API** and **Google Calendar API** in the same Cloud project (required for sync after connect).
7. Set env: `MAILBOX_GOOGLE_CLIENT_ID`, `MAILBOX_GOOGLE_CLIENT_SECRET`.

### Microsoft (Graph)

1. Register an app in Azure Entra ID → add **Microsoft Graph** delegated permissions: `Mail.ReadWrite`, `Mail.Send`, `Calendars.Read`, `offline_access`, `User.Read`.
2. Redirect URI: `{API_ORIGIN}/v1/tenant/mailbox/oauth/microsoft/callback`
3. Set env: `MAILBOX_MICROSOFT_CLIENT_ID`, `MAILBOX_MICROSOFT_CLIENT_SECRET`, `MAILBOX_MICROSOFT_TENANT_ID` (`common` for multi-tenant).

### Generic IMAP/SMTP

- User supplies host, ports, username, app password.
- Credentials stored encrypted (`FIELD_ENCRYPTION_KEY` + tenant AAD).
- UI copy links to provider app-password docs (Gmail, Outlook, etc.).

---

## Data model

```
mailbox_inboxes (personal | tenant_shared | workforce_agent)
  └── mailbox_accounts (connections: internal | gmail | microsoft | imap)
        └── mailbox_threads
              └── mailbox_messages
                    └── mailbox_attachments (blob storage)

mailbox_account_members (shared + agent inbox access; references connection id)

mailbox_calendars (per user)
  └── mailbox_calendar_events
        └── mailbox_event_attendees
```

**Agent APIs:** `/v1/tenant/mailbox/agents/:employeeId/accounts`, `…/accounts/imap`, `…/oauth/:provider/start`, `…/members`.

---

## Delivery phases

### Phase A — Foundation

Module shell, core tables, internal mail delivery, minimal inbox UI.

### Phase B — IMAP/SMTP

Generic connector, credential connect UI, poll sync worker.

### Phase C — OAuth

Gmail + Microsoft connectors; OAuth start/callback routes.

### Phase D — Calendar

ICS parse worker, calendar UI, RSVP replies.

### Phase E — Compose & polish

Compose/reply/forward, drafts, shared mailbox admin, basic search.

### Phase F — Post-v1

CRM contact linking, push webhooks, super-admin OAuth settings UI.

---

## Bidirectional sync (v1)

Poll sync is **two-way for supported mailbox actions**:

| Direction | Behaviour |
|-----------|-----------|
| Provider → app | Inbox and sent folders polled; new messages imported; existing messages reconciled for **read**, **star**, and **folder** |
| App → provider | After local changes, the API pushes to the connected account: mark read/unread, star/unstar, move (archive / trash / restore), **permanent delete from trash**, and **empty trash** (full provider trash folder per connection) |

**Provider support**

| Provider | Read | Star | Move | Permanent delete | Empty trash |
|----------|------|------|------|------------------|
| Gmail | Labels (`UNREAD`) | `STARRED` label | Label add/remove (`INBOX`, `TRASH`, …) | `messages.delete` | All messages in `TRASH` |
| Microsoft Graph | `isRead` PATCH | `flag` PATCH | `messages/move` | `DELETE` | All messages in `deleteditems` |
| IMAP | `\Seen` flag | `\Flagged` flag | `MOVE` to special-use mailboxes | `DELETE` / expunge | All messages in trash mailbox |

Internal (`notifications@internal`) accounts are local-only — no provider push.

**Microsoft OAuth:** bidirectional folder/read updates require **`Mail.ReadWrite`**. Accounts connected under the old `Mail.Read` scope must **disconnect and reconnect**.

Provider push failures are logged and do **not** roll back local UI state.

---

## Soft disable

When `mailbox_enabled` is false:

- `GET /tenant/mailbox/availability` returns `mailboxEnabled: false`, `mailboxRole: null`.
- All other mailbox routes return **403** `feature_disabled`.
- Nav item hidden; data retained.

---

## Verification checklist

- [ ] `pnpm verify`
- [ ] `pnpm db:migrate` (pg + mysql)
- [ ] Connect IMAP test account; receive and read message
- [ ] Connect Gmail (test OAuth app); sync inbox
- [ ] Connect Microsoft 365; sync inbox
- [ ] Send quote email → internal notification in sender inbox
- [ ] Inbound `.ics` invite → calendar event → RSVP
- [ ] User A cannot read user B personal mail; shared viewer cannot send
