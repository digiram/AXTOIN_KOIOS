/**
 * SalesFunnelActivityTimeline.
 *
 * Renders manual and system activity entries for a funnel lead or deal.
 *
 * Responsibilities:
 * - Map activity types to icons and human-readable summaries
 * - Link referenced CRM contacts when `activityContacts` are present
 * - Support compact (panel) and expanded (full-page) layout variants
 *
 * Depends on:
 * - Shared activity label helpers from `salesFunnelActivityConstants`
 */

import type { ReactNode } from "react";
import {
  ArrowRightCircle,
  Calendar,
  CircleDot,
  Mail,
  MessageCircle,
  MessageSquare,
  Package,
  Phone
} from "lucide-react";
import type { SalesFunnelManualActivityType } from "@starter/shared";

import { SalesFunnelActivityContactLinks } from "../../components/sales/SalesFunnelActivityContactLinks.js";
import { useUserDisplayDatetime } from "../../hooks/useUserDisplayDatetime.js";
import {
  formatSalesFunnelSystemActivitySummary,
  isSalesFunnelSystemActivity,
  SALES_FUNNEL_ACTIVITY_LABELS,
  SALES_FUNNEL_DIRECTION_LABELS,
  salesFunnelSystemActivityLabel
} from "../../components/sales/salesFunnelActivityConstants.js";

/** CRM contact reference attached to a funnel activity row. */
export type FunnelActivityContactRef = {
  contactId: string;
  displayName: string;
};

/** Single funnel activity timeline entry (manual note or system event). */
export type FunnelActivityItem = {
  id: string;
  activityType: string;
  summary: string;
  createdAt: string;
  contactIds?: string[];
  activityContacts?: FunnelActivityContactRef[];
  payload?: Record<string, unknown> | null;
};

type Props = {
  activities: FunnelActivityItem[];
  variant?: "compact" | "detail";
  heading?: string | null;
  className?: string;
  crmBase?: string;
  /** Shown when `activities` is empty (e.g. filter no-match vs never logged). */
  emptyMessage?: string;
};

const iconForType = (activityType: string, sizeClass: string) => {
  const t = activityType.toLowerCase();
  if (t === "note") {
    return { Icon: MessageSquare, iconClass: `${sizeClass} text-indigo-700`, ring: "bg-indigo-50 ring-indigo-200/80" };
  }
  if (t === "call") {
    return { Icon: Phone, iconClass: `${sizeClass} text-sky-700`, ring: "bg-sky-50 ring-sky-200/80" };
  }
  if (t === "email") {
    return { Icon: Mail, iconClass: `${sizeClass} text-violet-700`, ring: "bg-violet-50 ring-violet-200/80" };
  }
  if (t === "mail") {
    return { Icon: Package, iconClass: `${sizeClass} text-amber-800`, ring: "bg-amber-50 ring-amber-200/80" };
  }
  if (t === "meeting") {
    return { Icon: Calendar, iconClass: `${sizeClass} text-emerald-800`, ring: "bg-emerald-50 ring-emerald-200/80" };
  }
  if (t === "conversation") {
    return { Icon: MessageCircle, iconClass: `${sizeClass} text-teal-700`, ring: "bg-teal-50 ring-teal-200/80" };
  }
  if (t === "promoted") {
    return { Icon: ArrowRightCircle, iconClass: `${sizeClass} text-violet-700`, ring: "bg-violet-50 ring-violet-200/80" };
  }
  return { Icon: CircleDot, iconClass: `${sizeClass} text-stone-600`, ring: "bg-stone-100 ring-stone-200/80" };
};

const activityTypeLabel = (t: string) => {
  const key = t.toLowerCase() as SalesFunnelManualActivityType;
  if (key in SALES_FUNNEL_ACTIVITY_LABELS) return SALES_FUNNEL_ACTIVITY_LABELS[key];
  return salesFunnelSystemActivityLabel(t);
};

const directionFromPayload = (payload?: Record<string, unknown> | null) => {
  const d = payload?.direction;
  if (d === "INBOUND" || d === "OUTBOUND") {
    return SALES_FUNNEL_DIRECTION_LABELS[d];
  }
  return null;
};

