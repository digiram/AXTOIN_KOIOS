/**
 * Super Mail page.
 *
 * Tenant super-admin screen mounted under AppShell at /super-admin.
 *
 * Responsibilities:
 * - Load and render primary super-admin data for the route
 * - Wire user actions to tenant API endpoints
 * - Compose shared module components and modals
 *
 * Related:
 * - Route: /super-admin
 *
 * Security:
 * - Tenant-scoped API calls via authenticated session
 */
import { useCallback, useEffect, useState } from "react";

import { useAuth } from "../../auth/AuthContext.js";
import { Switch } from "../../components/Switch.js";
import { API_BASE_URL } from "../../lib/api.js";

type SmtpResponse = {
  host: string;
  port: number;
  secure: boolean;
  username: string | null;
  hasPassword: boolean;
  fromName: string;
  fromEmail: string;
  smtpEnabled: boolean;
  updatedAt: string;
};

/**
 * Super-admin mail: SMTP transport only. Welcome/test HTML is read from `platform_email_templates.body_html` (seeded default).
 */
export const SuperMailPage = () => {
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

  const [saveError, setSaveError] = useState("");
  const [saveOk, setSaveOk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toggleBusy, setToggleBusy] = useState(false);

  const [testTo, setTestTo] = useState("");
  const [testError, setTestError] = useState("");
  const [testOk, setTestOk] = useState(false);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      let res = await fetch(`${API_BASE_URL}/platform/mail/smtp`, { headers: authHeaders() });
      if (res.status === 401) {
        const ok = await refreshSession();
        if (!ok) {
          logout();
          return;
        }
        res = await fetch(`${API_BASE_URL}/platform/mail/smtp`, { headers: authHeaders() });
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message ?? "Could not load SMTP settings.");
        return;
      }
      const json = (await res.json()) as SmtpResponse;
      setHost(json.host);
      setPort(String(json.port));
      setSecure(json.secure);
      setUsername(json.username ?? "");
      setFromName(json.fromName);
      setFromEmail(json.fromEmail);
      setHasPassword(json.hasPassword);
      setSmtpEnabled(json.smtpEnabled ?? true);
      setPassword("");
    } catch {
      setError("Could not load SMTP settings.");
    } finally {
      setLoading(false);
    }
  }, [authHeaders, refreshSession, logout]);

  useEffect(() => {
    void load();
  }, [load]);

  const inputClass =
    "w-full rounded-lg border border-stone-200/90 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/25";

  const smtpPutPayload = (deliveryEnabled: boolean): Record<string, unknown> => ({
    host: host.trim(),
    port: Number(port) || 587,
    secure,
    username: username.trim() === "" ? null : username.trim(),
    fromName: fromName.trim(),
    fromEmail: fromEmail.trim(),
    smtpEnabled: deliveryEnabled
  });

  const toggleSmtpDelivery = useCallback(
    async (next: boolean) => {
      const prev = smtpEnabled;
      setSmtpEnabled(next);
      setSaveError("");
      setToggleBusy(true);
      try {
        let res = await fetch(`${API_BASE_URL}/platform/mail/smtp`, {
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
          res = await fetch(`${API_BASE_URL}/platform/mail/smtp`, {
            method: "PUT",
            headers: { ...authHeaders(), "content-type": "application/json" },
            body: JSON.stringify(smtpPutPayload(next))
          });
        }
        const j = (await res.json().catch(() => null)) as { message?: string } | null;
        if (!res.ok) {
          setSmtpEnabled(prev);
          setSaveError(j?.message ?? "Could not update SMTP delivery.");
          return;
        }
        await load();
      } catch {
        setSmtpEnabled(prev);
        setSaveError("Could not update SMTP delivery.");
      } finally {
        setToggleBusy(false);
      }
    },
    [authHeaders, fromEmail, fromName, host, load, logout, port, refreshSession, secure, username]
  );

  const saveSmtp = async () => {
    setSaveError("");
    setSaveOk(false);
    const body: Record<string, unknown> = {
      ...smtpPutPayload(smtpEnabled)
    };
    if (password.trim() !== "") {
      body.password = password.trim();
    }

    setSaving(true);
    try {
      let res = await fetch(`${API_BASE_URL}/platform/mail/smtp`, {
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
        res = await fetch(`${API_BASE_URL}/platform/mail/smtp`, {
          method: "PUT",
          headers: { ...authHeaders(), "content-type": "application/json" },
          body: JSON.stringify(body)
        });
      }
      const j = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) {
        setSaveError(j?.message ?? "Could not save SMTP settings.");
        return;
      }
      setSaveOk(true);
      setPassword("");
      window.setTimeout(() => setSaveOk(false), 2400);
      await load();
    } catch {
      setSaveError("Could not save SMTP settings.");
    } finally {
      setSaving(false);
    }
  };

  const clearPassword = async () => {
    setSaveError("");
    setSaving(true);
    try {
      let res = await fetch(`${API_BASE_URL}/platform/mail/smtp`, {
        method: "PUT",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({ ...smtpPutPayload(smtpEnabled), password: "" })
      });
      if (res.status === 401) {
        const ok = await refreshSession();
        if (!ok) {
          logout();
          return;
        }
        res = await fetch(`${API_BASE_URL}/platform/mail/smtp`, {
          method: "PUT",
          headers: { ...authHeaders(), "content-type": "application/json" },
          body: JSON.stringify({ ...smtpPutPayload(smtpEnabled), password: "" })
        });
      }
      const j = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) {
        setSaveError(j?.message ?? "Could not clear password.");
        return;
      }
      setHasPassword(false);
      setPassword("");
      await load();
    } catch {
      setSaveError("Could not clear password.");
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    setTestError("");
    setTestOk(false);
    setTesting(true);
    try {
      let res = await fetch(`${API_BASE_URL}/platform/mail/smtp/test`, {
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
        res = await fetch(`${API_BASE_URL}/platform/mail/smtp/test`, {
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

  return (
    <div className="w-full min-w-0 max-w-none space-y-8">
      <section
        className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm ring-1 ring-slate-900/5"
        aria-labelledby="super-mail-smtp-enable-heading"
      >
        <div className="flex flex-col sm:flex-row sm:items-stretch">
          <div className="min-w-0 flex-1 p-5 sm:p-6">
            <h2 id="super-mail-smtp-enable-heading" className="text-sm font-semibold text-slate-900">
              SMTP delivery
            </h2>
            <p className="mt-1 text-sm text-stone-600">
              When enabled, the platform can send mail through your configured SMTP transport (super-admin test sends,
              and any feature that uses <code className="rounded bg-stone-100 px-1 py-0.5 text-xs">sendMailHtml</code>
              ). When disabled, outbound SMTP is refused. Use the{" "}
              <strong className="font-semibold text-slate-800">toggle</strong> in the gray strip; changes apply
              immediately when you flip it.
            </p>
          </div>
          <div className="mx-auto flex w-[8%] min-w-16 max-w-full shrink-0 items-center justify-center border-t border-stone-200/90 bg-stone-100 px-1 py-3 sm:mx-0 sm:flex-none sm:border-l sm:border-t-0 sm:px-1.5 sm:py-4">
            {error ? null : (
              <Switch
                checked={smtpEnabled}
                disabled={loading || toggleBusy || saving}
                aria-busy={toggleBusy}
                aria-label={smtpEnabled ? "SMTP delivery, on" : "SMTP delivery, off"}
                onCheckedChange={(next) => void toggleSmtpDelivery(next)}
              />
            )}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,15,15,0.06)] sm:p-6">
        <h2 className="text-base font-semibold tracking-tight text-stone-900">SMTP connection &amp; sender</h2>
        <p className="mt-2 text-sm leading-relaxed text-stone-600">
          Uses{" "}
          <span className="font-medium text-stone-800">TLS</span> according to your host/port (
          <span className="font-mono text-xs">secure</span> flag). Host, username, and password are encrypted at rest with{" "}
          <span className="font-mono text-xs">FIELD_ENCRYPTION_KEY</span>. Prefer app passwords or SMTP relays for production.
        </p>

        {loading ? (
          <p className="mt-4 text-sm text-stone-500">Loading…</p>
        ) : error ? (
          <p className="mt-4 text-sm text-rose-600">{error}</p>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="super-mail-smtp-host" className="mb-1.5 block text-xs font-medium text-stone-600">
                Host
              </label>
              <input
                id="super-mail-smtp-host"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                className={inputClass}
                placeholder="smtp.example.com"
                autoComplete="off"
              />
            </div>
            <div>
              <label htmlFor="super-mail-smtp-port" className="mb-1.5 block text-xs font-medium text-stone-600">
                Port
              </label>
              <input
                id="super-mail-smtp-port"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                className={inputClass}
                inputMode="numeric"
              />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-800">
                <input type="checkbox" checked={secure} onChange={(e) => setSecure(e.target.checked)} className="rounded border-stone-300 text-amber-700 focus:ring-amber-400" />
                Secure (SSL/TLS direct)
              </label>
            </div>
            <div>
              <label htmlFor="super-mail-smtp-user" className="mb-1.5 block text-xs font-medium text-stone-600">
                Username
              </label>
              <input
                id="super-mail-smtp-user"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={inputClass}
                autoComplete="off"
              />
            </div>
            <div>
              <label htmlFor="super-mail-smtp-pass" className="mb-1.5 block text-xs font-medium text-stone-600">
                Password
              </label>
              <input
                id="super-mail-smtp-pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
                placeholder={hasPassword ? "Leave blank to keep current" : "Optional"}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label htmlFor="super-mail-from-name" className="mb-1.5 block text-xs font-medium text-stone-600">
                From name
              </label>
              <input id="super-mail-from-name" value={fromName} onChange={(e) => setFromName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="super-mail-from-email" className="mb-1.5 block text-xs font-medium text-stone-600">
                From email
              </label>
              <input
                id="super-mail-from-email"
                type="email"
                value={fromEmail}
                onChange={(e) => setFromEmail(e.target.value)}
                className={inputClass}
                autoComplete="off"
              />
            </div>

            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <button
                type="button"
                disabled={saving || toggleBusy}
                onClick={() => void saveSmtp()}
                className="rounded-lg border border-amber-300/80 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-950 shadow-sm transition hover:bg-amber-100 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save SMTP"}
              </button>
              {hasPassword ? (
                <button
                  type="button"
                  disabled={saving || toggleBusy}
                  onClick={() => void clearPassword()}
                  className="rounded-lg border border-stone-200 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 shadow-sm transition hover:bg-stone-50 disabled:opacity-50"
                >
                  Clear saved password
                </button>
              ) : null}
            </div>
            {saveError ? (
              <p className="text-sm text-rose-600 sm:col-span-2" role="alert">
                {saveError}
              </p>
            ) : null}
            {saveOk ? (
              <p className="text-sm text-emerald-700 sm:col-span-2" role="status">
                SMTP settings saved.
              </p>
            ) : null}

            <div className="border-t border-stone-100 pt-6 sm:col-span-2">
              <h3 className="text-sm font-semibold text-stone-900">Send test email</h3>
              <p className="mt-1 text-xs text-stone-500">
                Sends the stored welcome HTML (`platform_email_templates`) using your SMTP settings.
              </p>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1">
                  <label htmlFor="super-mail-test-to" className="mb-1.5 block text-xs font-medium text-stone-600">
                    To
                  </label>
                  <input
                    id="super-mail-test-to"
                    type="email"
                    value={testTo}
                    onChange={(e) => setTestTo(e.target.value)}
                    className={inputClass}
                    placeholder="you@company.com"
                  />
                </div>
                <button
                  type="button"
                  disabled={testing || testTo.trim() === "" || !smtpEnabled}
                  onClick={() => void sendTest()}
                  className="shrink-0 rounded-lg border border-stone-200 bg-white px-4 py-2.5 text-sm font-semibold text-stone-900 shadow-sm transition hover:bg-stone-50 disabled:opacity-50"
                >
                  {testing ? "Sending…" : "Send test"}
                </button>
              </div>
              {!smtpEnabled ? (
                <p className="mt-2 text-xs text-stone-500">Turn on SMTP delivery above to send a test message.</p>
              ) : null}
              {testError ? (
                <p className="mt-2 text-sm text-rose-600" role="alert">
                  {testError}
                </p>
              ) : null}
              {testOk ? (
                <p className="mt-2 text-sm text-emerald-700" role="status">
                  Test message queued for delivery (check spam).
                </p>
              ) : null}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
