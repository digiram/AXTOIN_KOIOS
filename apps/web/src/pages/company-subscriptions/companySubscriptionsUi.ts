/**
 * Company Subscriptions UI helpers.
 *
 * Shared Tailwind class names, labels, and table chrome for company subscriptions list and form screens.
 *
 * Responsibilities:
 * - Export consistent data-table and field styling tokens
 * - Host small presentation helpers reused across company subscriptions pages
 *
 * Related:
 * - Sibling page and modal components in company-subscriptions
 */
import type {
  CompanySubscriptionCadenceKind,
  CompanySubscriptionCadenceUnit,
  CompanySubscriptionKind,
  CompanySubscriptionSeatStatus,
  CompanySubscriptionStatus
} from "@starter/shared";
import {
  COMPANY_SUBSCRIPTION_KINDS,
  isSeatedCompanySubscription,
  isSingularCompanySubscription,
  subscriptionKindLabel
} from "@starter/shared";

export { COMPANY_SUBSCRIPTION_KINDS, isSeatedCompanySubscription, isSingularCompanySubscription, subscriptionKindLabel };

import type { CurrencyFormatId } from "../../lib/country-presets.js";
import {
  formatAmountMajorForInput,
  parseLocalizedMajorToMinor
} from "../../lib/currencyFormat.js";
import { readApiErrorMessage } from "../../lib/api-error.js";
import { crmModalOutlineInputClass } from "../../components/crm/crmModalOutlineInputClass.js";
import { defaultBillingPeriodDatesFromToday } from "./companySubscriptionCadenceDates.js";

/** Shared constant or class token for company subscriptions presentation. */
export const csLabelClass = "mb-1.5 block text-xs font-medium text-stone-600";
/** Shared constant or class token for company subscriptions presentation. */
export const csFieldClass = crmModalOutlineInputClass(false);
/** Shared constant or class token for company subscriptions presentation. */
export const csSectionClass =
  "rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm ring-1 ring-slate-900/5 sm:p-6";

/** Shared data-table chrome (overview, plan seats, etc.). */
export const csDataTableShellClass =
  "w-full min-w-0 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm";
/** Shared constant or class token for company subscriptions presentation. */
export const csDataTableClass =
  "w-full min-w-[640px] table-auto border-collapse text-left divide-y divide-slate-200";
/** Shared constant or class token for company subscriptions presentation. */
export const csCompactThClass =
  "w-[1%] whitespace-nowrap px-3 py-2 align-bottom text-xs font-medium uppercase tracking-wider text-slate-500";
/** Shared constant or class token for company subscriptions presentation. */
export const csCompactTdClass = "w-[1%] whitespace-nowrap px-3 py-2 align-middle";
/** Shared constant or class token for company subscriptions presentation. */
export const csActionsThClass =
  "w-[4.5rem] min-w-[4.5rem] max-w-[4.5rem] border-l border-slate-200 px-0 py-2 align-bottom text-left text-xs font-medium uppercase tracking-wider text-slate-500";
/** Shared constant or class token for company subscriptions presentation. */
export const csActionsTdClass = "border-l border-slate-200 p-0 align-top text-sm";
/** Shared constant or class token for company subscriptions presentation. */
export const csActionRailClass = "flex min-h-[2.75rem] w-[4.5rem]";

/** Action rail width scales with button count (4.5rem per slot), full height of parent row. */
export const csActionRailForCount = (actionCount: number): string => {
  const base = "flex min-h-[2.75rem] self-stretch";
  if (actionCount >= 3) return `${base} w-[13.5rem] min-w-[13.5rem] max-w-[13.5rem]`;
  if (actionCount === 2) return `${base} w-[9rem] min-w-[9rem] max-w-[9rem]`;
  return `${base} w-[4.5rem] min-w-[4.5rem] max-w-[4.5rem]`;
};

const csActionBtnBase =
  "flex flex-1 items-center justify-center transition focus:outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-40";

