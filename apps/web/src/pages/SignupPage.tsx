/**
 * SignupPage.
 *
 * Self-service tenant registration at `/signup`: email verification flow, optional MFA enrollment,
 * and gating when platform or realm policy disables open registration.
 *
 * Responsibilities:
 * - Probe `/auth/self-registration` (optionally scoped by email) for gate state
 * - Two-step register + verify via `AuthContext.registerStart` / `registerVerify`
 * - Render `MfaLoginStep` when verification returns MFA requirement
 *
 * Security:
 * - Verification codes are single-use server-side; no tenant id supplied by client
 */
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { registerSchema, type UserRole } from "@starter/shared";

import { useAuth } from "../auth/AuthContext.js";
import { authFieldClass, authLabelClass } from "../components/auth/fieldStyles.js";
import { AuthCardShell } from "../components/auth/AuthCardShell.js";
import { MfaLoginStep } from "../components/auth/MfaLoginStep.js";
import { API_BASE_URL, formatApiUnreachableMessage } from "../lib/api.js";
import { fetchWithDevProxyWarmup } from "../lib/dev-api-proxy-warmup.js";
import { isLikelyFetchNetworkError } from "../lib/fetch-network-error.js";

type RegistrationGate = "loading" | "open" | "closed_platform" | "closed_realm";

