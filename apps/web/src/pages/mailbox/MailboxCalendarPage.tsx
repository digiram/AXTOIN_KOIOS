/**
 * Mailbox Calendar page.
 *
 * Tenant mailbox screen mounted under AppShell at /admin/mailbox.
 *
 * Responsibilities:
 * - Load and render primary mailbox data for the route
 * - Wire user actions to tenant API endpoints
 * - Compose shared module components and modals
 *
 * Related:
 * - Route: /admin/mailbox
 *
 * Security:
 * - Tenant-scoped API calls via authenticated session
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Clock, MapPin, Plus, Video } from "lucide-react";

import {
  WEEKDAY_LABELS,
  buildMonthGrid,
  calendarEventAcceptsRsvp,
  calendarEventDisplayLocation,
  extractCalendarMeetingUrl,
  groupEventsByDay,
  isSameDay,
  mailboxDateKey,
  monthRangeForGrid,
  startOfDay,
  type MailboxCalendarEvent
} from "./mailboxCalendarUtils.js";
import {
  MAILBOX_CALENDAR_ACCENT_BORDER_WIDTH_PX,
  MailboxAccentStripe,
  resolveCalendarEventAccentColor
} from "./mailboxAccent.js";
import { CalendarEventModal, type CalendarEventModalMode } from "./CalendarEventModal.js";
import {
  MAILBOX_CALENDAR_GRID_COLS,
  MAILBOX_VIEWPORT_COLUMN,
  MailboxAccountToolbar
} from "./mailboxShell.js";
import { useMailboxLayout } from "./MailboxLayout.js";
import { useMailboxApi } from "./useMailboxApi.js";
import { useMailboxDisplayFormatters } from "./useMailboxDisplayFormatters.js";

const calendarEventChipClass = (cancelled: boolean) =>
  [
    "flex min-w-0 overflow-hidden rounded leading-tight",
    cancelled ? "bg-slate-100 text-slate-500 line-through" : "bg-indigo-100 text-indigo-800"
  ].join(" ");

/** Route page component for tenant mailbox under AppShell. */
export const MailboxCalendarPage = () => {
  const { apiFetch } = useMailboxApi();
  const { connections, connectionFilterId, connectionColors, showConnectionAccents } = useMailboxLayout();
  const { formatMonthYear, formatLongCalendarDay, formatEventTime } = useMailboxDisplayFormatters();
  const [viewMonth, setViewMonth] = useState(() => startOfDay(new Date()));
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(() => mailboxDateKey(new Date()));
  const [events, setEvents] = useState<MailboxCalendarEvent[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [detailEvent, setDetailEvent] = useState<MailboxCalendarEvent | null>(null);
  const [modalMode, setModalMode] = useState<CalendarEventModalMode>("view");
  const [modalOpen, setModalOpen] = useState(false);

  const inboxConnectionIds = useMemo(() => new Set(connections.map((connection) => connection.id)), [connections]);
  const visibleEvents = useMemo(() => {
    let list = events.filter(
      (event) => !event.connectionId || inboxConnectionIds.has(event.connectionId)
    );
    if (connectionFilterId) {
      list = list.filter((event) => event.connectionId === connectionFilterId);
    }
    return list;
  }, [events, inboxConnectionIds, connectionFilterId]);

  const showEventAccents = showConnectionAccents && !connectionFilterId;
  const eventAccentColor = useCallback(
    (event: MailboxCalendarEvent) => resolveCalendarEventAccentColor(event, connectionColors),
    [connectionColors]
  );

  const monthGrid = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);
  const eventsByDay = useMemo(() => groupEventsByDay(visibleEvents), [visibleEvents]);
  const today = useMemo(() => startOfDay(new Date()), []);
  const selectedEvents = selectedDayKey ? (eventsByDay.get(selectedDayKey) ?? []) : [];
  const userEmails = useMemo(
    () => connections.map((connection) => connection.emailAddress).filter(Boolean),
    [connections]
  );

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { from, to } = monthRangeForGrid(viewMonth);
      const params = new URLSearchParams({
        from: from.toISOString(),
        to: to.toISOString(),
        limit: "500"
      });
      if (connectionFilterId) {
        params.set("connectionId", connectionFilterId);
      }
      const res = await apiFetch(`/tenant/mailbox/calendar/events?${params}`);
      if (!res.ok) throw new Error("Could not load events");
      const json = (await res.json()) as { events: MailboxCalendarEvent[] };
      setEvents(json.events);
    } catch {
      setError("Could not load calendar.");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, connectionFilterId, viewMonth]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const rsvp = async (eventId: string, response: "accepted" | "declined" | "tentative") => {
    await apiFetch(`/tenant/mailbox/calendar/events/${eventId}/rsvp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ response })
    });
    await loadEvents();
  };

  const goToMonth = (offset: number) => {
    setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
  };

  const goToToday = () => {
    const now = startOfDay(new Date());
    setViewMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDayKey(mailboxDateKey(now));
  };

  const openModal = (mode: CalendarEventModalMode, event: MailboxCalendarEvent | null = null) => {
    setModalMode(mode);
    setDetailEvent(event);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setDetailEvent(null);
  };

  const selectedDayLabel = selectedDayKey ? formatLongCalendarDay(selectedDayKey) : null;

  return (
    <div className={MAILBOX_VIEWPORT_COLUMN}>
      <MailboxAccountToolbar onAccountChange={() => void loadEvents()} />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className={`grid shrink-0 ${MAILBOX_CALENDAR_GRID_COLS}`}>
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 lg:border-r">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{formatMonthYear(viewMonth)}</h2>
              <p className="text-xs text-slate-500">
                {loading ? "Loading events…" : "Mail invites and synced Gmail / Outlook calendars appear here."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
                onClick={() => openModal("add")}
              >
                <Plus className="h-4 w-4" aria-hidden />
                Create event
              </button>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                title="Previous month"
                aria-label="Previous month"
                onClick={() => goToMonth(-1)}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50"
                onClick={goToToday}
              >
                Today
              </button>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                title="Next month"
                aria-label="Next month"
                onClick={() => goToMonth(1)}
              >
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </header>

          <header className="border-b border-slate-200 px-4 py-3">
            {selectedDayKey ? (
              <>
                <h3 className="text-base font-semibold text-slate-900">{selectedDayLabel}</h3>
                <p className="mt-1 text-xs text-slate-500">
                  {selectedEvents.length === 0
                    ? "No events scheduled"
                    : `${selectedEvents.length} event${selectedEvents.length === 1 ? "" : "s"}`}
                </p>
              </>
            ) : (
              <>
                <h3 className="text-base font-semibold text-slate-400">Day details</h3>
                <p className="mt-1 text-xs text-slate-500">Select a day on the calendar</p>
              </>
            )}
          </header>
        </div>

        <div className={`grid min-h-0 flex-1 ${MAILBOX_CALENDAR_GRID_COLS}`}>
          <section className="flex min-h-0 min-w-0 flex-col overflow-hidden lg:border-r lg:border-slate-200">
            {error ? <p className="shrink-0 px-4 py-2 text-sm text-red-700">{error}</p> : null}

            <div className="grid shrink-0 grid-cols-7 border-b border-slate-200 bg-slate-50/80">
              {WEEKDAY_LABELS.map((label) => (
                <div
                  key={label}
                  className="py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500"
                >
                  {label}
                </div>
              ))}
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6">
              {monthGrid.map((cell) => {
                const dayEvents = eventsByDay.get(cell.key) ?? [];
                const isToday = isSameDay(cell.date, today);
                const isSelected = selectedDayKey === cell.key;

                return (
                  <button
                    key={cell.key}
                    type="button"
                    aria-pressed={isSelected}
                    aria-label={`${formatLongCalendarDay(cell.key)}${dayEvents.length > 0 ? `, ${dayEvents.length} events` : ""}`}
                    className={[
                      "flex min-h-0 flex-col border-b border-r border-slate-100 p-1.5 text-left transition-colors",
                      cell.inMonth ? "bg-white" : "bg-slate-50/60",
                      isSelected ? "bg-indigo-50/80 ring-1 ring-inset ring-indigo-200" : "hover:bg-slate-50"
                    ].join(" ")}
                    onClick={() => setSelectedDayKey(cell.key)}
                  >
                    <span
                      className={[
                        "mb-1 inline-flex h-6 w-6 items-center justify-center self-start rounded-full text-xs font-medium",
                        isToday ? "bg-indigo-600 text-white" : cell.inMonth ? "text-slate-800" : "text-slate-400"
                      ].join(" ")}
                    >
                      {cell.date.getDate()}
                    </span>
                    <div className="min-h-0 flex-1 space-y-0.5 overflow-hidden">
                      {dayEvents.slice(0, 3).map((event) => {
                        const accentColor = eventAccentColor(event);
                        const cancelled = event.status === "cancelled";
                        return (
                          <span
                            key={event.id}
                            className={calendarEventChipClass(cancelled)}
                            title={event.title}
                          >
                            <MailboxAccentStripe
                              color={accentColor}
                              show={showEventAccents && Boolean(accentColor)}
                              widthPx={MAILBOX_CALENDAR_ACCENT_BORDER_WIDTH_PX}
                              className="rounded-none"
                            />
                            <span className="block truncate px-1 py-0.5 text-[10px] font-medium">{event.title}</span>
                          </span>
                        );
                      })}
                      {dayEvents.length > 3 ? (
                        <span className="block px-1 text-[10px] font-medium text-slate-500">
                          +{dayEvents.length - 3} more
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="flex min-h-0 min-w-0 flex-col overflow-hidden max-lg:max-h-[38%] max-lg:border-t max-lg:border-slate-200">
            {!selectedDayKey ? (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-slate-500">
                <CalendarEmptyIcon />
                <p className="text-center text-sm">Select a day to view events</p>
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                {selectedEvents.length === 0 ? (
                  <div className="space-y-3">
                    <p className="text-sm text-slate-500">
                      Nothing on this day yet. Connect Gmail or Outlook to sync your calendar, or create an event here.
                    </p>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-800 hover:bg-indigo-100"
                      onClick={() => openModal("add")}
                    >
                      <Plus className="h-4 w-4" aria-hidden />
                      Create event
                    </button>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {selectedEvents.map((event) => {
                      const accentColor = eventAccentColor(event);
                      const meeting = extractCalendarMeetingUrl(event);
                      const displayLocation = calendarEventDisplayLocation(event);
                      const cancelled = event.status === "cancelled";
                      const acceptsRsvp = calendarEventAcceptsRsvp(event, userEmails);

                      return (
                        <li key={event.id}>
                          <div
                            className={[
                              "flex overflow-hidden rounded-lg border border-slate-200 bg-white transition-colors",
                              cancelled ? "opacity-75" : "hover:border-slate-300 hover:shadow-sm"
                            ].join(" ")}
                          >
                            <MailboxAccentStripe
                              color={accentColor}
                              show={showEventAccents && Boolean(accentColor)}
                              widthPx={MAILBOX_CALENDAR_ACCENT_BORDER_WIDTH_PX}
                              className="rounded-none"
                            />
                            <div className="min-w-0 flex-1">
                              <div
                                role="button"
                                tabIndex={0}
                                className="cursor-pointer px-2.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-300"
                                onClick={() => openModal("view", event)}
                                onKeyDown={(keydownEvent) => {
                                  if (keydownEvent.key === "Enter" || keydownEvent.key === " ") {
                                    keydownEvent.preventDefault();
                                    openModal("view", event);
                                  }
                                }}
                              >
                                <p
                                  className={[
                                    "truncate text-sm font-medium leading-snug",
                                    cancelled ? "text-slate-500 line-through" : "text-slate-900"
                                  ].join(" ")}
                                >
                                  {event.title}
                                </p>
                                <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-500">
                                  <Clock className="h-3 w-3 shrink-0" aria-hidden />
                                  <span className="truncate">{formatEventTime(event)}</span>
                                </p>
                                {displayLocation ? (
                                  <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-500">
                                    <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                                    <span className="truncate">{displayLocation}</span>
                                  </p>
                                ) : null}
                                {meeting ? (
                                  <p className="mt-0.5 flex items-center gap-1 text-xs">
                                    <Video className="h-3 w-3 shrink-0 text-indigo-500" aria-hidden />
                                    <a
                                      href={meeting.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="truncate font-medium text-indigo-600 hover:underline"
                                      onClick={(clickEvent) => clickEvent.stopPropagation()}
                                    >
                                      {meeting.label}
                                    </a>
                                  </p>
                                ) : null}
                                {cancelled ? (
                                  <p className="mt-1 text-[11px] font-medium text-red-600">Cancelled</p>
                                ) : null}
                              </div>
                              {!cancelled && acceptsRsvp ? (
                                <div className="flex flex-wrap gap-1 px-2.5 pb-2">
                                  <button
                                    type="button"
                                    className="rounded border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-800 hover:bg-green-100"
                                    onClick={() => void rsvp(event.id, "accepted")}
                                  >
                                    Accept
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 hover:bg-amber-100"
                                    onClick={() => void rsvp(event.id, "tentative")}
                                  >
                                    Tentative
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                                    onClick={() => void rsvp(event.id, "declined")}
                                  >
                                    Decline
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </section>
        </div>
      </div>

      <CalendarEventModal
        mode={modalMode}
        open={modalOpen}
        onClose={closeModal}
        event={detailEvent}
        connections={connections}
        defaultConnectionId={connectionFilterId}
        defaultDayKey={selectedDayKey}
        userEmails={userEmails}
        onSaved={loadEvents}
        onDeleted={loadEvents}
        onRequestEdit={() => setModalMode("edit")}
        onRsvp={async (eventId, response) => {
          await rsvp(eventId, response);
          closeModal();
        }}
      />
    </div>
  );
};

const CalendarEmptyIcon = () => (
  <svg className="h-12 w-12 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
);
