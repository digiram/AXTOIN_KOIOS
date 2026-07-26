/**
 * LoginPage.
 *
 * Public sign-in screen at `/login`: email/password form, optional MFA step-up, dev quick accounts,
 * and link to self-registration when the platform allows it.
 *
 * Responsibilities:
 * - Validate credentials with `loginSchema` before calling `AuthContext.login`
 * - Probe `/auth/self-registration` for signup availability banner
 * - Render `MfaLoginStep` when the API returns `mfa_required`
 *
 * Security:
 * - No tokens stored until `AuthContext` succeeds; dev quick-login is build-gated
 */
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { loginSchema, type UserRole } from "@starter/shared";

import { useAuth } from "../auth/AuthContext.js";
import { authFieldClass, authLabelClass } from "../components/auth/fieldStyles.js";
import { AuthCardShell } from "../components/auth/AuthCardShell.js";
import { MfaLoginStep } from "../components/auth/MfaLoginStep.js";
import {
  API_BASE_URL,
  formatApiUnreachableMessage,
  isApiUnreachableAuthMessage
} from "../lib/api.js";
import { fetchWithDevProxyWarmup } from "../lib/dev-api-proxy-warmup.js";
import { isLikelyFetchNetworkError } from "../lib/fetch-network-error.js";

/** Shared dev password for one-click test accounts (only wired in dev builds below). */
const DEV_QUICK_PASSWORD = "Welcome01";

const DEV_QUICK_ACCOUNTS = [
  { label: "admin", email: "admin" },
  { label: "ramli@company.com", email: "ramli@company.com" },
  { label: "dave@company.com", email: "dave@company.com" }
] as const;

