/**
 * Mailbox calendar event recurrence and reminder helpers.
 *
 * Enum schemas for reminders, recurrence, and location types; RRULE build/parse;
 * and JSON extras stored in `recurrence_json` on calendar events.
 *
 * Responsibilities:
 * - Parse/serialize calendar extras JSON for mailbox calendar rows
 * - Compute recurrence previews and reminder lead times in minutes
 *
 * Related:
 * - `mailbox.ts` calendar message types; web calendar compose UI
 */
import { z } from "zod";

export const CALENDAR_REMINDER_CODES = ["none", "10m", "30m", "1h", "2h", "4h", "1d", "1w"] as const;
export type CalendarReminderCode = (typeof CALENDAR_REMINDER_CODES)[number];

export const CALENDAR_RECURRENCE_FREQS = ["none", "daily", "weekly", "monthly", "yearly"] as const;
export type CalendarRecurrenceFreq = (typeof CALENDAR_RECURRENCE_FREQS)[number];

export const CALENDAR_RECURRENCE_SCOPES = ["this", "future", "series"] as const;
export type CalendarRecurrenceScope = (typeof CALENDAR_RECURRENCE_SCOPES)[number];

export const CALENDAR_LOCATION_TYPES = ["in_person", "by_call"] as const;
export type CalendarLocationType = (typeof CALENDAR_LOCATION_TYPES)[number];

export const calendarReminderCodeSchema = z.enum(CALENDAR_REMINDER_CODES);
export const calendarRecurrenceFreqSchema = z.enum(CALENDAR_RECURRENCE_FREQS);
export const calendarRecurrenceScopeSchema = z.enum(CALENDAR_RECURRENCE_SCOPES);
export const calendarLocationTypeSchema = z.enum(CALENDAR_LOCATION_TYPES);

/** Stored in `recurrence_json` alongside optional RRULE metadata. */
export const mailboxCalendarEventExtrasSchema = z
  .object({
    rrule: z.string().trim().max(2048).nullable().optional(),
    busy: z.boolean().optional(),
    private: z.boolean().optional(),
    reminders: z.array(calendarReminderCodeSchema).max(8).optional(),
    locationType: calendarLocationTypeSchema.optional(),
    attendeeIds: z.array(z.string().uuid()).max(50).optional(),
    recurrenceInterval: z.number().int().min(1).max(999).optional(),
    recurrenceFreq: calendarRecurrenceFreqSchema.optional(),
    stopRecurrenceDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    /** ISO date keys skipped when deleting/editing a single occurrence. */
    exceptionDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(500).optional()
  })
  .strict();

export type MailboxCalendarEventExtras = z.infer<typeof mailboxCalendarEventExtrasSchema>;

