/**
 * WorkforceWorkingHoursGrid.
 *
 * Weekday grid helpers for employee work-schedule editing and API payload conversion.
 *
 * Responsibilities:
 * - Define ordered work-week day labels
 * - Map API schedule rows to/from enabled day grid with start/end times
 */

import type { WorkforceWorkScheduleDayCode } from "@starter/shared";

/** Ordered weekdays for the work-hours editor grid. */
export const WORK_WEEK_DAYS: { code: WorkforceWorkScheduleDayCode; label: string }[] = [
  { code: "mon", label: "Monday" },
  { code: "tue", label: "Tuesday" },
  { code: "wed", label: "Wednesday" },
  { code: "thu", label: "Thursday" },
  { code: "fri", label: "Friday" },
  { code: "sat", label: "Saturday" },
  { code: "sun", label: "Sunday" }
];

/** Single weekday row in the work-hours editor. */
export type DayScheduleRow = { enabled: boolean; start: string; end: string };

/**
 * Empty seven-day schedule grid with default 09:00–17:00 slots (all disabled).
 *
 * @returns Record keyed by {@link WorkforceWorkScheduleDayCode}
 */
export const emptyDayScheduleGrid = (): Record<WorkforceWorkScheduleDayCode, DayScheduleRow> =>
  Object.fromEntries(
    WORK_WEEK_DAYS.map(({ code }) => [code, { enabled: false, start: "09:00", end: "17:00" }])
  ) as Record<WorkforceWorkScheduleDayCode, DayScheduleRow>;

/**
 * Hydrate editor grid from API `work_schedule` rows.
 *
 * @param schedule - Enabled day rows from employee detail API
 */
export function scheduleGridFromApi(
  schedule: { day: WorkforceWorkScheduleDayCode; start: string; end: string }[] | null | undefined
): Record<WorkforceWorkScheduleDayCode, DayScheduleRow> {
  const base = emptyDayScheduleGrid();
  for (const row of schedule ?? []) {
    if (row.day in base) {
      base[row.day] = { enabled: true, start: row.start, end: row.end };
    }
  }
  return base;
}

/**
 * Build API work-schedule payload from enabled grid rows.
 *
 * @param grid - Editor state keyed by weekday code
 */
export function workSchedulePayloadFromGrid(
  grid: Record<WorkforceWorkScheduleDayCode, DayScheduleRow>
): { day: WorkforceWorkScheduleDayCode; start: string; end: string }[] {
  return WORK_WEEK_DAYS.filter(({ code }) => grid[code].enabled).map(({ code }) => ({
    day: code,
    start: grid[code].start,
    end: grid[code].end
  }));
}