/** Realm and platform login route component. */
export const LoginPage = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [selfRegisterEnabled, setSelfRegisterEnabled] = useState<boolean | null>(null);
  const [backendHint, setBackendHint] = useState("");
  const [mfa, setMfa] = useState<{
    ticket: string;
    methods: ("totp" | "email")[];
    role: UserRole;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithDevProxyWarmup(`${API_BASE_URL}/auth/self-registration`);
        if (!res.ok) {
          if (import.meta.env.DEV && !API_BASE_URL && [502, 504].includes(res.status)) {
            setSelfRegisterEnabled(null);
            setBackendHint(formatApiUnreachableMessage(API_BASE_URL, res.status));
            return;
          }
          setBackendHint("");
          setSelfRegisterEnabled(true);
          return;
        }
        const j = (await res.json().catch(() => null)) as { selfRegisterEnabled?: boolean } | null;
        if (!cancelled) {
          setBackendHint("");
          setSelfRegisterEnabled(j?.selfRegisterEnabled !== false);
        }
      } catch (e) {
        if (cancelled) return;
        if (import.meta.env.DEV && isLikelyFetchNetworkError(e)) {
          setSelfRegisterEnabled(null);
          setBackendHint(formatApiUnreachableMessage(API_BASE_URL));
          return;
        }
        setSelfRegisterEnabled(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const disabled = useMemo(() => !email || !password, [email, password]);

  const navigateForRole = useCallback(
    (role: UserRole, rememberSession: boolean) => {
      if (rememberSession && typeof window !== "undefined") {
        window.localStorage.setItem("starter.rememberSession", "1");
      } else {
        window.localStorage.removeItem("starter.rememberSession");
      }
      if (role === "super_admin") navigate("/super-admin", { replace: true });
      else if (role === "tenant_admin") navigate("/admin", { replace: true });
      else navigate("/user", { replace: true });
    },
    [navigate]
  );

  const submitCredentials = useCallback(
    async (credEmail: string, credPassword: string, rememberSession: boolean) => {
      setError("");
      const parsed = loginSchema.safeParse({ email: credEmail, password: credPassword });
      if (!parsed.success) {
        setError("Enter your email or username and password (password at least 8 characters).");
        return;
      }

      try {
        const result = await login(parsed.data);
        if (result.kind === "mfa_required") {
          setMfa({
            ticket: result.mfaTicket,
            methods: result.methods,
            role: result.role
          });
          return;
        }
        navigateForRole(result.role, rememberSession);
      } catch (e) {
        if (e instanceof Error && isApiUnreachableAuthMessage(e.message)) {
          setError(e.message);
        } else {
          setError("Could not sign you in. Check your email or username and password.");
        }
      }
    },
    [login, navigateForRole]
  );

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await submitCredentials(email, password, remember);
  };

  const devQuickLogin = useCallback(
    async (credEmail: string) => {
      setEmail(credEmail);
      setPassword(DEV_QUICK_PASSWORD);
      setRemember(false);
      await submitCredentials(credEmail, DEV_QUICK_PASSWORD, false);
    },
    [submitCredentials]
  );

  const clearMfa = useCallback(() => {
    setMfa(null);
    setError("");
  }, []);

  if (mfa) {
    return (
      <AuthCardShell
        variant="login"
        eyebrow="Account"
        title="Verify your sign-in"
        belowCard={
          import.meta.env.DEV ? (
            <p className="text-center text-sm text-gray-600">
              <span className="font-medium text-gray-700">Login as:</span>
              {DEV_QUICK_ACCOUNTS.map((acc, i) => (
                <span key={acc.email} className="inline-flex items-center">
                  {i > 0 ? <span className="text-gray-300"> / </span> : null}
                  <button
                    type="button"
                    onClick={() => void devQuickLogin(acc.email)}
                    className="ml-1 rounded font-semibold text-indigo-600 underline decoration-indigo-600/30 underline-offset-2 hover:text-indigo-500 hover:decoration-indigo-500"
                  >
                    {acc.label}
                  </button>
                </span>
              ))}
            </p>
          ) : undefined
        }
      >
        <MfaLoginStep
          mfaTicket={mfa.ticket}
          methods={mfa.methods}
          onBack={clearMfa}
          onSuccess={(role) => navigateForRole(role, remember)}
        />
      </AuthCardShell>
    );
  }

  return (
    <AuthCardShell
      variant="login"
      eyebrow="Account"
      title="Sign in to your workspace"
      belowCard={
        import.meta.env.DEV ? (
          <p className="text-center text-sm text-gray-600">
            <span className="font-medium text-gray-700">Login as:</span>
            {DEV_QUICK_ACCOUNTS.map((acc, i) => (
              <span key={acc.email} className="inline-flex items-center">
                {i > 0 ? <span className="text-gray-300"> / </span> : null}
                <button
                  type="button"
                  onClick={() => void devQuickLogin(acc.email)}
                  className="ml-1 rounded font-semibold text-indigo-600 underline decoration-indigo-600/30 underline-offset-2 hover:text-indigo-500 hover:decoration-indigo-500"
                >
                  {acc.label}
                </button>
              </span>
            ))}
          </p>
        ) : undefined
      }
    >
      <p className="text-sm leading-6 text-gray-600">
        Use your <span className="font-medium text-gray-900">work email</span> — your realm is chosen from the email
        domain. Platform administrators sign in with their <span className="font-medium text-gray-900">username or id</span>{" "}
        (no <code className="text-indigo-700">@</code> required).
      </p>

      {backendHint ? (
        <p
          className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-950 ring-1 ring-inset ring-amber-700/15"
          role="alert"
        >
          {backendHint}
        </p>
      ) : null}

      <form className="mt-8 space-y-6" onSubmit={onSubmit}>
        <div>
          <label htmlFor="login-email" className={authLabelClass}>
            Email or username
          </label>
          <input
            id="login-email"
            type="text"
            className={authFieldClass}
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            placeholder="you@company.com or platform id"
            autoComplete="username"
          />
        </div>

        <div>
          <label htmlFor="login-password" className={authLabelClass}>
            Password
          </label>
          <input
            id="login-password"
            type="password"
            className={authFieldClass}
            value={password}
            onChange={(ev) => setPassword(ev.target.value)}
            placeholder="Enter your password"
            autoComplete="current-password"
          />
        </div>

        <label className="flex cursor-pointer items-start gap-3 text-sm leading-6 text-gray-600">
          <input
            type="checkbox"
            checked={remember}
            onChange={(ev) => setRemember(ev.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
          />
          <span>Keep me signed in on this device</span>
        </label>

        <div>
          <button
            type="submit"
            disabled={disabled}
            className="flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Sign in
          </button>
        </div>

        {error && (
          <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-inset ring-red-600/10">
            {error}
          </p>
        )}

        {selfRegisterEnabled === false ? (
          <p className="text-center text-sm text-gray-500">
            New accounts are invite-only. Ask your tenant or platform administrator for access.
          </p>
        ) : backendHint ? null : (
          <p className="text-center text-sm text-gray-500">
            Need an organization?{" "}
            <Link to="/signup" className="font-semibold text-indigo-600 hover:text-indigo-500">
              Create an account
            </Link>
          </p>
        )}
      </form>
    </AuthCardShell>
  );
};
