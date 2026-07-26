/**
 * Company subscription recurring cost normalization.
 *
 * Converts per-period amounts (minor units) to estimated monthly equivalents
 * for dashboards and rollups, with per-seat multipliers for seated providers.
 *
 * Responsibilities:
 * - Normalize amount by cadence to monthly minor units
 * - Sum plan costs for seated providers with seat multipliers
 *
 * Related:
 * - `company-subscriptions.ts`, `company-subscription-cadence-dates.ts`
 */
import type { CompanySubscriptionCadenceKind } from "./company-subscriptions.js";
import type { CompanySubscriptionCadenceUnit } from "./company-subscription-cadence-dates.js";

export type RecurringCostCadenceInput = {
  cadenceKind: CompanySubscriptionCadenceKind;
  cadenceIntervalCount?: number | null;
  cadenceIntervalUnit?: CompanySubscriptionCadenceUnit | null;
};

const periodsPerYear = (cadence: RecurringCostCadenceInput): number | null => {
  const { cadenceKind, cadenceIntervalCount, cadenceIntervalUnit } = cadence;
  switch (cadenceKind) {
    case "daily":
      return 365;
    case "weekly":
      return 52;
    case "monthly":
      return 12;
    case "quarterly":
      return 4;
    case "yearly":
      return 1;
    case "custom": {
      const count = cadenceIntervalCount;
      if (count == null || count < 1 || !cadenceIntervalUnit) return null;
      switch (cadenceIntervalUnit) {
        case "day":
          return 365 / count;
        case "week":
          return 52 / count;
        case "month":
          return 12 / count;
        case "year":
          return 1 / count;
        default:
          return null;
      }
    }
    default:
      return null;
  }
};

/** Normalize a recurring amount (minor units) to an estimated monthly equivalent. */
export const amountMinorPerMonth = (
  amountMinor: number | null | undefined,
  cadence: RecurringCostCadenceInput
): number | null => {
  if (amountMinor == null || !Number.isFinite(amountMinor) || amountMinor < 0) return null;
  const yearly = periodsPerYear(cadence);
  if (yearly == null || yearly <= 0) return null;
  return Math.round((amountMinor * yearly) / 12);
};

/** Seats used to multiply per-seat plan cost (licensed count, else assigned seats, else 1). */
export const planSeatMultiplier = (
  licensedSeatCount: number | null | undefined,
  assignedSeatCount = 0
): number => {
  if (licensedSeatCount != null && licensedSeatCount > 0) return licensedSeatCount;
  if (assignedSeatCount > 0) return assignedSeatCount;
  return 1;
};

/** Monthly cost for a plan: per-seat amount (normalized to month) × seat multiplier. */
export const planMonthlyCostMinor = (
  plan: { amountMinor: number | null; seatCount?: number | null } & RecurringCostCadenceInput,
  assignedSeatCount = 0
): number | null => {
  const perSeatMonthly = amountMinorPerMonth(plan.amountMinor, plan);
  if (perSeatMonthly == null) return null;
  return perSeatMonthly * planSeatMultiplier(plan.seatCount, assignedSeatCount);
};

/** Sum monthly-normalized plan costs for a seated provider (per-seat × seats per plan). */
export const sumPlansMonthlyCostMinor = (
  plans: ReadonlyArray<
    { amountMinor: number | null; seatCount?: number | null; assignedSeatCount?: number } & RecurringCostCadenceInput
  >
): number | null => {
  let total = 0;
  let any = false;
  for (const plan of plans) {
    const monthly = planMonthlyCostMinor(plan, plan.assignedSeatCount ?? 0);
    if (monthly == null) continue;
    total += monthly;
    any = true;
  }
  return any ? total : null;
};
