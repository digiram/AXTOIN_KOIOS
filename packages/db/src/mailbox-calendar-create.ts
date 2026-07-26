/**
 * Create and mutate calendar events on external providers.
 *
 * Posts new events and updates/deletes existing ones via Google Calendar and Microsoft Graph
 * APIs for connected mailbox accounts.
 *
 * Responsibilities:
 * - Google Calendar event insert/update/delete with timezone-aware formatting
 * - Microsoft Graph event CRUD and online meeting links when requested
 * - Provider dispatch via `createProviderCalendarEvent` / `updateProviderCalendarEvent`
 *
 * Depends on:
 * - `gmail-connector` / `microsoft-connector` OAuth token resolution
 * - `@starter/shared` reminder and location types
 *
 * Security:
 * - OAuth tokens loaded from encrypted mailbox account rows; never returned to callers.
 * - Attendee emails are sent to provider APIs only — validate tenant scope before loading accounts.
 */

import { randomUUID } from "node:crypto";

import type { CalendarLocationType, CalendarReminderCode, MailboxAddress } from "@starter/shared";
import { reminderCodeToMinutes } from "@starter/shared";

import type { MailboxAccountRow } from "./mailbox-repos.js";
import { resolveGmailAccessToken } from "./mailbox-connectors/gmail-connector.js";
import { resolveMicrosoftAccessToken } from "./mailbox-connectors/microsoft-connector.js";

export type CreateProviderCalendarEventInput = {
  account: MailboxAccountRow;
  providerCalendarId: string;
  title: string;
  description?: string | null;
  location?: string | null;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  allDay: boolean;
  attendees: MailboxAddress[];
  addVideoMeeting: boolean;
  busy?: boolean;
  isPrivate?: boolean;
  reminders?: CalendarReminderCode[];
  rrule?: string | null;
  locationType?: CalendarLocationType;
};

export type MutateProviderCalendarEventInput = CreateProviderCalendarEventInput & {
  providerEventId: string;
};

export type CreatedProviderCalendarEvent = {
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
};

const formatLocalDateInTimeZone = (date: Date, timeZone: string): string => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
};

const formatLocalDateTimeInTimeZone = (date: Date, timeZone: string): string => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
};

const addCalendarDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

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

const reminderMinutesFromCodes = (reminders: CalendarReminderCode[] | undefined): number[] => {
  if (!reminders?.length) return [10];
  const minutes = reminders
    .map((code) => reminderCodeToMinutes(code))
    .filter((value): value is number => value !== null);
  return minutes.length > 0 ? [...new Set(minutes)] : [10];
};

const applyGoogleEventExtras = (body: Record<string, unknown>, input: CreateProviderCalendarEventInput) => {
  body.transparency = input.busy === false ? "transparent" : "opaque";
  body.visibility = input.isPrivate ? "private" : "default";
  const minutes = reminderMinutesFromCodes(input.reminders);
  body.reminders = {
    useDefault: false,
    overrides: minutes.map((value) => ({ method: "popup", minutes: value }))
  };
  if (input.rrule) {
    body.recurrence = [`RRULE:${input.rrule}`];
  }
};

const applyMicrosoftEventExtras = (body: Record<string, unknown>, input: CreateProviderCalendarEventInput) => {
  body.showAs = input.busy === false ? "free" : "busy";
  body.sensitivity = input.isPrivate ? "private" : "normal";
  const minutes = reminderMinutesFromCodes(input.reminders)[0] ?? 10;
  body.isReminderOn = !input.reminders?.includes("none");
  body.reminderMinutesBeforeStart = minutes;
};

