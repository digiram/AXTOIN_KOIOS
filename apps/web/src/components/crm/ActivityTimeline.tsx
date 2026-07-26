/**
 * ActivityTimeline
 *
 * CRM contact/organization activity feed with filters and inline logging.
 *
 * Responsibilities:
 * - List paginated activities from tenant CRM API with type/date/direction filters
 * - Render timeline rows with icons and user-local datetimes
 * - Host expandable log-activity form tabs
 *
 * Related:
 * - CRM detail pages; `crmConstants`
 *
 * Security:
 * - Uses caller-supplied auth headers; tenant scope enforced server-side.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  CrmActivityDirection,
  CrmActivityListDatePreset,
  CrmActivityType,
  CrmEntityKind
} from "@starter/shared";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Calendar,
  Filter,
  Mail,
  MessageCircle,
  Package,
  Phone,
  Play,
  Search,
  SquarePen,
  Tag
} from "lucide-react";

import { useUserDisplayDatetime } from "../../hooks/useUserDisplayDatetime.js";
import { API_BASE_URL } from "../../lib/api.js";
import {
  CRM_ACTIVITY_DIRECTION_LABELS,
  CRM_ACTIVITY_LOG_FORM_TAB_ORDER,
  CRM_ACTIVITY_TYPE_LABELS,
  CRM_ACTIVITY_TYPES
} from "./crmConstants.js";

type ActivityRow = {
  id: string;
  activityType: string;
  title: string;
  description: string | null;
  scheduledAt: string | null;
  direction: string | null;
  createdAt: string;
};

type Props = {
  entityKind: CrmEntityKind;
  entityId: string;
  authHeaders: () => Record<string, string>;
  refreshSession: () => Promise<boolean>;
  logout: () => void;
};

const activityTypeIcon = (t: CrmActivityType, iconClass = "h-3.5 w-3.5 shrink-0") => {
  switch (t) {
    case "NOTE":
      return <SquarePen className={iconClass} aria-hidden strokeWidth={2} />;
    case "CALL":
      return <Phone className={iconClass} aria-hidden strokeWidth={2} />;
    case "MAIL":
      return <Package className={iconClass} aria-hidden strokeWidth={2} />;
    case "EMAIL":
      return <Mail className={iconClass} aria-hidden strokeWidth={2} />;
    case "MEETING":
      return <Calendar className={iconClass} aria-hidden strokeWidth={2} />;
    case "CONVERSATION":
      return <MessageCircle className={iconClass} aria-hidden strokeWidth={2} />;
    default:
      return null;
  }
};

const timelineIconForType = (raw: string) => {
  const cls = "h-4 w-4 shrink-0 text-emerald-800 sm:h-[1.125rem] sm:w-[1.125rem]";
  if (raw in CRM_ACTIVITY_TYPE_LABELS) {
    return activityTypeIcon(raw as CrmActivityType, cls);
  }
  return <MessageCircle className={cls} aria-hidden strokeWidth={2} />;
};

const activityTypeLabel = (t: string) =>
  t in CRM_ACTIVITY_TYPE_LABELS ? CRM_ACTIVITY_TYPE_LABELS[t as CrmActivityType] : t;

const directionLabel = (d: string | null) => {
  if (!d) return null;
  return d in CRM_ACTIVITY_DIRECTION_LABELS
    ? CRM_ACTIVITY_DIRECTION_LABELS[d as CrmActivityDirection]
    : d;
};

const clampHour = (raw: string) => {
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) return "";
  return String(Math.min(23, Math.max(0, n)));
};

const clampMinute = (raw: string) => {
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) return "";
  return String(Math.min(59, Math.max(0, n)));
};

const buildScheduledAt = (dateStr: string, hourStr: string, minuteStr: string): string | null => {
  const d = dateStr.trim();
  if (!d) return null;
  const h = clampHour(hourStr.padStart(2, "0")) || "0";
  const m = clampMinute(minuteStr.padStart(2, "0")) || "0";
  return `${d}T${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
};

const scheduleFieldsFromDate = (d: Date) => {
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { dateStr, hourStr: String(d.getHours()), minuteStr: String(d.getMinutes()) };
};

const DATE_PRESET_OPTIONS: { value: CrmActivityListDatePreset | ""; label: string }[] = [
  { value: "", label: "Any time" },
  { value: "between", label: "Between" },
  { value: "before", label: "Before" },
  { value: "after", label: "After" }
];

const ymdOk = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s.trim());

/**
 * Paginated activity timeline and log form for one CRM entity.
 *
 * @param entityKind - `CONTACT` or `ORGANIZATION` anchor for API paths.
 * @param entityId - Primary key of the entity whose activities are shown.
 */
