/**
 * Browser CORS for the Fastify API.
 *
 * - **PATCH** (and other verbs) must appear in `methods` or preflight fails with
 *   `Method PATCH is not allowed by Access-Control-Allow-Methods`.
 * - **`CORS_ORIGINS`**: comma-separated allowlist (e.g. `http://localhost:5173`).
 *   - **Production** (`NODE_ENV=production`): unset or empty after parsing → **`origin: false`** (no
 *     `Access-Control-Allow-Origin` for browser cross-origin calls — configure an explicit list).
 *   - **Non-production**: unset/empty → **`origin: true`** (reflect request origin for local dev).
 */

import type { FastifyCorsOptions } from "@fastify/cors";

const DEFAULT_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const;

const defaultAllowedHeaders = ["authorization", "content-type", "x-csrf-token", "x-request-id"];

const isProduction = (): boolean => process.env.NODE_ENV === "production";

const parseAllowedHeaders = (): string[] => {
  const raw = process.env.CORS_ALLOWED_HEADERS?.trim();
  if (!raw) return [...defaultAllowedHeaders];
  const parts = raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return parts.length > 0 ? parts : [...defaultAllowedHeaders];
};

const parseOrigin = (): FastifyCorsOptions["origin"] => {
  const raw = process.env.CORS_ORIGINS?.trim();
  if (!raw) {
    return isProduction() ? false : true;
  }
  const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (list.length === 0) {
    return isProduction() ? false : true;
  }
  if (list.length === 1) {
    return list[0]!;
  }
  return list;
};

export const buildCorsOptions = (): FastifyCorsOptions => ({
  origin: parseOrigin(),
  credentials: process.env.CORS_CREDENTIALS === "true",
  methods: [...DEFAULT_METHODS],
  allowedHeaders: parseAllowedHeaders()
});