export const createGoogleCalendarEvent = async (
  input: CreateProviderCalendarEventInput
): Promise<CreatedProviderCalendarEvent> => {
  const token = await resolveGmailAccessToken(input.account);
  const params = new URLSearchParams();
  if (input.addVideoMeeting) params.set("conferenceDataVersion", "1");
  if (input.attendees.length > 0) params.set("sendUpdates", "all");

  const body: Record<string, unknown> = {
    summary: input.title,
    description: input.description ?? undefined,
    location: input.location ?? undefined,
    attendees: input.attendees.map((attendee) => ({
      email: attendee.email,
      displayName: attendee.name ?? undefined
    }))
  };

  if (input.allDay) {
    body.start = { date: formatLocalDateInTimeZone(input.startsAt, input.timezone), timeZone: input.timezone };
    body.end = {
      date: formatLocalDateInTimeZone(addCalendarDays(input.endsAt, 1), input.timezone),
      timeZone: input.timezone
    };
  } else {
    body.start = {
      dateTime: formatLocalDateTimeInTimeZone(input.startsAt, input.timezone),
      timeZone: input.timezone
    };
    body.end = {
      dateTime: formatLocalDateTimeInTimeZone(input.endsAt, input.timezone),
      timeZone: input.timezone
    };
  }

  if (input.addVideoMeeting) {
    body.conferenceData = {
      createRequest: {
        requestId: randomUUID(),
        conferenceSolutionKey: { type: "hangoutsMeet" }
      }
    };
  }

  applyGoogleEventExtras(body, input);
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(input.providerCalendarId)}/events?${params}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    let detail = "";
    try {
      const err = (await res.json()) as { error?: { message?: string } };
      detail = err.error?.message ? `: ${err.error.message}` : "";
    } catch {
      // ignore
    }
    if (res.status === 403 && detail.toLowerCase().includes("insufficient")) {
      throw new Error(
        `Google Calendar create failed: missing calendar write permission. Disconnect and reconnect Gmail, approving all requested permissions.${detail}`
      );
    }
    throw new Error(`Google Calendar create failed: ${res.status}${detail}`);
  }

  const item = (await res.json()) as {
    id: string;
    status?: string;
    summary?: string;
    description?: string;
    location?: string;
    hangoutLink?: string;
    conferenceData?: { entryPoints?: { uri?: string }[] };
    start: { date?: string; dateTime?: string; timeZone?: string };
    end: { date?: string; dateTime?: string; timeZone?: string };
    organizer?: { email?: string; displayName?: string };
  };

  const start = parseGoogleEventTime(item.start);
  const end = parseGoogleEventTime(item.end);
  const meetingUrl =
    item.hangoutLink ??
    item.conferenceData?.entryPoints?.find((entry) => entry.uri?.startsWith("http"))?.uri ??
    null;
  const description = [input.description, meetingUrl && !input.description?.includes(meetingUrl) ? meetingUrl : null]
    .filter(Boolean)
    .join("\n\n") || null;

  return {
    providerEventId: item.id,
    title: item.summary?.trim() || input.title,
    description,
    location: item.location ?? input.location ?? null,
    startsAt: start.at,
    endsAt: end.at > start.at ? end.at : start.at,
    timezone: start.timezone,
    allDay: start.allDay,
    status: item.status === "cancelled" ? "cancelled" : "confirmed",
    organizer: {
      email: item.organizer?.email ?? input.account.emailAddress,
      name: item.organizer?.displayName ?? input.account.displayName
    }
  };
};

