/**
 * Super Data Table Styles.
 *
 * Shared Tailwind class helpers for super-admin list tables (users, subscriptions, jobs).
 *
 * Responsibilities:
 * - Export consistent table shell, header, row, and empty-state classes
 * - Keep platform directory tables visually aligned across super-admin screens
 *
 * Related:
 * - SuperUsersPage.tsx, SuperSubscriptionsPage.tsx
 * - Route: /super-admin
 */
/** Shared outer scroll shell for super-admin data tables. */
export const superDataTableOuterClass =
  "w-full min-w-0 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm";

/** Base table classes with caller-supplied minimum width. */
export const superDataTableClass = (minWidthClass: string) =>
  ["w-full", minWidthClass, "table-auto", "border-collapse", "text-left", "divide-y", "divide-slate-200"].join(" ");

/** Table header background for super-admin lists. */
export const superDataTableTheadClass = "bg-slate-50";

/** Standard header cell typography for super-admin tables. */
export const superDataTableThClass =
  "px-3 py-2 align-bottom text-xs font-medium uppercase tracking-wider text-slate-500";

/** Body row divider and text styling. */
export const superDataTableTbodyClass = "divide-y divide-slate-100 text-sm text-slate-700";

/** Zebra and hover classes for data rows. */
export const superDataTableRowClass = (idx: number) =>
  [idx % 2 === 0 ? "bg-white" : "bg-slate-50/40", "transition-colors hover:bg-slate-100/80"].join(" ");

/** Background for empty-state placeholder rows. */
export const superDataTableEmptyRowClass = "bg-white";

/** Padding and typography for empty-state cells. */
export const superDataTableEmptyCellClass = "px-3 py-16 text-center text-sm text-slate-500";

/** Users directory: icon rail header cells (full-bleed buttons). */
export const superDataTableUsersActionsThClass =
  "w-[4.5rem] min-w-[4.5rem] max-w-[4.5rem] border-l border-slate-200 px-0 py-2 text-left align-bottom text-xs font-medium uppercase tracking-wider text-slate-500";

/** Users directory: icon rail body cells. */
export const superDataTableUsersActionsTdClass = "border-l border-slate-200 p-0 align-top text-sm";

/** One icon control: same width as a single cell inside the users `4.5rem` dual-button rail (`w-9` = 2.25rem). */
export const superDataTableUsersSingleActionThClass =
  "w-9 min-w-9 max-w-9 border-l border-slate-200 px-0 py-2 text-left align-bottom text-xs font-medium uppercase tracking-wider text-slate-500";
