/**
 * Calendar Event modal.
 *
 * Modal dialog for a focused mailbox create, edit, or confirmation flow.
 *
 * Responsibilities:
 * - Collect and validate user input for a single action
 * - Submit changes to tenant APIs and surface errors inline
 *
 * Related:
 * - Route: /admin/mailbox
 *
 * Security:
 * - Submissions use authenticated tenant API helpers
 */
import type { CalendarRecurrenceFreq, CalendarRecurrenceScope, CalendarReminderCode } from "@starter/shared";
import {
  computeRecurrencePreview,
  defaultStopRecurrenceDate
} from "@starter/shared";
import { Clock, Lock, Sun } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  CalendarEventAttendeesField,
  type CalendarEventAttendee
} from "./CalendarEventAttendeesField.js";
import { CalendarEventLocationField } from "./CalendarEventLocationField.js";
import { CalendarEventModalShell } from "./CalendarEventModalShell.js";
import { CalendarEventScopeModal } from "./CalendarEventScopeModal.js";
import {
  allDayBounds,
  calendarEventGlobalErrorClass,
  calendarEventInputClass,
  calendarEventInputErrorClass,
  calendarEventErrorTextClass,
  calendarEventLabelClass,
  calendarEventPreviewBoxClass,
  calendarEventSubLabelClass,
  calendarEventTimeInputClass,
  calendarEventToggleActiveClass,
  calendarEventToggleClass,
  calendarEventToggleInactiveClass,
  calendarEventPrimaryButtonClass,
  calendarEventSecondaryButtonClass,
  calendarEventReminderChipActiveClass,
  calendarEventReminderChipInactiveClass,
  calendarEventLinkClass,
  calendarEventFocusRingClass,
  CALENDAR_REMINDER_OPTIONS,
  CALENDAR_RECURRENCE_FREQ_LABELS,
  clampNumericInput,
  combineDateAndTime,
  calendarEventDateInputClass,
  calendarEventIconToggleClass,
  defaultBrowserTimeZone,
  displayHourPart,
  displayTimePart,
  initialEventRange,
  joinTimeParts,
  splitTimeParts,
  toDateInputValue,
  toTimeInputValue
} from "./calendarEventFormUtils.js";
import {
  calendarEventAcceptsRsvp,
  extractCalendarMeetingUrl,
  type MailboxCalendarEvent
} from "./mailboxCalendarUtils.js";
import type { MailboxConnection } from "./mailboxTypes.js";
import { useMailboxApi } from "./useMailboxApi.js";
import { useMailboxDisplayFormatters } from "./useMailboxDisplayFormatters.js";

/** Modal UI for a focused mailbox workflow. */
export type CalendarEventModalMode = "add" | "edit" | "view";

type Props = {
  mode: CalendarEventModalMode;
  open: boolean;
  onClose: () => void;
  event?: MailboxCalendarEvent | null;
  connections: MailboxConnection[];
  defaultConnectionId?: string | null;
  defaultDayKey?: string | null;
  userEmails?: string[];
  onSaved?: () => void | Promise<void>;
  onDeleted?: () => void | Promise<void>;
  onRsvp?: (eventId: string, response: "accepted" | "declined" | "tentative") => void | Promise<void>;
  onRequestEdit?: () => void;
};

const writableConnections = (connections: MailboxConnection[]) =>
  connections.filter((connection) => connection.provider === "gmail" || connection.provider === "microsoft");

const toggleReminder = (current: CalendarReminderCode[], code: CalendarReminderCode): CalendarReminderCode[] => {
  if (code === "none") return current.includes("none") ? [] : ["none"];
  const withoutNone = current.filter((item) => item !== "none");
  return withoutNone.includes(code) ? withoutNone.filter((item) => item !== code) : [...withoutNone, code];
};

