/**
 * SalesFunnelActivitySection
 *
 * Full activity timeline and log form for a sales funnel lead or deal.
 *
 * Responsibilities:
 * - List activities with filters, system-activity toggle, and pagination
 * - Manual activity logging with contact linking
 * - Reuses funnel activity constants and contact search fields
 *
 * Related:
 * - Sales funnel detail pages; `salesFunnelActivityConstants`
 *
 * Security:
 * - Tenant-scoped funnel API via `useSalesApi`.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { SalesFunnelManualActivityType } from "@starter/shared";
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

import { Switch } from "../Switch.js";

import { API_BASE_URL } from "../../lib/api.js";
import { useCrmBasePath } from "../../pages/crm/crmPaths.js";
import { useSalesApi } from "../../pages/sales/useSalesApi.js";
import {
  FunnelActivityContactBadge,
  FunnelRecordContactSearchField
} from "./FunnelRecordContactSearchField.js";
import type { SalesFunnelContactRow } from "./SalesFunnelRecordProfileCard.js";
import type { FunnelActivityItem } from "../../pages/sales/SalesFunnelActivityTimeline.js";
import { SalesFunnelActivityTimeline } from "../../pages/sales/SalesFunnelActivityTimeline.js";
import {
  filterSalesFunnelActivities,
  SALES_FUNNEL_ACTIVITY_LABELS,
  SALES_FUNNEL_LOG_TAB_ORDER,
  SALES_FUNNEL_SYSTEM_ACTIVITY_TYPES,
  salesFunnelSystemActivityLabel
} from "./salesFunnelActivityConstants.js";

type Props = {
  kind: "lead" | "deal";
  recordId: string;
  canEdit: boolean;
  /** Contacts linked to the lead/deal; used for optional activity association. */
  contacts?: SalesFunnelContactRow[];
};

