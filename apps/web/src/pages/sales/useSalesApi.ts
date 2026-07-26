/**
 * SalesApiHook.
 *
 * Authenticated fetch helper for tenant Sales funnel pages under `/admin/sales`.
 *
 * Responsibilities:
 * - Attach realm access JWT to Sales API requests
 * - Retry once after session refresh on 401
 *
 * Security:
 * - Tenant scope enforced server-side on `/v1/tenant/sales/*` routes
 */

import { useCallback } from "react";

import { useAuth } from "../../auth/AuthContext.js";

/**
 * Sales page hook for bearer-authenticated `fetch` with 401 refresh handling.
 *
 * @returns `authedFetch` that logs out when session refresh fails
 */
export const useSalesApi = () => {
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
