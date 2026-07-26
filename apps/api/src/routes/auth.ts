/**
 * Authentication routes: registration, login, and refresh-token rotation.
 *
 * Security model (starter defaults):
 * - **Passwords**: stored as Argon2 hashes only (`password_hash` column).
 * - **Access JWT**: short TTL (~15m), signed by `@fastify/jwt`, includes `sub`, `email`, `role`, and
 *   optionally `tenantId` for realm sessions (omitted for platform `super_admin`).
 * - **Refresh token**: opaque random string; only **SHA-256** appears in DB (`tenant_id` nullable for super admins).
 *
 * Persistence lives in `@starter/db` repositories (`packages/db/src/repos.ts`).
 */

import { randomBytes, randomInt } from "node:crypto";
import argon2 from "argon2";
import type { FastifyInstance } from "fastify";

import {
  deleteRefreshTokenById,
  deleteRefreshTokensByUserId,
  ensurePlatformModuleSettingsRow,
  findRefreshTokenWithUser,
  findSuperAdminByEmail,
  findUserByTenantEmail,
  getPlatformSmtpSettingsRow,
  getUserMfaRowById,
  hashMfaOtp,
  insertMfaOtpChallenge,
  countRecentMfaChallenges,
  insertRefreshToken,
  openTotpSecretForUser,
  resolveEffectiveSmtpForTenant,
  verifyAndConsumeMfaOtpChallenge
} from "@starter/db";
import {
  authMfaEmailSendBodySchema,
  authMfaVerifyBodySchema,
  loginSchema,
  logoutSchema,
  registerStartSchema,
  registerVerifySchema,
  tenantSelfRegistrationQuerySchema
} from "@starter/shared";
import { verifySync } from "otplib";

import { enrichAccessTokenSignInput } from "../lib/access-token-context.js";
import { issueTokens, signAccessToken } from "../lib/issue-tokens.js";
import { completeRealmLoginWithMfa } from "../lib/realm-mfa-login.js";
import { completeSuperAdminLoginWithMfa } from "../lib/super-admin-mfa-login.js";
import { resolveTenantIdFromEmailForRealmLogin } from "../lib/register-tenant.js";
import {
  assessRegistrationEligibility,
  completeVerifiedRegistration,
  parseRegistrationTicket,
  sendRegistrationVerificationCode,
  shouldExposeRegistrationVerificationCode,
  signRegistrationTicket,
  verifyRegistrationCode
} from "../lib/registration-flow.js";
import { sendMailHtml } from "../lib/mail-transport.js";
import {
  AUTH_INVALID_CREDENTIALS_MESSAGE,
} from "../lib/auth-response.js";
import {
  clearCsrfCookie,
  clearRefreshTokenCookie,
  readRefreshTokenFromRequest
} from "../lib/auth-cookies.js";
import { sendAuthTokenResponse } from "../lib/auth-token-response.js";
import { assertLoginNotLocked, clearLoginFailures, recordLoginFailure } from "../lib/login-lockout.js";
import {
  handleRefreshTokenReuse,
  markRefreshTokenConsumed
} from "../lib/refresh-token-rotation.js";
import { logSecurityEvent } from "../lib/security-audit-log.js";
import { hashRefreshToken } from "../lib/tokens.js";
import { requireTenantContext } from "../plugins/tenant.js";

/** Sliding refresh validity window for newly issued refresh tokens. */
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const mfaOtpPepper = (): string => {
  const p = process.env.MFA_OTP_PEPPER?.trim() || process.env.FIELD_ENCRYPTION_KEY?.trim();
  if (!p) {
    throw new Error("MFA_OTP_PEPPER or FIELD_ENCRYPTION_KEY must be set for MFA email codes");
  }
  return p;
};

const MFA_LOGIN_EMAIL_PURPOSE = "mfa_login_email";