/** Shared constant or class token for company subscriptions presentation. */
export const csActionBtnEditClass = `${csActionBtnBase} bg-sky-100 text-sky-950 hover:bg-sky-200 focus-visible:ring-sky-400/80`;
/** Shared constant or class token for company subscriptions presentation. */
export const csActionBtnAddClass = `${csActionBtnBase} bg-emerald-100 text-emerald-950 hover:bg-emerald-200 focus-visible:ring-emerald-500/80`;
/** Shared constant or class token for company subscriptions presentation. */
export const csActionBtnDeleteClass = `${csActionBtnBase} bg-rose-100 text-rose-950 hover:bg-rose-200 focus-visible:ring-rose-400/80`;
/** Shared constant or class token for company subscriptions presentation. */
export const csActionBtnViewClass = `${csActionBtnBase} bg-amber-100 text-amber-950 hover:bg-amber-200 focus-visible:ring-amber-400/80`;

/** Inline delete acknowledgement rail (matches Admin users / system tables). */
export const csActionConfirmMaskCellClass =
  "relative border-2 border-amber-400 border-r-0 p-0 align-middle";
/** Shared constant or class token for company subscriptions presentation. */
export const csActionConfirmRailCellClass =
  "relative border-2 border-l-0 border-amber-400 p-0 align-top text-sm";
/** Shared constant or class token for company subscriptions presentation. */
export const csActionConfirmMaskInnerClass =
  "pointer-events-none absolute inset-0 bg-white";
/** Shared constant or class token for company subscriptions presentation. */
export const csActionConfirmMessageWrapClass =
  "relative flex min-h-[2.75rem] flex-1 items-center justify-end px-3 py-2 pr-2 sm:px-4";
/** Shared constant or class token for company subscriptions presentation. */
export const csActionBtnCancelClass = `${csActionBtnBase} bg-rose-100 text-rose-900 hover:bg-rose-200 focus-visible:ring-rose-400/80`;
/** Shared constant or class token for company subscriptions presentation. */
export const csActionBtnConfirmClass = `${csActionBtnBase} bg-emerald-100 text-emerald-900 hover:bg-emerald-200 focus-visible:ring-emerald-500/80`;

/** Shared constant or class token for company subscriptions presentation. */
export const statusBadgeClass = (status: CompanySubscriptionStatus): string => {
  switch (status) {
    case "active":
      return "border-emerald-200/80 bg-emerald-50 text-emerald-900";
    case "trial":
      return "border-sky-200/80 bg-sky-50 text-sky-900";
    case "pending_renewal":
      return "border-amber-200/80 bg-amber-50 text-amber-950";
    case "expired":
      return "border-rose-200/80 bg-rose-50 text-rose-900";
    case "cancelled":
      return "border-stone-300/80 bg-stone-100 text-stone-800";
    default:
      return "border-stone-200/80 bg-stone-50 text-stone-800";
  }
};

/** Shared constant or class token for company subscriptions presentation. */
export const statusLabel = (status: CompanySubscriptionStatus) =>
  status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** Active toggle maps to `active`; off maps to `cancelled` (inactive). */
export const providerActiveFromStatus = (status: CompanySubscriptionStatus): boolean => status === "active";

/** Shared constant or class token for company subscriptions presentation. */
export const statusToProviderActive = (active: boolean): CompanySubscriptionStatus =>
  active ? "active" : "cancelled";

/** Shared constant or class token for company subscriptions presentation. */
export const seatStatusLabel = (status: string) =>
  status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** Active toggle maps to `active`; off maps to `disabled` (inactive). */
export const seatActiveFromStatus = (status: CompanySubscriptionSeatStatus): boolean => status === "active";

/** Shared constant or class token for company subscriptions presentation. */
export const seatStatusToActive = (active: boolean): CompanySubscriptionSeatStatus =>
  active ? "active" : "disabled";

