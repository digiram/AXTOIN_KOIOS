/**
 * Invoicing Api hook.
 *
 * React hook exposing authenticated tenant HTTP helpers for invoicing and quoting API routes.
 *
 * Responsibilities:
 * - Attach bearer token from auth context to fetch calls
 * - Centralize base URL and JSON error handling for invoicing and quoting screens
 *
 * Related:
 * - apps/api tenant invoicing routes
 *
 * Security:
 * - Tenant scope enforced server-side; hook only forwards the session token
 */
import { useCallback } from "react";

import { useAuth } from "../../auth/AuthContext.js";
import { API_BASE_URL } from "../../lib/api.js";

/** Hook for invoicing & quoting screens; see implementation for inputs and return shape. */
export const useInvoicingApi = () => {
  const { getAccessToken, refreshSession, logout } = useAuth();

  const authHeaders = useCallback(() => {
    const token = getAccessToken();
    const h: Record<string, string> = {};
    if (token) h.authorization = `Bearer ${token}`;
    return h;
  }, [getAccessToken]);

  const authedFetch = useCallback(
    async (path: string, init?: RequestInit) => {
      const url = path.startsWith("http") ? path : `${API_BASE_URL}${path}`;
      let res = await fetch(url, { ...init, headers: { ...authHeaders(), ...init?.headers } });
      if (res.status === 401) {
        const ok = await refreshSession();
        if (!ok) {
          logout();
          throw new Error("session_expired");
        }
        res = await fetch(url, { ...init, headers: { ...authHeaders(), ...init?.headers } });
      }
      return res;
    },
    [authHeaders, logout, refreshSession]
  );

  return { authedFetch };
};
