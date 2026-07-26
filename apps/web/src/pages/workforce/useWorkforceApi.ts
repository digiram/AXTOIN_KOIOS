/**
 * WorkforceApiHook.
 *
 * Authenticated fetch helper for tenant workforce pages under `/admin/workforce`.
 *
 * Responsibilities:
 * - Attach realm access JWT to workforce API requests
 * - Retry once after session refresh on 401
 *
 * Security:
 * - Tenant scope enforced server-side on `/v1/tenant/workforce/*` routes
 */

import { useCallback } from "react";

import { useAuth } from "../../auth/AuthContext.js";

/**
 * Authenticated fetch for `/tenant/workforce/*` (tenant admin + HRM gate on mutating routes).
 *
 * @returns `authHeaders`, `authedFetch`, `refreshSession`, and `logout`
 */
export const useWorkforceApi = () => {
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
          return null;
        }
        res = await fetch(url, { ...init, headers: { ...authHeaders(), ...init?.headers } });
      }
      return res;
    },
    [authHeaders, refreshSession]
  );

  return { authHeaders, authedFetch, refreshSession, logout };
};
