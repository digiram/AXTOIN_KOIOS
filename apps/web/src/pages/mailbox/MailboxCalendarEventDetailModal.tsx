/**
 * Mailbox Calendar Event Detail modal.
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
import { Calendar, Clock, MapPin, User, Video } from "lucide-react";

import { CrmModal } from "../../components/crm/CrmModal.js";
import {
  calendarEventAcceptsRsvp,
  calendarEventDescriptionText,
  calendarEventDisplayLocation,
  extractCalendarMeetingUrl,
  type MailboxCalendarEvent
} from "./mailboxCalendarUtils.js";
import { useMailboxDisplayFormatters } from "./useMailboxDisplayFormatters.js";

type Props = {
  event: MailboxCalendarEvent | null;
  userEmails: string[];
  onClose: () => void;
  onRsvp: (eventId: string, response: "accepted" | "declined" | "tentative") => void | Promise<void>;
};

/** Modal UI for a focused mailbox workflow. */
export const MailboxCalendarEventDetailModal = ({ event, userEmails, onClose, onRsvp }: Props) => {
  const { formatLongCalendarDay, formatEventTime } = useMailboxDisplayFormatters();

  if (!event) return null;

  const meeting = extractCalendarMeetingUrl(event);
  const displayLocation = calendarEventDisplayLocation(event);
  const description = calendarEventDescriptionText(event.description);
  const acceptsRsvp = calendarEventAcceptsRsvp(event, userEmails);
  const dayKey = event.startsAt.slice(0, 10);
  const cancelled = event.status === "cancelled";

  return (
    <CrmModal title={event.title} open={Boolean(event)} onClose={onClose}>
      <div className="space-y-5">
        {cancelled ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            This event was cancelled.
          </p>
        ) : null}

        <dl className="space-y-4">
          <div className="flex gap-3">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            <div>
              <dt className="sr-only">When</dt>
              <dd className="text-sm font-medium text-slate-900">{formatLongCalendarDay(dayKey)}</dd>
              <dd className="mt-0.5 text-sm text-slate-600">{formatEventTime(event)}</dd>
            </div>
          </div>

          {displayLocation ? (
            <div className="flex gap-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
              <div>
                <dt className="sr-only">Where</dt>
                <dd className="text-sm text-slate-700">{displayLocation}</dd>
              </div>
            </div>
          ) : null}

          {meeting ? (
            <div className="flex gap-3">
              <Video className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
              <div>
                <dt className="sr-only">Meeting link</dt>
                <dd>
                  <a
                    href={meeting.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
                  >
                    {meeting.label}
                  </a>
                </dd>
              </div>
            </div>
          ) : null}

          {event.organizer.email ? (
            <div className="flex gap-3">
              <User className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
              <div>
                <dt className="sr-only">Organizer</dt>
                <dd className="text-sm text-slate-700">
                  {event.organizer.name ?? event.organizer.email}
                  {event.organizer.name ? (
                    <span className="block text-xs text-slate-500">{event.organizer.email}</span>
                  ) : null}
                </dd>
              </div>
            </div>
          ) : null}

          {event.calendarName ? (
            <div className="flex gap-3">
              <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
              <div>
                <dt className="sr-only">Calendar</dt>
                <dd className="text-sm text-slate-600">{event.calendarName}</dd>
              </div>
            </div>
          ) : null}
        </dl>

        {description ? (
          <div className="border-t border-slate-100 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Details</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{description}</p>
          </div>
        ) : null}

        {!cancelled && acceptsRsvp ? (
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700"
              onClick={() => void onRsvp(event.id, "accepted")}
            >
              Accept
            </button>
            <button
              type="button"
              className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100"
              onClick={() => void onRsvp(event.id, "tentative")}
            >
              Tentative
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              onClick={() => void onRsvp(event.id, "declined")}
            >
              Decline
            </button>
          </div>
        ) : null}
      </div>
    </CrmModal>
  );
};
