/**
 * Billing cadence date arithmetic for company subscriptions.
 *
 * Adds one billing period to ISO calendar dates (`YYYY-MM-DD`) using UTC month/day
 * rules shared with realm subscription billing.
 *
 * Responsibilities:
 * - Step start dates by cadence kind (daily through custom interval)
 * - Derive renewal and end dates from subscription start
 *
 * Depends on:
 * - `subscription-billing.ts` (`addDaysUtc`, `addMonthsUtc`)
 *
 * Related:
 * - `company-subscriptions.ts` cadence kinds
 */
import type { CompanySubscriptionCadenceKind } from "./company-subscriptions.js";
import { addDaysUtc, addMonthsUtc } from "./subscription-billing.js";

export type CompanySubscriptionCadenceUnit = "day" | "week" | "month" | "year";

export type BillingCadencePeriodInput = {
  cadenceKind: CompanySubscriptionCadenceKind;
  cadenceIntervalCount?: number | null;
  cadenceIntervalUnit?: CompanySubscriptionCadenceUnit | null;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const formatIsoDateUtc = (date: Date): string => {
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
};

/** Add one billing period to an ISO date (`YYYY-MM-DD`). Returns null when input or cadence is invalid. */
export const addBillingCadenceToIsoDate = (
  startIso: string,
  cadence: BillingCadencePeriodInput
): string | null => {
  const start = startIso.trim();
  if (!ISO_DATE.test(start)) return null;

  const [y, m, d] = start.split("-").map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;

  const date = new Date(Date.UTC(y, m - 1, d));

  switch (cadence.cadenceKind) {
    case "daily": {
      const next = addDaysUtc(date, 1);
      return formatIsoDateUtc(next);
    }
    case "weekly": {
      const next = addDaysUtc(date, 7);
      return formatIsoDateUtc(next);
    }
    case "monthly": {
      const next = addMonthsUtc(date, 1);
      return formatIsoDateUtc(next);
    }
    case "quarterly": {
      const next = addMonthsUtc(date, 3);
      return formatIsoDateUtc(next);
    }
    case "yearly": {
      const next = addMonthsUtc(date, 12);
      return formatIsoDateUtc(next);
    }
    case "custom": {
      const count = cadence.cadenceIntervalCount;
      const unit = cadence.cadenceIntervalUnit;
      if (count == null || count < 1 || !unit) return null;
      let next: Date;
      if (unit === "day") next = addDaysUtc(date, count);
      else if (unit === "week") next = addDaysUtc(date, count * 7);
      else if (unit === "month") next = addMonthsUtc(date, count);
      else if (unit === "year") next = addMonthsUtc(date, count * 12);
      else return null;
      return formatIsoDateUtc(next);
    }
    default:
      return null;
  }
};

/** Renewal and period end both default to start + one billing cadence. */
export const deriveRenewalAndEndFromStart = (
  startIso: string,
  cadence: BillingCadencePeriodInput
): { renewalDate: string; endDate: string } | null => {
  const next = addBillingCadenceToIsoDate(startIso, cadence);
  if (!next) return null;
  return { renewalDate: next, endDate: next };
};
