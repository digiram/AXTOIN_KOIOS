/**
 * CrmApiHook.
 *
 * Shared authenticated fetch helpers for tenant CRM pages under `/admin/crm` and `/user/crm`.
 *
 * Responsibilities:
 * - Attach realm access JWT to CRM API requests
 * - Retry once after session refresh on 401
 * - Log out when refresh fails
 *
 * Security:
 * - Tenant scope is enforced server-side; callers must use `/v1/tenant/crm/*` routes only
 */

import { useCallback } from "react";

import { useAuth } from "../../auth/AuthContext.js";

/**
 * CRM page hook wrapping `useAuth` for bearer headers and 401-safe `fetch`.
 *
 * @returns `authHeaders`, `authedFetch`, `refreshSession`, and `logout` from the auth context
 */
export const useCrmApi = () => {
  const { getAccessToken, refreshSession, logout } = useAuth();

  const authHeaders = useCallback((): Record<string, string> => {
    const token = getAccessToken();
    return token ? { authorization: `Bearer ${token}` } : {};
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

  return { authHeaders, authedFetch, refreshSession, logout };
};
