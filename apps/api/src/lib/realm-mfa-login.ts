/**
 * Realm login MFA gate.
 *
 * Decides whether a successful password login issues tokens immediately, requires
 * MFA step-up, or blocks access when enrollment grace has expired.
 *
 * Responsibilities:
 * - Honor platform and tenant MFA enforcement settings
 * - Start or check MFA grace windows for enforced tenants
 * - Issue MFA step tickets or full token pairs
 *
 * Related:
 * - `routes/auth.ts` — realm login entrypoint
 * - `routes/account-mfa.ts` — enrollment after login
 *
 * Security:
 * - MFA tickets are short-lived JWTs (`typ: mfa_step`)
 * - Blocks users who missed enforced enrollment deadlines
 */

import type { FastifyInstance } from "fastify";

import {
  ensurePlatformModuleSettingsRow,
  getTenantGeneralSettings,
  getUserMfaRowById,
  setUserMfaBlockedAt,
  setUserMfaGraceExpiresAt,
  touchFirstPasswordLoginAt,
  type RealmLoginUserRow
} from "@starter/db";

import { enrichAccessTokenSignInput } from "./access-token-context.js";
import { issueTokens } from "./issue-tokens.js";

const MFA_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

/** Discriminated result of realm login MFA evaluation. */
export type RealmMfaLoginResult =
  | {
      kind: "tokens";
      accessToken: string;
      refreshToken: string;
      tenantId: string;
      role: string;
      mfaEnrollmentDue?: boolean;
      mfaGraceExpiresAt?: string | null;
    }
  | { kind: "mfa_required"; mfaTicket: string; methods: ("totp" | "email")[] }
  | { kind: "blocked"; message: string };

const signMfaTicket = (
  app: FastifyInstance,
  input: { userId: string; email: string; role: string; tenantId: string }
) =>
  app.jwt.sign(
    {
      sub: input.userId,
      email: input.email,
      role: input.role,
      tenantId: input.tenantId,
      typ: "mfa_step"
    },
    { expiresIn: "8m" }
  );

export const completeRealmLoginWithMfa = async (
  app: FastifyInstance,
  user: RealmLoginUserRow,
  tenantId: string,
  emailLower: string
): Promise<RealmMfaLoginResult> => {
  await touchFirstPasswordLoginAt(user.id);

  const modules = await ensurePlatformModuleSettingsRow();
  if (!modules.mfaTotpEnabled) {
    const tokens = await issueTokens(
      app,
      await enrichAccessTokenSignInput({
        userId: user.id,
        tenantId,
        email: emailLower,
        role: user.role,
        accessTokenVersion: user.accessTokenVersion
      })
    );
    return {
      kind: "tokens",
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tenantId,
      role: user.role
    };
  }

  const tenant = await getTenantGeneralSettings(tenantId);
  const enrolled = Boolean(user.mfaTotpEnabled || user.mfaEmailEnabled);

  let u = (await getUserMfaRowById(user.id))!;

  if (u.mfaBlockedAt && !enrolled) {
    return {
      kind: "blocked",
      message:
        "This account requires multi-factor authentication. The setup window has expired. Ask your tenant administrator to reset MFA access for your user."
    };
  }

  if (tenant?.mfaEnforced && !enrolled) {
    if (!u.mfaGraceExpiresAt) {
      await setUserMfaGraceExpiresAt(user.id, new Date(Date.now() + MFA_GRACE_MS));
      u = (await getUserMfaRowById(user.id))!;
    }
    if (u.mfaGraceExpiresAt && Date.now() > u.mfaGraceExpiresAt.getTime()) {
      await setUserMfaBlockedAt(user.id, new Date());
      return {
        kind: "blocked",
        message:
          "Multi-factor authentication was required but not completed in time. Contact your tenant administrator to restore access."
      };
    }
  }

  if (enrolled) {
    const row = await getUserMfaRowById(user.id);
    const methods: ("totp" | "email")[] = [];
    if (row?.mfaTotpEnabled) methods.push("totp");
    if (row?.mfaEmailEnabled) methods.push("email");
    const mfaTicket = signMfaTicket(app, {
      userId: user.id,
      email: emailLower,
      role: user.role,
      tenantId
    });
    return { kind: "mfa_required", mfaTicket, methods: methods.length > 0 ? methods : ["totp"] };
  }

  const versionRow = await getUserMfaRowById(user.id);
  const tokens = await issueTokens(
    app,
    await enrichAccessTokenSignInput({
      userId: user.id,
      tenantId,
      email: emailLower,
      role: user.role,
      accessTokenVersion: versionRow?.accessTokenVersion ?? user.accessTokenVersion
    })
  );
  return {
    kind: "tokens",
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    tenantId,
    role: user.role,
    mfaEnrollmentDue: Boolean(tenant?.mfaEnforced),
    mfaGraceExpiresAt: versionRow?.mfaGraceExpiresAt ? versionRow.mfaGraceExpiresAt.toISOString() : null
  };
};
