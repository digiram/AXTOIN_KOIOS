/**
 * External calendar delta sync (Google and Microsoft).
 *
 * Fetches incremental calendar event changes from provider APIs for connected mailbox accounts
 * and normalizes them into `ProviderCalendarEvent` rows for persistence in `mailbox-repos`.
 *
 * Responsibilities:
 * - Google Calendar syncToken pagination (single batch; resets on 410)
 * - Microsoft Graph calendarView delta link handling
 * - Initial window: 90 days past, 365 days future when no cursor
 *
 * Depends on:
 * - `gmail-connector` / `microsoft-connector` for OAuth access tokens
 * - `mailbox-repos` account rows (encrypted OAuth tokens)
 *
 * Security:
 * - Access tokens are resolved from encrypted account storage; never persist or log tokens here.
 * - Account rows must be tenant-scoped before sync.
 */

import type { MailboxAddress } from "@starter/shared";

import type { MailboxAccountRow } from "./mailbox-repos.js";
import { resolveGmailAccessToken } from "./mailbox-connectors/gmail-connector.js";
import { resolveMicrosoftAccessToken } from "./mailbox-connectors/microsoft-connector.js";

export type ProviderCalendarEvent = {
  providerEventId: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  allDay: boolean;
  status: string;
  organizer: MailboxAddress;
  cancelled: boolean;
};

export type CalendarSyncResult = {
  cursor: string | null;
  events: ProviderCalendarEvent[];
  resetCursor?: boolean;
};

const CALENDAR_INITIAL_PAST_DAYS = 90;
const CALENDAR_INITIAL_FUTURE_DAYS = 365;

const parseGoogleEventTime = (input: {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}): { at: Date; allDay: boolean; timezone: string } => {
  if (input.date) {
    return { at: new Date(`${input.date}T00:00:00.000Z`), allDay: true, timezone: input.timeZone ?? "UTC" };
  }
  return {
    at: new Date(input.dateTime ?? new Date().toISOString()),
    allDay: false,
    timezone: input.timeZone ?? "UTC"
  };
};

export const syncGoogleCalendarDelta = async (input: {
  account: MailboxAccountRow;
  providerCalendarId: string;
  syncCursor: string | null;
}): Promise<CalendarSyncResult> => {
  const token = await resolveGmailAccessToken(input.account);
  const params = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
    showDeleted: "true"
  });
  if (input.syncCursor) {
    params.set("syncToken", input.syncCursor);
  } else {
    const now = Date.now();
    params.set("timeMin", new Date(now - CALENDAR_INITIAL_PAST_DAYS * 86_400_000).toISOString());
    params.set("timeMax", new Date(now + CALENDAR_INITIAL_FUTURE_DAYS * 86_400_000).toISOString());
  }

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(input.providerCalendarId)}/events?${params}`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (res.status === 410) {
    return { cursor: null, events: [], resetCursor: true };
  }
  if (!res.ok) throw new Error(`Google Calendar list failed: ${res.status}`);

  const data = (await res.json()) as {
    items?: {
      id: string;
      status?: string;
      summary?: string;
      description?: string;
      location?: string;
      start: { date?: string; dateTime?: string; timeZone?: string };
      end: { date?: string; dateTime?: string; timeZone?: string };
      organizer?: { email?: string; displayName?: string };
    }[];
    nextSyncToken?: string;
    nextPageToken?: string;
  };

  const events: ProviderCalendarEvent[] = (data.items ?? []).map((item) => {
    const start = parseGoogleEventTime(item.start);
    const end = parseGoogleEventTime(item.end);
    const cancelled = item.status === "cancelled";
    return {
      providerEventId: item.id,
      title: item.summary?.trim() || "(No title)",
      description: item.description ?? null,
      location: item.location ?? null,
      startsAt: start.at,
      endsAt: end.at > start.at ? end.at : start.at,
      timezone: start.timezone,
      allDay: start.allDay,
      status: cancelled ? "cancelled" : "confirmed",
      organizer: {
        email: item.organizer?.email ?? "",
        name: item.organizer?.displayName ?? null
      },
      cancelled
    };
  });

  if (data.nextPageToken) {
    throw new Error("Google Calendar pagination not implemented in v1 sync batch");
  }

  return { cursor: data.nextSyncToken ?? input.syncCursor, events };
};

export const syncMicrosoftCalendarDelta = async (input: {
  account: MailboxAccountRow;
  syncCursor: string | null;
}): Promise<CalendarSyncResult> => {
  const token = await resolveMicrosoftAccessToken(input.account);
  let url = input.syncCursor;
  if (!url) {
    const now = Date.now();
    const start = new Date(now - CALENDAR_INITIAL_PAST_DAYS * 86_400_000).toISOString();
    const end = new Date(now + CALENDAR_INITIAL_FUTURE_DAYS * 86_400_000).toISOString();
    url = `https://graph.microsoft.com/v1.0/me/calendarView/delta?startDateTime=${encodeURIComponent(start)}&endDateTime=${encodeURIComponent(end)}&$top=250`;
  }

  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Microsoft Calendar delta failed: ${res.status}`);

  const data = (await res.json()) as {
    value?: {
      id: string;
      subject?: string;
      bodyPreview?: string;
      location?: { displayName?: string };
      start: { dateTime: string; timeZone: string };
      end: { dateTime: string; timeZone: string };
      isAllDay?: boolean;
      isCancelled?: boolean;
      organizer?: { emailAddress?: { address?: string; name?: string } };
      "@removed"?: { reason?: string };
    }[];
    "@odata.nextLink"?: string;
    "@odata.deltaLink"?: string;
  };

  if (data["@odata.nextLink"]) {
    throw new Error("Microsoft Calendar pagination not implemented in v1 sync batch");
  }

  const events: ProviderCalendarEvent[] = (data.value ?? []).map((item) => {
    const cancelled = Boolean(item.isCancelled || item["@removed"]);
    return {
      providerEventId: item.id,
      title: item.subject?.trim() || "(No title)",
      description: item.bodyPreview ?? null,
      location: item.location?.displayName ?? null,
      startsAt: new Date(item.start.dateTime),
      endsAt: new Date(item.end.dateTime),
      timezone: item.start.timeZone || "UTC",
      allDay: Boolean(item.isAllDay),
      status: cancelled ? "cancelled" : "confirmed",
      organizer: {
        email: item.organizer?.emailAddress?.address ?? "",
        name: item.organizer?.emailAddress?.name ?? null
      },
      cancelled
    };
  });

  return {
    cursor: data["@odata.deltaLink"] ?? input.syncCursor,
    events
  };
};
