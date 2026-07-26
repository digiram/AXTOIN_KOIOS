/**
 * Calendar Event Form utilities.
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
import type { CalendarRecurrenceFreq, CalendarReminderCode } from "@starter/shared";

/** Shared constant or class token for mailbox presentation. */
export const calendarEventLabelClass = "mb-1 block text-sm font-medium text-slate-700";
/** Shared constant or class token for mailbox presentation. */
export const calendarEventSubLabelClass = "mb-1 block text-xs font-medium text-slate-600";
/** Shared constant or class token for mailbox presentation. */
export const calendarEventFocusRingClass = "focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-400";
/** Shared constant or class token for mailbox presentation. */
export const calendarEventInputClass =
  `w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm ${calendarEventFocusRingClass} disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500`;
/** Shared constant or class token for mailbox presentation. */
export const calendarEventInputErrorClass = "border-red-500 focus:border-red-500 focus:ring-red-500/25";
/** Shared constant or class token for mailbox presentation. */
export const calendarEventErrorTextClass = "mt-1 text-xs text-red-600";
/** Shared constant or class token for mailbox presentation. */
export const calendarEventGlobalErrorClass =
  "rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600";
/** Shared constant or class token for mailbox presentation. */
export const calendarEventDateInputClass =
  `min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm ${calendarEventFocusRingClass} disabled:opacity-60`;
/** Shared constant or class token for mailbox presentation. */
export const calendarEventTimeInputClass =
  `w-[3.5rem] rounded-md border border-slate-300 px-2 py-2 text-center font-mono text-sm tabular-nums shadow-sm ${calendarEventFocusRingClass} disabled:opacity-60`;
/** Shared constant or class token for mailbox presentation. */
export const calendarEventToggleClass =
  "inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors";
/** Shared constant or class token for mailbox presentation. */
export const calendarEventToggleActiveClass = "border-indigo-600 bg-indigo-600 text-white";
/** Shared constant or class token for mailbox presentation. */
export const calendarEventToggleInactiveClass =
  "border-slate-300 bg-white text-slate-700 hover:border-indigo-200 hover:bg-indigo-50";
/** Shared constant or class token for mailbox presentation. */
export const calendarEventIconToggleClass =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border transition-colors";
/** Shared constant or class token for mailbox presentation. */
export const calendarEventPreviewBoxClass =
  "mt-1 flex h-10 items-center truncate rounded-md border border-indigo-100 bg-indigo-50/60 px-3 text-sm text-indigo-950";
/** Shared constant or class token for mailbox presentation. */
export const calendarEventPrimaryButtonClass =
  "rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60";
/** Shared constant or class token for mailbox presentation. */
export const calendarEventSecondaryButtonClass =
  "rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-indigo-200 hover:bg-indigo-50";
/** Shared constant or class token for mailbox presentation. */
export const calendarEventReminderChipActiveClass =
  "border-indigo-300 bg-indigo-100 text-indigo-900";
/** Shared constant or class token for mailbox presentation. */
export const calendarEventReminderChipInactiveClass =
  "border-slate-300 bg-white text-slate-700 hover:border-indigo-200 hover:bg-indigo-50";
/** Shared constant or class token for mailbox presentation. */
export const calendarEventAttendeeChipClass =
  "inline-flex max-w-full items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-xs text-indigo-900";
/** Shared constant or class token for mailbox presentation. */
export const calendarEventLinkClass = "text-indigo-700 hover:text-indigo-900 hover:underline";

/** React component for mailbox UI. */
export const CALENDAR_REMINDER_OPTIONS: { code: CalendarReminderCode; label: string }[] = [
  { code: "none", label: "No reminder" },
  { code: "10m", label: "10 minutes before" },
  { code: "30m", label: "30 minutes before" },
  { code: "1h", label: "1 hour before" },
  { code: "2h", label: "2 hours before" },
  { code: "4h", label: "4 hours before" },
  { code: "1d", label: "1 day before" },
  { code: "1w", label: "1 week before" }
];

/** React component for mailbox UI. */
export const CALENDAR_RECURRENCE_FREQ_LABELS: Record<
  Exclude<CalendarRecurrenceFreq, "none">,
  string
> = {
  daily: "Day(s)",
  weekly: "Week(s)",
  monthly: "Month(s)",
  yearly: "Year(s)"
};

/** Display minute without leading zero (matches reference UI). */
export const displayTimePart = (value: string): string => String(Number(value));

/** Shared constant or class token for mailbox presentation. */
export const displayHourPart = (value: string): string => pad2(Math.min(23, Math.max(0, Number(value) || 0)));

/** Shared constant or class token for mailbox presentation. */
export const pad2 = (value: number) => String(value).padStart(2, "0");

/** Shared constant or class token for mailbox presentation. */
export const toDateInputValue = (date: Date): string =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

/** Shared constant or class token for mailbox presentation. */
export const parseDateInput = (value: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
};

/** Shared constant or class token for mailbox presentation. */
export const splitTimeParts = (timeValue: string): { hours: string; minutes: string } => {
  const [hours = "0", minutes = "0"] = timeValue.split(":");
  return { hours: pad2(Math.min(23, Math.max(0, Number(hours) || 0))), minutes: pad2(Math.min(59, Math.max(0, Number(minutes) || 0))) };
};

/** Shared constant or class token for mailbox presentation. */
export const joinTimeParts = (hours: string, minutes: string): string =>
  `${pad2(Math.min(23, Math.max(0, Number(hours) || 0)))}:${pad2(Math.min(59, Math.max(0, Number(minutes) || 0)))}`;

/** Shared constant or class token for mailbox presentation. */
export const combineDateAndTime = (dateValue: string, timeValue: string): Date | null => {
  const date = parseDateInput(dateValue);
  if (!date) return null;
  const { hours, minutes } = splitTimeParts(timeValue);
  date.setHours(Number(hours), Number(minutes), 0, 0);
  return date;
};

/** Shared constant or class token for mailbox presentation. */
export const toTimeInputValue = (date: Date): string => `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;

/** Shared constant or class token for mailbox presentation. */
export const defaultBrowserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

/** Shared constant or class token for mailbox presentation. */
export const initialEventRange = (dayKey?: string | null): {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
} => {
  const base = dayKey ? parseDateInput(dayKey) : new Date();
  const start = base ?? new Date();
  if (!dayKey) {
    start.setSeconds(0, 0);
  } else {
    start.setHours(9, 0, 0, 0);
  }
  const end = new Date(start);
  end.setHours(end.getHours() + 1);
  return {
    startDate: toDateInputValue(start),
    startTime: toTimeInputValue(start),
    endDate: toDateInputValue(end),
    endTime: toTimeInputValue(end)
  };
};

/** Shared constant or class token for mailbox presentation. */
export const allDayBounds = (startDate: string, endDate: string): { startsAt: Date; endsAt: Date } | null => {
  const start = parseDateInput(startDate);
  const end = parseDateInput(endDate || startDate);
  if (!start || !end) return null;
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  if (end < start) end.setTime(start.getTime());
  return { startsAt: start, endsAt: end };
};

/** Shared constant or class token for mailbox presentation. */
export const clampNumericInput = (value: string, max: number): string => {
  const digits = value.replace(/\D/g, "").slice(0, 2);
  if (!digits) return "";
  const num = Math.min(max, Math.max(0, Number(digits)));
  return String(num);
};
