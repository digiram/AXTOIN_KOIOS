/**
 * Calendar Event Attendees Field.
 *
 * Reusable mailbox UI building block: Calendar Event Attendees Field.
 *
 * Responsibilities:
 * - Encapsulate a focused interaction or form segment
 * - Keep parent pages thin by isolating validation and presentation
 *
 * Related:
 * - Route: /admin/mailbox
 */
import type { CrmChannelEntry } from "@starter/shared";
import { User, X } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { crmListPrimaryChannelValue } from "../../components/crm/CrmOverviewEntityCard.js";
import { API_BASE_URL } from "../../lib/api.js";
import { useCrmApi } from "../crm/useCrmApi.js";
import { useCrmModuleAvailability } from "../crm/useCrmModuleAvailability.js";
import {
  calendarEventInputClass,
  calendarEventLabelClass,
  calendarEventAttendeeChipClass
} from "./calendarEventFormUtils.js";

/** React component for mailbox UI. */
export type CalendarEventAttendee = {
  id: string;
  name: string;
  email: string;
};

type ContactRow = {
  id: string;
  firstName: string;
  lastName: string;
  salutation: string | null;
  email: string | null;
  emails?: CrmChannelEntry[];
};

type Props = {
  attendees: CalendarEventAttendee[];
  onChange: (attendees: CalendarEventAttendee[]) => void;
  disabled?: boolean;
  readOnly?: boolean;
};

const contactDisplayName = (contact: ContactRow): string => {
  const name = `${contact.firstName} ${contact.lastName}`.trim();
  const salutation = contact.salutation?.trim();
  return salutation && name ? `${salutation} ${name}` : name || "Unnamed contact";
};

/** React component for mailbox UI. */
export const CalendarEventAttendeesField = ({ attendees, onChange, disabled = false, readOnly = false }: Props) => {
  const inputId = useId();
  const { hasCrmAccess, loading: crmLoading } = useCrmModuleAvailability();
  const { authHeaders, refreshSession, logout } = useCrmApi();
  const rootRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [listBoxStyle, setListBoxStyle] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const loadResults = useCallback(async () => {
    if (!hasCrmAccess || debouncedQ.length === 0) {
      setContacts([]);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: "1", pageSize: "12", q: debouncedQ });
      const headers = authHeaders();
      let res = await fetch(`${API_BASE_URL}/tenant/crm/contacts?${params}`, { headers });
      if (res.status === 401) {
        if (!(await refreshSession())) {
          logout();
          return;
        }
        res = await fetch(`${API_BASE_URL}/tenant/crm/contacts?${params}`, { headers: authHeaders() });
      }
      const json = res.ok ? ((await res.json()) as { contacts: ContactRow[] }) : { contacts: [] };
      setContacts(json.contacts ?? []);
    } catch {
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, debouncedQ, hasCrmAccess, logout, refreshSession]);

  useEffect(() => {
    void loadResults();
  }, [loadResults]);

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
  }, [contacts.length, loading, syncListBoxPosition]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const addAttendee = (contact: ContactRow) => {
    const email = crmListPrimaryChannelValue(contact.emails, contact.email);
    if (!email) return;
    if (attendees.some((row) => row.id === contact.id)) return;
    onChange([
      ...attendees,
      { id: contact.id, name: contactDisplayName(contact), email: email.trim() }
    ]);
    setQuery("");
    setOpen(false);
  };

  if (readOnly) {
    return (
      <div>
        <span className={calendarEventLabelClass}>Attendees (contacts)</span>
        {attendees.length === 0 ? (
          <p className="mt-1 text-sm text-slate-500">—</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {attendees.map((attendee) => (
              <li key={attendee.id}>
                <span className={calendarEventAttendeeChipClass}>
                  {attendee.name}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div ref={rootRef}>
      <label htmlFor={inputId} className={calendarEventLabelClass}>
        Attendees (contacts)
      </label>
      <div ref={anchorRef}>
        <input
          id={inputId}
          type="search"
          autoComplete="off"
          disabled={disabled || crmLoading || !hasCrmAccess}
          placeholder={hasCrmAccess ? "Search contacts to add…" : "CRM required for attendees"}
          className={calendarEventInputClass}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
      </div>
      {attendees.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {attendees.map((attendee) => (
            <li key={attendee.id}>
              <span className={calendarEventAttendeeChipClass}>
                <span className="truncate">{attendee.name}</span>
                <button
                  type="button"
                  className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-indigo-600 hover:bg-indigo-100 disabled:opacity-40"
                  disabled={disabled}
                  aria-label={`Remove ${attendee.name}`}
                  onClick={() => onChange(attendees.filter((row) => row.id !== attendee.id))}
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {open && debouncedQ.length > 0 && listBoxStyle && typeof document !== "undefined"
        ? createPortal(
            <ul
              role="listbox"
              className="fixed z-[3000] max-h-60 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg"
              style={{
                top: listBoxStyle.top,
                left: listBoxStyle.left,
                width: Math.max(listBoxStyle.width, 280)
              }}
            >
              {loading ? (
                <li className="px-3 py-2 text-xs text-slate-500">Searching…</li>
              ) : contacts.length === 0 ? (
                <li className="px-3 py-2 text-xs text-slate-500">No contacts found.</li>
              ) : (
                contacts.map((contact) => {
                  const email = crmListPrimaryChannelValue(contact.emails, contact.email);
                  if (!email) return null;
                  return (
                    <li key={contact.id} role="presentation">
                      <button
                        type="button"
                        role="option"
                        className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-indigo-50"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => addAttendee(contact)}
                      >
                        <User className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-slate-800">
                            {contactDisplayName(contact)}
                          </span>
                          <span className="block truncate text-xs text-slate-500">{email}</span>
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>,
            document.body
          )
        : null}
    </div>
  );
};
