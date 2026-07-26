/**
 * HTTP API entrypoint (`@starter/api`).
 *
 * Boot order:
 * 1. Load env (`dotenv`).
 * 2. Minimal env validation (`assertMinimalBootEnv`).
 * 3. Production boot guards.
 * 4. Optionally apply SQL migrations (see `@starter/db` `shouldAutoMigrate` / `runMigrations`).
 * 5. Optionally bootstrap platform super admin from `BOOTSTRAP_SUPER_ADMIN_*` (see `lib/bootstrap-super-admin.ts`).
 * 6. In development, seed LoginPage quick-login users for `company.com` (see `lib/bootstrap-dev-quick-users.ts`).
 * 7. Build Fastify app (`app.ts`) and listen on `API_PORT` — default **3500** (see `resolveApiListenPort`).
 *
 * Multitenancy is enforced inside routes via JWT claims + repositories that always scope by `tenant_id`.
 */

import "./env-bootstrap.js";
import { createLogger, printDevServiceReady, resolveLogLevel } from "@starter/logger";
import { resolveApiListenPort } from "@starter/shared";
import { assertMinimalBootEnv, runMigrations, shouldAutoMigrate } from "@starter/db";

import { buildApp } from "./app.js";
import { bootstrapSuperAdmin } from "./lib/bootstrap-super-admin.js";
import { bootstrapDevQuickUsers } from "./lib/bootstrap-dev-quick-users.js";
import { assertProductionBootConfig } from "./lib/production-boot-guards.js";
import { resolveJwtAccessSecret } from "./lib/jwt-secret.js";
import { shutdownJobQueueWsHub } from "./lib/job-queue-ws-hub.js";

const apiDevBootStartedAt = Date.now();

const port = resolveApiListenPort(process.env.API_PORT);
const nodeEnv = process.env.NODE_ENV ?? "development";
const dialect = process.env.DATABASE_DIALECT ?? "postgres";

const rootLogger = createLogger("api");
const corsOriginsRaw = process.env.CORS_ORIGINS?.trim();
const corsMode = corsOriginsRaw
  ? "allowlist"
  : nodeEnv === "production"
    ? "deny-cross-origin"
    : "reflect-request-origin";
rootLogger.info({
  msg: "API boot sequence started",
  nodeEnv,
  logLevel: resolveLogLevel(),
  port,
  databaseDialect: dialect,
  autoMigrate: shouldAutoMigrate(),
  httpRequestLogging: process.env.LOG_HTTP !== "false",
  corsMode,
  corsCredentials: process.env.CORS_CREDENTIALS === "true"
});

try {
  assertMinimalBootEnv({ nodeEnv, role: "api" });
} catch (err) {
  rootLogger.fatal(err, "Minimal environment configuration incomplete — refusing to start");
  process.exit(1);
}

try {
  assertProductionBootConfig({ nodeEnv, logger: rootLogger });
} catch (err) {
  rootLogger.fatal(err, "Production boot configuration invalid — refusing to start");
  process.exit(1);
}

if (shouldAutoMigrate()) {
  try {
    rootLogger.info("Applying database migrations before listen");
    await runMigrations();
    rootLogger.info("Database migrations finished");
  } catch (error) {
    rootLogger.fatal(error, "Database migration failed");
    process.exit(1);
  }
} else {
  rootLogger.debug("AUTO_MIGRATE disabled - skipping in-process migrations");
}

try {
  await bootstrapSuperAdmin(rootLogger);
  await bootstrapDevQuickUsers(rootLogger);
} catch (error) {
  rootLogger.fatal(error, "Bootstrap admin seed failed");
  process.exit(1);
}

let jwtAccessSecret: string;
try {
  jwtAccessSecret = resolveJwtAccessSecret({ nodeEnv, logger: rootLogger });
} catch (err) {
  rootLogger.fatal(err, "JWT access secret configuration invalid — refusing to start");
  process.exit(1);
}

const app = await buildApp({
  jwtAccessSecret,
  loggerInstance: rootLogger,
  logHttp: process.env.LOG_HTTP !== "false"
});

app.addHook("onClose", async () => {
  await shutdownJobQueueWsHub();
});

try {
  await app.listen({ host: "0.0.0.0", port });
} catch (error) {
  const code =
    error !== null && typeof error === "object" && "code" in error
      ? String((error as NodeJS.ErrnoException).code)
      : "";
  if (code === "EADDRINUSE") {
    app.log.error(
      {
        port,
        err: error,
        hint:
          `Port ${port} is already in use (another API / Node process, or a stale dev server). ` +
          `Stop the other process (Ctrl+C in its terminal), set API_PORT to a free port, or on Windows: ` +
          `"netstat -ano | findstr :${port}" then "taskkill /PID <pid> /F".`
      },
      "HTTP listen failed: EADDRINUSE"
    );
  } else {
    app.log.error(error, "HTTP listen failed");
  }
  process.exit(1);
}
app.log.info(
  { host: "0.0.0.0", port, stopWith: "Ctrl+C" },
  "HTTP server listening — stop with Ctrl+C"
);

if (nodeEnv !== "production") {
  const readyMs = Date.now() - apiDevBootStartedAt;
  printDevServiceReady("@starter/api", readyMs, [
    { label: "HTTP", value: `http://127.0.0.1:${port}/` },
    {
      label: "WebSocket",
      value: `ws://127.0.0.1:${port}/platform/ws/job-queues?accessToken=<jwt>`
    }
  ]);
  void import("../../../scripts/dev-process-registry.mjs").then((m) =>
    m.markDevProcessReady({ pid: process.pid, port })
  );
}

let shuttingDown = false;
const shutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, "Closing HTTP server");
  try {
    await app.close();
  } catch (error) {
    app.log.error(error, "Error while closing HTTP server");
  }
  process.exit(0);
};
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}
