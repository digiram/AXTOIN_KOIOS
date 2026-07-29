/**
 * Worker liveness HTTP server.
 *
 * Minimal Node `http` listener so Hostinger (and other PaaS) can keep a Web App
 * process warm via `GET /health` on the jobs hostname. Not a full readiness probe.
 *
 * Responsibilities:
 * - Serve `GET /health` with a small JSON body
 * - Bind `0.0.0.0` on the resolved worker health port
 * - No-op when no port is configured (local `pnpm dev:worker` default)
 *
 * Depends on:
 * - `@starter/shared` `resolveWorkerHealthListenPort`
 * - `@starter/logger` for bind / error logs
 *
 * Security:
 * - Public liveness only — no secrets, no DB details, no admin actions
 */

import http from "node:http";

import { createLogger } from "@starter/logger";
import { resolveWorkerHealthListenPort } from "@starter/shared";

const log = createLogger("worker-health");

const HEALTH_BODY = JSON.stringify({
  status: "ok",
  service: "@starter/worker"
});

export type WorkerHealthServerHandle = {
  port: number;
  close: () => Promise<void>;
};

/**
 * Starts the worker health HTTP server when `WORKER_PORT` or platform `PORT` is set.
 * Returns a handle, or `null` when health HTTP is skipped.
 */
export const startWorkerHealthServer = (
  workerPortEnv: string | undefined = process.env.WORKER_PORT,
  platformPortEnv: string | undefined = process.env.PORT
): WorkerHealthServerHandle | null => {
  const port = resolveWorkerHealthListenPort(workerPortEnv, platformPortEnv);
  if (port == null) {
    log.debug("Worker health HTTP skipped — set WORKER_PORT or PORT to enable");
    return null;
  }

  const server = http.createServer((req, res) => {
    const path = req.url?.split("?")[0] ?? "";
    if (req.method === "GET" && (path === "/health" || path === "/")) {
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store"
      });
      res.end(HEALTH_BODY);
      return;
    }
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not Found");
  });

  server.on("error", (err) => {
    log.error({ err, port }, "Worker health HTTP listen failed");
  });

  server.listen(port, "0.0.0.0", () => {
    log.info({ host: "0.0.0.0", port, path: "/health" }, "Worker health HTTP listening");
  });

  return {
    port,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      })
  };
};
