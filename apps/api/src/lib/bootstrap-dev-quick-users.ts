/**
 * Development-only seed for LoginPage one-click accounts (`company.com` realm).
 * Idempotent: skips tenant/users that already exist.
 */

import argon2 from "argon2";
import type { FastifyBaseLogger } from "fastify";

import { findOrCreateTenantByName, findUserByTenantEmail, insertUser } from "@starter/db";

/** Must match `DEV_QUICK_PASSWORD` in `apps/web/src/pages/LoginPage.tsx`. */
const DEV_QUICK_PASSWORD = "Welcome01";

const DEV_QUICK_REALM = "company.com";

const DEV_QUICK_USERS = [
  { email: "ramli@company.com", role: "tenant_admin" as const },
  { email: "dave@company.com", role: "tenant_user" as const }
];

export const bootstrapDevQuickUsers = async (log: FastifyBaseLogger): Promise<void> => {
  const nodeEnv = process.env.NODE_ENV?.trim().toLowerCase() ?? "development";
  if (nodeEnv !== "development") return;

  const { id: tenantId } = await findOrCreateTenantByName(DEV_QUICK_REALM);
  const passwordHash = await argon2.hash(DEV_QUICK_PASSWORD);

  for (const user of DEV_QUICK_USERS) {
    const existing = await findUserByTenantEmail(tenantId, user.email);
    if (existing) continue;
    await insertUser({
      tenantId,
      email: user.email,
      passwordHash,
      role: user.role
    });
    log.info({ email: user.email, realm: DEV_QUICK_REALM }, "Bootstrap dev quick user created");
  }
};
