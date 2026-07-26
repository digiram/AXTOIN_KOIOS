/**
 * Mailbox calendar event mutation helpers.
 *
 * Resolves attendees from CRM contacts, builds recurrence extras JSON, and
 * serializes calendar events for API responses.
 *
 * Responsibilities:
 * - Merge explicit attendee emails with CRM contact emails (tenant-scoped)
 * - Build and patch RRULE/extras JSON for create/update flows
 * - Apply recurrence scope (this/future/series) on delete or edit
 * - Shape event rows for HTTP JSON responses
 *
 * Security:
 * - Contact lookups filter by `tenantId`
 */

import type { MailboxAddress } from "@starter/shared";
import {
  buildCalendarRrule,
  parseMailboxCalendarEventExtras,
  serializeMailboxCalendarEventExtras,
  type CalendarRecurrenceScope,
  type CalendarRecurrenceFreq,
  type CalendarReminderCode,
  type CalendarLocationType
} from "@starter/shared";

import { getContactById } from "@starter/db";
import { parseMailboxAddressJson } from "@starter/db";

const primaryContactEmail = (contact: Awaited<ReturnType<typeof getContactById>>): string | null => {
  if (!contact) return null;
  const fromList = contact.emails.find((entry) => entry.value?.trim())?.value?.trim();
  return fromList ?? contact.email?.trim() ?? null;
};

type EventBodyLike = {
  title: string;
  description?: string;
  location?: string;
  startsAt: string;
  endsAt: string;
  timezone?: string;
  allDay?: boolean;
  attendees?: MailboxAddress[];
  attendeeIds?: string[];
  addVideoMeeting?: boolean;
  busy?: boolean;
  isPrivate?: boolean;
  reminders?: CalendarReminderCode[];
  locationType?: CalendarLocationType;
  recurrenceInterval?: number;
  recurrenceFreq?: CalendarRecurrenceFreq;
  stopRecurrenceDate?: string;
};

export const resolveCalendarEventAttendees = async (
  tenantId: string,
  body: Pick<EventBodyLike, "attendees" | "attendeeIds">
): Promise<MailboxAddress[]> => {
  const byEmail = new Map<string, MailboxAddress>();
  for (const attendee of body.attendees ?? []) {
    const email = attendee.email.trim().toLowerCase();
    if (!email) continue;
    byEmail.set(email, { email: attendee.email.trim(), name: attendee.name ?? undefined });
  }
  for (const contactId of body.attendeeIds ?? []) {
    const contact = await getContactById(tenantId, contactId);
    if (!contact) continue;
    const email = primaryContactEmail(contact);
    if (!email?.trim()) continue;
    const normalized = email.trim().toLowerCase();
    if (byEmail.has(normalized)) continue;
    const name = `${contact.firstName} ${contact.lastName}`.trim() || undefined;
    byEmail.set(normalized, { email: email.trim(), name });
  }
  return [...byEmail.values()];
};

export const buildCalendarEventExtrasJson = (
  body: EventBodyLike,
  existingJson: string | null | undefined
): string | null => {
  const existing = parseMailboxCalendarEventExtras(existingJson);
  const rrule = buildCalendarRrule({
    freq: body.recurrenceFreq ?? existing.recurrenceFreq ?? "none",
    interval: body.recurrenceInterval ?? existing.recurrenceInterval ?? 1,
    stopRecurrenceDate:
      body.stopRecurrenceDate ??
      existing.stopRecurrenceDate ??
      new Date(body.startsAt).toISOString().slice(0, 10),
    allDay: Boolean(body.allDay)
  });

  return serializeMailboxCalendarEventExtras({
    ...existing,
    rrule,
    busy: body.busy ?? existing.busy ?? true,
    private: body.isPrivate ?? existing.private ?? false,
    reminders: body.reminders ?? existing.reminders ?? ["10m"],
    locationType: body.locationType ?? existing.locationType ?? "in_person",
    attendeeIds: body.attendeeIds ?? existing.attendeeIds ?? [],
    recurrenceInterval: body.recurrenceInterval ?? existing.recurrenceInterval ?? 1,
    recurrenceFreq: body.recurrenceFreq ?? existing.recurrenceFreq ?? "none",
    stopRecurrenceDate: body.stopRecurrenceDate ?? existing.stopRecurrenceDate
  });
};

