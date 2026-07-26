/**
 * Company Subscriptions Api hook.
 *
 * React hook exposing authenticated tenant HTTP helpers for company subscriptions API routes.
 *
 * Responsibilities:
 * - Attach bearer token from auth context to fetch calls
 * - Centralize base URL and JSON error handling for company subscriptions screens
 *
 * Related:
 * - apps/api tenant company routes
 *
 * Security:
 * - Tenant scope enforced server-side; hook only forwards the session token
 */
import type {
  CompanySubscriptionCadenceKind,
  CompanySubscriptionKind,
  CompanySubscriptionSeatStatus,
  CompanySubscriptionStatus
} from "@starter/shared";
import { useCallback } from "react";

import { useAuth } from "../../auth/AuthContext.js";
import { API_BASE_URL } from "../../lib/api.js";

/** React component for company subscriptions UI. */
export const COMPANY_SUBSCRIPTIONS_API = `${API_BASE_URL}/tenant/company-subscriptions`;

/** React component for company subscriptions UI. */
export type CompanySubscriptionBillingMetadata = {
  paymentMethodRef?: string | null;
  bankAccountRef?: string | null;
  costCenter?: string | null;
  purchaseOwner?: string | null;
  procurementContact?: string | null;
  vendorAccountNumber?: string | null;
  renewalOwner?: string | null;
};

/** React component for company subscriptions UI. */
export type CompanySubscriptionProviderRow = {
  id: string;
  name: string;
  vendorName: string | null;
  category: string | null;
  description: string | null;
  status: CompanySubscriptionStatus;
  subscriptionKind: CompanySubscriptionKind;
  ownerEmployeeId: string | null;
  ownerEmployeeName?: string | null;
  renewalDate: string | null;
  contractStartDate: string | null;
  contractEndDate: string | null;
  cadenceKind: CompanySubscriptionCadenceKind;
  cadenceIntervalCount: number | null;
  cadenceIntervalUnit: string | null;
  amountMinor: number | null;
  currencyCode: string | null;
  billingMetadata?: CompanySubscriptionBillingMetadata | null;
  notes: string | null;
  planCount?: number;
  seatCount?: number;
  /** Estimated monthly recurring cost (singular: provider; seated: sum of plans). */
  monthlyCostMinor?: number | null;
  createdAt: string;
  updatedAt: string;
};

/** React component for company subscriptions UI. */
export type CompanySubscriptionPlanRow = {
  id: string;
  providerId: string;
  name: string;
  sku: string | null;
  seatCount: number | null;
  amountMinor: number | null;
  currencyCode: string | null;
  cadenceKind: CompanySubscriptionCadenceKind;
  cadenceIntervalCount: number | null;
  cadenceIntervalUnit: string | null;
  startDate: string | null;
  endDate: string | null;
  renewalDate: string | null;
  autoRenew: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

/** React component for company subscriptions UI. */
export type CompanySubscriptionSeatRow = {
  id: string;
  planId: string;
  employeeId: string | null;
  employeeDisplayName?: string | null;
  displayName: string | null;
  email: string | null;
  seatType: string | null;
  status: CompanySubscriptionSeatStatus;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

/** React component for company subscriptions UI. */
export type CompanySubscriptionProviderDocumentRow = {
  id: string;
  providerId: string;
  title: string;
  originalFilename: string;
  mimeType: string | null;
  byteSize: number;
  createdAt: string;
};

/** React component for company subscriptions UI. */
export type DashboardSummaryResponse = {
  activeCount: number;
  totalSeats: number;
  upcomingRenewals: number;
  expiringSoon: number;
  estimatedRecurringCostMinor: number;
  currencyCode: string;
};

/** React component for company subscriptions UI. */
export type ProvidersListResponse = {
  providers: CompanySubscriptionProviderRow[];
  total: number;
};

/** React component for company subscriptions UI. */
export type ProviderDetailResponse = {
  provider: CompanySubscriptionProviderRow;
  plans: { plan: CompanySubscriptionPlanRow; seats: CompanySubscriptionSeatRow[] }[];
};

/** Authenticated fetch for `/tenant/company-subscriptions/*`. */
export const useCompanySubscriptionsApi = () => {
  const { getAccessToken, refreshSession, logout } = useAuth();

  const authHeaders = useCallback(() => {
    const token = getAccessToken();
    const h: Record<string, string> = {};
    if (token) h.authorization = `Bearer ${token}`;
    return h;
  }, [getAccessToken]);

  const authedFetch = useCallback(
    async (url: string, init?: RequestInit) => {
      let res = await fetch(url, { ...init, headers: { ...authHeaders(), ...init?.headers } });
      if (res.status === 401) {
        const ok = await refreshSession();
        if (!ok) {
          logout();
          return null;
        }
        res = await fetch(url, { ...init, headers: { ...authHeaders(), ...init?.headers } });
      }
      return res;
    },
    [authHeaders, logout, refreshSession]
  );

  return { authedFetch };
};
