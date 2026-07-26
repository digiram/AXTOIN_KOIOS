/**
 * Rolling monthly billing in **UTC** (Option B): period boundaries use calendar-month arithmetic
 * anchored to the subscription start instant (same clock time, day clamped when month length differs).
 *
 * v1 catalog is **monthly, count 1** only; day/year tiers are rejected until extended.
 * **Trials** use calendar **days** in UTC (`addDaysUtc`) to set `trial_ends_at`; no mid-period price proration in v1.
 */

/** Add **calendar days** in UTC (same UTC clock time; month length does not compress the day count). */
export function addDaysUtc(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function addMonthsUtc(date: Date, months: number): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const d = date.getUTCDate();
  const h = date.getUTCHours();
  const min = date.getUTCMinutes();
  const s = date.getUTCSeconds();
  const ms = date.getUTCMilliseconds();
  const targetMonth = m + months;
  const lastDayOfTargetMonth = new Date(Date.UTC(y, targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDayOfTargetMonth);
  return new Date(Date.UTC(y, targetMonth, day, h, min, s, ms));
}

/** v1: only single-month rolling plans are subscriber-assignable from catalog. */
export function isV1SubscriberPlan(durationUnit: string, durationCount: number): boolean {
  return durationUnit === "month" && durationCount === 1;
}

/**
 * First invoice amount for a full rolling period (v1). Coupons / percent-off and in-period proration are **not**
 * modeled here (PSP or future columns).
 */
export function firstPeriodPriceCents(planPriceCents: number): number {
  return planPriceCents;
}
