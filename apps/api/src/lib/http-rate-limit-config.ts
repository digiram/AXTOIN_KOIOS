/**
 * Env-tunable HTTP rate limits (@fastify/rate-limit). Unset vars keep the previous hard-coded defaults.
 */

import { createHash } from "node:crypto";
import type { FastifyRequest } from "fastify";

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const t = raw.trim();
  if (t === "") return fallback;
  const n = Number.parseInt(t, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return n;
}

/** Milliseconds; minimum 1000 to avoid accidental sub-second windows. */
function parseWindowMs(raw: string | undefined, fallbackMs: number): number {
  const n = parsePositiveInt(raw, fallbackMs);
  return Math.max(1000, n);
}

export const globalRateLimitMax = (url: string): number => {
  if (url.startsWith("/webhooks/")) {
    return parsePositiveInt(process.env.RATE_LIMIT_WEBHOOK_MAX, 8000);
  }
  const devDefault = process.env.NODE_ENV !== "production" ? 2000 : 100;
  return parsePositiveInt(process.env.RATE_LIMIT_GLOBAL_MAX, devDefault);
};

export const globalRateLimitTimeWindowMs = (): number =>
  parseWindowMs(process.env.RATE_LIMIT_GLOBAL_WINDOW, 60_000);

export const authRateLimitMax = (): number => parsePositiveInt(process.env.RATE_LIMIT_AUTH_MAX, 40);

export const authRateLimitTimeWindowMs = (): number =>
  parseWindowMs(process.env.RATE_LIMIT_AUTH_WINDOW, 15 * 60_000);

/** Per-email bucket on `/auth` (login/register) when body includes `email`. */
export const authRateLimitKey = (request: FastifyRequest): string => {
  const body = request.body as { email?: string } | undefined;
  const query = request.query as { email?: string } | undefined;
  const email = body?.email?.trim().toLowerCase() ?? query?.email?.trim().toLowerCase();
  if (email) {
    const h = createHash("sha256").update(email).digest("hex").slice(0, 24);
    return `auth-email:${h}`;
  }
  return `ip:${request.ip}`;
};

export const tenantRateLimitMax = (): number => parsePositiveInt(process.env.RATE_LIMIT_TENANT_MAX, 300);

export const tenantRateLimitTimeWindowMs = (): number =>
  parseWindowMs(process.env.RATE_LIMIT_TENANT_WINDOW, 60_000);

/** Module nav gates poll these on layout mount; exclude from tenant rate limits. */
export const isTenantModuleAvailabilityRoute = (url: string): boolean =>
  /\/tenant\/[^/?]+\/availability(?:\?|$)/.test(url.split("#")[0] ?? url);

/** Per-tenant CRM geocode (`/tenant/crm/geocode/*`); `hook: preHandler` so `request.tenantId` is set. */
export const crmGeocodeRateLimitMax = (): number =>
  parsePositiveInt(process.env.RATE_LIMIT_CRM_GEOCODE_MAX, 60);

export const crmGeocodeRateLimitTimeWindowMs = (): number =>
  parseWindowMs(process.env.RATE_LIMIT_CRM_GEOCODE_WINDOW, 60_000);

/** Per-user account geocode (`/account/geocode/*`). */
export const accountGeocodeRateLimitMax = (): number =>
  parsePositiveInt(process.env.RATE_LIMIT_ACCOUNT_GEOCODE_MAX, 60);

export const accountGeocodeRateLimitTimeWindowMs = (): number =>
  parseWindowMs(process.env.RATE_LIMIT_ACCOUNT_GEOCODE_WINDOW, 60_000);

/** Platform super-admin geocode test route. */
export const platformGeocodeRateLimitMax = (): number =>
  parsePositiveInt(process.env.RATE_LIMIT_PLATFORM_GEOCODE_MAX, 60);

export const platformGeocodeRateLimitTimeWindowMs = (): number =>
  parseWindowMs(process.env.RATE_LIMIT_PLATFORM_GEOCODE_WINDOW, 60_000);
