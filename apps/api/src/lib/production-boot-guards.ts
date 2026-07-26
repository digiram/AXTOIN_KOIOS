/**
 * Production startup policy — fail fast on unsafe configuration before migrations or listen.
 */

import { deriveTenantKey } from "@starter/crypto";
import { AMBIGUOUS_PROD_AUTO_MIGRATE_VALUES } from "@starter/db";
import { usesRedisBackend } from "@starter/shared";

import { refreshTokenInCookieEnabled } from "./auth-cookies.js";

export type ProductionBootLogger = {
  warn: (obj: object, msg?: string) => void;
};

const isTruthy = (v: string | undefined): boolean => v === "true" || v === "1";

const hasBootstrapSuperAdminEnv = (): boolean => {
  const email = process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL?.trim() ?? "";
  const password = process.env.BOOTSTRAP_SUPER_ADMIN_PASSWORD?.trim() ?? "";
  return email.length > 0 && password.length > 0;
};

/**
 * @throws Error when production env is misconfigured.
 */
export const assertProductionBootConfig = (opts: { nodeEnv: string; logger?: ProductionBootLogger }): void => {
  if (opts.nodeEnv !== "production") return;

  const fieldKey = process.env.FIELD_ENCRYPTION_KEY?.trim() ?? "";
  if (!fieldKey) {
    throw new Error(
      "FIELD_ENCRYPTION_KEY must be set in production (base64-encoded 32-byte key for AES-256-GCM at rest)."
    );
  }
  try {
    deriveTenantKey(fieldKey, "production-boot-check");
  } catch {
    throw new Error("FIELD_ENCRYPTION_KEY must decode to exactly 32 bytes (base64-encoded AES-256 key).");
  }

  if (hasBootstrapSuperAdminEnv() && !isTruthy(process.env.ALLOW_BOOTSTRAP_SUPER_ADMIN)) {
    throw new Error(
      "BOOTSTRAP_SUPER_ADMIN_* is set but ALLOW_BOOTSTRAP_SUPER_ADMIN is not true. " +
        "Remove bootstrap credentials or set ALLOW_BOOTSTRAP_SUPER_ADMIN=true for intentional one-time seeding."
    );
  }

  const autoMigrateRaw = process.env.AUTO_MIGRATE?.trim().toLowerCase();
  if (autoMigrateRaw && AMBIGUOUS_PROD_AUTO_MIGRATE_VALUES.has(autoMigrateRaw)) {
    throw new Error(
      `AUTO_MIGRATE='${autoMigrateRaw}' is ambiguous in production. ` +
        "Use AUTO_MIGRATE=force to run migrations on boot deliberately, " +
        "or AUTO_MIGRATE=off to apply them out-of-band via pnpm db:migrate."
    );
  }

  if (isTruthy(process.env.ALLOW_PLAINTEXT_BLOB_STORAGE)) {
    throw new Error(
      "ALLOW_PLAINTEXT_BLOB_STORAGE must not be enabled in production — set FIELD_ENCRYPTION_KEY for encrypted uploads."
    );
  }

  if (usesRedisBackend()) {
    const redisUrl = process.env.REDIS_URL?.trim() ?? "";
    const tlsOptOut = process.env.REDIS_TLS?.trim().toLowerCase() === "false";
    if (redisUrl && !redisUrl.startsWith("rediss://") && !tlsOptOut) {
      opts.logger?.warn(
        {
          redisTls: "plaintext",
          hint: "Use rediss:// for TLS in production, or set REDIS_TLS=false to acknowledge a private-network Redis."
        },
        "Production REDIS_URL is not using TLS (rediss://)"
      );
    }
  }

  const dbSsl = process.env.DATABASE_SSL?.trim().toLowerCase();
  if (dbSsl !== "require" && dbSsl !== "true") {
    opts.logger?.warn(
      {
        databaseSsl: dbSsl || "unset",
        hint: "Set DATABASE_SSL=require for encrypted Postgres connections in production (Supabase sets this automatically)."
      },
      "Production database connection may not use TLS"
    );
  }

  const blobBackend = (process.env.BLOB_STORAGE_BACKEND ?? "local").trim().toLowerCase();
  const allowLocalBlob = isTruthy(process.env.ALLOW_LOCAL_BLOB_STORAGE);
  if (blobBackend === "local" && !allowLocalBlob) {
    opts.logger?.warn(
      {
        blobStorageBackend: "local",
        hint: "Set BLOB_STORAGE_BACKEND=s3 and S3_* env for multi-instance production, or ALLOW_LOCAL_BLOB_STORAGE=true for single-node only."
      },
      "Production is using local disk blob storage — not safe behind a load balancer with multiple API replicas"
    );
  }

  if (refreshTokenInCookieEnabled()) {
    if (!isTruthy(process.env.CORS_CREDENTIALS)) {
      throw new Error(
        "REFRESH_TOKEN_IN_COOKIE is enabled in production but CORS_CREDENTIALS is not true. " +
          "Set CORS_CREDENTIALS=true and list every web origin in CORS_ORIGINS."
      );
    }
    const corsOrigins = process.env.CORS_ORIGINS?.trim() ?? "";
    if (!corsOrigins) {
      throw new Error(
        "REFRESH_TOKEN_IN_COOKIE is enabled in production but CORS_ORIGINS is empty. " +
          "Set CORS_ORIGINS to the exact browser origins that may call this API."
      );
    }
  }

  opts.logger?.warn(
    { productionGuards: true },
    "Production boot guards passed (encryption key, bootstrap, migrate policy)"
  );
};