export const ActivityTimeline = ({ entityKind, entityId, authHeaders, refreshSession, logout }: Props) => {
  const { formatDateTime } = useUserDisplayDatetime();
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [filterType, setFilterType] = useState<CrmActivityType | "">("");
  const [filterDatePreset, setFilterDatePreset] = useState<CrmActivityListDatePreset | "">("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const [description, setDescription] = useState("");
  const [activityType, setActivityType] = useState<CrmActivityType>("NOTE");
  const [direction, setDirection] = useState<CrmActivityDirection>("INBOUND");
  const initialScheduleRef = useRef<ReturnType<typeof scheduleFieldsFromDate> | null>(null);
  if (initialScheduleRef.current === null) {
    initialScheduleRef.current = scheduleFieldsFromDate(new Date());
  }
  const [dateStr, setDateStr] = useState(initialScheduleRef.current.dateStr);
  const [hourStr, setHourStr] = useState(initialScheduleRef.current.hourStr);
  const [minuteStr, setMinuteStr] = useState(initialScheduleRef.current.minuteStr);

  const scheduledAt = useMemo(
    () => buildScheduledAt(dateStr, hourStr, minuteStr),
    [dateStr, hourStr, minuteStr]
  );

  useEffect(() => {
    const id = window.setTimeout(() => setSearchQ(searchDraft.trim()), 400);
    return () => window.clearTimeout(id);
  }, [searchDraft]);

  const queryString = useMemo(() => {
    const p = new URLSearchParams({ relatedKind: entityKind, relatedId: entityId });
    if (filterType) p.set("activityType", filterType);
    if (searchQ) p.set("q", searchQ);
    const dateQueryOk =
      filterDatePreset &&
      ymdOk(filterDateFrom) &&
      (filterDatePreset !== "between" || (filterDateTo.trim() !== "" && ymdOk(filterDateTo)));
    if (dateQueryOk) {
      p.set("datePreset", filterDatePreset);
      p.set("dateFrom", filterDateFrom.trim());
      if (filterDatePreset === "between") p.set("dateTo", filterDateTo.trim());
    }
    return p.toString();
  }, [entityKind, entityId, filterDateFrom, filterDatePreset, filterDateTo, filterType, searchQ]);

  const load = useCallback(async () => {
    setErr("");
    try {
      let res = await fetch(`${API_BASE_URL}/tenant/crm/activities?${queryString}`, {
        headers: authHeaders()
      });
      if (res.status === 401) {
        if (!(await refreshSession())) {
          logout();
          return;
        }
        res = await fetch(`${API_BASE_URL}/tenant/crm/activities?${queryString}`, {
          headers: authHeaders()
        });
      }
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { message?: string } | null;
        setErr(b?.message ?? "Could not load activities.");
        return;
      }
      const j = (await res.json()) as { activities: ActivityRow[] };
      setActivities(j.activities);
    } catch {
      setErr("Could not load activities.");
    }
  }, [authHeaders, entityId, entityKind, logout, queryString, refreshSession]);

  useEffect(() => {
    void load();
  }, [load]);

  const activityPayload = useMemo(
    () => ({
      activityType,
      description: description.trim(),
      relatedEntityId: entityId,
      relatedEntityKind: entityKind,
      scheduledAt,
      direction
    }),
    [activityType, description, direction, entityId, entityKind, scheduledAt]
  );

  const addActivity = async () => {
    setBusy(true);
    try {
      let res = await fetch(`${API_BASE_URL}/tenant/crm/activities`, {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify(activityPayload)
      });
      if (res.status === 401) {
        if (!(await refreshSession())) {
          logout();
          return;
        }
        res = await fetch(`${API_BASE_URL}/tenant/crm/activities`, {
          method: "POST",
          headers: { ...authHeaders(), "content-type": "application/json" },
          body: JSON.stringify(activityPayload)
        });
      }
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { message?: string } | null;
        setErr(b?.message ?? "Could not save activity.");
        return;
      }
      setDescription("");
      const next = scheduleFieldsFromDate(new Date());
      setDateStr(next.dateStr);
      setHourStr(next.hourStr);
      setMinuteStr(next.minuteStr);
      setDirection("INBOUND");
      setActivityType("NOTE");
      await load();
    } catch {
      setErr("Could not save activity.");
    } finally {
      setBusy(false);
    }
  };

  /** Matches `AdminUsersPage` / `SuperUsersPage` filter `<select>` styling. */
  const filterSelectClass =
    "w-full min-w-0 rounded-lg border border-stone-200/90 bg-white px-3 py-2.5 pr-9 text-sm text-stone-900 shadow-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/25";

  const filterSearchInputClass =
    "w-full rounded-lg border border-stone-200/90 bg-white py-2.5 pl-10 pr-3 text-sm text-stone-900 shadow-sm placeholder:text-stone-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/25";

  const filterDateInputClass =
    "w-full min-w-0 rounded-lg border border-stone-200/90 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/25";

  const hasListFilters = Boolean(
    filterType ||
      searchQ ||
      (filterDatePreset &&
        ymdOk(filterDateFrom) &&
        (filterDatePreset !== "between" || (filterDateTo.trim() !== "" && ymdOk(filterDateTo))))
  );

  const typeTabClass = (active: boolean) =>
    [
      "flex min-h-[3rem] min-w-0 flex-1 basis-0 flex-row items-center justify-center gap-1.5 border-0 px-1.5 py-2 text-[10px] font-semibold leading-tight transition-colors sm:min-h-[3.25rem] sm:gap-2 sm:px-2 sm:text-xs",
      active ? "bg-emerald-600 text-white" : "bg-transparent text-stone-600 hover:bg-stone-100/90"
    ].join(" ");

  const directionBtnClass = (active: boolean) =>
    [
      "flex min-h-[3rem] flex-1 flex-row items-center justify-center gap-1.5 border-0 px-2 py-2 text-[10px] font-semibold transition-colors sm:min-h-[3.25rem] sm:gap-2 sm:text-xs",
      active ? "bg-slate-900 text-white" : "bg-stone-100/90 text-stone-600 hover:bg-stone-200/80"
    ].join(" ");

  const saveBlocked = busy || description.trim().length === 0;

  return (
    <>
      <section
        aria-label="Log activity"
        className="relative z-10 mb-4 flex flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm"
      >
        <div className="flex w-full min-w-0 items-stretch border-b border-stone-200 bg-stone-50/70">
          <div
            className="flex min-w-0 flex-1 divide-x divide-stone-200/90"
            role="tablist"
            aria-label="Activity type"
          >
            {CRM_ACTIVITY_LOG_FORM_TAB_ORDER.map((t) => {
              const active = activityType === t;
              return (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActivityType(t)}
                  className={typeTabClass(active)}
                >
                  <span className="flex shrink-0 items-center justify-center">{activityTypeIcon(t)}</span>
                  <span className="min-w-0 truncate">{CRM_ACTIVITY_TYPE_LABELS[t]}</span>
                </button>
              );
            })}
          </div>
          <div
            className="flex w-[38%] max-w-[13.5rem] shrink-0 divide-x divide-stone-200 border-l border-stone-200 sm:max-w-[15rem]"
            role="group"
            aria-label="Inbound or outbound"
          >
            <button type="button" onClick={() => setDirection("INBOUND")} className={directionBtnClass(direction === "INBOUND")}>
              <ArrowDownToLine className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" aria-hidden strokeWidth={2} />
              <span>Inbound</span>
            </button>
            <button type="button" onClick={() => setDirection("OUTBOUND")} className={directionBtnClass(direction === "OUTBOUND")}>
              <ArrowUpFromLine className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" aria-hidden strokeWidth={2} />
              <span>Outbound</span>
            </button>
          </div>
        </div>

        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What happened?"
          rows={4}
          className="min-h-[6.5rem] w-full resize-y border-0 bg-transparent px-3 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-amber-400/30 sm:px-4 sm:py-3"
        />

        <div className="flex flex-wrap items-stretch gap-2 border-t border-stone-200 bg-stone-50/40 px-2 py-2 sm:gap-3 sm:px-3 sm:py-2.5">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <input
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm text-stone-900 shadow-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/25 sm:max-w-[11rem] sm:flex-none"
              aria-label="Scheduled date"
            />
            <div className="flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-1 py-1 shadow-sm">
              <input
                type="text"
                inputMode="numeric"
                maxLength={2}
                value={hourStr}
                onChange={(e) => setHourStr(e.target.value.replace(/\D/g, "").slice(0, 2))}
                onBlur={() => {
                  if (hourStr === "") return;
                  setHourStr(clampHour(hourStr));
                }}
                placeholder="hh"
                className="w-9 rounded border-0 bg-transparent py-1 text-center text-sm tabular-nums text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 sm:w-10"
                aria-label="Hours"
              />
              <span className="text-sm font-medium text-stone-500">:</span>
              <input
                type="text"
                inputMode="numeric"
                maxLength={2}
                value={minuteStr}
                onChange={(e) => setMinuteStr(e.target.value.replace(/\D/g, "").slice(0, 2))}
                onBlur={() => {
                  if (minuteStr === "") return;
                  setMinuteStr(clampMinute(minuteStr));
                }}
                placeholder="mm"
                className="w-9 rounded border-0 bg-transparent py-1 text-center text-sm tabular-nums text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 sm:w-10"
                aria-label="Minutes"
              />
            </div>
          </div>

          <button
            type="button"
            aria-disabled={saveBlocked}
            title="Save activity"
            aria-label="Save activity"
            onClick={() => {
              if (saveBlocked) return;
              void addActivity();
            }}
            className={[
              "flex min-h-[2.75rem] min-w-[3rem] shrink-0 flex-col items-center justify-center rounded-md border border-stone-300 bg-slate-300 px-2 text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50 sm:min-h-[2.875rem] sm:min-w-[3.5rem]",
              saveBlocked
                ? "cursor-not-allowed opacity-40 hover:bg-slate-300 focus:bg-slate-300"
                : "hover:bg-emerald-600 focus:bg-emerald-600"
            ].join(" ")}
          >
            <Play className="h-6 w-6 pl-0.5" aria-hidden fill="currentColor" strokeWidth={0} />
          </button>
        </div>
      </section>

      <div className="mb-3 mt-4 flex items-center gap-2 text-stone-800">
        <Filter className="h-5 w-5 text-amber-800/90" aria-hidden strokeWidth={2} />
        <h2 id="crm-activity-filters-heading" className="text-base font-semibold tracking-tight">
          Filters
        </h2>
      </div>
      <section
        className="min-w-0 rounded-2xl border border-stone-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,15,15,0.06)] sm:p-6"
        aria-labelledby="crm-activity-filters-heading"
      >
        <div className="flex flex-col gap-5">
          <div className="min-w-0 w-full">
            <label htmlFor="crm-act-search" className="mb-1.5 block text-xs font-medium text-stone-600">
              Search text
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex w-10 items-center justify-center text-stone-400">
                <Search className="h-5 w-5" aria-hidden strokeWidth={2} />
              </span>
              <input
                id="crm-act-search"
                type="search"
                placeholder="Title or description…"
                autoComplete="off"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                className={filterSearchInputClass}
              />
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:gap-4">
            <div className="min-w-0 w-full flex-1 basis-0">
              <label htmlFor="crm-act-filter" className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-stone-600">
                <Tag className="h-3.5 w-3.5 shrink-0 text-stone-500" aria-hidden strokeWidth={2} />
                Activity type
              </label>
              <select
                id="crm-act-filter"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as CrmActivityType | "")}
                className={filterSelectClass}
              >
                <option value="">Any type</option>
                {CRM_ACTIVITY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {CRM_ACTIVITY_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-0 w-full flex-1 basis-0">
              <label htmlFor="crm-act-date-preset" className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-stone-600">
                <Calendar className="h-3.5 w-3.5 shrink-0 text-stone-500" aria-hidden strokeWidth={2} />
                Logged date
              </label>
              <select
                id="crm-act-date-preset"
                value={filterDatePreset}
                onChange={(e) => {
                  const v = e.target.value as CrmActivityListDatePreset | "";
                  setFilterDatePreset(v);
                  if (!v) {
                    setFilterDateFrom("");
                    setFilterDateTo("");
                  }
                }}
                className={filterSelectClass}
              >
                {DATE_PRESET_OPTIONS.map(({ value, label }) => (
                  <option key={value || "any"} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {filterDatePreset ? (
              <div className="flex min-w-0 w-full flex-1 basis-0 flex-col gap-3 sm:flex-row sm:gap-3">
                <div className="min-w-0 flex-1 basis-0">
                  <label htmlFor="crm-act-date-from" className="mb-1.5 block text-xs font-medium text-stone-600">
                    {filterDatePreset === "between" ? "From" : filterDatePreset === "before" ? "Before" : "On or after"}
                  </label>
                  <input
                    id="crm-act-date-from"
                    type="date"
                    value={filterDateFrom}
                    onChange={(e) => setFilterDateFrom(e.target.value)}
                    className={filterDateInputClass}
                  />
                </div>
                {filterDatePreset === "between" ? (
                  <div className="min-w-0 flex-1 basis-0">
                    <label htmlFor="crm-act-date-to" className="mb-1.5 block text-xs font-medium text-stone-600">
                      To
                    </label>
                    <input
                      id="crm-act-date-to"
                      type="date"
                      value={filterDateTo}
                      onChange={(e) => setFilterDateTo(e.target.value)}
                      className={filterDateInputClass}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {err ? (
        <p className="mt-4 text-sm text-rose-600" role="alert">
          {err}
        </p>
      ) : null}

      <div className="mt-6 min-w-0" role="region" aria-label="Activity entries">
        <ol className="list-none p-0">
          {activities.length === 0 ? (
            <li className="py-2 text-center text-sm text-stone-600">
              {hasListFilters ? "No activities match your filters." : "No activities logged yet."}
            </li>
          ) : (
            activities.map((a, index) => {
              const isLast = index === activities.length - 1;
              const body = (a.description?.trim() || a.title.trim()) || "—";
              return (
                <li key={a.id} className="flex gap-3 pb-6 last:pb-0 sm:gap-4">
                  <div className="flex w-11 shrink-0 flex-col items-center pt-1 sm:w-12" aria-hidden>
                    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-white text-emerald-800 shadow-sm sm:h-11 sm:w-11">
                      {timelineIconForType(a.activityType)}
                    </div>
                    {!isLast ? (
                      <span className="mt-2 w-px flex-1 min-h-[1.5rem] bg-stone-300/80" />
                    ) : null}
                  </div>
                  <article className="min-w-0 flex-1 rounded-xl border border-stone-200 bg-white px-4 py-3 shadow-sm sm:px-5 sm:py-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                          {activityTypeLabel(a.activityType)}
                        </span>
                        {directionLabel(a.direction) ? (
                          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-700 ring-1 ring-stone-200/80">
                            {directionLabel(a.direction)}
                          </span>
                        ) : null}
                      </div>
                      <time
                        className="text-[11px] font-medium tabular-nums text-stone-500"
                        dateTime={a.createdAt}
                      >
                        {formatDateTime(a.createdAt)}
                      </time>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-stone-800">{body}</p>
                    {a.scheduledAt ? (
                      <p className="mt-2 text-xs tabular-nums text-stone-500">
                        Scheduled · {formatDateTime(a.scheduledAt)}
                      </p>
                    ) : null}
                  </article>
                </li>
              );
            })
          )}
        </ol>
      </div>
    </>
  );
};
