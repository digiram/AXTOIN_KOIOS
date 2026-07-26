/**
 * Company Subscription Cadence Dates.
 *
 * Date helpers for company subscription billing cadence fields.
 *
 * Responsibilities:
 * - Compute default billing period start/end from cadence kind
 * - Keep cadence math consistent across provider and plan forms
 *
 * Related:
 * - companySubscriptionsUi.ts
 */
import {
  addBillingCadenceToIsoDate,
  deriveRenewalAndEndFromStart,
  type BillingCadencePeriodInput,
  type CompanySubscriptionCadenceKind,
  type CompanySubscriptionCadenceUnit
} from "@starter/shared";

const CADENCE_DERIVE_KEYS = [
  "cadenceKind",
  "cadenceIntervalCount",
  "cadenceIntervalUnit"
] as const;

const cadenceFromForm = (input: {
  cadenceKind: CompanySubscriptionCadenceKind;
  cadenceIntervalCount: string;
  cadenceIntervalUnit: CompanySubscriptionCadenceUnit;
}): BillingCadencePeriodInput => ({
  cadenceKind: input.cadenceKind,
  cadenceIntervalCount:
    input.cadenceKind === "custom" ? Number.parseInt(input.cadenceIntervalCount, 10) || null : null,
  cadenceIntervalUnit: input.cadenceKind === "custom" ? input.cadenceIntervalUnit : null
});

const patchTriggersDerive = (patch: Record<string, unknown>, startKey: string): boolean =>
  startKey in patch || CADENCE_DERIVE_KEYS.some((k) => k in patch);

/** Merge renewal/end dates when start or cadence changes (provider form). */
export const mergeProviderCadenceDerivedDates = <
  T extends {
    contractStartDate: string;
    renewalDate: string;
    contractEndDate: string;
    cadenceKind: CompanySubscriptionCadenceKind;
    cadenceIntervalCount: string;
    cadenceIntervalUnit: CompanySubscriptionCadenceUnit;
  }
>(
  values: T,
  patch: Partial<T>
): Partial<T> => {
  if (!patchTriggersDerive(patch as Record<string, unknown>, "contractStartDate")) return patch;
  const merged = { ...values, ...patch };
  const start = merged.contractStartDate.trim();
  if (!start) return patch;
  const derived = deriveRenewalAndEndFromStart(start, cadenceFromForm(merged));
  if (!derived) return patch;
  return { ...patch, renewalDate: derived.renewalDate as T["renewalDate"], contractEndDate: derived.endDate as T["contractEndDate"] };
};

/** Merge renewal/end dates when start or cadence changes (plan form). */
export const mergePlanCadenceDerivedDates = <
  T extends {
    startDate: string;
    renewalDate: string;
    endDate: string;
    cadenceKind: CompanySubscriptionCadenceKind;
    cadenceIntervalCount: string;
    cadenceIntervalUnit: CompanySubscriptionCadenceUnit;
  }
>(
  values: T,
  patch: Partial<T>
): Partial<T> => {
  if (!patchTriggersDerive(patch as Record<string, unknown>, "startDate")) return patch;
  const merged = { ...values, ...patch };
  const start = merged.startDate.trim();
  if (!start) return patch;
  const derived = deriveRenewalAndEndFromStart(start, cadenceFromForm(merged));
  if (!derived) return patch;
  return { ...patch, renewalDate: derived.renewalDate as T["renewalDate"], endDate: derived.endDate as T["endDate"] };
};

/** Local calendar today as `YYYY-MM-DD` (matches HTML date inputs). */
export const todayIsoDateLocal = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};


/** Default contract/start + derived renewal/end for singular provider or seated plan billing. */
export const defaultBillingPeriodDatesFromToday = (cadence: {
  cadenceKind: CompanySubscriptionCadenceKind;
  cadenceIntervalCount: string;
  cadenceIntervalUnit: CompanySubscriptionCadenceUnit;
}): { start: string; renewalDate: string; endDate: string } => {
  const start = todayIsoDateLocal();
  const derived = deriveRenewalAndEndFromStart(start, cadenceFromForm(cadence));
  return {
    start,
    renewalDate: derived?.renewalDate ?? "",
    endDate: derived?.endDate ?? ""
  };
};

export { addBillingCadenceToIsoDate, deriveRenewalAndEndFromStart };
