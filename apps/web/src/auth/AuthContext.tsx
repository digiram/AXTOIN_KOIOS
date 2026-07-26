/**
 * Browser session: access JWT in memory only; refresh via HttpOnly cookie (production default) or sessionStorage (dev).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";

import { parseModuleRolesClaim, type TenantModuleRolesMap, type UserRole } from "@starter/shared";

import {
  API_BASE_URL,
  API_SAME_ORIGIN,
  formatApiUnreachableMessage,
  refreshTokenInCookieEnabled,
  withApiFetchInit
} from "../lib/api.js";
import { isLikelyFetchNetworkError } from "../lib/fetch-network-error.js";
import {
  clearStoredTokens,
  consumeLegacyStoredAccessToken,
  getMemoryAccessToken,
  getStoredRefreshToken,
  persistTokens
} from "./auth-token-storage.js";
import {
  decodeAccessPayload,
  isAccessTokenExpired,
  normalizeRole
} from "../lib/jwt.js";

export type SessionUser = {
  sub: string;
  /** Undefined for platform super-admin sessions (no realm). */
  tenantId?: string;
  email: string;
  role: UserRole;
  /** Per-module roles from access JWT (`mr` claim); tenant admins omit — treated as Manager in shared helpers. */
  moduleRoles?: TenantModuleRolesMap;
};

/** Password step succeeded; either session is established or MFA is required. */
export type AuthCredentialsResult =
  | { kind: "ok"; role: UserRole }
  | {
      kind: "mfa_required";
      mfaTicket: string;
      methods: ("totp" | "email")[];
      tenantId: string;
      role: UserRole;
    };