export const parseMailboxCalendarEventExtras = (
  recurrenceJson: string | null | undefined
): MailboxCalendarEventExtras => {
  if (!recurrenceJson?.trim()) return {};
  try {
    const parsed = mailboxCalendarEventExtrasSchema.safeParse(JSON.parse(recurrenceJson));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
};

export const serializeMailboxCalendarEventExtras = (extras: MailboxCalendarEventExtras): string | null => {
  const cleaned: MailboxCalendarEventExtras = {};
  if (extras.rrule) cleaned.rrule = extras.rrule;
  if (extras.busy !== undefined) cleaned.busy = extras.busy;
  if (extras.private !== undefined) cleaned.private = extras.private;
  if (extras.reminders?.length) cleaned.reminders = extras.reminders;
  if (extras.locationType) cleaned.locationType = extras.locationType;
  if (extras.attendeeIds?.length) cleaned.attendeeIds = extras.attendeeIds;
  if (extras.recurrenceInterval !== undefined) cleaned.recurrenceInterval = extras.recurrenceInterval;
  if (extras.recurrenceFreq) cleaned.recurrenceFreq = extras.recurrenceFreq;
  if (extras.stopRecurrenceDate) cleaned.stopRecurrenceDate = extras.stopRecurrenceDate;
  if (extras.exceptionDates?.length) cleaned.exceptionDates = extras.exceptionDates;
  return Object.keys(cleaned).length > 0 ? JSON.stringify(cleaned) : null;
};

const pad2 = (n: number) => String(n).padStart(2, "0");

export const dateToYmd = (date: Date): string =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

export const ymdToLocalDate = (ymd: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
};

export const addRecurrenceStep = (date: Date, freq: CalendarRecurrenceFreq, interval: number): Date => {
  const next = new Date(date);
  if (freq === "none") return next;
  const step = Math.max(1, interval);
  switch (freq) {
    case "daily":
      next.setDate(next.getDate() + step);
      break;
    case "weekly":
      next.setDate(next.getDate() + 7 * step);
      break;
    case "monthly":
      next.setMonth(next.getMonth() + step);
      break;
    case "yearly":
      next.setFullYear(next.getFullYear() + step);
      break;
    default:
      break;
  }
  return next;
};

export const nthRecurrenceStart = (
  start: Date,
  freq: CalendarRecurrenceFreq,
  interval: number,
  n: number
): Date => {
  let cursor = new Date(start);
  for (let i = 1; i < n; i += 1) {
    cursor = addRecurrenceStep(cursor, freq, interval);
  }
  return cursor;
};

/** Default stop date = end day of the 4th occurrence. */
export const defaultStopRecurrenceDate = (
  start: Date,
  freq: CalendarRecurrenceFreq,
  interval: number
): string => dateToYmd(nthRecurrenceStart(start, freq, interval, 4));

export const formatRruleUntil = (stopYmd: string, allDay: boolean): string => {
  const date = ymdToLocalDate(stopYmd);
  if (!date) return stopYmd.replace(/-/g, "");
  if (allDay) return `${stopYmd.replace(/-/g, "")}T235959Z`;
  return `${stopYmd.replace(/-/g, "")}T235959Z`;
};

export const buildCalendarRrule = (input: {
  freq: CalendarRecurrenceFreq;
  interval: number;
  stopRecurrenceDate: string;
  allDay: boolean;
}): string | null => {
  if (input.freq === "none") return null;
  const interval = Math.max(1, Math.trunc(input.interval));
  const freqToken = input.freq.toUpperCase();
  const until = formatRruleUntil(input.stopRecurrenceDate, input.allDay);
  return `FREQ=${freqToken};INTERVAL=${interval};UNTIL=${until}`;
};

export const parseCalendarRrule = (
  rrule: string | null | undefined
): { freq: CalendarRecurrenceFreq; interval: number; untilYmd: string | null } | null => {
  if (!rrule?.trim()) return null;
  const parts = Object.fromEntries(
    rrule
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [key, ...rest] = part.split("=");
        return [key?.toUpperCase() ?? "", rest.join("=")];
      })
  );
  const freqRaw = (parts.FREQ ?? "").toLowerCase();
  const freq = CALENDAR_RECURRENCE_FREQS.find((value) => value === freqRaw) ?? "none";
  if (freq === "none") return null;
  const interval = Math.max(1, Number.parseInt(parts.INTERVAL ?? "1", 10) || 1);
  const untilRaw = parts.UNTIL ?? "";
  const untilYmd =
    untilRaw.length >= 8
      ? `${untilRaw.slice(0, 4)}-${untilRaw.slice(4, 6)}-${untilRaw.slice(6, 8)}`
      : null;
  return { freq, interval, untilYmd };
};

export const computeRecurrencePreview = (input: {
  start: Date;
  freq: CalendarRecurrenceFreq;
  interval: number;
  stopRecurrenceDate: string;
}): { next: string | null; last: string | null } => {
  if (input.freq === "none") return { next: null, last: null };
  const stop = ymdToLocalDate(input.stopRecurrenceDate);
  if (!stop) return { next: null, last: null };
  stop.setHours(23, 59, 59, 999);

  let cursor = new Date(input.start);
  let next: Date | null = null;
  let last: Date | null = null;
  const now = new Date();

  while (cursor <= stop) {
    if (!next && cursor >= now) next = new Date(cursor);
    last = new Date(cursor);
    cursor = addRecurrenceStep(cursor, input.freq, input.interval);
    if (last && cursor > stop) break;
  }

  return {
    next: next ? dateToYmd(next) : null,
    last: last ? dateToYmd(last) : null
  };
};

export const reminderCodeToMinutes = (code: CalendarReminderCode): number | null => {
  switch (code) {
    case "none":
      return null;
    case "10m":
      return 10;
    case "30m":
      return 30;
    case "1h":
      return 60;
    case "2h":
      return 120;
    case "4h":
      return 240;
    case "1d":
      return 1440;
    case "1w":
      return 10_080;
    default:
      return null;
  }
};