export const applyRecurrenceScopeToExtras = (input: {
  recurrenceJson: string | null;
  scope: CalendarRecurrenceScope;
  occurrenceDate?: string;
}): { recurrenceJson: string | null; deleteEntireSeries: boolean } => {
  const extras = parseMailboxCalendarEventExtras(input.recurrenceJson);
  if (!extras.rrule || input.scope === "series") {
    return { recurrenceJson: input.recurrenceJson, deleteEntireSeries: true };
  }
  if (input.scope === "this" && input.occurrenceDate) {
    const exceptionDates = [...(extras.exceptionDates ?? [])];
    if (!exceptionDates.includes(input.occurrenceDate)) {
      exceptionDates.push(input.occurrenceDate);
    }
    return {
      recurrenceJson: serializeMailboxCalendarEventExtras({ ...extras, exceptionDates }),
      deleteEntireSeries: false
    };
  }
  if (input.scope === "future" && input.occurrenceDate && extras.stopRecurrenceDate) {
    const stop = input.occurrenceDate;
    const rrule = buildCalendarRrule({
      freq: extras.recurrenceFreq ?? "weekly",
      interval: extras.recurrenceInterval ?? 1,
      stopRecurrenceDate: stop,
      allDay: false
    });
    return {
      recurrenceJson: serializeMailboxCalendarEventExtras({
        ...extras,
        rrule,
        stopRecurrenceDate: stop
      }),
      deleteEntireSeries: false
    };
  }
  return { recurrenceJson: input.recurrenceJson, deleteEntireSeries: true };
};

export const serializeMailboxCalendarEventResponse = (input: {
  event: {
    id: string;
    title: string;
    description: string | null;
    location: string | null;
    startsAt: Date;
    endsAt: Date;
    timezone: string;
    allDay: boolean;
    status: string;
    organizerJson: string;
    sourceMessageId: string | null;
    icsUid: string | null;
    recurrenceJson: string | null;
    providerEventId: string | null;
    calendarId: string;
  };
  calendar?: {
    name: string;
    color: string;
    source: string;
    mailboxAccountId: string | null;
  } | null;
  attendees?: { email: string; displayName: string | null; response: string }[];
}) => {
  const extras = parseMailboxCalendarEventExtras(input.event.recurrenceJson);
  return {
    id: input.event.id,
    title: input.event.title,
    description: input.event.description,
    location: input.event.location,
    startsAt: input.event.startsAt.toISOString(),
    endsAt: input.event.endsAt.toISOString(),
    timezone: input.event.timezone,
    allDay: input.event.allDay,
    status: input.event.status,
    organizer: parseMailboxAddressJson(input.event.organizerJson),
    sourceMessageId: input.event.sourceMessageId,
    icsUid: input.event.icsUid,
    providerEventId: input.event.providerEventId,
    calendarName: input.calendar?.name ?? null,
    calendarColor: input.calendar?.color ?? null,
    calendarSource: input.calendar?.source ?? null,
    connectionId: input.calendar?.mailboxAccountId ?? null,
    busy: extras.busy ?? true,
    isPrivate: extras.private ?? false,
    reminders: extras.reminders ?? ["10m"],
    locationType: extras.locationType ?? "in_person",
    attendeeIds: extras.attendeeIds ?? [],
    recurrenceInterval: extras.recurrenceInterval ?? 1,
    recurrenceFreq: extras.recurrenceFreq ?? "none",
    stopRecurrenceDate: extras.stopRecurrenceDate ?? null,
    rrule: extras.rrule ?? null,
    exceptionDates: extras.exceptionDates ?? [],
    attendees: (input.attendees ?? []).map((row) => ({
      email: row.email,
      name: row.displayName,
      response: row.response
    }))
  };
};
