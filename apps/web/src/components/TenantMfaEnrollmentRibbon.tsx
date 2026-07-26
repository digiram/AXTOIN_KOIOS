/**
 * TenantMfaEnrollmentRibbon
 *
 * Warning ribbon under the shell header when MFA enrollment is required or overdue.
 *
 * Responsibilities:
 * - Fetch realm MFA status for the signed-in tenant user
 * - Show grace-period or blocked messaging with link to Security settings
 * - Hide on the settings route to avoid duplicate prompts
 *
 * Related:
 * - `AppShell`; account Security tab (`?tab=security`)
 *
 * Security:
 * - Reads MFA status only — enrollment changes happen on the settings page.
 */
import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import type { AuthContextValue } from "../auth/AuthContext.js";
import { useUserDisplayDatetime } from "../hooks/useUserDisplayDatetime.js";
import { API_BASE_URL } from "../lib/api.js";

type MfaStatus = {
  applicable?: boolean;
  platformMfaEnabled?: boolean;
  tenantMfaEnforced?: boolean;
  totpEnabled?: boolean;
  emailMfaEnabled?: boolean;
  mfaGraceExpiresAt?: string | null;
  mfaBlockedAt?: string | null;
};

type RibbonAuth = Pick<
  AuthContextValue,
  "ready" | "user" | "getAccessToken" | "refreshSession" | "logout"
>;

type Props = {
  /** Account settings route (e.g. `/admin/settings`); Security tab is opened via `?tab=security`. */
  settingsTo: string;
  /** Session slice from `AppShell` (avoids a second `useContext` inside the shell render-prop subtree). */
  auth: RibbonAuth;
};

/**
 * Full-width warning ribbon under the shell title when the tenant enforces MFA and the signed-in
 * realm user has not completed enrollment (or is blocked).
 */
export const TenantMfaEnrollmentRibbon = ({ settingsTo, auth }: Props) => {
  const { pathname } = useLocation();
  const { user, ready, getAccessToken, refreshSession, logout } = auth;
  const { formatDateTime } = useUserDisplayDatetime();
  const [status, setStatus] = useState<MfaStatus | null>(null);

  const authHeaders = useCallback(() => {
    const token = getAccessToken();
    const h: Record<string, string> = {};
    if (token) h.authorization = `Bearer ${token}`;
    return h;
  }, [getAccessToken]);

  const load = useCallback(async () => {
    if (!ready || !user?.tenantId) {
      setStatus(null);
      return;
    }
    try {
      let res = await fetch(`${API_BASE_URL}/account/mfa/status`, { headers: authHeaders() });
      if (res.status === 401) {
        if (!(await refreshSession())) {
          logout();
          return;
        }
        res = await fetch(`${API_BASE_URL}/account/mfa/status`, { headers: authHeaders() });
      }
      if (!res.ok) {
        setStatus(null);
        return;
      }
      setStatus((await res.json()) as MfaStatus);
    } catch {
      setStatus(null);
    }
  }, [authHeaders, logout, ready, refreshSession, user?.tenantId]);

  useEffect(() => {
    void load();
  }, [load, pathname]);

  if (!ready || !user?.tenantId) return null;
  if (!status?.applicable || !status.platformMfaEnabled || !status.tenantMfaEnforced) return null;

  const enrolled = Boolean(status.totpEnabled || status.emailMfaEnabled);
  if (enrolled) return null;

  const securitySettingsHref = `${settingsTo}?tab=security`;
  const grace = status.mfaGraceExpiresAt ? formatDateTime(status.mfaGraceExpiresAt) : null;
  const blocked = Boolean(status.mfaBlockedAt);

  return (
    <div
      role="status"
      className="border-t border-amber-200 bg-amber-50 px-[5%] py-2.5 text-sm leading-snug text-amber-950"
    >
      {blocked ? (
        <p>
          <span className="font-semibold">Multi-factor authentication is required</span> for your organization, but
          this account cannot complete setup right now. Ask a tenant administrator to restore access (for example with
          a new temporary password from Admin → Users).
        </p>
      ) : (
        <>
          <p>
            <span className="font-semibold">Set up multi-factor authentication.</span> Your organization requires MFA for
            sign-in.{" "}
            <Link to={securitySettingsHref} className="font-semibold text-amber-900 underline decoration-amber-700/50 underline-offset-2 hover:text-amber-950">
              Open Settings → Security
            </Link>{" "}
            to choose an authenticator app or email codes.
          </p>
          {grace ? <p className="mt-1.5 text-xs font-medium text-amber-900/90">Complete setup before: {grace}</p> : null}
        </>
      )}
    </div>
  );
};
