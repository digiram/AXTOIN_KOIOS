/**
 * ICS invite extraction and calendar upsert from mail.
 *
 * Detects meeting invites in message bodies, extracts embedded VCALENDAR blocks, and parses
 * them into mailbox calendar events via `mailbox-repos`.
 *
 * Responsibilities:
 * - Heuristic detection of HTML meeting links (Teams, Meet, Zoom)
 * - Extract ICS from text/html bodies when not stored as attachments
 * - Parse VEVENT rows and upsert tenant-scoped calendar events
 *
 * Depends on:
 * - `node-ical` for ICS parsing
 * - `mailbox-repos.upsertMailboxCalendarEventFromIcs`
 *
 * Security:
 * - All upserts require `tenantId` and `userId` from authenticated context.
 * - Parsed organizer/attendee emails are stored as mailbox data — do not log raw ICS in production.
 */

import ical from "node-ical";

import type { MailboxAddress } from "@starter/shared";

import { upsertMailboxCalendarEventFromIcs } from "./mailbox-repos.js";

const ICS_BLOCK_PATTERN = /BEGIN:VCALENDAR[\s\S]*?END:VCALENDAR/i;

const MEETING_INVITE_HTML_PATTERNS = [
  /teams\.microsoft\.com\/l\/meetup-join/i,
  /teams\.live\.com\/meet\//i,
  /meet\.google\.com\/[a-z0-9-]+/i,
  /[\w.-]*zoom\.us\/j\//i
] as const;

/** Heuristic for provider-rendered meeting bodies that omit inline ICS (e.g. Outlook HTML). */
export const messageBodyLooksLikeMeetingInvite = (input: {
  bodyText: string | null;
  bodyHtml: string | null;
}): boolean => {
  const haystack = `${input.bodyHtml ?? ""} ${input.bodyText ?? ""}`;
  return MEETING_INVITE_HTML_PATTERNS.some((pattern) => pattern.test(haystack));
};

/** Pull embedded ICS from stored message bodies when the calendar part was not persisted as an attachment. */
export const extractIcsFromMailboxMessage = (input: {
  bodyText: string | null;
  bodyHtml: string | null;
}): string | null => {
  const candidates = [
    input.bodyText ?? "",
    input.bodyHtml ?? "",
    (input.bodyHtml ?? "").replace(/<[^>]+>/g, " ")
  ];
  for (const candidate of candidates) {
    const match = candidate.match(ICS_BLOCK_PATTERN);
    if (match?.[0]) return match[0];
  }
  return null;
};

/** Parses ICS from a synced message and upserts tenant calendar events for each VEVENT. */
export const parseAndUpsertIcsInvite = async (input: {
  tenantId: string;
  userId: string;
  sourceMessageId: string;
  icsContent: string;
}): Promise<void> => {
  const events = ical.sync.parseICS(input.icsContent);
  for (const key of Object.keys(events)) {
    const ev = events[key];
    if (!ev || ev.type !== "VEVENT") continue;
    const uid = String(ev.uid ?? key);
    const sequence = Number(ev.sequence ?? 0);
    const method = String((ev as { method?: string }).method ?? "").toUpperCase();
    const cancelled = method === "CANCEL" || ev.status === "CANCELLED";
    const startsAt = ev.start instanceof Date ? ev.start : new Date();
    const endsAt = ev.end instanceof Date ? ev.end : new Date(startsAt.getTime() + 3600_000);
    const organizerRaw = ev.organizer;
    const organizer: MailboxAddress = {
      email:
        typeof organizerRaw === "string"
          ? organizerRaw.replace(/^mailto:/i, "")
          : String((organizerRaw as { val?: string })?.val?.replace(/^mailto:/i, "") ?? ""),
      name:
        typeof organizerRaw === "string"
          ? null
          : ((organizerRaw as { params?: { CN?: string } })?.params?.CN ?? null)
    };
    const attendees: MailboxAddress[] = [];
    const att = ev.attendee;
    if (att) {
      const list = Array.isArray(att) ? att : [att];
      for (const a of list) {
        attendees.push({
          email:
            typeof a === "string"
              ? a.replace(/^mailto:/i, "")
              : String((a as { val?: string })?.val?.replace(/^mailto:/i, "") ?? ""),
          name: typeof a === "string" ? null : ((a as { params?: { CN?: string } })?.params?.CN ?? null)
        });
      }
    }
    await upsertMailboxCalendarEventFromIcs({
      tenantId: input.tenantId,
      userId: input.userId,
      sourceMessageId: input.sourceMessageId,
      icsUid: uid,
      icsSequence: sequence,
      title: String(ev.summary ?? "Meeting"),
      description: ev.description ? String(ev.description) : null,
      location: ev.location ? String(ev.location) : null,
      startsAt,
      endsAt,
      timezone: "UTC",
      allDay: Boolean(ev.datetype === "date"),
      status: cancelled ? "cancelled" : "confirmed",
      organizer,
      attendees,
      cancelled
    });
  }
};
