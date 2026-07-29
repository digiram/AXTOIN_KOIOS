/**
 * Tests for worker health HTTP server port gating and `/health` response.
 *
 * Under test: `../src/health-server.js`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import http from "node:http";

import { startWorkerHealthServer } from "../src/health-server.js";

const allocateEphemeralPort = async (): Promise<number> => {
  const probe = http.createServer();
  await new Promise<void>((resolve, reject) => {
    probe.listen(0, "127.0.0.1", () => resolve());
    probe.on("error", reject);
  });
  const addr = probe.address();
  assert.ok(addr && typeof addr === "object");
  const freePort = addr.port;
  await new Promise<void>((resolve, reject) => {
    probe.close((err) => (err ? reject(err) : resolve()));
  });
  return freePort;
};

describe("startWorkerHealthServer", () => {
  it("skips listen when no port env is set", () => {
    assert.equal(startWorkerHealthServer(undefined, undefined), null);
  });

  it("binds and returns JSON on /health", async () => {
    const freePort = await allocateEphemeralPort();
    const handle = startWorkerHealthServer(String(freePort), undefined);
    assert.ok(handle);
    assert.equal(handle.port, freePort);

    try {
      let body = "";
      let lastErr: unknown;
      for (let attempt = 0; attempt < 40; attempt++) {
        try {
          body = await new Promise<string>((resolve, reject) => {
            http
              .get(`http://127.0.0.1:${freePort}/health`, (res) => {
                assert.equal(res.statusCode, 200);
                const chunks: Buffer[] = [];
                res.on("data", (c) => chunks.push(c));
                res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
              })
              .on("error", reject);
          });
          lastErr = undefined;
          break;
        } catch (err) {
          lastErr = err;
          await new Promise((r) => setTimeout(r, 25));
        }
      }
      if (lastErr) throw lastErr;

      const json = JSON.parse(body) as { status: string; service: string };
      assert.equal(json.status, "ok");
      assert.equal(json.service, "@starter/worker");
    } finally {
      await handle.close();
    }
  });
});
