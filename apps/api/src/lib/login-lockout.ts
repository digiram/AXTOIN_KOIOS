/**
 * Per-email login lockout after repeated failed password attempts (cache-backed).
 */

import { getCacheStore } from "./cache-store/index.js";
import { loginAttemptKey } from "./refresh-token-rotation.js";

const LOCKOUT_NAMESPACE = "auth:login-fail:v1";

const maxFailures = (): number => {
  const raw = process.env.LOGIN_LOCKOUT_MAX_FAILURES?.trim();
  const n = raw ? Number(raw) : 10;
  return Number.isFinite(n) && n >= 3 ? Math.floor(n) : 10;
};

const lockoutWindowSec = (): number => {
  const raw = process.env.LOGIN_LOCKOUT_WINDOW_SECONDS?.trim();
  const n = raw ? Number(raw) : 900;
  return Number.isFinite(n) && n >= 60 ? Math.floor(n) : 900;
};

type LockoutState = { count: number; lockedUntil?: number };

const parseState = (raw: string | null): LockoutState => {
  if (!raw) return { count: 0 };
  try {
    const parsed = JSON.parse(raw) as LockoutState;
    if (typeof parsed.count === "number") return parsed;
  } catch {
    /* ignore */
  }
  return { count: 0 };
};

export const assertLoginNotLocked = async (email: string): Promise<void> => {
  const key = loginAttemptKey(email);
  const raw = await getCacheStore().get(LOCKOUT_NAMESPACE, key);
  const state = parseState(raw);
  if (state.lockedUntil && state.lockedUntil > Date.now()) {
    const err = new Error("Too many failed login attempts. Try again later.");
    (err as Error & { statusCode: number; error: string }).statusCode = 429;
    (err as Error & { error: string }).error = "account_locked";
    throw err;
  }
};

export const recordLoginFailure = async (email: string): Promise<void> => {
  const key = loginAttemptKey(email);
  const store = getCacheStore();
  const state = parseState(await store.get(LOCKOUT_NAMESPACE, key));
  const nextCount = state.count + 1;
  const max = maxFailures();
  const next: LockoutState =
    nextCount >= max
      ? { count: nextCount, lockedUntil: Date.now() + lockoutWindowSec() * 1000 }
      : { count: nextCount };
  await store.set(LOCKOUT_NAMESPACE, key, JSON.stringify(next), lockoutWindowSec());
};

export const clearLoginFailures = async (email: string): Promise<void> => {
  await getCacheStore().del(LOCKOUT_NAMESPACE, loginAttemptKey(email));
};
