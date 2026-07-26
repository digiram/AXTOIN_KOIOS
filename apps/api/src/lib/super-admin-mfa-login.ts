/**
 * Super-admin login MFA gate.
 *
 * Optional MFA step-up for platform operators who have enrolled TOTP or email MFA;
 * otherwise issues tokens immediately after password verification.
 *
 * Responsibilities:
 * - Detect enrolled MFA factors for super-admin users
 * - Sign platform-scoped MFA step tickets
 * - Issue access/refresh tokens when MFA is not enrolled
 *
 * Security:
 * - MFA tickets include `platform: true` and expire in 8 minutes
 */

import type { FastifyInstance } from "fastify";

import { getUserMfaRowById, type AuthUserRow } from "@starter/db";

import { enrichAccessTokenSignInput } from "./access-token-context.js";
import { issueTokens } from "./issue-tokens.js";

/** Discriminated result of super-admin login MFA evaluation. */
export type SuperAdminMfaLoginResult =
  | {
      kind: "tokens";
      accessToken: string;
      refreshToken: string;
      role: string;
    }
  | { kind: "mfa_required"; mfaTicket: string; methods: ("totp" | "email")[] };

export const signSuperAdminMfaTicket = (
  app: FastifyInstance,
  input: { userId: string; email: string; role: string }
) =>
  app.jwt.sign(
    {
      sub: input.userId,
      email: input.email,
      role: input.role,
      typ: "mfa_step",
      platform: true
    },
    { expiresIn: "8m" }
  );

/** Optional platform-operator MFA — only enforced when the user has enrolled. */
export const completeSuperAdminLoginWithMfa = async (
  app: FastifyInstance,
  user: AuthUserRow,
  emailLower: string
): Promise<SuperAdminMfaLoginResult> => {
  const row = await getUserMfaRowById(user.id);
  const enrolled = Boolean(row?.mfaTotpEnabled || row?.mfaEmailEnabled);

  if (enrolled) {
    const methods: ("totp" | "email")[] = [];
    if (row?.mfaTotpEnabled) methods.push("totp");
    if (row?.mfaEmailEnabled) methods.push("email");
    const mfaTicket = signSuperAdminMfaTicket(app, {
      userId: user.id,
      email: emailLower,
      role: user.role
    });
    return { kind: "mfa_required", mfaTicket, methods: methods.length > 0 ? methods : ["totp"] };
  }

  const tokens = await issueTokens(
    app,
    await enrichAccessTokenSignInput({
      userId: user.id,
      tenantId: undefined,
      email: emailLower,
      role: user.role,
      accessTokenVersion: user.accessTokenVersion
    })
  );
  return {
    kind: "tokens",
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    role: user.role
  };
};
