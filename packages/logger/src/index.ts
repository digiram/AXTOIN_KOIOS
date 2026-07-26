/**
 * Structured logging for terminal and log collectors using **Pino**.
 *
 * Central factory for API, worker, and package loggers with level resolution from
 * environment and optional pretty printing in non-production.
 *
 * Responsibilities:
 * - Resolve log level (`LOG_LEVEL`, `VERBOSE`, `NODE_ENV` defaults)
 * - Create service-scoped Pino loggers with redaction in production JSON mode
 * - Re-export dev terminal readiness banner helper
 *
 * Security:
 * - Redacts `authorization` and `cookie` request headers in production JSON output
 *
 * Notes:
 * - See file header env list for `LOG_LEVEL`, `VERBOSE`, `LOG_PRETTY` behavior
 */

import pino from "pino";

export { printDevServiceReady, type DevReadyLine } from "./dev-terminal-banner.js";

const VALID_LEVELS = new Set([
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent"
]);

/**
 * Resolves effective Pino log level from environment.
 *
 * Precedence: valid `LOG_LEVEL` → `VERBOSE` shorthand → production `info` else `debug`.
 */
export const resolveLogLevel = (): string => {
  const explicit = process.env.LOG_LEVEL?.trim().toLowerCase();
  if (explicit && VALID_LEVELS.has(explicit)) {
    return explicit;
  }
  if (process.env.VERBOSE === "true" || process.env.VERBOSE === "1") {
    return "debug";
  }
  return process.env.NODE_ENV === "production" ? "info" : "debug";
};

/**
 * Creates a service-scoped logger. Each process should use one root (`api`, `worker`, …);
 * use `logger.child({ component: 'auth' })` for subsystems when needed.
 */
export const createLogger = (service: string): pino.Logger => {
  const level = resolveLogLevel();
  const usePretty =
    process.env.LOG_PRETTY !== "false" && process.env.NODE_ENV !== "production";

  const base = { service };

  if (usePretty) {
    return pino({
      level,
      base,
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:HH:MM:ss.l",
          ignore: "pid,hostname",
          singleLine: false,
          messageKey: "msg"
        }
      }
    });
  }

  return pino({
    level,
    base,
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: ["req.headers.authorization", "req.headers.cookie"],
      censor: "[Redacted]"
    }
  });
};
