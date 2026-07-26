/**
 * Mailbox Calendar Event Create modal.
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
import type { MailboxAddress } from "@starter/shared";
import { Video } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { CrmModal } from "../../components/crm/CrmModal.js";
import { MailboxCrmRecipientField } from "./MailboxCrmRecipientField.js";
import { mailboxComposeInputClass } from "./mailboxComposeUtils.js";
import type { MailboxConnection } from "./mailboxTypes.js";
import { useMailboxApi } from "./useMailboxApi.js";

type Props = {
  open: boolean;
  onClose: () => void;
  connections: MailboxConnection[];
  defaultConnectionId?: string | null;
  defaultDayKey?: string | null;
  onCreated: () => void | Promise<void>;
};

const writableConnections = (connections: MailboxConnection[]) =>
  connections.filter((connection) => connection.provider === "gmail" || connection.provider === "microsoft");

const defaultBrowserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

const pad = (value: number) => String(value).padStart(2, "0");

const toDateInputValue = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const toTimeInputValue = (date: Date): string => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

const parseDateInput = (value: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
};

const combineDateAndTime = (dateValue: string, timeValue: string): Date | null => {
  const date = parseDateInput(dateValue);
  if (!date) return null;
  const [hours, minutes] = timeValue.split(":").map((part) => Number(part));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  date.setHours(hours, minutes, 0, 0);
  return date;
};

const initialRange = (dayKey?: string | null): { startDate: string; startTime: string; endDate: string; endTime: string } => {
  const base = dayKey ? parseDateInput(dayKey) : new Date();
  const start = base ?? new Date();
  start.setHours(9, 0, 0, 0);
  const end = new Date(start);
  end.setHours(10, 0, 0, 0);
  return {
    startDate: toDateInputValue(start),
    startTime: toTimeInputValue(start),
    endDate: toDateInputValue(end),
    endTime: toTimeInputValue(end)
  };
};

const videoMeetingLabel = (provider: string): string => {
  if (provider === "gmail") return "Add Google Meet video conferencing";
  if (provider === "microsoft") return "Add Microsoft Teams meeting";
  return "Add video meeting";
};

/** Modal UI for a focused mailbox workflow. */
export const MailboxCalendarEventCreateModal = ({
  open,
  onClose,
  connections,
  defaultConnectionId,
  defaultDayKey,
  onCreated
}: Props) => {
  const { apiFetch } = useMailboxApi();
  const eligibleConnections = useMemo(() => writableConnections(connections), [connections]);
  const [connectionId, setConnectionId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("10:00");
  const [attendees, setAttendees] = useState<MailboxAddress[]>([]);
  const [addVideoMeeting, setAddVideoMeeting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selectedConnection = eligibleConnections.find((connection) => connection.id === connectionId) ?? null;

  useEffect(() => {
    if (!open) return;
    const range = initialRange(defaultDayKey);
    setConnectionId(
      defaultConnectionId && eligibleConnections.some((connection) => connection.id === defaultConnectionId)
        ? defaultConnectionId
        : eligibleConnections[0]?.id ?? ""
    );
    setTitle("");
    setDescription("");
    setLocation("");
    setAllDay(false);
    setStartDate(range.startDate);
    setStartTime(range.startTime);
    setEndDate(range.endDate);
    setEndTime(range.endTime);
    setAttendees([]);
    setAddVideoMeeting(false);
    setError("");
    setBusy(false);
  }, [open, defaultConnectionId, defaultDayKey, eligibleConnections]);

  const handleAllDayChange = (nextAllDay: boolean) => {
    setAllDay(nextAllDay);
    if (nextAllDay && endDate < startDate) {
      setEndDate(startDate);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!connectionId) {
      setError("Connect Gmail or Outlook to create calendar invites.");
      return;
    }
    if (!title.trim()) {
      setError("Add a title for the event.");
      return;
    }

    const startsAt = allDay
      ? parseDateInput(startDate)
      : combineDateAndTime(startDate, startTime);
    const endsAt = allDay ? parseDateInput(endDate || startDate) : combineDateAndTime(endDate || startDate, endTime);

    if (!startsAt || !endsAt) {
      setError("Enter a valid start and end time.");
      return;
    }
    if (endsAt <= startsAt) {
      setError("End time must be after the start time.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const res = await apiFetch("/tenant/mailbox/calendar/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          connectionId,
          title: title.trim(),
          description: description.trim() || undefined,
          location: location.trim() || undefined,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          timezone: defaultBrowserTimeZone(),
          allDay,
          attendees,
          addVideoMeeting
        })
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
        throw new Error(json?.message ?? "Could not create the calendar event.");
      }
      await onCreated();
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not create the calendar event.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <CrmModal title="Create event" open={open} onClose={onClose} wide>
      {eligibleConnections.length === 0 ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Calendar invites are created on your linked Gmail or Outlook calendar. Connect one of those accounts to
            schedule meetings and send invites.
          </p>
          <div className="flex justify-end">
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={(submitEvent) => void handleSubmit(submitEvent)}>
          <div>
            <label htmlFor="mailbox-calendar-create-connection" className="mb-1 block text-sm font-medium text-slate-700">
              Calendar account
            </label>
            <select
              id="mailbox-calendar-create-connection"
              className={mailboxComposeInputClass}
              value={connectionId}
              onChange={(changeEvent) => setConnectionId(changeEvent.target.value)}
              disabled={busy}
            >
              {eligibleConnections.map((connection) => (
                <option key={connection.id} value={connection.id}>
                  {connection.displayName} ({connection.emailAddress})
                </option>
              ))}
            </select>
            {selectedConnection ? (
              <p className="mt-1 text-xs text-slate-500">
                Invites and video meetings are sent through{" "}
                {selectedConnection.provider === "gmail" ? "Google Calendar" : "Outlook"}.
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="mailbox-calendar-create-title" className="mb-1 block text-sm font-medium text-slate-700">
              Title
            </label>
            <input
              id="mailbox-calendar-create-title"
              className={mailboxComposeInputClass}
              value={title}
              onChange={(changeEvent) => setTitle(changeEvent.target.value)}
              placeholder="Add title"
              disabled={busy}
              autoFocus
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="mailbox-calendar-create-start-date" className="mb-1 block text-sm font-medium text-slate-700">
                Start
              </label>
              <div className="flex gap-2">
                <input
                  id="mailbox-calendar-create-start-date"
                  type="date"
                  className={mailboxComposeInputClass}
                  value={startDate}
                  onChange={(changeEvent) => {
                    const nextStart = changeEvent.target.value;
                    setStartDate(nextStart);
                    if (allDay && endDate < nextStart) setEndDate(nextStart);
                  }}
                  disabled={busy}
                />
                {!allDay ? (
                  <input
                    type="time"
                    className={`${mailboxComposeInputClass} max-w-[8.5rem]`}
                    value={startTime}
                    onChange={(changeEvent) => setStartTime(changeEvent.target.value)}
                    disabled={busy}
                  />
                ) : null}
              </div>
            </div>
            <div>
              <label htmlFor="mailbox-calendar-create-end-date" className="mb-1 block text-sm font-medium text-slate-700">
                End
              </label>
              <div className="flex gap-2">
                <input
                  id="mailbox-calendar-create-end-date"
                  type="date"
                  className={mailboxComposeInputClass}
                  value={endDate}
                  onChange={(changeEvent) => setEndDate(changeEvent.target.value)}
                  disabled={busy}
                />
                {!allDay ? (
                  <input
                    type="time"
                    className={`${mailboxComposeInputClass} max-w-[8.5rem]`}
                    value={endTime}
                    onChange={(changeEvent) => setEndTime(changeEvent.target.value)}
                    disabled={busy}
                  />
                ) : null}
              </div>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              checked={allDay}
              onChange={(changeEvent) => handleAllDayChange(changeEvent.target.checked)}
              disabled={busy}
            />
            All day
          </label>

          <MailboxCrmRecipientField
            label="Guests"
            inputId="mailbox-calendar-create-guests"
            recipients={attendees}
            onChange={setAttendees}
            disabled={busy}
            emptyHint="Invite people by email"
          />

          <div>
            <label htmlFor="mailbox-calendar-create-location" className="mb-1 block text-sm font-medium text-slate-700">
              Location
            </label>
            <input
              id="mailbox-calendar-create-location"
              className={mailboxComposeInputClass}
              value={location}
              onChange={(changeEvent) => setLocation(changeEvent.target.value)}
              placeholder="Add location or room"
              disabled={busy}
            />
          </div>

          <div>
            <label htmlFor="mailbox-calendar-create-description" className="mb-1 block text-sm font-medium text-slate-700">
              Description
            </label>
            <textarea
              id="mailbox-calendar-create-description"
              className={`${mailboxComposeInputClass} min-h-[5rem] resize-y`}
              value={description}
              onChange={(changeEvent) => setDescription(changeEvent.target.value)}
              placeholder="Add details for guests"
              disabled={busy}
            />
          </div>

          {selectedConnection ? (
            <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
              <input
                type="checkbox"
                className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                checked={addVideoMeeting}
                onChange={(changeEvent) => setAddVideoMeeting(changeEvent.target.checked)}
                disabled={busy}
              />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <Video className="h-4 w-4 shrink-0 text-indigo-500" aria-hidden />
                  {videoMeetingLabel(selectedConnection.provider)}
                </span>
                <span className="text-xs text-slate-500">
                  The meeting link is created by your calendar provider and included in the invite.
                </span>
              </span>
            </label>
          ) : null}

          {error ? <p className="text-sm text-red-700">{error}</p> : null}

          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              disabled={busy}
            >
              {busy ? "Saving…" : attendees.length > 0 ? "Send invite" : "Save event"}
            </button>
          </div>
        </form>
      )}
    </CrmModal>
  );
};