/** Shared constant or class token for company subscriptions presentation. */
export const seatStatusBadgeClass = (status: CompanySubscriptionSeatStatus): string => {
  switch (status) {
    case "active":
      return "border-emerald-200/80 bg-emerald-50 text-emerald-900";
    case "pending":
      return "border-amber-200/80 bg-amber-50 text-amber-950";
    case "disabled":
      return "border-stone-300/80 bg-stone-100 text-stone-800";
    case "removed":
      return "border-rose-200/80 bg-rose-50 text-rose-900";
    default:
      return "border-stone-200/80 bg-stone-50 text-stone-800";
  }
};

/** Shared constant or class token for company subscriptions presentation. */
export const seatDisplayName = (seat: {
  employeeDisplayName?: string | null;
  displayName: string | null;
  email: string | null;
}): string =>
  seat.employeeDisplayName?.trim() || seat.displayName?.trim() || seat.email?.trim() || "Unassigned";

/** Seats table: display name, middle dot, email on one line. */
export const seatHolderOverviewLabel = (seat: {
  employeeDisplayName?: string | null;
  displayName: string | null;
  email: string | null;
}): string => {
  const name =
    seat.displayName?.trim() || seat.employeeDisplayName?.trim() || "Unassigned";
  const email = seat.email?.trim();
  return email ? `${name} · ${email}` : name;
};

/** Shared constant or class token for company subscriptions presentation. */
export const cadenceLabel = (row: {
  cadenceKind: CompanySubscriptionCadenceKind;
  cadenceIntervalCount: number | null;
  cadenceIntervalUnit: string | null;
}) => {
  if (row.cadenceKind === "custom" && row.cadenceIntervalCount && row.cadenceIntervalUnit) {
    return `Every ${row.cadenceIntervalCount} ${row.cadenceIntervalUnit}${row.cadenceIntervalCount === 1 ? "" : "s"}`;
  }
  return row.cadenceKind.charAt(0).toUpperCase() + row.cadenceKind.slice(1);
};

/** Clear provider-level billing when switching to seated. */
export const clearedProviderBillingFormFields = (): {
  contractStartDate: string;
  renewalDate: string;
  contractEndDate: string;
  amountMajor: string;
  cadenceKind: CompanySubscriptionCadenceKind;
  cadenceIntervalCount: string;
  cadenceIntervalUnit: CompanySubscriptionCadenceUnit;
} => ({
  contractStartDate: "",
  renewalDate: "",
  contractEndDate: "",
  amountMajor: "",
  cadenceKind: "monthly",
  cadenceIntervalCount: "1",
  cadenceIntervalUnit: "month"
});

type ProviderCadenceFormSlice = {
  cadenceKind: CompanySubscriptionCadenceKind;
  cadenceIntervalCount: string;
  cadenceIntervalUnit: CompanySubscriptionCadenceUnit;
  contractStartDate?: string;
};

type SingularProviderBillingFields = {
  contractStartDate: string;
  renewalDate: string;
  contractEndDate: string;
  cadenceKind: CompanySubscriptionCadenceKind;
  cadenceIntervalCount: string;
  cadenceIntervalUnit: CompanySubscriptionCadenceUnit;
};

/** Singular provider billing defaults: contract start today, renewal/end from cadence. */
export const defaultSingularProviderBillingFields = (
  cadence: ProviderCadenceFormSlice = {
    cadenceKind: "monthly",
    cadenceIntervalCount: "1",
    cadenceIntervalUnit: "month"
  }
): SingularProviderBillingFields => {
  const dates = defaultBillingPeriodDatesFromToday({
    cadenceKind: cadence.cadenceKind,
    cadenceIntervalCount: cadence.cadenceIntervalCount,
    cadenceIntervalUnit: cadence.cadenceIntervalUnit
  });
  return {
    contractStartDate: dates.start,
    renewalDate: dates.renewalDate,
    contractEndDate: dates.endDate,
    cadenceKind: cadence.cadenceKind,
    cadenceIntervalCount: cadence.cadenceIntervalCount,
    cadenceIntervalUnit: cadence.cadenceIntervalUnit
  };
};