/** Modal UI for a focused mailbox workflow. */
export const CalendarEventModal = ({
  mode,
  open,
  onClose,
  event,
  connections,
  defaultConnectionId,
  defaultDayKey,
  userEmails = [],
  onSaved,
  onDeleted,
  onRsvp,
  onRequestEdit
}: Props) => {
  const { apiFetch } = useMailboxApi();
  const { formatLongCalendarDay, formatEventTime } = useMailboxDisplayFormatters();
  const eligibleConnections = useMemo(() => writableConnections(connections), [connections]);
  const readOnly = mode === "view";

  const [connectionId, setConnectionId] = useState("");
  const [title, setTitle] = useState("");
  const [titleError, setTitleError] = useState("");
  const [busy, setBusy] = useState(true);
  const [isPrivate, setIsPrivate] = useState(false);
  const [allDay, setAllDay] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("10:00");
  const [attendees, setAttendees] = useState<CalendarEventAttendee[]>([]);
  const [locationType, setLocationType] = useState<"in_person" | "by_call">("in_person");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [reminders, setReminders] = useState<CalendarReminderCode[]>(["10m"]);
  const [recurrenceFreq, setRecurrenceFreq] = useState<CalendarRecurrenceFreq>("none");
  const [recurrenceInterval, setRecurrenceInterval] = useState("1");
  const [stopRecurrenceDate, setStopRecurrenceDate] = useState("");
  const [stopRecurrenceTouched, setStopRecurrenceTouched] = useState(false);
  const [globalError, setGlobalError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [scopeModal, setScopeModal] = useState<{ mode: "save" | "delete" } | null>(null);
  const [loadedEvent, setLoadedEvent] = useState<MailboxCalendarEvent | null>(null);

  const activeEvent = loadedEvent ?? event ?? null;

  const resetAddDefaults = () => {
    const range = initialEventRange(defaultDayKey);
    setConnectionId(
      defaultConnectionId && eligibleConnections.some((connection) => connection.id === defaultConnectionId)
        ? defaultConnectionId
        : eligibleConnections[0]?.id ?? ""
    );
    setTitle("");
    setTitleError("");
    setBusy(true);
    setIsPrivate(false);
    setAllDay(false);
    setStartDate(range.startDate);
    setStartTime(range.startTime);
    setEndDate(range.endDate);
    setEndTime(range.endTime);
    setAttendees([]);
    setLocationType("in_person");
    setLocation("");
    setDescription("");
    setReminders(["10m"]);
    setRecurrenceFreq("none");
    setRecurrenceInterval("1");
    setStopRecurrenceDate("");
    setStopRecurrenceTouched(false);
    setGlobalError("");
    setDeleteConfirm(false);
    setLoadedEvent(null);
  };

  const applyEventToForm = (row: MailboxCalendarEvent) => {
    const start = new Date(row.startsAt);
    const end = new Date(row.endsAt);
    setTitle(row.title);
    setBusy(row.busy ?? true);
    setIsPrivate(row.isPrivate ?? false);
    setAllDay(Boolean(row.allDay));
    setStartDate(toDateInputValue(start));
    setStartTime(toTimeInputValue(start));
    setEndDate(toDateInputValue(end));
    setEndTime(toTimeInputValue(end));
    setLocationType(row.locationType ?? "in_person");
    setLocation(row.location ?? "");
    setDescription(row.description ?? "");
    setReminders((row.reminders as CalendarReminderCode[] | undefined) ?? ["10m"]);
    setRecurrenceFreq(row.recurrenceFreq ?? "none");
    setRecurrenceInterval(String(row.recurrenceInterval ?? 1));
    setStopRecurrenceDate(row.stopRecurrenceDate ?? "");
    setStopRecurrenceTouched(Boolean(row.stopRecurrenceDate));
    setAttendees(
      (row.attendees ?? []).map((attendee, index) => ({
        id: row.attendeeIds?.[index] ?? attendee.email,
        name: attendee.name ?? attendee.email,
        email: attendee.email
      }))
    );
    setConnectionId(row.connectionId ?? "");
  };

  useEffect(() => {
    if (!open) return;
    if (mode === "add") {
      resetAddDefaults();
      return;
    }
    if (!event?.id) return;
    setGlobalError("");
    setDeleteConfirm(false);
    void (async () => {
      try {
        const res = await apiFetch(`/tenant/mailbox/calendar/events/${event.id}`);
        if (!res.ok) throw new Error("Could not load event");
        const json = (await res.json()) as { event: MailboxCalendarEvent };
        setLoadedEvent(json.event);
        applyEventToForm(json.event);
      } catch {
        applyEventToForm(event);
        setLoadedEvent(event);
      }
    })();
  }, [open, mode, event?.id, defaultConnectionId, defaultDayKey, eligibleConnections]);

  const startParts = splitTimeParts(startTime);
  const endParts = splitTimeParts(endTime);

  const recurrenceStart = useMemo(() => {
    if (allDay) return allDayBounds(startDate, endDate)?.startsAt ?? null;
    return combineDateAndTime(startDate, startTime);
  }, [allDay, startDate, startTime, endDate]);

  useEffect(() => {
    if (recurrenceFreq === "none" || stopRecurrenceTouched || !recurrenceStart) return;
    setStopRecurrenceDate(
      defaultStopRecurrenceDate(recurrenceStart, recurrenceFreq, Math.max(1, Number(recurrenceInterval) || 1))
    );
  }, [recurrenceFreq, recurrenceInterval, recurrenceStart, stopRecurrenceTouched]);

  const recurrencePreview = useMemo(() => {
    if (recurrenceFreq === "none" || !recurrenceStart || !stopRecurrenceDate) {
      return { next: null, last: null };
    }
    return computeRecurrencePreview({
      start: recurrenceStart,
      freq: recurrenceFreq,
      interval: Math.max(1, Number(recurrenceInterval) || 1),
      stopRecurrenceDate
    });
  }, [recurrenceFreq, recurrenceInterval, recurrenceStart, stopRecurrenceDate]);

  const validate = (): boolean => {
    setTitleError("");
    setGlobalError("");
    if (!title.trim()) {
      setTitleError("Title is required.");
      return false;
    }
    const bounds = allDay
      ? allDayBounds(startDate, endDate)
      : (() => {
          const startsAt = combineDateAndTime(startDate, startTime);
          const endsAt = combineDateAndTime(endDate || startDate, endTime);
          return startsAt && endsAt ? { startsAt, endsAt } : null;
        })();
    if (!bounds) {
      setGlobalError("Enter valid start and end dates.");
      return false;
    }
    if (bounds.endsAt <= bounds.startsAt) {
      setGlobalError("End must be after start.");
      return false;
    }
    if (recurrenceFreq !== "none") {
      const interval = Number(recurrenceInterval);
      if (!Number.isInteger(interval) || interval < 1) {
        setGlobalError("Recurrence interval must be at least 1.");
        return false;
      }
      if (!stopRecurrenceDate) {
        setGlobalError("Stop recurrence date is required.");
        return false;
      }
    }
    if (mode === "add" && !connectionId) {
      setGlobalError("Connect Gmail or Outlook to create calendar events.");
      return false;
    }
    return true;
  };

  const buildPayload = () => {
    const bounds = allDay
      ? allDayBounds(startDate, endDate)!
      : {
          startsAt: combineDateAndTime(startDate, startTime)!,
          endsAt: combineDateAndTime(endDate || startDate, endTime)!
        };
    return {
      title: title.trim(),
      description: description.trim() || undefined,
      location: location.trim() || undefined,
      startsAt: bounds.startsAt.toISOString(),
      endsAt: bounds.endsAt.toISOString(),
      timezone: defaultBrowserTimeZone(),
      allDay,
      busy,
      isPrivate,
      reminders,
      locationType,
      attendeeIds: attendees.map((attendee) => attendee.id),
      recurrenceFreq,
      recurrenceInterval: Math.max(1, Number(recurrenceInterval) || 1),
      stopRecurrenceDate: recurrenceFreq === "none" ? undefined : stopRecurrenceDate
    };
  };

  const submitWithScope = async (scope?: CalendarRecurrenceScope) => {
    if (!validate()) return;
    setSaving(true);
    setGlobalError("");
    try {
      const payload = buildPayload();
      if (mode === "add") {
        const res = await apiFetch("/tenant/mailbox/calendar/events", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...payload, connectionId })
        });
        if (!res.ok) {
          const json = (await res.json().catch(() => null)) as { message?: string } | null;
          throw new Error(json?.message ?? "Could not create event.");
        }
      } else if (activeEvent) {
        const res = await apiFetch(`/tenant/mailbox/calendar/events/${activeEvent.id}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...payload, recurrenceScope: scope })
        });
        if (!res.ok) {
          const json = (await res.json().catch(() => null)) as { message?: string } | null;
          throw new Error(json?.message ?? "Could not save event.");
        }
      }
      await onSaved?.();
      onClose();
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : "Could not save event.");
    } finally {
      setSaving(false);
      setScopeModal(null);
    }
  };

  const handleSave = (submitEvent: React.FormEvent) => {
    submitEvent.preventDefault();
    if (readOnly) return;
    if (!validate()) return;
    if (mode === "edit" && recurrenceFreq !== "none") {
      setScopeModal({ mode: "save" });
      return;
    }
    void submitWithScope();
  };

  const deleteWithScope = async (scope?: CalendarRecurrenceScope) => {
    if (!activeEvent) return;
    setDeleting(true);
    setGlobalError("");
    try {
      const res = await apiFetch(`/tenant/mailbox/calendar/events/${activeEvent.id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recurrenceScope: scope,
          occurrenceDate: startDate
        })
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(json?.message ?? "Could not delete event.");
      }
      await onDeleted?.();
      onClose();
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : "Could not delete event.");
    } finally {
      setDeleting(false);
      setDeleteConfirm(false);
      setScopeModal(null);
    }
  };

  const handleDelete = () => {
    if (recurrenceFreq !== "none" || activeEvent?.rrule) {
      setScopeModal({ mode: "delete" });
      return;
    }
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      return;
    }
    void deleteWithScope();
  };

  const handleAllDayToggle = () => {
    const next = !allDay;
    setAllDay(next);
    if (next && endDate < startDate) setEndDate(startDate);
  };

  const modalTitle = mode === "add" ? "Add event" : mode === "edit" ? "Edit event" : activeEvent?.title ?? "Event";

  const footer = readOnly ? (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-2">
        {activeEvent && calendarEventAcceptsRsvp(activeEvent, userEmails) ? (
          <>
            <button
              type="button"
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
              onClick={() => void onRsvp?.(activeEvent.id, "accepted")}
            >
              Accept
            </button>
            <button
              type="button"
              className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
              onClick={() => void onRsvp?.(activeEvent.id, "tentative")}
            >
              Tentative
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => void onRsvp?.(activeEvent.id, "declined")}
            >
              Decline
            </button>
          </>
        ) : null}
      </div>
      <div className="ml-auto flex gap-2">
        {activeEvent?.providerEventId ? (
          <button
            type="button"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-indigo-200 hover:bg-indigo-50"
            onClick={onRequestEdit}
          >
            Edit
          </button>
        ) : null}
        <button
          type="button"
          className={calendarEventSecondaryButtonClass}
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  ) : (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {mode === "edit" ? (
        <button
          type="button"
          className={[
            "rounded-md px-4 py-2 text-sm font-medium",
            deleteConfirm
              ? "bg-red-600 text-white hover:bg-red-700"
              : "border border-red-300 bg-white text-red-700 hover:bg-red-50"
          ].join(" ")}
          disabled={saving || deleting}
          onClick={handleDelete}
        >
          {deleteConfirm ? "Click again to delete" : "Delete event"}
        </button>
      ) : (
        <span />
      )}
      <div className="ml-auto flex gap-2">
        <button
          type="button"
          className={calendarEventSecondaryButtonClass}
          onClick={onClose}
          disabled={saving || deleting}
        >
          Cancel
        </button>
        <button
          type="submit"
          form="calendar-event-form"
          className={calendarEventPrimaryButtonClass}
          disabled={saving || deleting}
        >
          {saving ? "Saving…" : "Save event"}
        </button>
      </div>
    </div>
  );

  const meeting = activeEvent ? extractCalendarMeetingUrl(activeEvent) : null;

  return (
    <>
      <CalendarEventModalShell title={modalTitle} open={open} onClose={onClose} footer={footer}>
        {mode === "add" && eligibleConnections.length === 0 ? (
          <p className="text-sm text-slate-600">
            Calendar events are created on your linked Gmail or Outlook calendar. Connect one of those accounts first.
          </p>
        ) : (
          <form id="calendar-event-form" className="space-y-6" onSubmit={handleSave}>
            <div className="grid gap-4 md:grid-cols-[minmax(0,1.5fr)_auto] md:items-end">
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end">
                {mode === "add" && eligibleConnections.length > 0 ? (
                  <div className="w-full shrink-0 sm:w-52">
                    <label htmlFor="calendar-event-connection" className={calendarEventLabelClass}>
                      Calendar account
                    </label>
                    <select
                      id="calendar-event-connection"
                      className={calendarEventInputClass}
                      value={connectionId}
                      disabled={saving || readOnly}
                      onChange={(changeEvent) => setConnectionId(changeEvent.target.value)}
                    >
                      {eligibleConnections.map((connection) => (
                        <option key={connection.id} value={connection.id}>
                          {connection.displayName}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                <div className="min-w-0 flex-1">
                  <label htmlFor="calendar-event-title" className={calendarEventLabelClass}>
                    Title <span className="text-red-500">*</span>
                  </label>
                  {readOnly ? (
                    <p className="text-sm text-slate-900">{title}</p>
                  ) : (
                    <>
                      <input
                        id="calendar-event-title"
                        className={`${calendarEventInputClass} ${titleError ? calendarEventInputErrorClass : ""}`}
                        value={title}
                        onChange={(changeEvent) => {
                          setTitle(changeEvent.target.value);
                          if (titleError) setTitleError("");
                        }}
                        disabled={saving}
                        autoFocus={mode === "add"}
                      />
                      {titleError ? <p className={calendarEventErrorTextClass}>{titleError}</p> : null}
                    </>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 md:pb-0.5">
                {readOnly ? (
                  <>
                    <span className={`${calendarEventToggleClass} ${calendarEventToggleActiveClass}`}>
                      <span className={`inline-block h-2 w-2 rounded-full ${busy ? "bg-red-500" : "border border-green-500 bg-transparent"}`} />
                      {busy ? "Busy" : "Free"}
                    </span>
                    {isPrivate ? (
                      <span className={`${calendarEventIconToggleClass} ${calendarEventToggleActiveClass}`}>
                        <Lock className="h-4 w-4" aria-hidden />
                      </span>
                    ) : null}
                  </>
                ) : (
                  <>
                    <div className="inline-flex overflow-hidden rounded-md border border-slate-300">
                      <button
                        type="button"
                        className={`${calendarEventToggleClass} rounded-none border-0 ${busy ? calendarEventToggleActiveClass : calendarEventToggleInactiveClass}`}
                        onClick={() => setBusy(true)}
                      >
                        <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
                        Busy
                      </button>
                      <button
                        type="button"
                        className={`${calendarEventToggleClass} rounded-none border-0 border-l border-slate-300 ${!busy ? calendarEventToggleActiveClass : calendarEventToggleInactiveClass}`}
                        onClick={() => setBusy(false)}
                      >
                        <span className="inline-block h-2 w-2 rounded-full border border-green-500 bg-transparent" />
                        Free
                      </button>
                    </div>
                    <button
                      type="button"
                      className={`${calendarEventIconToggleClass} ${isPrivate ? calendarEventToggleActiveClass : calendarEventToggleInactiveClass}`}
                      onClick={() => setIsPrivate((value) => !value)}
                      aria-pressed={isPrivate}
                      title={isPrivate ? "Private event" : "Mark as private"}
                    >
                      <Lock className="h-4 w-4" aria-hidden />
                      <span className="sr-only">Private</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {readOnly && activeEvent ? (
              <div className="rounded-md border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-sm text-indigo-950">
                <div className="font-medium">{formatLongCalendarDay(startDate)}</div>
                <div className="text-slate-600">{formatEventTime(activeEvent)}</div>
                {meeting ? (
                  <a href={meeting.url} target="_blank" rel="noopener noreferrer" className={`mt-2 inline-block ${calendarEventLinkClass}`}>
                    {meeting.label}
                  </a>
                ) : null}
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <span className={calendarEventLabelClass}>Start date &amp; time</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      className={calendarEventDateInputClass}
                      value={startDate}
                      disabled={saving}
                      onChange={(changeEvent) => {
                        const next = changeEvent.target.value;
                        setStartDate(next);
                        if (allDay && endDate < next) setEndDate(next);
                      }}
                    />
                    {!allDay ? (
                      <div className="flex shrink-0 items-center gap-1">
                        <input
                          inputMode="numeric"
                          aria-label="Start hour"
                          className={calendarEventTimeInputClass}
                          value={displayHourPart(startParts.hours)}
                          disabled={saving}
                          onChange={(changeEvent) =>
                            setStartTime(joinTimeParts(clampNumericInput(changeEvent.target.value, 23), startParts.minutes))
                          }
                        />
                        <span className="text-slate-500">:</span>
                        <input
                          inputMode="numeric"
                          aria-label="Start minute"
                          className={calendarEventTimeInputClass}
                          value={displayTimePart(startParts.minutes)}
                          disabled={saving}
                          onChange={(changeEvent) =>
                            setStartTime(joinTimeParts(startParts.hours, clampNumericInput(changeEvent.target.value, 59)))
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
                <div>
                  <span className={calendarEventLabelClass}>End date &amp; time</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="date"
                      className={calendarEventDateInputClass}
                      value={endDate}
                      disabled={saving}
                      onChange={(changeEvent) => setEndDate(changeEvent.target.value)}
                    />
                    {!allDay ? (
                      <div className="flex shrink-0 items-center gap-1">
                        <input
                          inputMode="numeric"
                          aria-label="End hour"
                          className={calendarEventTimeInputClass}
                          value={displayHourPart(endParts.hours)}
                          disabled={saving}
                          onChange={(changeEvent) =>
                            setEndTime(joinTimeParts(clampNumericInput(changeEvent.target.value, 23), endParts.minutes))
                          }
                        />
                        <span className="text-slate-500">:</span>
                        <input
                          inputMode="numeric"
                          aria-label="End minute"
                          className={calendarEventTimeInputClass}
                          value={displayTimePart(endParts.minutes)}
                          disabled={saving}
                          onChange={(changeEvent) =>
                            setEndTime(joinTimeParts(endParts.hours, clampNumericInput(changeEvent.target.value, 59)))
                          }
                        />
                      </div>
                    ) : null}
                    <button
                      type="button"
                      className={`${calendarEventToggleClass} shrink-0 ${allDay ? calendarEventToggleActiveClass : calendarEventToggleInactiveClass}`}
                      onClick={handleAllDayToggle}
                      aria-pressed={allDay}
                    >
                      {allDay ? <Sun className="h-4 w-4" aria-hidden /> : <Clock className="h-4 w-4" aria-hidden />}
                      {allDay ? "Full day" : "Timed"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <CalendarEventAttendeesField
              attendees={attendees}
              onChange={setAttendees}
              disabled={saving}
              readOnly={readOnly}
            />

            <CalendarEventLocationField
              locationType={locationType}
              onLocationTypeChange={setLocationType}
              location={location}
              onLocationChange={setLocation}
              disabled={saving}
              readOnly={readOnly}
            />

            <div>
              <label htmlFor="calendar-event-description" className={calendarEventLabelClass}>
                Description
              </label>
              {readOnly ? (
                <p className="whitespace-pre-wrap text-sm text-slate-700">{description.trim() || "—"}</p>
              ) : (
                <textarea
                  id="calendar-event-description"
                  rows={4}
                  className={calendarEventInputClass}
                  value={description}
                  disabled={saving}
                  onChange={(changeEvent) => setDescription(changeEvent.target.value)}
                />
              )}
            </div>

            <div>
              <span className={calendarEventLabelClass}>Reminders</span>
              {readOnly ? (
                <p className="text-sm text-slate-700">
                  {reminders
                    .map((code) => CALENDAR_REMINDER_OPTIONS.find((option) => option.code === code)?.label ?? code)
                    .join(", ") || "No reminder"}
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {CALENDAR_REMINDER_OPTIONS.map((option) => {
                    const active = reminders.includes(option.code);
                    return (
                      <button
                        key={option.code}
                        type="button"
                        className={[
                          "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                          active ? calendarEventReminderChipActiveClass : calendarEventReminderChipInactiveClass
                        ].join(" ")}
                        onClick={() => setReminders((current) => toggleReminder(current, option.code))}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <span className={calendarEventLabelClass}>Recurrence</span>
              {readOnly ? (
                <p className="text-sm text-slate-700">
                  {recurrenceFreq === "none"
                    ? "Does not repeat"
                    : `Every ${recurrenceInterval} ${CALENDAR_RECURRENCE_FREQ_LABELS[recurrenceFreq as keyof typeof CALENDAR_RECURRENCE_FREQ_LABELS] ?? recurrenceFreq}${stopRecurrenceDate ? ` until ${formatLongCalendarDay(stopRecurrenceDate)}` : ""}`}
                </p>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-slate-600">Every</span>
                    <input
                      type="number"
                      min={1}
                      className={`h-10 w-16 rounded-md border border-slate-300 px-2 text-center text-sm shadow-sm ${calendarEventFocusRingClass} disabled:opacity-60`}
                      value={recurrenceInterval}
                      disabled={recurrenceFreq === "none" || saving}
                      onChange={(changeEvent) => setRecurrenceInterval(changeEvent.target.value)}
                    />
                    <select
                      className={`${calendarEventInputClass} min-w-[10rem] flex-1`}
                      value={recurrenceFreq}
                      disabled={saving}
                      onChange={(changeEvent) => {
                        setRecurrenceFreq(changeEvent.target.value as CalendarRecurrenceFreq);
                        setStopRecurrenceTouched(false);
                      }}
                    >
                      <option value="none">Does not repeat</option>
                      {(Object.keys(CALENDAR_RECURRENCE_FREQ_LABELS) as Array<keyof typeof CALENDAR_RECURRENCE_FREQ_LABELS>).map(
                        (freq) => (
                          <option key={freq} value={freq}>
                            {CALENDAR_RECURRENCE_FREQ_LABELS[freq]}
                          </option>
                        )
                      )}
                    </select>
                  </div>
                  {recurrenceFreq !== "none" ? (
                    <div className="grid gap-4 md:grid-cols-3">
                      <div>
                        <span className={calendarEventSubLabelClass}>Next occurrence</span>
                        <div className={calendarEventPreviewBoxClass}>
                          {recurrencePreview.next ? formatLongCalendarDay(recurrencePreview.next) : "—"}
                        </div>
                      </div>
                      <div>
                        <span className={calendarEventSubLabelClass}>Last occurrence</span>
                        <div className={calendarEventPreviewBoxClass}>
                          {recurrencePreview.last ? formatLongCalendarDay(recurrencePreview.last) : "—"}
                        </div>
                      </div>
                      <div>
                        <label htmlFor="calendar-event-stop-recurrence" className={calendarEventSubLabelClass}>
                          Stop recurrence <span className="text-red-500">*</span>
                        </label>
                        <input
                          id="calendar-event-stop-recurrence"
                          type="date"
                          className={calendarEventInputClass}
                          value={stopRecurrenceDate}
                          disabled={saving}
                          onChange={(changeEvent) => {
                            setStopRecurrenceDate(changeEvent.target.value);
                            setStopRecurrenceTouched(true);
                          }}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            {globalError ? <p className={calendarEventGlobalErrorClass}>{globalError}</p> : null}
          </form>
        )}
      </CalendarEventModalShell>

      <CalendarEventScopeModal
        open={Boolean(scopeModal)}
        mode={scopeModal?.mode ?? "save"}
        onClose={() => setScopeModal(null)}
        onSelect={(scope) => {
          if (scopeModal?.mode === "delete") void deleteWithScope(scope);
          else void submitWithScope(scope);
        }}
      />
    </>
  );
};