export const registerAuthRoutes = async (app: FastifyInstance) => {
  /**
   * Public: whether self-service signup is open at the platform level.
   * Does not vary by `email` query (avoids realm existence / policy enumeration).
   */
  app.get("/self-registration", async (request, reply) => {
    const q = tenantSelfRegistrationQuerySchema.safeParse(request.query ?? {});
    if (!q.success) {
      return reply.code(400).send({ error: "validation_error", message: q.error.message });
    }

    const modules = await ensurePlatformModuleSettingsRow();
    return { selfRegisterEnabled: modules.selfRegisterEnabled };
  });

  /**
   * Signup step 1: validate eligibility and email a verification code (or return a dev/test code when SMTP is off).
   */
  app.post("/register/start", async (request, reply) => {
    const parsed = registerStartSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
    }

    const eligibility = await assessRegistrationEligibility(parsed.data);
    if (!eligibility.ok) {
      return reply.code(eligibility.status).send({
        error: eligibility.error,
        message: eligibility.message
      });
    }

    const passwordHash = await argon2.hash(parsed.data.password);
    const registrationTicket = signRegistrationTicket(app, {
      email: eligibility.email,
      name: parsed.data.name.trim(),
      ph: passwordHash,
      tk: eligibility.tenantKey,
      consumer: eligibility.consumer
    });

    try {
      const { code, emailed } = await sendRegistrationVerificationCode({
        email: eligibility.email,
        log: request.log
      });
      const out: {
        step: "verification_required";
        registrationTicket: string;
        expiresInSeconds: number;
        emailed: boolean;
        verificationCode?: string;
      } = {
        step: "verification_required",
        registrationTicket,
        expiresInSeconds: 15 * 60,
        emailed
      };
      if (shouldExposeRegistrationVerificationCode() && (!emailed || (process.env.NODE_ENV?.trim().toLowerCase() ?? "") === "test")) {
        out.verificationCode = code;
      } else if (!emailed) {
        return reply.code(503).send({
          error: "mail_not_configured",
          message: "Email verification requires platform SMTP. Configure mail in super-admin settings."
        });
      }
      return out;
    } catch (err) {
      const status =
        err !== null && typeof err === "object" && "statusCode" in err && typeof (err as { statusCode: unknown }).statusCode === "number"
          ? (err as { statusCode: number }).statusCode
          : 500;
      const message = err instanceof Error ? err.message : "Could not start registration.";
      const error =
        err !== null && typeof err === "object" && "error" in err && typeof (err as { error: unknown }).error === "string"
          ? (err as { error: string }).error
          : "server_error";
      return reply.code(status).send({ error, message });
    }
  });

  /** Signup step 2: verify email code and create the tenant user. */
  app.post("/register/verify", async (request, reply) => {
    const parsed = registerVerifySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
    }

    let rawPayload: unknown;
    try {
      rawPayload = await app.jwt.verify(parsed.data.registrationTicket);
    } catch {
      return reply.code(401).send({
        error: "invalid_token",
        message: "Registration session expired. Start sign-up again."
      });
    }

    const ticket = parseRegistrationTicket(rawPayload);
    if (!ticket) {
      return reply.code(400).send({ error: "validation_error", message: "Invalid registration ticket." });
    }

    const ok = await verifyRegistrationCode(ticket.email, parsed.data.code);
    if (!ok) {
      return reply.code(401).send({ error: "invalid_code", message: "That verification code was not valid." });
    }

    try {
      const { mfaOut, tenantId, role } = await completeVerifiedRegistration(app, ticket);
      if (mfaOut.kind === "blocked") {
        return reply.code(403).send({ error: "account_locked", message: mfaOut.message });
      }
      if (mfaOut.kind === "mfa_required") {
        return {
          step: "mfa_required",
          mfaTicket: mfaOut.mfaTicket,
          methods: mfaOut.methods,
          tenantId,
          role
        };
      }
      return sendAuthTokenResponse(reply, {
        accessToken: mfaOut.accessToken,
        refreshToken: mfaOut.refreshToken,
        tenantId,
        role: mfaOut.role,
        mfaEnrollmentDue: mfaOut.mfaEnrollmentDue,
        mfaGraceExpiresAt: mfaOut.mfaGraceExpiresAt
      });
    } catch (err) {
      const status =
        err !== null && typeof err === "object" && "statusCode" in err && typeof (err as { statusCode: unknown }).statusCode === "number"
          ? (err as { statusCode: number }).statusCode
          : 500;
      const message = err instanceof Error ? err.message : "Registration failed.";
      const error =
        err !== null && typeof err === "object" && "error" in err && typeof (err as { error: unknown }).error === "string"
          ? (err as { error: string }).error
          : "server_error";
      return reply.code(status).send({ error, message });
    }
  });

  /**
   * Login: **`email` + `password` only**. Tries **platform** `super_admin` (no tenant) first, then **realm** user by
   * deriving `tenant_id` from the **email domain** (same keys as `/auth/register`).
   */
  app.post("/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
    }

    const email = parsed.data.email;

    try {
      await assertLoginNotLocked(email);
    } catch (e) {
      const status =
        e !== null && typeof e === "object" && "statusCode" in e && typeof (e as { statusCode: unknown }).statusCode === "number"
          ? (e as { statusCode: number }).statusCode
          : 429;
      const message = e instanceof Error ? e.message : "Too many failed login attempts.";
      const error =
        e !== null && typeof e === "object" && "error" in e && typeof (e as { error: unknown }).error === "string"
          ? (e as { error: string }).error
          : "account_locked";
      return reply.code(status).send({ error, message });
    }

    const failLogin = async () => {
      await recordLoginFailure(email);
      return reply
        .code(401)
        .send({ error: "invalid_credentials", message: AUTH_INVALID_CREDENTIALS_MESSAGE });
    };

    const superUser = await findSuperAdminByEmail(email);
    if (superUser) {
      const ok = await argon2.verify(superUser.passwordHash, parsed.data.password);
      if (!ok) {
        return failLogin();
      }
      await clearLoginFailures(email);
      const mfaOut = await completeSuperAdminLoginWithMfa(app, superUser, email.toLowerCase());
      if (mfaOut.kind === "mfa_required") {
        return {
          step: "mfa_required",
          mfaTicket: mfaOut.mfaTicket,
          methods: mfaOut.methods,
          role: superUser.role
        };
      }
      return sendAuthTokenResponse(reply, {
        accessToken: mfaOut.accessToken,
        refreshToken: mfaOut.refreshToken,
        role: mfaOut.role
      });
    }

    const tenantId = await resolveTenantIdFromEmailForRealmLogin(email);
    if (!tenantId) {
      return failLogin();
    }

    const user = await findUserByTenantEmail(tenantId, email);
    if (!user) {
      return failLogin();
    }

    const valid = await argon2.verify(user.passwordHash, parsed.data.password);
    if (!valid) {
      return failLogin();
    }

    await clearLoginFailures(email);

    const mfaOut = await completeRealmLoginWithMfa(app, user, tenantId, user.email);
    if (mfaOut.kind === "blocked") {
      return reply.code(403).send({ error: "account_locked", message: mfaOut.message });
    }
    if (mfaOut.kind === "mfa_required") {
      return {
        step: "mfa_required",
        mfaTicket: mfaOut.mfaTicket,
        methods: mfaOut.methods,
        tenantId,
        role: user.role
      };
    }

    return sendAuthTokenResponse(reply, {
      accessToken: mfaOut.accessToken,
      refreshToken: mfaOut.refreshToken,
      tenantId,
      role: mfaOut.role,
      mfaEnrollmentDue: mfaOut.mfaEnrollmentDue,
      mfaGraceExpiresAt: mfaOut.mfaGraceExpiresAt
    });
  });

  app.post("/mfa/email/send", async (request, reply) => {
    const parsed = authMfaEmailSendBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
    }
    let payload: { sub?: string; typ?: string; tenantId?: string; email?: string; role?: string; platform?: boolean };
    try {
      payload = (await app.jwt.verify(parsed.data.mfaTicket)) as typeof payload;
    } catch {
      return reply.code(401).send({ error: "invalid_token", message: "MFA session expired. Sign in again." });
    }
    const isPlatformMfa = Boolean(payload.platform) || (payload.role === "super_admin" && !payload.tenantId);
    if (payload.typ !== "mfa_step" || !payload.sub || !payload.email) {
      return reply.code(400).send({ error: "validation_error", message: "Invalid MFA ticket" });
    }
    if (!isPlatformMfa && !payload.tenantId) {
      return reply.code(400).send({ error: "validation_error", message: "Invalid MFA ticket" });
    }
    if (!isPlatformMfa) {
      const modules = await ensurePlatformModuleSettingsRow();
      if (!modules.mfaTotpEnabled) {
        return reply.code(403).send({ error: "forbidden", message: "MFA is not enabled for this platform." });
      }
    }
    const user = await getUserMfaRowById(payload.sub);
    if (!user?.mfaEmailEnabled) {
      return reply.code(400).send({ error: "validation_error", message: "Email MFA is not enabled for this account." });
    }
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const sent = await countRecentMfaChallenges(payload.sub, MFA_LOGIN_EMAIL_PURPOSE, since);
    if (sent >= 5) {
      return reply.code(429).send({ error: "rate_limited", message: "Too many codes requested. Try again later." });
    }
    const code = String(randomInt(100_000, 1_000_000));
    const pepper = mfaOtpPepper();
    const codeHash = hashMfaOtp(pepper, payload.sub, MFA_LOGIN_EMAIL_PURPOSE, code);
    await insertMfaOtpChallenge({
      userId: payload.sub,
      purpose: MFA_LOGIN_EMAIL_PURPOSE,
      codeHash,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    });
    const smtp = isPlatformMfa
      ? await getPlatformSmtpSettingsRow()
      : (await resolveEffectiveSmtpForTenant(payload.tenantId!)).row;
    if (!smtp) {
      return reply.code(500).send({ error: "server_error", message: "Mail is not configured." });
    }
    try {
      await sendMailHtml({
        row: smtp,
        smtpScope: isPlatformMfa ? {} : { tenantId: payload.tenantId! },
        to: payload.email,
        subject: "Your sign-in verification code",
        html: `<p>Your verification code is:</p><p style="font-size:22px;font-weight:bold;letter-spacing:4px">${code}</p><p>This code expires in 10 minutes. If you did not try to sign in, ignore this email.</p>`
      });
    } catch (err) {
      app.log.warn({ err }, "mfa login email send failed");
      return reply.code(502).send({ error: "mail_error", message: "Could not send verification email." });
    }
    return { ok: true };
  });

  app.post("/mfa/verify", async (request, reply) => {
    const parsed = authMfaVerifyBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
    }
    let payload: { sub?: string; typ?: string; tenantId?: string; email?: string; role?: string; platform?: boolean };
    try {
      payload = (await app.jwt.verify(parsed.data.mfaTicket)) as typeof payload;
    } catch {
      return reply.code(401).send({ error: "invalid_token", message: "MFA session expired. Sign in again." });
    }
    const isPlatformMfa = Boolean(payload.platform) || (payload.role === "super_admin" && !payload.tenantId);
    if (payload.typ !== "mfa_step" || !payload.sub || !payload.email || !payload.role) {
      return reply.code(400).send({ error: "validation_error", message: "Invalid MFA ticket" });
    }
    if (!isPlatformMfa && !payload.tenantId) {
      return reply.code(400).send({ error: "validation_error", message: "Invalid MFA ticket" });
    }
    if (!isPlatformMfa) {
      const modules = await ensurePlatformModuleSettingsRow();
      if (!modules.mfaTotpEnabled) {
        return reply.code(403).send({ error: "forbidden", message: "MFA is not enabled for this platform." });
      }
    }
    const user = await getUserMfaRowById(payload.sub);
    if (!user) {
      return reply.code(401).send({ error: "invalid_credentials", message: "User not found" });
    }
    const code = parsed.data.code.replace(/\s+/g, "");
    let ok = false;
    if (parsed.data.method === "totp") {
      if (!user.mfaTotpEnabled || !user.mfaTotpSecretEncrypted) {
        return reply.code(400).send({ error: "validation_error", message: "Authenticator MFA is not active." });
      }
      try {
        const secret = await openTotpSecretForUser(user);
        ok = verifySync({ secret, token: code, epochTolerance: 2 }).valid;
      } catch {
        ok = false;
      }
    } else {
      if (!user.mfaEmailEnabled) {
        return reply.code(400).send({ error: "validation_error", message: "Email MFA is not active." });
      }
      const pepper = mfaOtpPepper();
      const codeHash = hashMfaOtp(pepper, payload.sub, MFA_LOGIN_EMAIL_PURPOSE, code);
      ok = await verifyAndConsumeMfaOtpChallenge({
        userId: payload.sub,
        purpose: MFA_LOGIN_EMAIL_PURPOSE,
        codeHash
      });
    }
    if (!ok) {
      return reply.code(401).send({ error: "invalid_code", message: "That code was not valid. Try again." });
    }
    const tokens = await issueTokens(
      app,
      await enrichAccessTokenSignInput({
        userId: payload.sub,
        tenantId: isPlatformMfa ? undefined : payload.tenantId,
        email: payload.email,
        role: payload.role,
        accessTokenVersion: user.accessTokenVersion
      })
    );
    return sendAuthTokenResponse(reply, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tenantId: isPlatformMfa ? undefined : payload.tenantId,
      role: payload.role
    });
  });

  /** Refresh-token rotation (consumes old refresh row; tenant scope preserved from token row). */
  app.post("/refresh", async (request, reply) => {
    const refreshRaw = readRefreshTokenFromRequest(request);
    if (!refreshRaw) {
      return reply.code(400).send({ error: "validation_error", message: "refreshToken is required" });
    }

    const tokenHash = hashRefreshToken(refreshRaw);
    const tokenRow = await findRefreshTokenWithUser(tokenHash);
    if (!tokenRow) {
      if (await handleRefreshTokenReuse({ tokenHash, requestId: request.requestId, log: request.log })) {
        clearRefreshTokenCookie(reply);
        clearCsrfCookie(reply);
        return reply.code(401).send({ error: "invalid_refresh_token", message: "Token is invalid or expired" });
      }
      return reply.code(401).send({ error: "invalid_refresh_token", message: "Token is invalid or expired" });
    }

    if (tokenRow.expiresAt.getTime() <= Date.now()) {
      await deleteRefreshTokenById(tokenRow.tokenId);
      return reply.code(401).send({ error: "invalid_refresh_token", message: "Token is invalid or expired" });
    }

    await markRefreshTokenConsumed(tokenRow, tokenHash);

    const refreshToken = randomBytes(32).toString("base64url");
    await insertRefreshToken({
      userId: tokenRow.userId,
      tenantId: tokenRow.tenantId,
      userDeviceId: tokenRow.userDeviceId,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS)
    });

    const accessToken = signAccessToken(
      app,
      await enrichAccessTokenSignInput({
        userId: tokenRow.userId,
        email: tokenRow.email,
        role: tokenRow.role,
        tenantId: tokenRow.tenantId,
        accessTokenVersion: tokenRow.accessTokenVersion
      })
    );

    return sendAuthTokenResponse(reply, {
      accessToken,
      refreshToken,
      tenantId: tokenRow.tenantId ?? undefined,
      role: tokenRow.role
    });
  });

  /** Revoke the current refresh session (and optionally all sessions when access JWT is valid). */
  app.post("/logout", async (request, reply) => {
    const parsed = logoutSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
    }

    let actorUserId: string | undefined;
    if (parsed.data.revokeAll) {
      await requireTenantContext(request, reply);
      if (reply.sent) return;
      actorUserId = request.userId;
      if (actorUserId) {
        await deleteRefreshTokensByUserId(actorUserId);
        logSecurityEvent(request.log, {
          action: "auth.logout_all",
          actorUserId,
          requestId: request.requestId,
          outcome: "ok"
        });
      }
    } else {
      const refreshRaw = readRefreshTokenFromRequest(request);
      if (refreshRaw) {
        const tokenRow = await findRefreshTokenWithUser(hashRefreshToken(refreshRaw));
        if (tokenRow) {
          actorUserId = tokenRow.userId;
          await deleteRefreshTokenById(tokenRow.tokenId);
        }
      }
      logSecurityEvent(request.log, {
        action: "auth.logout",
        actorUserId: actorUserId ?? null,
        requestId: request.requestId,
        outcome: "ok"
      });
    }

    clearRefreshTokenCookie(reply);
    clearCsrfCookie(reply);
    return { ok: true };
  });
};
