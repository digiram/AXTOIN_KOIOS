/**
 * Security Settings panel.
 *
 * Settings or detail panel segment within account settings admin screens.
 *
 * Responsibilities:
 * - Render a subsection of configuration or read-only detail
 * - Persist changes through tenant API where editable
 *
 * Related:
 * - Route: /admin/settings
 *
 * Security:
 * - Editable fields require appropriate tenant admin or module role
 */
import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";

import { useAuth } from "../../auth/AuthContext.js";
import { authFieldClass, authLabelClass } from "../../components/auth/fieldStyles.js";
import { useUserDisplayDatetime } from "../../hooks/useUserDisplayDatetime.js";
import { API_BASE_URL } from "../../lib/api.js";

type MfaStatus = {
  applicable: boolean;
  platformOperator?: boolean;
  platformMfaEnabled?: boolean;
  tenantMfaEnforced?: boolean;
  totpEnabled?: boolean;
  emailMfaEnabled?: boolean;
  mfaGraceExpiresAt?: string | null;
  mfaBlockedAt?: string | null;
};

/** Panel segment within account settings settings or detail screens. */
export const SecuritySettingsPanel = () => {
  const { getAccessToken, refreshSession, logout } = useAuth();
  const { formatDateTime } = useUserDisplayDatetime();
  const authHeaders = useCallback(() => {
    const token = getAccessToken();
    const h: Record<string, string> = {};
    if (token) h.authorization = `Bearer ${token}`;
    return h;
  }, [getAccessToken]);

  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [setupChoice, setSetupChoice] = useState<"totp" | "email">("totp");
  const [totpSecret, setTotpSecret] = useState<string | null>(null);
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [totpBusy, setTotpBusy] = useState(false);
  const [totpMsg, setTotpMsg] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState("");
  const [disableBusy, setDisableBusy] = useState(false);

  const load = useCallback(async () => {
    setLoadErr("");
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
        setLoadErr("Could not load security settings.");
        return;
      }
      const j = (await res.json()) as MfaStatus;
      setStatus(j);
    } catch {
      setLoadErr("Could not load security settings.");
    }
  }, [authHeaders, logout, refreshSession]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!otpauthUrl) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(otpauthUrl, { margin: 2, width: 208, errorCorrectionLevel: "M" })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [otpauthUrl]);

  if (loadErr) {
    return <p className="text-sm text-rose-600">{loadErr}</p>;
  }
  if (!status?.applicable) {
    return (
      <p className="text-sm text-slate-600">
        Multi-factor authentication is not available for this account type.
      </p>
    );
  }
  if (!status.platformOperator && !status.platformMfaEnabled) {
    return (
      <p className="text-sm text-slate-600">
        MFA is not enabled for this deployment. A platform operator can turn the feature on under Super admin →
        Features.
      </p>
    );
  }

  const enrolled = Boolean(status.totpEnabled || status.emailMfaEnabled);

  const setChoice = (c: "totp" | "email") => {
    setSetupChoice(c);
    setTotpMsg("");
    setEmailMsg("");
    if (c === "email") {
      setTotpSecret(null);
      setOtpauthUrl(null);
      setTotpCode("");
    } else {
      setEmailCode("");
    }
  };

  const beginTotp = async () => {
    setTotpMsg("");
    setTotpBusy(true);
    try {
      const postBegin = () =>
        fetch(`${API_BASE_URL}/account/mfa/totp/begin`, {
          method: "POST",
          headers: { ...authHeaders(), "content-type": "application/json" },
          body: "{}"
        });
      let res = await postBegin();
      if (res.status === 401) {
        if (!(await refreshSession())) {
          logout();
          return;
        }
        res = await postBegin();
      }
      const j = (await res.json().catch(() => null)) as { secret?: string; otpauthUrl?: string; message?: string } | null;
      if (!res.ok) {
        setTotpMsg(j?.message ?? "Could not start authenticator setup.");
        return;
      }
      setTotpSecret(j?.secret ?? null);
      setOtpauthUrl(j?.otpauthUrl ?? null);
      setTotpMsg("Scan the barcode with your authenticator app, then enter a 6-digit code to confirm.");
    } catch {
      setTotpMsg("Could not start authenticator setup.");
    } finally {
      setTotpBusy(false);
    }
  };

  const verifyTotp = async () => {
    setTotpMsg("");
    setTotpBusy(true);
    try {
      let res = await fetch(`${API_BASE_URL}/account/mfa/totp/verify`, {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({ code: totpCode.trim() })
      });
      if (res.status === 401) {
        if (!(await refreshSession())) {
          logout();
          return;
        }
        res = await fetch(`${API_BASE_URL}/account/mfa/totp/verify`, {
          method: "POST",
          headers: { ...authHeaders(), "content-type": "application/json" },
          body: JSON.stringify({ code: totpCode.trim() })
        });
      }
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { message?: string } | null;
        setTotpMsg(j?.message ?? "Verification failed.");
        return;
      }
      setTotpSecret(null);
      setOtpauthUrl(null);
      setTotpCode("");
      setTotpMsg("Authenticator app is now your sign-in verification method.");
      await load();
    } catch {
      setTotpMsg("Verification failed.");
    } finally {
      setTotpBusy(false);
    }
  };

  const sendEmailSetup = async () => {
    setEmailMsg("");
    setEmailBusy(true);
    try {
      const postSendSetup = () =>
        fetch(`${API_BASE_URL}/account/mfa/email/send-setup`, {
          method: "POST",
          headers: { ...authHeaders(), "content-type": "application/json" },
          body: "{}"
        });
      let res = await postSendSetup();
      if (res.status === 401) {
        if (!(await refreshSession())) {
          logout();
          return;
        }
        res = await postSendSetup();
      }
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { message?: string } | null;
        setEmailMsg(j?.message ?? "Could not send email.");
        return;
      }
      setEmailMsg("If delivery is configured, a code was sent to your account email.");
    } catch {
      setEmailMsg("Could not send email.");
    } finally {
      setEmailBusy(false);
    }
  };

  const confirmEmailSetup = async () => {
    setEmailMsg("");
    setEmailBusy(true);
    try {
      let res = await fetch(`${API_BASE_URL}/account/mfa/email/confirm-setup`, {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({ code: emailCode.trim() })
      });
      if (res.status === 401) {
        if (!(await refreshSession())) {
          logout();
          return;
        }
        res = await fetch(`${API_BASE_URL}/account/mfa/email/confirm-setup`, {
          method: "POST",
          headers: { ...authHeaders(), "content-type": "application/json" },
          body: JSON.stringify({ code: emailCode.trim() })
        });
      }
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { message?: string } | null;
        setEmailMsg(j?.message ?? "Invalid code.");
        return;
      }
      setEmailCode("");
      setEmailMsg("Email codes are now your sign-in verification method.");
      await load();
    } catch {
      setEmailMsg("Invalid code.");
    } finally {
      setEmailBusy(false);
    }
  };

  const disableMfa = async () => {
    setDisableBusy(true);
    setTotpMsg("");
    setEmailMsg("");
    try {
      let res = await fetch(`${API_BASE_URL}/account/mfa`, { method: "DELETE", headers: authHeaders() });
      if (res.status === 401) {
        if (!(await refreshSession())) {
          logout();
          return;
        }
        res = await fetch(`${API_BASE_URL}/account/mfa`, { method: "DELETE", headers: authHeaders() });
      }
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { message?: string } | null;
        setTotpMsg(j?.message ?? "Could not turn off MFA.");
        return;
      }
      setTotpSecret(null);
      setOtpauthUrl(null);
      setTotpMsg("MFA has been turned off for this account. You can enroll again with one method below.");
      await load();
    } catch {
      setTotpMsg("Could not turn off MFA.");
    } finally {
      setDisableBusy(false);
    }
  };

  const grace = status.mfaGraceExpiresAt ? formatDateTime(status.mfaGraceExpiresAt) : null;
  const blocked = Boolean(status.mfaBlockedAt);
  const platformOp = Boolean(status.platformOperator);

  return (
    <div className="space-y-8 text-sm text-slate-700">
      {platformOp ? (
        <p className="text-xs text-slate-600">
          Optional extra protection for your platform operator account. MFA is off until you enroll here; sign-in only
          asks for a code after setup.
        </p>
      ) : null}
      {!platformOp && status.tenantMfaEnforced ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3 text-amber-950">
          <p className="font-semibold">MFA is required by your organization</p>
          <p className="mt-1 text-xs leading-relaxed text-amber-900/90">
            Complete setup before your grace period ends. After that, sign-in may be blocked until an administrator
            restores access.
          </p>
          {grace ? (
            <p className="mt-2 text-xs font-medium text-amber-900">Grace deadline: {grace}</p>
          ) : null}
          {blocked ? (
            <p className="mt-2 text-xs font-semibold text-rose-700">
              Your account is blocked pending MFA. Ask a tenant administrator to issue a new temporary password for your
              user from Admin → Users (that clears MFA so you can enroll again).
            </p>
          ) : null}
        </div>
      ) : null}

      <section>
        <h3 className="text-base font-semibold text-slate-900">Sign-in verification</h3>
        <p className="mt-1 text-xs text-slate-600">
          Choose one method: an authenticator app (TOTP) or one-time codes sent to your account email. Only one can be
          active at a time. To switch methods, turn MFA off (when allowed) and set up again.
        </p>

        {enrolled ? (
          <p className="mt-3 text-sm">
            Current method:{" "}
            <span className="font-medium text-slate-900">
              {status.totpEnabled ? "Authenticator app" : "Email codes"}
            </span>
          </p>
        ) : (
          <fieldset className="mt-4 space-y-2">
            <legend className="sr-only">Verification method</legend>
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm has-[:checked]:border-indigo-300 has-[:checked]:bg-indigo-50/50">
              <input
                type="radio"
                name="mfa-setup-method"
                className="mt-0.5 h-4 w-4 border-slate-300 text-indigo-600 focus:ring-indigo-600"
                checked={setupChoice === "totp"}
                onChange={() => setChoice("totp")}
              />
              <span>
                <span className="font-medium text-slate-900">Authenticator app</span>
                <span className="mt-0.5 block text-xs text-slate-600">
                  Google Authenticator, Microsoft Authenticator, 1Password, and similar TOTP apps.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm has-[:checked]:border-indigo-300 has-[:checked]:bg-indigo-50/50">
              <input
                type="radio"
                name="mfa-setup-method"
                className="mt-0.5 h-4 w-4 border-slate-300 text-indigo-600 focus:ring-indigo-600"
                checked={setupChoice === "email"}
                onChange={() => setChoice("email")}
              />
              <span>
                <span className="font-medium text-slate-900">Email codes</span>
                <span className="mt-0.5 block text-xs text-slate-600">Receive a code by email when you sign in.</span>
              </span>
            </label>
          </fieldset>
        )}

        {!enrolled && setupChoice === "totp" ? (
          <div className="mt-4 space-y-3">
            {!totpSecret ? (
              <button
                type="button"
                disabled={totpBusy}
                onClick={() => void beginTotp()}
                className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-900 hover:bg-indigo-100 disabled:opacity-50"
              >
                Start setup — show barcode
              </button>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-medium text-slate-700">Scan this barcode</p>
                <p className="mt-1 text-xs text-slate-600">Point your authenticator app at the square code.</p>
                <div className="mt-3 flex justify-center rounded-lg bg-white p-3 ring-1 ring-slate-200">
                  {qrDataUrl ? (
                    <img src={qrDataUrl} width={208} height={208} alt="Authenticator setup QR code" className="h-52 w-52" />
                  ) : (
                    <div className="flex h-52 w-52 items-center justify-center text-xs text-slate-500">Generating…</div>
                  )}
                </div>
                <details className="mt-4 rounded-md border border-slate-200 bg-white px-3 py-2">
                  <summary className="cursor-pointer text-xs font-semibold text-slate-800">
                    {"Can't scan? Enter key manually"}
                  </summary>
                  <p className="mt-2 text-xs text-slate-600">
                    In your app, choose manual entry and type this secret (spaces optional). Then use the 6-digit codes
                    it generates.
                  </p>
                  {totpSecret ? (
                    <p className="mt-2 break-all font-mono text-xs text-slate-900">{totpSecret}</p>
                  ) : null}
                </details>
                <label htmlFor="sec-totp-code" className={`${authLabelClass} mt-4`}>
                  6-digit code from the app
                </label>
                <input
                  id="sec-totp-code"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  className={authFieldClass}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                />
                <button
                  type="button"
                  disabled={totpBusy || totpCode.trim().length < 6}
                  onClick={() => void verifyTotp()}
                  className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  Confirm and turn on
                </button>
              </div>
            )}
          </div>
        ) : null}

        {!enrolled && setupChoice === "email" ? (
          <div className="mt-4 space-y-3">
            <button
              type="button"
              disabled={emailBusy}
              onClick={() => void sendEmailSetup()}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              Email me a setup code
            </button>
            <div>
              <label htmlFor="sec-email-code" className={authLabelClass}>
                Code from email
              </label>
              <input
                id="sec-email-code"
                value={emailCode}
                onChange={(e) => setEmailCode(e.target.value)}
                className={authFieldClass}
                inputMode="numeric"
              />
              <button
                type="button"
                disabled={emailBusy || emailCode.trim().length < 6}
                onClick={() => void confirmEmailSetup()}
                className="mt-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                Confirm and turn on
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {(totpMsg || emailMsg) && (
        <p className="text-sm text-slate-700" role="status">
          {totpMsg || emailMsg}
        </p>
      )}

      {enrolled ? (
        <section className="border-t border-slate-100 pt-6">
          <button
            type="button"
            disabled={disableBusy || status.tenantMfaEnforced}
            title={
              status.tenantMfaEnforced
                ? "Your organization requires MFA; you cannot turn it off while enforcement is on."
                : "Remove your current verification method"
            }
            onClick={() => void disableMfa()}
            className="rounded-lg border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Turn off MFA
          </button>
        </section>
      ) : null}
    </div>
  );
};
