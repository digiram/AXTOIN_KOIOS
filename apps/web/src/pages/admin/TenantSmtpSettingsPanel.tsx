/**
 * Tenant Smtp Settings panel.
 *
 * Settings or detail panel segment within tenant admin admin screens.
 *
 * Responsibilities:
 * - Render a subsection of configuration or read-only detail
 * - Persist changes through tenant API where editable
 *
 * Related:
 * - Route: /admin
 *
 * Security:
 * - Editable fields require appropriate tenant admin or module role
 */
import { Mail } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useAuth } from "../../auth/AuthContext.js";
import { Switch } from "../../components/Switch.js";
import { API_BASE_URL } from "../../lib/api.js";

type TenantSmtpResponse = {
  host: string;
  port: number;
  secure: boolean;
  username: string | null;
  hasPassword: boolean;
  fromName: string;
  fromEmail: string;
  smtpEnabled: boolean;
  configured: boolean;
  usingPlatformFallback: boolean;
  effectiveSource: "tenant" | "platform";
  updatedAt: string | null;
};

const inputClass =
  "w-full rounded-lg border border-stone-200/90 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/25";

/** Tenant system configuration — optional SMTP with platform fallback when host/from email are empty. */
export const TenantSmtpSettingsPanel = () => {
  const { getAccessToken, refreshSession, logout } = useAuth();
  const authHeaders = useCallback(() => {
    const token = getAccessToken();
    const h: Record<string, string> = {};
    if (token) h.authorization = `Bearer ${token}`;
    return h;
  }, [getAccessToken]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("587");
  const [secure, setSecure] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [hasPassword, setHasPassword] = useState(false);
  const [smtpEnabled, setSmtpEnabled] = useState(true);
  const [usingPlatformFallback, setUsingPlatformFallback] = useState(true);

  const [saveError, setSaveError] = useState("");
  const [saveOk, setSaveOk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toggleBusy, setToggleBusy] = useState(false);

  const [testTo, setTestTo] = useState("");
  const [testError, setTestError] = useState("");
  const [testOk, setTestOk] = useState(false);
  const [testing, setTesting] = useState(false);

  const applyResponse = (json: TenantSmtpResponse) => {
    setHost(json.host);
    setPort(String(json.port));
    setSecure(json.secure);
    setUsername(json.username ?? "");
    setFromName(json.fromName);
    setFromEmail(json.fromEmail);
    setHasPassword(json.hasPassword);
    setSmtpEnabled(json.smtpEnabled ?? true);
    setUsingPlatformFallback(json.usingPlatformFallback);
    setPassword("");
  };

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      let res = await fetch(`${API_BASE_URL}/tenant/mail/smtp`, { headers: authHeaders() });
      if (res.status === 401) {
        const ok = await refreshSession();
        if (!ok) {
          logout();
          return;
        }
        res = await fetch(`${API_BASE_URL}/tenant/mail/smtp`, { headers: authHeaders() });
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message ?? "Could not load SMTP settings.");
        return;
      }
      applyResponse((await res.json()) as TenantSmtpResponse);
    } catch {
      setError("Could not load SMTP settings.");
    } finally {
      setLoading(false);
    }
  }, [authHeaders, refreshSession, logout]);

  useEffect(() => {
    void load();
  }, [load]);

  const smtpPutPayload = (deliveryEnabled: boolean): Record<string, unknown> => ({
    host: host.trim(),
    port: Number(port) || 587,
    secure,
    username: username.trim() === "" ? null : username.trim(),
    fromName: fromName.trim(),
    fromEmail: fromEmail.trim(),
    smtpEnabled: deliveryEnabled
  });

  const saveSmtp = async (extra?: Record<string, unknown>) => {
    setSaveError("");
    setSaveOk(false);
    setSaving(true);
    try {
      const body = { ...smtpPutPayload(smtpEnabled), ...extra };
      let res = await fetch(`${API_BASE_URL}/tenant/mail/smtp`, {
        method: "PUT",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      if (res.status === 401) {
        const ok = await refreshSession();
        if (!ok) {
          logout();
          return;
        }
        res = await fetch(`${API_BASE_URL}/tenant/mail/smtp`, {
          method: "PUT",
          headers: { ...authHeaders(), "content-type": "application/json" },
          body: JSON.stringify(body)
        });
      }
      const j = (await res.json().catch(() => null)) as TenantSmtpResponse & { message?: string };
      if (!res.ok) {
        setSaveError(j?.message ?? "Could not save SMTP settings.");
        return;
      }
      applyResponse(j);
      setSaveOk(true);
      window.setTimeout(() => setSaveOk(false), 4000);
    } catch {
      setSaveError("Could not save SMTP settings.");
    } finally {
      setSaving(false);
    }
  };

  const toggleSmtpDelivery = async (next: boolean) => {
    const prev = smtpEnabled;
    setSmtpEnabled(next);
    setToggleBusy(true);
    setSaveError("");
    try {
      let res = await fetch(`${API_BASE_URL}/tenant/mail/smtp`, {
        method: "PUT",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify(smtpPutPayload(next))
      });
      if (res.status === 401) {
        const ok = await refreshSession();
        if (!ok) {
          logout();
          return;
        }
        res = await fetch(`${API_BASE_URL}/tenant/mail/smtp`, {
          method: "PUT",
          headers: { ...authHeaders(), "content-type": "application/json" },
          body: JSON.stringify(smtpPutPayload(next))
        });
      }
      const j = (await res.json().catch(() => null)) as TenantSmtpResponse & { message?: string };
      if (!res.ok) {
        setSmtpEnabled(prev);
        setSaveError(j?.message ?? "Could not update SMTP delivery.");
        return;
      }
      applyResponse(j);
    } catch {
      setSmtpEnabled(prev);
      setSaveError("Could not update SMTP delivery.");
    } finally {
      setToggleBusy(false);
    }
  };

  const sendTest = async () => {
    setTestError("");
    setTestOk(false);
    setTesting(true);
    try {
      let res = await fetch(`${API_BASE_URL}/tenant/mail/smtp/test`, {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({ to: testTo.trim() })
      });
      if (res.status === 401) {
        const ok = await refreshSession();
        if (!ok) {
          logout();
          return;
        }
        res = await fetch(`${API_BASE_URL}/tenant/mail/smtp/test`, {
          method: "POST",
          headers: { ...authHeaders(), "content-type": "application/json" },
          body: JSON.stringify({ to: testTo.trim() })
        });
      }
      const j = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) {
        setTestError(j?.message ?? "Test send failed.");
        return;
      }
      setTestOk(true);
      window.setTimeout(() => setTestOk(false), 4000);
    } catch {
      setTestError("Test send failed.");
    } finally {
      setTesting(false);
    }
  };

  const customConfigured = host.trim().length > 0;

  return (
    <div className="overflow-hidden rounded-xl border border-stone-200/90 bg-white shadow-sm ring-1 ring-slate-900/5">
      <div className="border-b border-stone-200/90 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-900 ring-1 ring-indigo-200/80">
            <Mail className="h-5 w-5" strokeWidth={2} aria-hidden />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-900">SMTP connection &amp; sender</h3>
            {usingPlatformFallback ? (
              <p className="mt-2 text-sm text-amber-900/90">
                Currently using <span className="font-semibold">platform SMTP</span> — save custom host and from email
                below to send from your own mail server.
              </p>
            ) : (
              <p className="mt-2 text-sm text-emerald-800">
                Using <span className="font-semibold">your organization&apos;s SMTP</span> for outbound mail.
              </p>
            )}
            {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
            {saveError ? <p className="mt-2 text-sm text-rose-600">{saveError}</p> : null}
            {saveOk ? (
              <p className="mt-2 text-sm text-emerald-700" role="status">
                SMTP settings saved.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-stretch">
        <div className="min-w-0 flex-1 p-4 sm:p-5">
          <h4 className="text-sm font-semibold text-slate-900">SMTP delivery</h4>
          <p className="mt-1 text-sm text-stone-600">
            Applies when you have configured a custom SMTP host. When disabled, tenant-scoped mail falls back to platform
            SMTP if available.
          </p>
        </div>
        <div className="mx-auto flex w-[8%] min-w-16 max-w-full shrink-0 items-center justify-center border-t border-stone-200/90 bg-stone-100 px-1 py-3 sm:mx-0 sm:flex-none sm:border-l sm:border-t-0 sm:px-1.5 sm:py-4">
          {loading || error ? null : (
            <Switch
              checked={smtpEnabled}
              disabled={toggleBusy || saving || !customConfigured}
              aria-busy={toggleBusy}
              aria-label={smtpEnabled ? "Custom SMTP delivery, on" : "Custom SMTP delivery, off"}
              onCheckedChange={(next) => void toggleSmtpDelivery(next)}
            />
          )}
        </div>
      </div>

      {loading ? (
        <p className="px-4 pb-5 text-sm text-stone-500 sm:px-5">Loading SMTP…</p>
      ) : error ? null : (
        <div className="space-y-4 border-t border-stone-100 px-4 pb-5 pt-4 sm:px-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="tenant-mail-smtp-host" className="mb-1.5 block text-xs font-medium text-stone-600">
                Host
              </label>
              <input
                id="tenant-mail-smtp-host"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                className={inputClass}
                placeholder="smtp.example.com (empty = platform default)"
                autoComplete="off"
              />
            </div>
            <div>
              <label htmlFor="tenant-mail-smtp-port" className="mb-1.5 block text-xs font-medium text-stone-600">
                Port
              </label>
              <input
                id="tenant-mail-smtp-port"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                className={inputClass}
                inputMode="numeric"
              />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-800">
                <input
                  type="checkbox"
                  checked={secure}
                  onChange={(e) => setSecure(e.target.checked)}
                  className="rounded border-stone-300 text-amber-700 focus:ring-amber-400"
                />
                Secure (SSL/TLS direct)
              </label>
            </div>
            <div>
              <label htmlFor="tenant-mail-smtp-user" className="mb-1.5 block text-xs font-medium text-stone-600">
                Username
              </label>
              <input
                id="tenant-mail-smtp-user"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={inputClass}
                autoComplete="off"
              />
            </div>
            <div>
              <label htmlFor="tenant-mail-smtp-pass" className="mb-1.5 block text-xs font-medium text-stone-600">
                Password
              </label>
              <input
                id="tenant-mail-smtp-pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
                placeholder={hasPassword ? "Leave blank to keep current" : "Optional"}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label htmlFor="tenant-mail-from-name" className="mb-1.5 block text-xs font-medium text-stone-600">
                From name
              </label>
              <input
                id="tenant-mail-from-name"
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="tenant-mail-from-email" className="mb-1.5 block text-xs font-medium text-stone-600">
                From email
              </label>
              <input
                id="tenant-mail-from-email"
                type="email"
                value={fromEmail}
                onChange={(e) => setFromEmail(e.target.value)}
                className={inputClass}
                autoComplete="off"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving || toggleBusy}
              onClick={() => void saveSmtp(password.trim() ? { password } : {})}
              className="rounded-lg border border-amber-300/80 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-950 shadow-sm hover:bg-amber-100 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save SMTP"}
            </button>
            {hasPassword ? (
              <button
                type="button"
                disabled={saving || toggleBusy}
                onClick={() => void saveSmtp({ password: "" })}
                className="rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-800 shadow-sm hover:bg-stone-50 disabled:opacity-50"
              >
                Clear saved password
              </button>
            ) : null}
          </div>

          <div className="border-t border-stone-100 pt-4">
            <h4 className="text-sm font-semibold text-stone-900">Send test email</h4>
            <p className="mt-1 text-xs text-stone-500">
              Uses your custom SMTP when configured; otherwise sends via the platform default.
            </p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <label htmlFor="tenant-mail-test-to" className="mb-1.5 block text-xs font-medium text-stone-600">
                  To
                </label>
                <input
                  id="tenant-mail-test-to"
                  type="email"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  className={inputClass}
                  placeholder="you@company.com"
                />
              </div>
              <button
                type="button"
                disabled={testing || testTo.trim() === ""}
                onClick={() => void sendTest()}
                className="shrink-0 rounded-lg border border-stone-200 bg-white px-4 py-2.5 text-sm font-semibold text-stone-900 shadow-sm hover:bg-stone-50 disabled:opacity-50"
              >
                {testing ? "Sending…" : "Send test"}
              </button>
            </div>
            {testError ? (
              <p className="mt-2 text-sm text-rose-600" role="alert">
                {testError}
              </p>
            ) : null}
            {testOk ? (
              <p className="mt-2 text-sm text-emerald-700" role="status">
                Test message sent (check spam).
              </p>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};
