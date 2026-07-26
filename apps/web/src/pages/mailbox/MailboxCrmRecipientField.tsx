/**
 * Mailbox Crm Recipient Field.
 *
 * Reusable mailbox UI building block: Mailbox Crm Recipient Field.
 *
 * Responsibilities:
 * - Encapsulate a focused interaction or form segment
 * - Keep parent pages thin by isolating validation and presentation
 *
 * Related:
 * - Route: /admin/mailbox
 */
import type { CrmChannelEntry, MailboxAddress } from "@starter/shared";
import { Building2, ChevronDown, ChevronUp, User, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";

import { crmListPrimaryChannelValue } from "../../components/crm/CrmOverviewEntityCard.js";
import { API_BASE_URL } from "../../lib/api.js";
import { useCrmBasePath } from "../crm/crmPaths.js";
import { useCrmApi } from "../crm/useCrmApi.js";
import { useCrmModuleAvailability } from "../crm/useCrmModuleAvailability.js";
import {
  appendMailboxRecipient,
  formatRecipientChip,
  mailboxComposeInputClass,
  removeMailboxRecipient
} from "./mailboxComposeUtils.js";

const LISTBOX_SELECTOR = "[data-mailbox-crm-recipient-listbox]";

const measureRecipientBadgeCollapse = (node: HTMLUListElement) => {
  const prevMaxHeight = node.style.maxHeight;
  node.style.maxHeight = "none";

  const children = [...node.children] as HTMLElement[];
  const firstTop = children[0]?.offsetTop ?? 0;
  const needsCollapse = children.some((child) => child.offsetTop > firstTop + 1);
  const oneRowHeight = children.reduce((max, child) => {
    if (child.offsetTop > firstTop + 1) return max;
    return Math.max(max, child.offsetHeight);
  }, 0);

  node.style.maxHeight = prevMaxHeight;

  return {
    needsCollapse,
    oneRowHeight: needsCollapse ? Math.ceil(oneRowHeight) : null
  };
};

type ContactRow = {
  id: string;
  firstName: string;
  lastName: string;
  salutation: string | null;
  email: string | null;
  emails?: CrmChannelEntry[];
};

type OrganizationRow = {
  id: string;
  name: string;
  email: string | null;
  emails?: CrmChannelEntry[];
};

type CrmPick = MailboxAddress & { label: string; kind: "contact" | "organization" };

const contactDisplayName = (contact: ContactRow): string => {
  const name = `${contact.firstName} ${contact.lastName}`.trim();
  const salutation = contact.salutation?.trim();
  return salutation && name ? `${salutation} ${name}` : name || "Unnamed contact";
};

const contactEmail = (contact: ContactRow): string | null =>
  crmListPrimaryChannelValue(contact.emails, contact.email);

const organizationEmail = (org: OrganizationRow): string | null =>
  crmListPrimaryChannelValue(org.emails, org.email);

type Props = {
  label: string;
  inputId: string;
  recipients: MailboxAddress[];
  onChange: (recipients: MailboxAddress[]) => void;
  disabled?: boolean;
  emptyHint?: string;
  /** Collapse multi-line recipient chips to a single row with expand/collapse. */
  collapsibleRecipients?: boolean;
};

/** React component for mailbox UI. */
export const MailboxCrmRecipientField = ({
  label,
  inputId,
  recipients,
  onChange,
  disabled = false,
  emptyHint = "Search CRM contacts or companies…",
  collapsibleRecipients = false
}: Props) => {
  const crmBase = useCrmBasePath();
  const { hasCrmAccess, loading: crmLoading } = useCrmModuleAvailability();
  const { authHeaders, refreshSession, logout } = useCrmApi();
  const rootRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const badgesRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [recipientsExpanded, setRecipientsExpanded] = useState(false);
  const [recipientsOverflow, setRecipientsOverflow] = useState(false);
  const [collapsedBadgeRowHeightPx, setCollapsedBadgeRowHeightPx] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [organizations, setOrganizations] = useState<OrganizationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [listBoxStyle, setListBoxStyle] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(query.trim()), 320);
    return () => window.clearTimeout(timer);
  }, [query]);

  useLayoutEffect(() => {
    if (!collapsibleRecipients) {
      setRecipientsOverflow(false);
      setRecipientsExpanded(false);
      setCollapsedBadgeRowHeightPx(null);
      return;
    }

    const el = badgesRef.current;
    if (!el || recipients.length === 0) {
      setRecipientsOverflow(false);
      setRecipientsExpanded(false);
      setCollapsedBadgeRowHeightPx(null);
      return;
    }

    const measure = () => {
      const node = badgesRef.current;
      if (!node) return;
      const { needsCollapse, oneRowHeight } = measureRecipientBadgeCollapse(node);
      setRecipientsOverflow(needsCollapse);
      setCollapsedBadgeRowHeightPx(oneRowHeight);
      if (!needsCollapse) setRecipientsExpanded(false);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [collapsibleRecipients, recipients]);

  const loadResults = useCallback(async () => {
    if (!hasCrmAccess || debouncedQ.length === 0) {
      setContacts([]);
      setOrganizations([]);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: "1", pageSize: "12", q: debouncedQ });
      const headers = authHeaders();
      let contactsRes = await fetch(`${API_BASE_URL}/tenant/crm/contacts?${params}`, { headers });
      let orgsRes = await fetch(`${API_BASE_URL}/tenant/crm/organizations?${params}`, { headers });
      if (contactsRes.status === 401 || orgsRes.status === 401) {
        if (!(await refreshSession())) {
          logout();
          return;
        }
        const retryHeaders = authHeaders();
        contactsRes = await fetch(`${API_BASE_URL}/tenant/crm/contacts?${params}`, { headers: retryHeaders });
        orgsRes = await fetch(`${API_BASE_URL}/tenant/crm/organizations?${params}`, { headers: retryHeaders });
      }
      const contactsJson = contactsRes.ok
        ? ((await contactsRes.json()) as { contacts: ContactRow[] })
        : { contacts: [] };
      const orgsJson = orgsRes.ok
        ? ((await orgsRes.json()) as { organizations: OrganizationRow[] })
        : { organizations: [] };
      setContacts(contactsJson.contacts ?? []);
      setOrganizations(orgsJson.organizations ?? []);
    } catch {
      setContacts([]);
      setOrganizations([]);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, debouncedQ, hasCrmAccess, logout, refreshSession]);

  useEffect(() => {
    void loadResults();
  }, [loadResults]);

  const picks: CrmPick[] = [];
  for (const org of organizations) {
    const email = organizationEmail(org);
    if (!email) continue;
    picks.push({ kind: "organization", label: org.name, name: org.name, email });
  }
  for (const contact of contacts) {
    const email = contactEmail(contact);
    if (!email) continue;
    const name = contactDisplayName(contact);
    picks.push({ kind: "contact", label: name, name, email });
  }

  const syncListBoxPosition = useCallback(() => {
    const wrap = anchorRef.current;
    if (!wrap || !open || debouncedQ.length === 0) {
      setListBoxStyle(null);
      return;
    }
    const rect = wrap.getBoundingClientRect();
    setListBoxStyle({ top: rect.bottom + 4, left: rect.left, width: rect.width });
  }, [debouncedQ.length, open]);

  useLayoutEffect(() => {
    syncListBoxPosition();
  }, [loading, picks.length, syncListBoxPosition]);

  useEffect(() => {
    if (!open || debouncedQ.length === 0) return;
    syncListBoxPosition();
    window.addEventListener("resize", syncListBoxPosition);
    window.addEventListener("scroll", syncListBoxPosition, true);
    return () => {
      window.removeEventListener("resize", syncListBoxPosition);
      window.removeEventListener("scroll", syncListBoxPosition, true);
    };
  }, [debouncedQ.length, open, syncListBoxPosition]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if ((event.target as Element | null)?.closest?.(LISTBOX_SELECTOR)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const addRecipient = (address: MailboxAddress) => {
    onChange(appendMailboxRecipient(recipients, address));
    setQuery("");
    setOpen(false);
  };

  if (!crmLoading && !hasCrmAccess) {
    return (
      <div className="min-w-0">
        <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
        <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2.5 text-sm text-amber-900">
          Recipients must be CRM contacts or companies with an email address.{" "}
          <Link to={`${crmBase}/contacts`} className="font-medium text-indigo-700 hover:underline">
            Add them in CRM
          </Link>{" "}
          before composing mail.
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="min-w-0">
      <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <div ref={anchorRef}>
        <input
          id={inputId}
          type="search"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${inputId}-listbox`}
          aria-autocomplete="list"
          value={query}
          disabled={disabled || crmLoading}
          placeholder={emptyHint}
          className={mailboxComposeInputClass}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
      </div>
      {recipients.length > 0 ? (
        <div className="mt-2">
          <ul
            ref={badgesRef}
            className={[
              "flex flex-wrap gap-1.5",
              collapsibleRecipients && recipientsOverflow && !recipientsExpanded ? "overflow-hidden" : ""
            ].join(" ")}
            style={
              collapsibleRecipients &&
              recipientsOverflow &&
              !recipientsExpanded &&
              collapsedBadgeRowHeightPx != null
                ? { maxHeight: collapsedBadgeRowHeightPx }
                : undefined
            }
          >
            {recipients.map((recipient) => (
              <li key={recipient.email}>
                <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-900">
                  <span className="truncate">{formatRecipientChip(recipient)}</span>
                  <button
                    type="button"
                    className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-indigo-600 hover:bg-indigo-100 disabled:opacity-40"
                    disabled={disabled}
                    aria-label={`Remove ${formatRecipientChip(recipient)}`}
                    onClick={() => onChange(removeMailboxRecipient(recipients, recipient.email))}
                  >
                    <X className="h-3 w-3" aria-hidden />
                  </button>
                </span>
              </li>
            ))}
          </ul>
          {collapsibleRecipients && recipientsOverflow ? (
            <button
              type="button"
              className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-indigo-700 hover:text-indigo-900"
              onClick={() => setRecipientsExpanded((expanded) => !expanded)}
            >
              {recipientsExpanded ? (
                <>
                  <ChevronUp className="h-3.5 w-3.5 shrink-0" aria-hidden strokeWidth={2} />
                  Show less
                </>
              ) : (
                <>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden strokeWidth={2} />
                  Show all ({recipients.length})
                </>
              )}
            </button>
          ) : null}
        </div>
      ) : null}
      {open && debouncedQ.length > 0 && listBoxStyle && typeof document !== "undefined"
        ? createPortal(
            <ul
              id={`${inputId}-listbox`}
              role="listbox"
              data-mailbox-crm-recipient-listbox=""
              className="fixed z-[3000] max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-slate-100"
              style={{
                top: listBoxStyle.top,
                left: listBoxStyle.left,
                width: Math.max(listBoxStyle.width, 280)
              }}
            >
              {loading ? (
                <li className="px-3 py-2 text-xs text-slate-500">Searching CRM…</li>
              ) : picks.length === 0 ? (
                <li className="px-3 py-2 text-xs text-slate-500">
                  No matches with email. Add the contact or company in CRM first.
                </li>
              ) : (
                picks.map((pick) => (
                  <li key={`${pick.kind}-${pick.email}-${pick.label}`} role="presentation">
                    <button
                      type="button"
                      role="option"
                      className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => addRecipient({ email: pick.email, name: pick.name })}
                    >
                      <span className="mt-0.5 shrink-0 text-indigo-600">
                        {pick.kind === "organization" ? (
                          <Building2 className="h-4 w-4" aria-hidden />
                        ) : (
                          <User className="h-4 w-4" aria-hidden />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-slate-800">{pick.label}</span>
                        <span className="block truncate text-xs text-slate-500">{pick.email}</span>
                      </span>
                      <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                        {pick.kind === "organization" ? "Company" : "Contact"}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>,
            document.body
          )
        : null}
    </div>
  );
};