const scheduledFromPayload = (payload?: Record<string, unknown> | null) => {
  const s = payload?.scheduledAt;
  return typeof s === "string" && s.trim() ? s.trim() : null;
};

const TimelineRail = ({ isLast, children }: { isLast: boolean; children: ReactNode }) => (
  <div className="flex w-8 shrink-0 flex-col items-center self-stretch pt-0.5 sm:w-11 sm:pt-1" aria-hidden>
    {children}
    {!isLast ? <div className="mt-2 w-px flex-1 min-h-[1.5rem] bg-stone-300/80" /> : null}
  </div>
);

/** Icon column + connector for system rows: icon vertically centered with the card. */
const SystemTimelineRail = ({ isLast, children }: { isLast: boolean; children: ReactNode }) => (
  <>
    <div className="relative z-10 flex w-8 shrink-0 items-center justify-center sm:w-11">{children}</div>
    {!isLast ? (
      <div
        className="pointer-events-none absolute top-1/2 left-4 h-[calc(100%+1.25rem)] w-px -translate-x-1/2 bg-stone-300/80 sm:left-[1.375rem]"
        aria-hidden
      />
    ) : null}
  </>
);

function ActivityCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2.5 shadow-sm ring-1 ring-slate-900/5">
      {children}
    </div>
  );
}

const SystemActivityLineBody = ({
  label,
  summary,
  createdAt,
  formatDateTime,
  activity,
  crmBase
}: {
  label: string;
  summary: string;
  createdAt: string;
  formatDateTime: (iso: string) => string;
  activity: FunnelActivityItem;
  crmBase: string;
}) => (
  <>
    <div className="flex items-baseline justify-between gap-x-3 gap-y-1">
      <p className="min-w-0 text-sm leading-snug text-stone-800">
        <span className="font-semibold text-stone-800">{label}</span>
        {summary ? <span className="text-stone-600"> {summary}</span> : null}
      </p>
      <time
        className="shrink-0 text-[11px] font-medium tabular-nums text-stone-500"
        dateTime={createdAt}
      >
        {formatDateTime(createdAt)}
      </time>
    </div>
    {crmBase ? (
      <SalesFunnelActivityContactLinks activity={activity} crmBase={crmBase} className="mt-1 justify-start" />
    ) : null}
  </>
);

const SystemActivityRow = ({
  activity,
  isLast,
  formatDateTime,
  crmBase,
  iconSizeClass,
  compact = false
}: {
  activity: FunnelActivityItem;
  isLast: boolean;
  formatDateTime: (iso: string) => string;
  crmBase: string;
  iconSizeClass: string;
  compact?: boolean;
}) => {
  const { Icon, iconClass, ring } = iconForType(activity.activityType, iconSizeClass);
  const label = salesFunnelSystemActivityLabel(activity.activityType);
  const summary = formatSalesFunnelSystemActivitySummary(activity.summary);
  const iconShell = compact
    ? "z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white shadow-sm ring-1"
    : "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-white shadow-sm sm:h-10 sm:w-10";
  const body = (
    <SystemActivityLineBody
      label={label}
      summary={summary}
      createdAt={activity.createdAt}
      formatDateTime={formatDateTime}
      activity={activity}
      crmBase={crmBase}
    />
  );

  return (
    <li
      className={
        compact
          ? "relative flex items-center gap-3 mb-5 last:mb-0"
          : "relative flex items-center gap-3 mb-4 last:mb-0 sm:gap-4 sm:mb-5"
      }
    >
      <SystemTimelineRail isLast={isLast}>
        <div className={`${iconShell} ${ring}`}>
          <Icon className={iconClass} aria-hidden strokeWidth={2} />
        </div>
      </SystemTimelineRail>
      <div className="min-w-0 flex-1">
        <ActivityCard>{body}</ActivityCard>
      </div>
    </li>
  );
};

/**
 * Activity timeline list for funnel records.
 *
 * @param props.variant - `"compact"` for panel preview or `"expanded"` for full-page section
 */
