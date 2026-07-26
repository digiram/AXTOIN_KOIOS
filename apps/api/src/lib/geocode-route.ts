/**
 * Shared Nominatim geocode HTTP handler + optional rate-limit registration.
 */

import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { ensurePlatformGeolocationSettingsRow } from "@starter/db";
import { crmGeocodeSearchQuerySchema } from "@starter/shared";

import {
  accountGeocodeRateLimitMax,
  accountGeocodeRateLimitTimeWindowMs,
  crmGeocodeRateLimitMax,
  crmGeocodeRateLimitTimeWindowMs,
  platformGeocodeRateLimitMax,
  platformGeocodeRateLimitTimeWindowMs
} from "./http-rate-limit-config.js";
import { readGeocodeErrorStatus, nominatimSearchForward } from "./nominatim-geocode.js";

export const handleGeocodeSearch = async (request: FastifyRequest, reply: FastifyReply) => {
  const parsed = crmGeocodeSearchQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
  }
  try {
    const { results } = await nominatimSearchForward({
      q: parsed.data.q,
      limit: parsed.data.limit
    });
    return { results };
  } catch (err) {
    const status = readGeocodeErrorStatus(err) ?? 500;
    const message = err instanceof Error ? err.message : "Geocoding failed.";
    return reply.code(status).send({ error: status === 502 ? "bad_gateway" : "geocode_error", message });
  }
};

export const handleGeocodeStatus = async () => {
  const row = await ensurePlatformGeolocationSettingsRow();
  return { enabled: Boolean(row.nominatimEnabled) };
};

type GeocodeRateLimitProfile = "crm" | "account" | "platform";

export const registerGeocodeRateLimit = async (
  scope: FastifyInstance,
  profile: GeocodeRateLimitProfile
): Promise<void> => {
  const configs: Record<
    GeocodeRateLimitProfile,
    { max: () => number; window: () => number; namespace: string; key: (req: FastifyRequest) => string }
  > = {
    crm: {
      max: crmGeocodeRateLimitMax,
      window: crmGeocodeRateLimitTimeWindowMs,
      namespace: "crm-geocode",
      key: (req) => {
        const tid = req.tenantId;
        return typeof tid === "string" && tid.length > 0 ? `tenant:${tid}` : `ip:${req.ip}`;
      }
    },
    account: {
      max: accountGeocodeRateLimitMax,
      window: accountGeocodeRateLimitTimeWindowMs,
      namespace: "account-geocode",
      key: (req) => {
        const uid = req.userId;
        return typeof uid === "string" && uid.length > 0 ? `user:${uid}` : `ip:${req.ip}`;
      }
    },
    platform: {
      max: platformGeocodeRateLimitMax,
      window: platformGeocodeRateLimitTimeWindowMs,
      namespace: "platform-geocode",
      key: (req) => {
        const sub = (req.user as { sub?: string } | undefined)?.sub;
        return typeof sub === "string" && sub.length > 0 ? `super:${sub}` : `ip:${req.ip}`;
      }
    }
  };

  const cfg = configs[profile];
  await scope.register(rateLimit, {
    max: cfg.max(),
    timeWindow: cfg.window(),
    hook: "preHandler",
    nameSpace: cfg.namespace,
    keyGenerator: cfg.key
  });
};