export const createMicrosoftCalendarEvent = async (
  input: CreateProviderCalendarEventInput
): Promise<CreatedProviderCalendarEvent> => {
  const token = await resolveMicrosoftAccessToken(input.account);
  const body: Record<string, unknown> = {
    subject: input.title,
    body: input.description
      ? { contentType: "text", content: input.description }
      : undefined,
    location: input.location ? { displayName: input.location } : undefined,
    start: input.allDay
      ? {
          dateTime: formatLocalDateInTimeZone(input.startsAt, input.timezone),
          timeZone: input.timezone
        }
      : {
          dateTime: formatLocalDateTimeInTimeZone(input.startsAt, input.timezone),
          timeZone: input.timezone
        },
    end: input.allDay
      ? {
          dateTime: formatLocalDateInTimeZone(addCalendarDays(input.endsAt, 1), input.timezone),
          timeZone: input.timezone
        }
      : {
          dateTime: formatLocalDateTimeInTimeZone(input.endsAt, input.timezone),
          timeZone: input.timezone
        },
    isAllDay: input.allDay,
    attendees: input.attendees.map((attendee) => ({
      emailAddress: {
        address: attendee.email,
        name: attendee.name ?? undefined
      },
      type: "required"
    }))
  };

  if (input.addVideoMeeting) {
    body.isOnlineMeeting = true;
    body.onlineMeetingProvider = "teamsForBusiness";
  }

  applyMicrosoftEventExtras(body, input);

  const res = await fetch("https://graph.microsoft.com/v1.0/me/events", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    let detail = "";
    try {
      const err = (await res.json()) as { error?: { message?: string } };
      detail = err.error?.message ? `: ${err.error.message}` : "";
    } catch {
      // ignore
    }
    throw new Error(`Microsoft Calendar create failed: ${res.status}${detail}`);
  }

  const item = (await res.json()) as {
    id: string;
    subject?: string;
    bodyPreview?: string;
    body?: { content?: string };
    location?: { displayName?: string };
    start: { dateTime: string; timeZone: string };
    end: { dateTime: string; timeZone: string };
    isAllDay?: boolean;
    isCancelled?: boolean;
    onlineMeeting?: { joinUrl?: string };
    organizer?: { emailAddress?: { address?: string; name?: string } };
  };

  const meetingUrl = item.onlineMeeting?.joinUrl ?? null;
  const baseDescription = item.body?.content ?? item.bodyPreview ?? input.description ?? null;
  const description =
    meetingUrl && baseDescription && !baseDescription.includes(meetingUrl)
      ? `${baseDescription}\n\n${meetingUrl}`
      : meetingUrl && !baseDescription
        ? meetingUrl
        : baseDescription;

  return {
    providerEventId: item.id,
    title: item.subject?.trim() || input.title,
    description,
    location: item.location?.displayName ?? input.location ?? null,
    startsAt: new Date(item.start.dateTime),
    endsAt: new Date(item.end.dateTime),
    timezone: item.start.timeZone || input.timezone,
    allDay: Boolean(item.isAllDay),
    status: item.isCancelled ? "cancelled" : "confirmed",
    organizer: {
      email: item.organizer?.emailAddress?.address ?? input.account.emailAddress,
      name: item.organizer?.emailAddress?.name ?? input.account.displayName
    }
  };
};

export const createProviderCalendarEvent = async (
  provider: "gmail" | "microsoft",
  input: CreateProviderCalendarEventInput
): Promise<CreatedProviderCalendarEvent> =>
  provider === "gmail" ? createGoogleCalendarEvent(input) : createMicrosoftCalendarEvent(input);

const buildGoogleEventBody = (input: CreateProviderCalendarEventInput): Record<string, unknown> => {
  const body: Record<string, unknown> = {
    summary: input.title,
    description: input.description ?? undefined,
    location: input.location ?? undefined,
    attendees: input.attendees.map((attendee) => ({
      email: attendee.email,
      displayName: attendee.name ?? undefined
    }))
  };
  if (input.allDay) {
    body.start = { date: formatLocalDateInTimeZone(input.startsAt, input.timezone), timeZone: input.timezone };
    body.end = {
      date: formatLocalDateInTimeZone(addCalendarDays(input.endsAt, 1), input.timezone),
      timeZone: input.timezone
    };
  } else {
    body.start = {
      dateTime: formatLocalDateTimeInTimeZone(input.startsAt, input.timezone),
      timeZone: input.timezone
    };
    body.end = {
      dateTime: formatLocalDateTimeInTimeZone(input.endsAt, input.timezone),
      timeZone: input.timezone
    };
  }
  applyGoogleEventExtras(body, input);
  return body;
};

const buildMicrosoftEventBody = (input: CreateProviderCalendarEventInput): Record<string, unknown> => {
  const body: Record<string, unknown> = {
    subject: input.title,
    body: input.description ? { contentType: "text", content: input.description } : undefined,
    location: input.location ? { displayName: input.location } : undefined,
    start: input.allDay
      ? {
          dateTime: formatLocalDateInTimeZone(input.startsAt, input.timezone),
          timeZone: input.timezone
        }
      : {
          dateTime: formatLocalDateTimeInTimeZone(input.startsAt, input.timezone),
          timeZone: input.timezone
        },
    end: input.allDay
      ? {
          dateTime: formatLocalDateInTimeZone(addCalendarDays(input.endsAt, 1), input.timezone),
          timeZone: input.timezone
        }
      : {
          dateTime: formatLocalDateTimeInTimeZone(input.endsAt, input.timezone),
          timeZone: input.timezone
        },
    isAllDay: input.allDay,
    attendees: input.attendees.map((attendee) => ({
      emailAddress: {
        address: attendee.email,
        name: attendee.name ?? undefined
      },
      type: "required"
    }))
  };
  if (input.addVideoMeeting) {
    body.isOnlineMeeting = true;
    body.onlineMeetingProvider = "teamsForBusiness";
  }
  applyMicrosoftEventExtras(body, input);
  return body;
};

