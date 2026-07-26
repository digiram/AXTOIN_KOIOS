/**
 * Mailbox Calendar utilities.
 *
 * Pure helpers supporting mailbox forms, calendars, or document workflows.
 *
 * Responsibilities:
 * - Normalize and validate client-side form or display values
 * - Keep page components free of duplicated transformation logic
 *
 * Related:
 * - Route: /admin/mailbox
 */
export type MailboxCalendarEvent = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string;
  allDay?: boolean;
  status: string;
  organizer: { email: string; name?: string | null };
  sourceMessageId?: string | null;
  calendarName?: string | null;
  calendarColor?: string | null;
  calendarSource?: string | null;
  connectionId?: string | null;
  providerEventId?: string | null;
  busy?: boolean;
  isPrivate?: boolean;
  reminders?: string[];
  locationType?: "in_person" | "by_call";
  attendeeIds?: string[];
  attendees?: { email: string; name?: string | null; response?: string }[];
  recurrenceFreq?: "none" | "daily" | "weekly" | "monthly" | "yearly";
  recurrenceInterval?: number;
  stopRecurrenceDate?: string | null;
  rrule?: string | null;
  exceptionDates?: string[];
};

/** React component for mailbox UI. */
export type MonthGridCell = {
  date: Date;
  inMonth: boolean;
  key: string;
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Helper for mailbox client logic. */
export function mailboxDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Helper for mailbox client logic. */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Helper for mailbox client logic. */
export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Helper for mailbox client logic. */
export function buildMonthGrid(viewMonth: Date): MonthGridCell[] {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const leadingDays = firstOfMonth.getDay();
  const gridStart = new Date(year, month, 1 - leadingDays);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return {
      date,
      inMonth: date.getMonth() === month,
      key: mailboxDateKey(date)
    };
  });
}

/** Helper for mailbox client logic. */
export function monthRangeForGrid(viewMonth: Date): { from: Date; to: Date } {
  const cells = buildMonthGrid(viewMonth);
  const from = startOfDay(cells[0]!.date);
  const last = cells[cells.length - 1]!.date;
  const to = new Date(last.getFullYear(), last.getMonth(), last.getDate(), 23, 59, 59, 999);
  return { from, to };
}

/** Helper for mailbox client logic. */
export function groupEventsByDay(events: MailboxCalendarEvent[]): Map<string, MailboxCalendarEvent[]> {
  const map = new Map<string, MailboxCalendarEvent[]>();
  for (const event of events) {
    const key = mailboxDateKey(new Date(event.startsAt));
    const list = map.get(key) ?? [];
    list.push(event);
    map.set(key, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  }
  return map;
}

export { WEEKDAY_LABELS };

const MEETING_URL_PATTERNS = [
  /https?:\/\/meet\.google\.com\/[a-z0-9-]+/i,
  /https?:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s<>"']+/i,
  /https?:\/\/teams\.live\.com\/meet\/[^\s<>"']+/i,
  /https?:\/\/[\w.-]*zoom\.us\/j\/[^\s<>"'?&]+/i,
  /https?:\/\/[^\s<>"']*webex\.com\/[^\s<>"']+/i
] as const;

/** Helper for mailbox client logic. */
export function calendarMeetingLinkLabel(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes("meet.google.com")) return "Join Google Meet";
  if (lower.includes("teams.microsoft.com") || lower.includes("teams.live.com")) return "Join Teams meeting";
  if (lower.includes("zoom.us")) return "Join Zoom meeting";
  if (lower.includes("webex.com")) return "Join Webex meeting";
  return "Join meeting";
}

/** Helper for mailbox client logic. */
export function extractCalendarMeetingUrl(event: MailboxCalendarEvent): { url: string; label: string } | null {
  const sources = [event.location, event.description];
  for (const source of sources) {
    if (!source) continue;
    for (const pattern of MEETING_URL_PATTERNS) {
      const match = source.match(pattern);
      if (match?.[0]) {
        return { url: match[0], label: calendarMeetingLinkLabel(match[0]) };
      }
    }
  }
  return null;
}

/** Physical place only — omits raw meeting URLs already surfaced as a join link. */
export function calendarEventDisplayLocation(event: MailboxCalendarEvent): string | null {
  const location = event.location?.trim();
  if (!location) return null;
  const meeting = extractCalendarMeetingUrl(event);
  if (meeting && location.includes(meeting.url)) return null;
  if (/^https?:\/\//i.test(location)) return null;
  return location;
}

/** Helper for mailbox client logic. */
export function calendarEventDescriptionText(description: string | null): string | null {
  if (!description?.trim()) return null;
  return description.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

const normalizeMailboxEmail = (value: string): string => value.trim().toLowerCase();

/** True when the user can respond to an invite (not their own calendar block). */
export function calendarEventAcceptsRsvp(
  event: MailboxCalendarEvent,
  userEmails: string[]
): boolean {
  if (event.status === "cancelled") return false;
  if (event.sourceMessageId) return true;
  const organizerEmail = event.organizer.email.trim();
  if (!organizerEmail) return false;
  const normalizedOrganizer = normalizeMailboxEmail(organizerEmail);
  if (userEmails.some((email) => normalizeMailboxEmail(email) === normalizedOrganizer)) return false;
  return true;
}