export type AuthContextValue = {
  ready: boolean;
  user: SessionUser | null;
  /** Last-known tenant id from signup/login API responses (e.g. deep links); not shown on the login form. */
  lastTenantId: string;
  login: (input: { email: string; password: string }) => Promise<AuthCredentialsResult>;
  registerStart: (input: {
    name: string;
    email: string;
    password: string;
  }) => Promise<{ registrationTicket: string; verificationCode?: string; emailed: boolean }>;
  registerVerify: (input: { registrationTicket: string; code: string }) => Promise<AuthCredentialsResult>;
  completeMfaLogin: (input: {
    mfaTicket: string;
    method: "totp" | "email";
    code: string;
  }) => Promise<UserRole>;
  logout: () => void | Promise<void>;
  refreshSession: () => Promise<boolean>;
  getAccessToken: () => string | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const userFromAccessToken = (accessToken: string): SessionUser | null => {
  const p = decodeAccessPayload(accessToken);
  if (!p?.sub || !p.email) return null;
  const role = normalizeRole(p.role);
  if (role === "super_admin") {
    return { sub: p.sub, email: p.email, role };
  }
  if (!p.tenantId) return null;
  return {
    sub: p.sub,
    tenantId: p.tenantId,
    email: p.email,
    role,
    moduleRoles: parseModuleRolesClaim(p.mr)
  };
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [lastTenantId, setLastTenantId] = useState("");

  const logout = useCallback(async () => {
    try {
      await fetch(
        `${API_BASE_URL}/auth/logout`,
        withApiFetchInit({
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({})
        })
      );
    } catch {
      /* best-effort server revoke */
    }
    clearStoredTokens();
    setUser(null);
    setLastTenantId("");
  }, []);

  const refreshInFlightRef = useRef<Promise<boolean> | null>(null);

  const refreshSession = useCallback(async (): Promise<boolean> => {
    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current;
    }

    const run = (async (): Promise<boolean> => {
      const refreshToken = getStoredRefreshToken();
      if (!refreshToken && !refreshTokenInCookieEnabled()) return false;
      try {
        const response = await fetch(
          `${API_BASE_URL}/auth/refresh`,
          withApiFetchInit({
            method: "POST",
            headers: { "content-type": "application/json" },
            body: refreshTokenInCookieEnabled() ? undefined : JSON.stringify({ refreshToken })
          })
        );
        if (!response.ok) {
          logout();
          return false;
        }
        const data = (await response.json()) as {
          accessToken: string;
          refreshToken: string;
          tenantId?: string;
        };
        persistTokens(data.accessToken, data.refreshToken ?? refreshToken ?? "");
        const next = userFromAccessToken(data.accessToken);
        if (next) setUser(next);
        if (data.tenantId) setLastTenantId(data.tenantId);
        else setLastTenantId("");
        return true;
      } catch {
        /** Down API, DNS, CORS, or malformed JSON — avoid uncaught `TypeError: Failed to fetch`. */
        logout();
        return false;
      }
    })();

    refreshInFlightRef.current = run;
    try {
      return await run;
    } finally {
      if (refreshInFlightRef.current === run) {
        refreshInFlightRef.current = null;
      }
    }
  }, [logout]);

  useEffect(() => {
    const boot = async () => {
      try {
        const legacyAccess = consumeLegacyStoredAccessToken();
        const memoryAccess = getMemoryAccessToken();
        const access = memoryAccess ?? legacyAccess;
        const refresh = getStoredRefreshToken();

        if (access && !isAccessTokenExpired(access)) {
          persistTokens(access, refresh ?? "");
          const u = userFromAccessToken(access);
          if (u) setUser(u);
          return;
        }

        if (refresh || refreshTokenInCookieEnabled()) {
          await refreshSession();
        }
      } catch {
        /* `refreshSession` already handles fetch errors; guard stray throws */
      } finally {
        setReady(true);
      }
    };
    void boot();
  }, [refreshSession]);

  const applyTokenResponse = useCallback(
    (data: { accessToken: string; refreshToken?: string; tenantId?: string }) => {
      const storedRefresh = data.refreshToken ?? getStoredRefreshToken() ?? "";
      persistTokens(data.accessToken, storedRefresh);
      if (data.tenantId) setLastTenantId(data.tenantId);
      else setLastTenantId("");
      const u = userFromAccessToken(data.accessToken);
      if (!u) throw new Error("Invalid token");
      setUser(u);
      return u.role;
    },
    []
  );

  const login = useCallback(
    async (input: { email: string; password: string }): Promise<AuthCredentialsResult> => {
      let response: Response;
      try {
        response = await fetch(
          `${API_BASE_URL}/auth/login`,
          withApiFetchInit({
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email: input.email, password: input.password })
          })
        );
      } catch (e) {
        if (import.meta.env.DEV && isLikelyFetchNetworkError(e)) {
          throw new Error(formatApiUnreachableMessage(API_BASE_URL));
        }
        throw e;
      }
      if (!response.ok) {
        if (import.meta.env.DEV && API_SAME_ORIGIN && [502, 504].includes(response.status)) {
          throw new Error(formatApiUnreachableMessage(API_BASE_URL, response.status));
        }
        throw new Error("Login failed");
      }
      const data = (await response.json()) as {
        step?: string;
        mfaTicket?: string;
        methods?: ("totp" | "email")[];
        tenantId?: string;
        role?: string;
        accessToken?: string;
        refreshToken?: string;
      };
      if (data.step === "mfa_required" && data.mfaTicket && data.tenantId && data.role) {
        const methods = (data.methods ?? ["totp"]) as ("totp" | "email")[];
        return {
          kind: "mfa_required",
          mfaTicket: data.mfaTicket,
          methods,
          tenantId: data.tenantId,
          role: normalizeRole(data.role)
        };
      }
      if (!data.accessToken || (!data.refreshToken && !refreshTokenInCookieEnabled())) {
        throw new Error("Invalid login response");
      }
      const role = applyTokenResponse({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        tenantId: data.tenantId
      });
      return { kind: "ok", role };
    },
    [applyTokenResponse]
  );

  const parseAuthCompletion = useCallback(
    (data: {
      step?: string;
      mfaTicket?: string;
      methods?: ("totp" | "email")[];
      tenantId?: string;
      role?: string;
      accessToken?: string;
      refreshToken?: string;
    }): AuthCredentialsResult => {
      if (data.step === "mfa_required" && data.mfaTicket && data.tenantId && data.role) {
        const methods = (data.methods ?? ["totp"]) as ("totp" | "email")[];
        return {
          kind: "mfa_required",
          mfaTicket: data.mfaTicket,
          methods,
          tenantId: data.tenantId,
          role: normalizeRole(data.role)
        };
      }
      if (!data.accessToken || (!data.refreshToken && !refreshTokenInCookieEnabled()) || !data.tenantId) {
        throw new Error("Invalid registration response");
      }
      const role = applyTokenResponse({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        tenantId: data.tenantId
      });
      return { kind: "ok", role };
    },
    [applyTokenResponse]
  );

  const registerStart = useCallback(
    async (input: { name: string; email: string; password: string }) => {
      let response: Response;
      try {
        response = await fetch(
          `${API_BASE_URL}/auth/register/start`,
          withApiFetchInit({
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(input)
          })
        );
      } catch (e) {
        if (import.meta.env.DEV && isLikelyFetchNetworkError(e)) {
          throw new Error(formatApiUnreachableMessage(API_BASE_URL));
        }
        throw e;
      }
      if (!response.ok) {
        const err = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(err?.message ?? "Could not start registration");
      }
      const data = (await response.json()) as {
        registrationTicket: string;
        verificationCode?: string;
        emailed: boolean;
      };
      return data;
    },
    []
  );

  const registerVerify = useCallback(
    async (input: { registrationTicket: string; code: string }): Promise<AuthCredentialsResult> => {
      let response: Response;
      try {
        response = await fetch(
          `${API_BASE_URL}/auth/register/verify`,
          withApiFetchInit({
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(input)
          })
        );
      } catch (e) {
        if (import.meta.env.DEV && isLikelyFetchNetworkError(e)) {
          throw new Error(formatApiUnreachableMessage(API_BASE_URL));
        }
        throw e;
      }
      if (!response.ok) {
        const err = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(err?.message ?? "Verification failed");
      }
      return parseAuthCompletion((await response.json()) as Parameters<typeof parseAuthCompletion>[0]);
    },
    [parseAuthCompletion]
  );

  const completeMfaLogin = useCallback(
    async (input: { mfaTicket: string; method: "totp" | "email"; code: string }): Promise<UserRole> => {
      let response: Response;
      try {
        response = await fetch(
          `${API_BASE_URL}/auth/mfa/verify`,
          withApiFetchInit({
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              mfaTicket: input.mfaTicket,
              method: input.method,
              code: input.code
            })
          })
        );
      } catch (e) {
        if (import.meta.env.DEV && isLikelyFetchNetworkError(e)) {
          throw new Error(formatApiUnreachableMessage(API_BASE_URL));
        }
        throw e;
      }
      if (!response.ok) {
        if (import.meta.env.DEV && API_SAME_ORIGIN && [502, 504].includes(response.status)) {
          throw new Error(formatApiUnreachableMessage(API_BASE_URL, response.status));
        }
        const err = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(err?.message ?? "Verification failed");
      }
      const data = (await response.json()) as {
        accessToken: string;
        refreshToken: string;
        tenantId?: string;
      };
      return applyTokenResponse(data);
    },
    [applyTokenResponse]
  );

  const getAccessToken = useCallback(() => getMemoryAccessToken(), []);

  const value = useMemo(
    () => ({
      ready,
      user,
      lastTenantId,
      login,
      registerStart,
      registerVerify,
      completeMfaLogin,
      logout,
      refreshSession,
      getAccessToken
    }),
    [
      ready,
      user,
      lastTenantId,
      login,
      registerStart,
      registerVerify,
      completeMfaLogin,
      logout,
      refreshSession,
      getAccessToken
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
};