export const updateProviderCalendarEvent = async (
  provider: "gmail" | "microsoft",
  input: MutateProviderCalendarEventInput
): Promise<CreatedProviderCalendarEvent> =>
  provider === "gmail" ? updateGoogleCalendarEvent(input) : updateMicrosoftCalendarEvent(input);

export const deleteProviderCalendarEvent = async (
  provider: "gmail" | "microsoft",
  input: {
    account: MailboxAccountRow;
    providerCalendarId: string;
    providerEventId: string;
  }
): Promise<void> => {
  if (provider === "gmail") {
    const token = await resolveGmailAccessToken(input.account);
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(input.providerCalendarId)}/events/${encodeURIComponent(input.providerEventId)}`;
    const res = await fetch(url, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` }
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(`Google Calendar delete failed: ${res.status}`);
    }
    return;
  }
  const token = await resolveMicrosoftAccessToken(input.account);
  const res = await fetch(`https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(input.providerEventId)}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${token}` }
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Microsoft Calendar delete failed: ${res.status}`);
  }
};

const updateGoogleCalendarEvent = async (
  input: MutateProviderCalendarEventInput
): Promise<CreatedProviderCalendarEvent> => {
  const token = await resolveGmailAccessToken(input.account);
  const params = new URLSearchParams();
  if (input.attendees.length > 0) params.set("sendUpdates", "all");
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(input.providerCalendarId)}/events/${encodeURIComponent(input.providerEventId)}?${params}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(buildGoogleEventBody(input))
  });
  if (!res.ok) {
    throw new Error(`Google Calendar update failed: ${res.status}`);
  }
  const item = (await res.json()) as {
    id: string;
    status?: string;
    summary?: string;
    description?: string;
    location?: string;
    start: { date?: string; dateTime?: string; timeZone?: string };
    end: { date?: string; dateTime?: string; timeZone?: string };
    organizer?: { email?: string; displayName?: string };
  };
  const start = parseGoogleEventTime(item.start);
  const end = parseGoogleEventTime(item.end);
  return {
    providerEventId: item.id,
    title: item.summary?.trim() || input.title,
    description: item.description ?? input.description ?? null,
    location: item.location ?? input.location ?? null,
    startsAt: start.at,
    endsAt: end.at > start.at ? end.at : start.at,
    timezone: start.timezone,
    allDay: start.allDay,
    status: item.status === "cancelled" ? "cancelled" : "confirmed",
    organizer: {
      email: item.organizer?.email ?? input.account.emailAddress,
      name: item.organizer?.displayName ?? input.account.displayName
    }
  };
};

const updateMicrosoftCalendarEvent = async (
  input: MutateProviderCalendarEventInput
): Promise<CreatedProviderCalendarEvent> => {
  const token = await resolveMicrosoftAccessToken(input.account);
  const res = await fetch(`https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(input.providerEventId)}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(buildMicrosoftEventBody(input))
  });
  if (!res.ok) {
    throw new Error(`Microsoft Calendar update failed: ${res.status}`);
  }
  const item = (await res.json()) as {
    id: string;
    subject?: string;
    bodyPreview?: string;
    body?: { content?: string };
    location?: { displayName?: string };
    start: { dateTime: string; timeZone: string };
    end: { dateTime: string; timeZone: string };
    isAllDay?: boolean;
    isCancelled?: boolean;
    organizer?: { emailAddress?: { address?: string; name?: string } };
  };
  return {
    providerEventId: item.id,
    title: item.subject?.trim() || input.title,
    description: item.body?.content ?? item.bodyPreview ?? input.description ?? null,
    location: item.location?.displayName ?? input.location ?? null,
    startsAt: new Date(item.start.dateTime),
    endsAt: new Date(item.end.dateTime),
    timezone: item.start.timeZone || input.timezone,
    allDay: Boolean(item.isAllDay),
    status: item.isCancelled ? "cancelled" : "confirmed",
    organizer: {
      email: item.organizer?.emailAddress?.address ?? input.account.emailAddress,
      name: item.organizer?.emailAddress?.name ?? input.account.displayName
    }
  };
};
