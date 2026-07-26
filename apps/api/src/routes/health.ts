/**
 * Operational probes — liveness (`/health`) and readiness (`/ready`).
 * Registered before global rate limiting so orchestrators are not throttled.
 */

import type { FastifyInstance } from "fastify";

import { pingDatabase } from "@starter/db";
import { cspHttpHeaderBytes, resolveCspMode, usesDatabaseBackend } from "@starter/shared";

import { pingRedis } from "../lib/redis-ping.js";

export const registerHealthRoutes = async (app: FastifyInstance): Promise<void> => {
  app.get("/health", async () => {
    const body: Record<string, unknown> = {
      status: "ok",
      service: "@starter/api"
    };
    if (process.env.NODE_ENV?.trim().toLowerCase() === "production") {
      body.cspMode = resolveCspMode();
      body.cspHttpHeaderBytes = cspHttpHeaderBytes({ surface: "api" });
    }
    return body;
  });

  app.get("/ready", async (_request, reply) => {
    const db = await pingDatabase();
    const databaseBackend = usesDatabaseBackend();
    const redis = databaseBackend ? ({ ok: true } as const) : await pingRedis();
    const ready = db.ok && redis.ok;
    const isProd = process.env.NODE_ENV?.trim().toLowerCase() === "production";
    const body = {
      status: ready ? "ready" : "not_ready",
      checks: {
        database: isProd ? { ok: db.ok } : { ok: db.ok, dialect: db.dialect, error: db.error },
        redis: databaseBackend
          ? { ok: true, skipped: true, reason: "QUEUE_STRATEGY=local" }
          : isProd
            ? { ok: redis.ok }
            : { ok: redis.ok, error: "error" in redis ? redis.error : undefined }
      }
    };
    if (!ready) {
      return reply.code(503).send(body);
    }
    return body;
  });
};
