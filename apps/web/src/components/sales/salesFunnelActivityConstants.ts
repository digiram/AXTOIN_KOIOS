/**
 * salesFunnelActivityConstants
 *
 * Labels, tab order, and filter helpers for sales funnel activity UI.
 *
 * Responsibilities:
 * - Manual activity type labels and log-form tab order
 * - System-generated activity type detection and display labels
 * - Client-side activity list filtering by type and search query
 *
 * Related:
 * - `SalesFunnelActivitySection`; `@starter/shared` funnel activity types
 */
import type { SalesFunnelManualActivityType } from "@starter/shared";

/** Tab order for manual activity log form on funnel records. */
export const SALES_FUNNEL_LOG_TAB_ORDER: SalesFunnelManualActivityType[] = [
  "note",
  "call",
  "mail",
  "email",
  "meeting",
  "conversation"
];

/** Display labels for manual funnel activity types. */
export const SALES_FUNNEL_ACTIVITY_LABELS: Record<SalesFunnelManualActivityType, string> = {
  note: "Note",
  call: "Call",
  mail: "Mail",
  email: "Email",
  meeting: "Meeting",
  conversation: "Conversation"
};

/** Inbound/outbound labels for directed funnel activities. */
export const SALES_FUNNEL_DIRECTION_LABELS = {
  INBOUND: "Inbound",
  OUTBOUND: "Outbound"
} as const;

/** Auto-logged funnel events (not manual note/call/etc.). */
export const SALES_FUNNEL_SYSTEM_ACTIVITY_TYPES = [
  "created",
  "stage_change",
  "assignment",
  "reactivated",
  "promoted",
  "outcome"
] as const;

/** Union of auto-logged funnel system activity type keys. */
export type SalesFunnelSystemActivityType = (typeof SALES_FUNNEL_SYSTEM_ACTIVITY_TYPES)[number];

const SYSTEM_ACTIVITY_SET = new Set<string>(SALES_FUNNEL_SYSTEM_ACTIVITY_TYPES);

export const isSalesFunnelSystemActivity = (activityType: string): boolean =>
  SYSTEM_ACTIVITY_SET.has(activityType.trim().toLowerCase());

/** `stage_change` → `Stage change`; underscores in type keys become spaces. */
export const salesFunnelSystemActivityLabel = (activityType: string): string => {
  const key = activityType.trim().toLowerCase();
  if (key === "promoted") return "Promoted";
  return key
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

/** Presentation for system summaries (e.g. lane keys `ready_for_sales` → `ready for sales`). */
export const formatSalesFunnelSystemActivitySummary = (summary: string): string =>
  summary.trim().replace(/_/g, " ");

/** Display label for any funnel activity type (manual or system). */
export const salesFunnelActivityTypeLabel = (activityType: string): string => {
  const key = activityType.trim().toLowerCase();
  if (isSalesFunnelSystemActivity(key)) return salesFunnelSystemActivityLabel(key);
  if (key in SALES_FUNNEL_ACTIVITY_LABELS) {
    return SALES_FUNNEL_ACTIVITY_LABELS[key as SalesFunnelManualActivityType];
  }
  return key.replace(/_/g, " ");
};

/** Minimal activity shape required by {@link filterSalesFunnelActivities}. */
export type FunnelActivityFilterable = {
  activityType: string;
  summary: string;
  activityContacts?: { displayName: string }[];
};

/** Client-side filter by type, system-activity toggle, and search query. */
export const filterSalesFunnelActivities = <T extends FunnelActivityFilterable>(
  activities: T[],
  opts: { searchQ: string; filterType: string; showSystemActivities: boolean }
): T[] => {
  let list = activities;
  if (!opts.showSystemActivities) {
    list = list.filter((a) => !isSalesFunnelSystemActivity(a.activityType));
  }
  const typeKey = opts.filterType.trim().toLowerCase();
  if (typeKey) {
    list = list.filter((a) => a.activityType.trim().toLowerCase() === typeKey);
  }
  const q = opts.searchQ.trim().toLowerCase();
  if (q) {
    list = list.filter((a) => {
      const summaryText = isSalesFunnelSystemActivity(a.activityType)
        ? formatSalesFunnelSystemActivitySummary(a.summary)
        : a.summary.trim();
      const contactText = (a.activityContacts ?? []).map((c) => c.displayName).join(" ");
      const haystack = [salesFunnelActivityTypeLabel(a.activityType), summaryText, contactText]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }
  return list;
};
