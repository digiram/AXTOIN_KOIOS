/**
 * MfaLoginStep
 *
 * Second-factor verification form shown after password login returns an MFA ticket.
 *
 * Responsibilities:
 * - TOTP and/or email OTP entry depending on enrolled methods
 * - Request email codes via `/auth/mfa/email/send`
 * - Complete login through `AuthContext.completeMfaLogin`
 *
 * Related:
 * - Login page; API MFA routes under `/v1/auth/mfa/*`
 *
 * Security:
 * - Uses short-lived `mfaTicket` only — no access token until verification succeeds.
 */
import { type FormEvent, useCallback, useEffect, useState } from "react";

import type { UserRole } from "@starter/shared";

import { useAuth } from "../../auth/AuthContext.js";
import { authFieldClass, authLabelClass } from "./fieldStyles.js";
import { API_BASE_URL } from "../../lib/api.js";

type Props = {
  mfaTicket: string;
  methods: ("totp" | "email")[];
  onSuccess: (role: UserRole) => void;
  onBack: () => void;
};

/**
 * MFA step-up form for realm login.
 *
 * @param mfaTicket - Opaque ticket from the password step.
 * @param methods - Allowed verification methods for this account.
 * @param onSuccess - Called with the user's role after tokens are issued.
 */
export const MfaLoginStep = ({ mfaTicket, methods, onSuccess, onBack }: Props) => {
  const { completeMfaLogin } = useAuth();
  const [method, setMethod] = useState<"totp" | "email">(methods[0] ?? "totp");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [emailHint, setEmailHint] = useState("");

  useEffect(() => {
    if (!methods.includes(method)) {
      setMethod(methods[0] ?? "totp");
    }
  }, [method, methods]);

  const sendEmailCode = useCallback(async () => {
    setError("");
    setEmailHint("");
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/mfa/email/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mfaTicket })
      });
      const j = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) {
        setError(j?.message ?? "Could not send email code.");
        return;
      }
      setEmailHint("If your account has email MFA and mail is configured, a code was sent.");
    } catch {
      setError("Could not send email code.");
    } finally {
      setBusy(false);
    }
  }, [mfaTicket]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const trimmed = code.replace(/\s+/g, "");
    if (trimmed.length < 6) {
      setError("Enter the 6-digit code.");
      return;
    }
    setBusy(true);
    try {
      const role = await completeMfaLogin({ mfaTicket, method, code: trimmed });
      onSuccess(role);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  };

  const canEmail = methods.includes("email");
  const canTotp = methods.includes("totp");

  return (
    <form className="mt-2 space-y-5" onSubmit={(ev) => void onSubmit(ev)}>
      <p className="text-sm leading-6 text-gray-600">
        Sign-in requires a verification code.{" "}
        {canTotp && canEmail
          ? "Choose how to verify, then enter the code."
          : canTotp
            ? "Enter the code from your authenticator app."
            : "We can email you a one-time code; enter it below."}
      </p>

      {canTotp && canEmail ? (
        <div>
          <span className={authLabelClass}>Verification method</span>
          <div className="mt-2 flex flex-wrap gap-3 text-sm">
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="mfa-method"
                checked={method === "totp"}
                onChange={() => setMethod("totp")}
                className="h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-600"
              />
              <span>Authenticator app</span>
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="mfa-method"
                checked={method === "email"}
                onChange={() => setMethod("email")}
                className="h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-600"
              />
              <span>Email code</span>
            </label>
          </div>
        </div>
      ) : null}

      {method === "email" ? (
        <div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void sendEmailCode()}
            className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-900 hover:bg-indigo-100 disabled:opacity-50"
          >
            Email me a code
          </button>
          {emailHint ? (
            <p className="mt-2 text-xs text-gray-600" role="status">
              {emailHint}
            </p>
          ) : null}
        </div>
      ) : null}

      <div>
        <label htmlFor="mfa-code" className={authLabelClass}>
          {method === "totp" ? "Authenticator code" : "Code from email"}
        </label>
        <input
          id="mfa-code"
          value={code}
          onChange={(ev) => setCode(ev.target.value)}
          className={authFieldClass}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="6-digit code"
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="submit"
          disabled={busy || code.replace(/\s+/g, "").length < 6}
          className="flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:min-w-[10rem]"
        >
          {busy ? "Verifying…" : "Continue"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onBack}
          className="text-sm font-semibold text-gray-600 underline decoration-gray-400/40 underline-offset-2 hover:text-gray-900"
        >
          Use a different account
        </button>
      </div>

      {error ? (
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-inset ring-red-600/10">
          {error}
        </p>
      ) : null}
    </form>
  );
};
