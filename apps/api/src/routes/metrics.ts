/**
 * Prometheus metrics scrape route.
 *
 * Registers `GET /metrics` when metrics export is enabled for the current environment.
 *
 * Responsibilities:
 * - Conditionally mount the metrics endpoint
 * - Return Prometheus text exposition format
 *
 * Security:
 * - Production requires bearer token via `requireMetricsAuth`
 */

import type { FastifyInstance } from "fastify";

import { renderPrometheusMetrics } from "../lib/metrics.js";
import { metricsRouteEnabled, requireMetricsAuth } from "../lib/metrics-auth.js";

/** Registers `GET /metrics` when `metricsRouteEnabled()` is true. */
export const registerMetricsRoutes = async (app: FastifyInstance): Promise<void> => {
  if (!metricsRouteEnabled()) return;

  app.get(
    "/metrics",
    { preHandler: requireMetricsAuth },
    async (_request, reply) => {
      return reply.type("text/plain; version=0.0.4; charset=utf-8").send(renderPrometheusMetrics());
    }
  );
};