/** Self-registration route component. */
export const SignupPage = () => {
  const navigate = useNavigate();
  const { registerStart, registerVerify } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [registrationTicket, setRegistrationTicket] = useState("");
  const [codeEmailed, setCodeEmailed] = useState(true);
  const [error, setError] = useState("");
  const [gate, setGate] = useState<RegistrationGate>("loading");
  const [signupBackendHint, setSignupBackendHint] = useState("");
  const [step, setStep] = useState<"form" | "verify" | "mfa">("form");
  const [mfa, setMfa] = useState<{
    ticket: string;
    methods: ("totp" | "email")[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setGate("loading");
    setSignupBackendHint("");
    const delay = email.trim().length > 0 ? 450 : 0;
    const id = window.setTimeout(async () => {
      try {
        const trimmed = email.trim();
        const q =
          trimmed.includes("@") && trimmed.length > 5
            ? `?email=${encodeURIComponent(trimmed)}`
            : "";
        const res = await fetchWithDevProxyWarmup(`${API_BASE_URL}/auth/self-registration${q}`);
        if (cancelled) return;
        if (!res.ok) {
          if (import.meta.env.DEV && !API_BASE_URL && [502, 504].includes(res.status)) {
            setSignupBackendHint(formatApiUnreachableMessage(API_BASE_URL, res.status));
            setGate("open");
            return;
          }
          setGate("open");
          return;
        }
        const j = (await res.json().catch(() => null)) as { selfRegisterEnabled?: boolean } | null;
        if (j?.selfRegisterEnabled === false) {
          setGate(q ? "closed_realm" : "closed_platform");
        } else {
          setGate("open");
        }
      } catch (e) {
        if (!cancelled) {
          if (import.meta.env.DEV && isLikelyFetchNetworkError(e)) {
            setSignupBackendHint(formatApiUnreachableMessage(API_BASE_URL));
          }
          setGate("open");
        }
      }
    }, delay);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [email]);

  const disabled = useMemo(() => !name.trim() || !email || password.length < 8, [name, email, password]);
  const verifyDisabled = useMemo(() => verificationCode.trim().length < 4, [verificationCode]);

  const navigateForRole = useCallback(
    (role: UserRole) => {
      if (role === "tenant_admin") navigate("/admin", { replace: true });
      else navigate("/user", { replace: true });
    },
    [navigate]
  );

  const onSubmitStart = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const parsed = registerSchema.safeParse({
      name: name.trim(),
      email,
      password
    });
    if (!parsed.success) {
      setError("Fill all fields: your name, valid email, password (8+ characters).");
      return;
    }
    try {
      const started = await registerStart(parsed.data);
      setRegistrationTicket(started.registrationTicket);
      setCodeEmailed(started.emailed);
      if (started.verificationCode) {
        setVerificationCode(started.verificationCode);
      }
      setStep("verify");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    }
  };

  const onSubmitVerify = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!registrationTicket) {
      setError("Start sign-up again — your session expired.");
      setStep("form");
      return;
    }
    try {
      const result = await registerVerify({
        registrationTicket,
        code: verificationCode.trim()
      });
      if (result.kind === "mfa_required") {
        setMfa({ ticket: result.mfaTicket, methods: result.methods });
        setStep("mfa");
        return;
      }
      navigateForRole(result.role);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed.");
    }
  };

  const clearMfa = useCallback(() => {
    setMfa(null);
    setStep("form");
    setError("");
  }, []);

  if (gate === "loading") {
    return (
      <AuthCardShell variant="signup" eyebrow="Account" title="Create your account">
        <p className="text-sm text-gray-500">Checking registration…</p>
      </AuthCardShell>
    );
  }

  if (signupBackendHint) {
    return (
      <AuthCardShell variant="signup" eyebrow="Account" title="Create your account">
        <p
          className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-950 ring-1 ring-inset ring-amber-700/15"
          role="alert"
        >
          {signupBackendHint}
        </p>
        <p className="mt-8 text-center text-sm text-gray-500">
          <Link to="/login" className="font-semibold text-indigo-600 hover:text-indigo-500">
            Back to sign in
          </Link>
        </p>
      </AuthCardShell>
    );
  }

  if (gate === "closed_platform") {
    return (
      <AuthCardShell variant="signup" eyebrow="Account" title="Registration closed">
        <p className="text-sm leading-6 text-gray-600">
          Self-service sign-up is disabled on this platform. Ask your{" "}
          <span className="font-medium text-gray-900">tenant administrator</span> or{" "}
          <span className="font-medium text-gray-900">platform operator</span> to create an account for you, then sign
          in below.
        </p>
        <p className="mt-8 text-center text-sm text-gray-500">
          <Link to="/login" className="font-semibold text-indigo-600 hover:text-indigo-500">
            Back to sign in
          </Link>
        </p>
      </AuthCardShell>
    );
  }

  if (gate === "closed_realm") {
    return (
      <AuthCardShell variant="signup" eyebrow="Account" title="Registration not open for this organization">
        <p className="text-sm leading-6 text-gray-600">
          The organization for <span className="font-medium text-gray-900">{email.trim()}</span> does not accept
          self-service sign-up. Ask your <span className="font-medium text-gray-900">tenant administrator</span> to add
          your account, then sign in below.
        </p>
        <p className="mt-8 text-center text-sm text-gray-500">
          <Link to="/login" className="font-semibold text-indigo-600 hover:text-indigo-500">
            Back to sign in
          </Link>
        </p>
      </AuthCardShell>
    );
  }

  if (step === "mfa" && mfa) {
    return (
      <AuthCardShell variant="signup" eyebrow="Account" title="Verify your sign-in">
        <MfaLoginStep
          mfaTicket={mfa.ticket}
          methods={mfa.methods}
          onBack={clearMfa}
          onSuccess={(role) => navigateForRole(role)}
        />
      </AuthCardShell>
    );
  }

  if (step === "verify") {
    return (
      <AuthCardShell variant="signup" eyebrow="Account" title="Verify your email">
        <p className="text-sm leading-6 text-gray-600">
          {codeEmailed ? (
            <>
              We sent a six-digit code to <span className="font-medium text-gray-900">{email.trim()}</span>. Enter it
              below to finish creating your account.
            </>
          ) : (
            <>Enter the verification code shown for this development environment.</>
          )}
        </p>
        <form className="mt-8 space-y-6" onSubmit={onSubmitVerify}>
          <div>
            <label htmlFor="signup-code" className={authLabelClass}>
              Verification code
            </label>
            <input
              id="signup-code"
              className={authFieldClass}
              value={verificationCode}
              onChange={(ev) => setVerificationCode(ev.target.value)}
              placeholder="123456"
              autoComplete="one-time-code"
              inputMode="numeric"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                setStep("form");
                setError("");
              }}
              className="flex flex-1 justify-center rounded-md bg-white px-3 py-2.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={verifyDisabled}
              className="flex flex-1 justify-center rounded-md bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Create account
            </button>
          </div>
          {error && (
            <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-inset ring-red-600/10">
              {error}
            </p>
          )}
        </form>
      </AuthCardShell>
    );
  }

  return (
    <AuthCardShell variant="signup" eyebrow="Account" title="Create your account">
      <p className="text-sm leading-6 text-gray-600">
        Your <span className="font-medium text-gray-900">email domain</span> determines your organization realm. You must
        verify your email before your account is created. Work domains share one space; public mailboxes (Gmail,
        Outlook, Yahoo, etc.) get a personal realm.
      </p>

      <form className="mt-8 space-y-6" onSubmit={onSubmitStart}>
        <div>
          <label htmlFor="signup-name" className={authLabelClass}>
            Your name
          </label>
          <input
            id="signup-name"
            className={authFieldClass}
            value={name}
            onChange={(ev) => setName(ev.target.value)}
            placeholder="Jane Doe"
            autoComplete="name"
          />
        </div>

        <div>
          <label htmlFor="signup-email" className={authLabelClass}>
            Email
          </label>
          <input
            id="signup-email"
            type="email"
            className={authFieldClass}
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            placeholder="you@company.com"
            autoComplete="email"
          />
        </div>

        <div>
          <label htmlFor="signup-password" className={authLabelClass}>
            Password <span className="font-normal text-gray-500">(min. 8 characters)</span>
          </label>
          <input
            id="signup-password"
            type="password"
            className={authFieldClass}
            value={password}
            onChange={(ev) => setPassword(ev.target.value)}
            placeholder="Create a strong password"
            autoComplete="new-password"
          />
        </div>

        <div>
          <button
            type="submit"
            disabled={disabled}
            className="flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Continue
          </button>
        </div>

        {error && (
          <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-inset ring-red-600/10">
            {error}
          </p>
        )}

        <p className="text-center text-sm text-gray-500">
          Already registered?{" "}
          <Link to="/login" className="font-semibold text-indigo-600 hover:text-indigo-500">
            Sign in
          </Link>
        </p>
      </form>
    </AuthCardShell>
  );
};
