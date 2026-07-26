/**
 * ICS calendar RSVP reply builder for mailbox connectors.
 *
 * Builds METHOD:REPLY iCalendar payloads and subjects when a user accepts, declines, or
 * tentatively accepts a meeting invite via Gmail or Microsoft send paths.
 *
 * Responsibilities:
 * - RFC 5545 text escaping and UTC datetime formatting
 * - RSVP PARTSTAT mapping and reply subject lines
 * - `buildCalendarReplyIcs` assembly for provider send
 *
 * Security:
 * - Escapes ICS text fields; organizer/attendee emails are normalized to lowercase.
 */

import type { CalendarReplyInput } from "./types.js";

/** Formats a Date as ICS UTC `YYYYMMDDTHHMMSSZ`. */
export const formatIcsUtcDateTime = (date: Date): string => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    "T",
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
    "Z"
  ].join("");
};

export const escapeIcsText = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

export const calendarRsvpPartStat = (response: CalendarReplyInput["response"]): string => {
  switch (response) {
    case "accepted":
      return "ACCEPTED";
    case "declined":
      return "DECLINED";
    case "tentative":
      return "TENTATIVE";
  }
};

export const buildCalendarReplySubject = (
  response: CalendarReplyInput["response"],
  title: string
): string => {
  const trimmed = title.trim() || "Event";
  switch (response) {
    case "accepted":
      return `Accepted: ${trimmed}`;
    case "declined":
      return `Declined: ${trimmed}`;
    case "tentative":
      return `Tentatively accepted: ${trimmed}`;
  }
};

export const buildCalendarReplyIcs = (input: CalendarReplyInput): string => {
  const partStat = calendarRsvpPartStat(input.response);
  const dtStamp = formatIcsUtcDateTime(new Date());
  const dtStart = formatIcsUtcDateTime(input.startsAt);
  const dtEnd = formatIcsUtcDateTime(input.endsAt);
  const uid = escapeIcsText(input.icsUid);
  const summary = escapeIcsText(input.title.trim() || "Event");
  const organizerEmail = input.organizerEmail.trim().toLowerCase();
  const attendeeEmail = input.attendeeEmail.trim().toLowerCase();

  const attendeeParams = [
    "CUTYPE=INDIVIDUAL",
    "ROLE=REQ-PARTICIPANT",
    `PARTSTAT=${partStat}`,
    "RSVP=TRUE"
  ];
  if (input.attendeeName?.trim()) {
    attendeeParams.push(`CN=${escapeIcsText(input.attendeeName.trim())}`);
  }

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Starter Template//Mailbox//EN",
    "METHOD:REPLY",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    ...(input.icsSequence != null && input.icsSequence > 0 ? [`SEQUENCE:${input.icsSequence}`] : []),
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${summary}`,
    `ORGANIZER:mailto:${organizerEmail}`,
    `ATTENDEE;${attendeeParams.join(";")}:mailto:${attendeeEmail}`,
    "END:VEVENT",
    "END:VCALENDAR"
  ];
  return `${lines.join("\r\n")}\r\n`;
};