const activityTypeIcon = (t: SalesFunnelManualActivityType, iconClass = "h-3.5 w-3.5 shrink-0") => {
  switch (t) {
    case "note":
      return <SquarePen className={iconClass} aria-hidden strokeWidth={2} />;
    case "call":
      return <Phone className={iconClass} aria-hidden strokeWidth={2} />;
    case "mail":
      return <Package className={iconClass} aria-hidden strokeWidth={2} />;
    case "email":
      return <Mail className={iconClass} aria-hidden strokeWidth={2} />;
    case "meeting":
      return <Calendar className={iconClass} aria-hidden strokeWidth={2} />;
    case "conversation":
      return <MessageCircle className={iconClass} aria-hidden strokeWidth={2} />;
    default:
      return null;
  }
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

const contactOptionLabel = (c: SalesFunnelContactRow) => {
  const name = c.displayName?.trim();
  if (name) return c.role.trim() ? `${name} (${c.role})` : name;
  return c.role.trim() || c.contactId;
};

/** Activity timeline and manual log form for one funnel lead or deal. */
export const SalesFunnelActivitySection = ({
  kind,
  recordId,
  canEdit,
  contacts = []
}: Props) => {
  const { authedFetch } = useSalesApi();
  const [activities, setActivities] = useState<FunnelActivityItem[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const [body, setBody] = useState("");
  const [activityType, setActivityType] = useState<SalesFunnelManualActivityType>("note");
  const [direction, setDirection] = useState<"INBOUND" | "OUTBOUND">("INBOUND");
  const initialScheduleRef = useRef<ReturnType<typeof scheduleFieldsFromDate> | null>(null);
  if (initialScheduleRef.current === null) {
    initialScheduleRef.current = scheduleFieldsFromDate(new Date());
  }
  const [dateStr, setDateStr] = useState(initialScheduleRef.current.dateStr);
  const [hourStr, setHourStr] = useState(initialScheduleRef.current.hourStr);
  const [minuteStr, setMinuteStr] = useState(initialScheduleRef.current.minuteStr);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [filterType, setFilterType] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [showSystemActivities, setShowSystemActivities] = useState(true);
  const crmBase = useCrmBasePath();

  const contactById = useMemo(() => {
    const map = new Map<string, SalesFunnelContactRow>();
    for (const c of contacts) map.set(c.contactId, c);
    return map;
  }, [contacts]);

  const scheduledAt = useMemo(
    () => buildScheduledAt(dateStr, hourStr, minuteStr),
    [dateStr, hourStr, minuteStr]
  );

  const activitiesUrl =
    kind === "lead"
      ? `${API_BASE_URL}/tenant/sales/bdr/leads/${encodeURIComponent(recordId)}/activities`
      : `${API_BASE_URL}/tenant/sales/deals/${encodeURIComponent(recordId)}/activities`;

  const postUrl = activitiesUrl;

  const load = useCallback(async () => {
    setErr("");
    try {
      const res = await authedFetch(activitiesUrl);
      if (!res?.ok) {
        const b = (await res?.json().catch(() => null)) as { message?: string } | null;
        setErr(b?.message ?? "Could not load activities.");
        return;
      }
      const j = (await res.json()) as { activities: FunnelActivityItem[] };
      setActivities(j.activities ?? []);
    } catch {
      setErr("Could not load activities.");
    }
  }, [activitiesUrl, authedFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = window.setTimeout(() => setSearchQ(searchDraft.trim()), 400);
    return () => window.clearTimeout(id);
  }, [searchDraft]);

  const filteredActivities = useMemo(
    () =>
      filterSalesFunnelActivities(activities, {
        searchQ,
        filterType,
        showSystemActivities
      }),
    [activities, filterType, searchQ, showSystemActivities]
  );

  const hasListFilters = Boolean(filterType || searchQ || !showSystemActivities);

  const addActivity = async () => {
    setBusy(true);
    setErr("");
    try {
      const res = await authedFetch(postUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          activityType,
          body: body.trim(),
          direction,
          scheduledAt,
          contactIds: selectedContactIds
        })
      });
      if (!res || !res.ok) {
        const b = (await res?.json().catch(() => null)) as { message?: string } | null;
        setErr(b?.message ?? "Could not save activity.");
        return;
      }
      setBody("");
      const next = scheduleFieldsFromDate(new Date());
      setDateStr(next.dateStr);
      setHourStr(next.hourStr);
      setMinuteStr(next.minuteStr);
      setDirection("INBOUND");
      setActivityType("note");
      setSelectedContactIds([]);
      await load();
    } catch {
      setErr("Could not save activity.");
    } finally {
      setBusy(false);
    }
  };

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

  const saveBlocked = busy || body.trim().length === 0;

  const filterControlClass =
    "rounded-lg border border-stone-200 bg-white text-sm text-stone-900 shadow-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/25";

  const timelineEmptyMessage =
    activities.length === 0
      ? "No activities logged yet."
      : hasListFilters
        ? "No activities match your filters."
        : "No activities logged yet.";

  return (
    <>
      {canEdit ? (
        <section
          aria-label="Log activity"
          className="relative z-10 mb-4 flex flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm"
        >
          <LogActivityHeader>
            <div
              className="flex min-w-0 flex-1 divide-x divide-stone-200/90"
              role="tablist"
              aria-label="Activity type"
            >
              {SALES_FUNNEL_LOG_TAB_ORDER.map((t) => {
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
                    <span className="min-w-0 truncate">{SALES_FUNNEL_ACTIVITY_LABELS[t]}</span>
                  </button>
                );
              })}
            </div>
            <div
              className="flex w-[38%] max-w-[13.5rem] shrink-0 divide-x divide-stone-200 border-l border-stone-200 sm:max-w-[15rem]"
              role="group"
              aria-label="Inbound or outbound"
            >
              <button
                type="button"
                onClick={() => setDirection("INBOUND")}
                className={directionBtnClass(direction === "INBOUND")}
              >
                <ArrowDownToLine className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" aria-hidden strokeWidth={2} />
                <span>Inbound</span>
              </button>
              <button
                type="button"
                onClick={() => setDirection("OUTBOUND")}
                className={directionBtnClass(direction === "OUTBOUND")}
              >
                <ArrowUpFromLine className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" aria-hidden strokeWidth={2} />
                <span>Outbound</span>
              </button>
            </div>
          </LogActivityHeader>

          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
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
              <div className="flex min-w-0 flex-1 basis-full items-center gap-1.5 sm:min-w-[14rem] sm:basis-auto">
                <FunnelRecordContactSearchField
                  inputId={`activity-record-contacts-${recordId}`}
                  recordContacts={contacts}
                  excludeContactIds={selectedContactIds}
                  disabled={busy}
                  onSelect={(row) =>
                    setSelectedContactIds((prev) =>
                      prev.includes(row.contactId) ? prev : [...prev, row.contactId]
                    )
                  }
                />
                {selectedContactIds.length > 0 ? (
                  <div className="flex min-w-0 shrink flex-wrap items-center justify-end gap-1">
                    {selectedContactIds.map((id) => {
                      const row = contactById.get(id);
                      const label = row ? contactOptionLabel(row) : id;
                      return (
                        <FunnelActivityContactBadge
                          key={id}
                          label={label}
                          disabled={busy}
                          onRemove={() =>
                            setSelectedContactIds((prev) => prev.filter((x) => x !== id))
                          }
                        />
                      );
                    })}
                  </div>
                ) : null}
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
      ) : null}

      <section
        className="mb-4 flex min-w-0 items-center gap-2 rounded-xl border border-stone-200 bg-white px-2 py-2 shadow-sm sm:gap-3 sm:px-3 sm:py-2.5"
        aria-label="Activity filters"
      >
        <Filter className="h-4 w-4 shrink-0 text-amber-800/90 sm:h-[1.125rem] sm:w-[1.125rem]" aria-hidden strokeWidth={2} />
        <div className="relative min-w-0 flex-1">
          <span className="pointer-events-none absolute inset-y-0 left-0 flex w-9 items-center justify-center text-stone-400">
            <Search className="h-4 w-4" aria-hidden strokeWidth={2} />
          </span>
          <input
            id={`${kind}-activity-search-${recordId}`}
            type="search"
            placeholder="Search activities…"
            autoComplete="off"
            aria-label="Search activities"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            className={`${filterControlClass} w-full py-1.5 pl-9 pr-2 placeholder:text-stone-400`}
          />
        </div>
        <div className="relative shrink-0">
          <Tag
            className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-500"
            aria-hidden
            strokeWidth={2}
          />
          <select
            id={`${kind}-activity-type-filter-${recordId}`}
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            aria-label="Activity type"
            className={`${filterControlClass} w-[7.5rem] appearance-none py-1.5 pl-8 pr-7 sm:w-[9.5rem]`}
          >
            <option value="">Any type</option>
            <optgroup label="Logged">
              {SALES_FUNNEL_LOG_TAB_ORDER.map((t) => (
                <option key={t} value={t}>
                  {SALES_FUNNEL_ACTIVITY_LABELS[t]}
                </option>
              ))}
            </optgroup>
            <optgroup label="System">
              {SALES_FUNNEL_SYSTEM_ACTIVITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {salesFunnelSystemActivityLabel(t)}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
        <div className="flex shrink-0 items-center gap-2 border-l border-stone-200 pl-2 sm:gap-2.5 sm:pl-3">
          <label
            htmlFor={`${kind}-activity-system-toggle-${recordId}`}
            className="whitespace-nowrap text-xs font-medium text-stone-700"
          >
            System
          </label>
          <Switch
            id={`${kind}-activity-system-toggle-${recordId}`}
            checked={showSystemActivities}
            onCheckedChange={setShowSystemActivities}
            aria-label={
              showSystemActivities ? "System activities visible" : "System activities hidden"
            }
          />
        </div>
      </section>

      {err ? (
        <p className="mb-4 text-sm text-rose-600" role="alert">
          {err}
        </p>
      ) : null}

      <div className="min-w-0" role="region" aria-label="Activity timeline">
        <SalesFunnelActivityTimeline
          activities={filteredActivities}
          variant="detail"
          crmBase={crmBase}
          emptyMessage={timelineEmptyMessage}
        />
      </div>
    </>
  );
};

function LogActivityHeader({ children }: { children: ReactNode }) {
  return (
    <div className="flex w-full min-w-0 items-stretch border-b border-stone-200 bg-stone-50/70">
      {children}
    </div>
  );
}
