/**
 * Prometheus metrics routes — `registerMetricsRoutes` in `src/routes/metrics.ts`.
 *
 * Asserts scrape endpoint registration and auth/exposure behavior.
 */

import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import Fastify from "fastify";

import { registerMetricsRoutes } from "../src/routes/metrics.js";

describe("metrics routes", () => {
  it("requires bearer token in production when METRICS_BEARER_TOKEN is set", async () => {
    const origEnv = process.env.NODE_ENV;
    const origToken = process.env.METRICS_BEARER_TOKEN;
    process.env.NODE_ENV = "production";
    process.env.METRICS_BEARER_TOKEN = "metrics-test-secret";

    const app = Fastify({ logger: false });
    try {
      await registerMetricsRoutes(app);
      await app.ready();

      const denied = await app.inject({ method: "GET", url: "/metrics" });
      assert.equal(denied.statusCode, 401);

      const ok = await app.inject({
        method: "GET",
        url: "/metrics",
        headers: { authorization: "Bearer metrics-test-secret" }
      });
      assert.equal(ok.statusCode, 200);
      assert.match(ok.body, /starter_http_requests_total/);
    } finally {
      await app.close();
      if (origEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = origEnv;
      if (origToken === undefined) delete process.env.METRICS_BEARER_TOKEN;
      else process.env.METRICS_BEARER_TOKEN = origToken;
    }
  });

  it("does not register /metrics in production when METRICS_BEARER_TOKEN is unset", async () => {
    const origEnv = process.env.NODE_ENV;
    const origToken = process.env.METRICS_BEARER_TOKEN;
    process.env.NODE_ENV = "production";
    delete process.env.METRICS_BEARER_TOKEN;

    const app = Fastify({ logger: false });
    try {
      await registerMetricsRoutes(app);
      await app.ready();
      const res = await app.inject({ method: "GET", url: "/metrics" });
      assert.equal(res.statusCode, 404);
    } finally {
      await app.close();
      if (origEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = origEnv;
      if (origToken === undefined) delete process.env.METRICS_BEARER_TOKEN;
      else process.env.METRICS_BEARER_TOKEN = origToken;
    }
  });
});