export const SalesFunnelActivityTimeline = ({
  activities,
  variant = "compact",
  heading,
  className,
  crmBase = "",
  emptyMessage = "No activities logged yet."
}: Props) => {
  const { formatDateTime } = useUserDisplayDatetime();
  const n = activities.length;

  if (variant === "detail") {
    return (
      <ol className="list-none p-0">
        {n === 0 ? (
          <li className="py-2 text-center text-sm text-stone-600">{emptyMessage}</li>
        ) : (
          activities.map((a, index) => {
            const isLast = index === activities.length - 1;
            const sizeClass = "h-4 w-4 shrink-0 sm:h-[1.125rem] sm:w-[1.125rem]";
            if (isSalesFunnelSystemActivity(a.activityType)) {
              return (
                <SystemActivityRow
                  key={a.id}
                  activity={a}
                  isLast={isLast}
                  formatDateTime={formatDateTime}
                  crmBase={crmBase}
                  iconSizeClass={sizeClass}
                />
              );
            }
            const { Icon, iconClass, ring } = iconForType(a.activityType, sizeClass);
            const dir = directionFromPayload(a.payload);
            const scheduled = scheduledFromPayload(a.payload);
            return (
              <li key={a.id} className="flex gap-3 pb-6 last:pb-0 sm:gap-4">
                <TimelineRail isLast={isLast}>
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-white shadow-sm sm:h-11 sm:w-11 ${ring}`}
                  >
                    <Icon className={iconClass} aria-hidden strokeWidth={2} />
                  </div>
                </TimelineRail>
                <article className="min-w-0 flex-1 rounded-xl border border-stone-200 bg-white px-4 py-3 shadow-sm sm:px-5 sm:py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                        {activityTypeLabel(a.activityType)}
                      </span>
                      {dir ? (
                        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-700 ring-1 ring-stone-200/80">
                          {dir}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-col items-end gap-1 text-end">
                      <time
                        className="text-[11px] font-medium tabular-nums text-stone-500"
                        dateTime={a.createdAt}
                      >
                        {formatDateTime(a.createdAt)}
                      </time>
                      {crmBase ? (
                        <SalesFunnelActivityContactLinks activity={a} crmBase={crmBase} />
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-stone-800">
                    {a.summary.trim() || "—"}
                  </p>
                  {scheduled ? (
                    <p className="mt-2 text-xs tabular-nums text-stone-500">
                      Scheduled · {formatDateTime(scheduled)}
                    </p>
                  ) : null}
                </article>
              </li>
            );
          })
        )}
      </ol>
    );
  }

  const compactHeading = heading === undefined ? "Activity" : heading;

  return (
    <div className={className ?? "mt-6"}>
      {compactHeading ? (
        <h4 className="text-xs font-semibold uppercase tracking-wide text-stone-500">{compactHeading}</h4>
      ) : null}
      {n === 0 ? (
        <p className={compactHeading ? "mt-3 text-sm text-stone-500" : "text-sm text-stone-500"}>
          {emptyMessage}
        </p>
      ) : (
        <ul className={compactHeading ? "mt-3" : ""}>
          {activities.map((a, i) => {
            const isLast = i === n - 1;
            if (isSalesFunnelSystemActivity(a.activityType)) {
              return (
                <SystemActivityRow
                  key={a.id}
                  activity={a}
                  isLast={isLast}
                  formatDateTime={formatDateTime}
                  crmBase={crmBase}
                  iconSizeClass="h-3.5 w-3.5"
                  compact
                />
              );
            }
            const { Icon, iconClass, ring } = iconForType(a.activityType, "h-3.5 w-3.5");
            return (
              <li key={a.id} className="flex items-start gap-3">
                <TimelineRail isLast={isLast}>
                  <div
                    className={`z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white shadow-sm ring-1 ${ring}`}
                  >
                    <Icon className={iconClass} aria-hidden strokeWidth={2} />
                  </div>
                </TimelineRail>
                <div className={`min-w-0 flex-1 ${isLast ? "pb-0" : "pb-5"}`}>
                  <ActivityCard>
                    <p className="text-sm leading-snug text-stone-800">{a.summary}</p>
                    <div className="mt-2 flex flex-col items-end gap-1 text-end">
                      <time
                        className="text-[11px] font-medium tabular-nums text-stone-500"
                        dateTime={a.createdAt}
                      >
                        {formatDateTime(a.createdAt)}
                      </time>
                      {crmBase ? (
                        <SalesFunnelActivityContactLinks activity={a} crmBase={crmBase} />
                      ) : null}
                    </div>
                  </ActivityCard>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
