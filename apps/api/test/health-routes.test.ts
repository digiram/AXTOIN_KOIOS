/**
 * Health probe routes — `registerHealthRoutes` in `src/routes/health.ts`.
 *
 * Asserts liveness/readiness endpoints and response shapes.
 */

import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import Fastify from "fastify";

import { registerHealthRoutes } from "../src/routes/health.js";

describe("health routes", () => {
  const app = Fastify({ logger: false });

  after(async () => {
    await app.close();
  });

  it("GET /health returns ok without dependencies", async () => {
    await registerHealthRoutes(app);
    const res = await app.inject({ method: "GET", url: "/health" });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { status: string; service: string };
    assert.equal(body.status, "ok");
    assert.equal(body.service, "@starter/api");
  });
});
