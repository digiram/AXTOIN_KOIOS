/**
 * Optional platform **super admin** bootstrap — no tenant (`tenant_id` NULL), env credentials only.
 *
 * When a row with `tenant_id IS NULL` and the same email already exists, nothing is created or updated.
 */

import argon2 from "argon2";
import type { FastifyBaseLogger } from "fastify";

import { findSuperAdminByEmail, insertUser } from "@starter/db";

const passwordOk = (v: string) => v.length >= 8;
/** Matches platform login: non-empty trimmed id, max length (DB `users.email` holds the sign-in key). */
const signInIdOk = (v: string) => {
  const t = v.trim();
  return t.length >= 1 && t.length <= 320;
};

export const bootstrapSuperAdmin = async (log: FastifyBaseLogger): Promise<void> => {
  const emailRaw = process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL?.trim() ?? "";
  const password = process.env.BOOTSTRAP_SUPER_ADMIN_PASSWORD?.trim() ?? "";

  if (!emailRaw || !password) {
    log.debug(
      "Bootstrap super admin skipped - set BOOTSTRAP_SUPER_ADMIN_EMAIL and BOOTSTRAP_SUPER_ADMIN_PASSWORD to enable"
    );
    return;
  }

  if (!signInIdOk(emailRaw)) {
    log.warn(
      "Bootstrap super admin skipped - BOOTSTRAP_SUPER_ADMIN_EMAIL must be a non-empty sign-in id (max 320 characters)"
    );
    return;
  }
  if (!passwordOk(password)) {
    log.warn("Bootstrap super admin skipped - BOOTSTRAP_SUPER_ADMIN_PASSWORD must be at least 8 characters");
    return;
  }

  const email = emailRaw.toLowerCase();

  const existing = await findSuperAdminByEmail(email);
  if (existing) {
    log.debug({ email }, "Bootstrap super admin skipped - platform administrator already exists");
    return;
  }

  const passwordHash = await argon2.hash(password);
  await insertUser({
    tenantId: null,
    email,
    passwordHash,
    role: "super_admin"
  });
  log.info({ email }, "Bootstrap super admin: created platform administrator");
};
