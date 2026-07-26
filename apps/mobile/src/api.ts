/**
 * Mobile HTTP client for authentication.
 *
 * Thin fetch wrapper around `/v1/auth/login` using shared Zod validation so the Expo
 * app stays aligned with web login contracts.
 *
 * Responsibilities:
 * - Resolve API origin from `EXPO_PUBLIC_API_BASE_URL` (Metro bundle-time)
 * - Validate login body with `loginSchema` before network I/O
 *
 * Security:
 * - Does not persist tokens; caller stores refresh token via SecureStore
 */

import { loginSchema } from "@starter/shared";

const API_ORIGIN = (process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:3500").replace(/\/$/, "");
const API_BASE_URL = `${API_ORIGIN}/v1`;

/**
 * Posts credentials to `/v1/auth/login` and returns token pair on success.
 *
 * @param email - Tenant email or platform username (realm resolved server-side).
 * @param password - Plain password; validated locally before request.
 * @throws When validation fails, HTTP status is non-OK, or response shape is invalid.
 */
export const login = async (email: string, password: string) => {
  const body = { email, password };
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error("Invalid login payload");
  }

  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(parsed.data)
  });

  if (!response.ok) {
    throw new Error("Login failed");
  }

  return (await response.json()) as { accessToken: string; refreshToken: string };
};