/** Shared constant or class token for company subscriptions presentation. */
export const patchForProviderSubscriptionKind = (
  kind: CompanySubscriptionKind,
  current?: ProviderCadenceFormSlice
) => {
  if (isSeatedCompanySubscription(kind)) {
    return { subscriptionKind: kind, ...clearedProviderBillingFormFields() };
  }
  const keepExistingStart = Boolean(current?.contractStartDate?.trim());
  return {
    subscriptionKind: kind,
    ...(keepExistingStart
      ? {}
      : defaultSingularProviderBillingFields(
          current ?? { cadenceKind: "monthly", cadenceIntervalCount: "1", cadenceIntervalUnit: "month" }
        ))
  };
};

/** Build provider create/patch JSON; validates singular cost when applicable. */
export const buildProviderSaveBody = (
  values: {
    name: string;
    subscriptionKind: CompanySubscriptionKind;
    vendorName: string;
    category: string;
    description: string;
    status: CompanySubscriptionStatus;
    contractStartDate: string;
    renewalDate: string;
    contractEndDate: string;
    cadenceKind: CompanySubscriptionCadenceKind;
    cadenceIntervalCount: string;
    cadenceIntervalUnit: string;
    amountMajor: string;
    currencyCode: string;
    notes: string;
  },
  currencyFormat: CurrencyFormatId | null
): { body: Record<string, unknown> } | { error: string } => {
  const isSingular = isSingularCompanySubscription(values.subscriptionKind);
  let amountMinor: number | null = null;
  if (isSingular) {
    const parsed = parseAmountMajorToMinor(values.amountMajor, currencyFormat);
    if (parsed === "invalid") return { error: "Enter a valid cost amount." };
    amountMinor = parsed;
  }

  const body: Record<string, unknown> = {
    name: values.name.trim(),
    subscriptionKind: values.subscriptionKind,
    vendorName: values.vendorName.trim() || null,
    category: values.category.trim() || null,
    description: values.description.trim() || null,
    status: values.status,
    currencyCode: values.currencyCode.trim().toUpperCase() || null,
    notes: values.notes.trim() || null,
    contractStartDate: isSingular ? values.contractStartDate.trim() || null : null,
    renewalDate: isSingular ? values.renewalDate.trim() || null : null,
    contractEndDate: isSingular ? values.contractEndDate.trim() || null : null,
    cadenceKind: isSingular ? values.cadenceKind : "monthly",
    amountMinor: isSingular ? amountMinor : null
  };

  if (isSingular && values.cadenceKind === "custom") {
    const count = Number.parseInt(values.cadenceIntervalCount, 10);
    if (!Number.isFinite(count) || count < 1) {
      return { error: "Custom cadence requires a valid interval count." };
    }
    body.cadenceIntervalCount = count;
    body.cadenceIntervalUnit = values.cadenceIntervalUnit;
  } else if (isSingular) {
    body.cadenceIntervalCount = null;
    body.cadenceIntervalUnit = null;
  } else {
    body.cadenceIntervalCount = null;
    body.cadenceIntervalUnit = null;
  }

  return { body };
};

/** Overview table: vendor, middle dot, subscription name. */
export const providerOverviewLabel = (
  vendorName: string | null | undefined,
  name: string
): string => {
  const vendor = vendorName?.trim();
  const subscription = name.trim() || "—";
  return vendor ? `${vendor} · ${subscription}` : subscription;
};

/** Shared constant or class token for company subscriptions presentation. */
export const parseAmountMajorToMinor = (
  major: string,
  currencyFormat: CurrencyFormatId | null
): number | null | "invalid" => {
  const trimmed = major.trim();
  if (trimmed === "") return null;
  const minor = parseLocalizedMajorToMinor(trimmed, currencyFormat);
  if (minor == null || minor < 0) return "invalid";
  return minor;
};

/** Shared constant or class token for company subscriptions presentation. */
export const amountMinorToFormMajorString = (
  minor: number | null | undefined,
  locale: string,
  currencyFormat: CurrencyFormatId | null
): string => {
  if (minor == null) return "";
  return formatAmountMajorForInput(minor / 100, locale, currencyFormat);
};

export { readApiErrorMessage };
