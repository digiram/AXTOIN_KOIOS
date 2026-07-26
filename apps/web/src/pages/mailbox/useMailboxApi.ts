/**
 * Mailbox Api hook.
 *
 * React hook exposing authenticated tenant HTTP helpers for mailbox API routes.
 *
 * Responsibilities:
 * - Attach bearer token from auth context to fetch calls
 * - Centralize base URL and JSON error handling for mailbox screens
 *
 * Related:
 * - apps/api tenant mailbox routes
 *
 * Security:
 * - Tenant scope enforced server-side; hook only forwards the session token
 */
import { useCallback } from "react";

import { useAuth } from "../../auth/AuthContext.js";
import { API_BASE_URL } from "../../lib/api.js";

/** Hook for mailbox screens; see implementation for inputs and return shape. */
export const useMailboxApi = () => {
  const { getAccessToken, refreshSession, logout } = useAuth();

  const authHeaders = useCallback(() => {
    const token = getAccessToken();
    const h: Record<string, string> = {};
    if (token) h.authorization = `Bearer ${token}`;
    return h;
  }, [getAccessToken]);

  const apiFetch = useCallback(
    async (path: string, init?: RequestInit) => {
      let res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers: { ...authHeaders(), ...init?.headers } });
      if (res.status === 401) {
        const ok = await refreshSession();
        if (!ok) {
          logout();
          throw new Error("session_expired");
        }
        res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers: { ...authHeaders(), ...init?.headers } });
      }
      return res;
    },
    [authHeaders, logout, refreshSession]
  );

  return { apiFetch, authHeaders };
};
