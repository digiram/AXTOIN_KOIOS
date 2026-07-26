/**
 * Two-step registration: email verification before tenant/user creation.
 */

import { randomInt } from "node:crypto";

import argon2 from "argon2";
import type { FastifyInstance } from "fastify";

import {
  countRecentEmailOtpChallenges,
  countTenantAdmins,
  ensurePlatformModuleSettingsRow,
  ensureSystemRelationshipTypesForTenant,
  findOrCreateTenantByName,
  findTenantByExactName,
  findUserByTenantEmail,
  getPlatformSmtpSettingsRow,
  hashEmailOtp,
  insertEmailOtpChallenge,
  insertUser,
  REGISTRATION_EMAIL_VERIFY_PURPOSE,
  verifyAndConsumeEmailOtpChallenge
} from "@starter/db";
import {
  extractEmailDomain,
  isConsumerEmailProviderDomain,
  type RegisterStartInput
} from "@starter/shared";

import { AUTH_REGISTRATION_FAILED_MESSAGE } from "./auth-response.js";
import { completeRealmLoginWithMfa } from "./realm-mfa-login.js";
import { personalTenantKeyFromEmail } from "./register-tenant.js";
import { sendMailHtml } from "./mail-transport.js";
import { enqueueWelcomeEmail } from "./email-queue.js";

export type RegistrationTicketPayload = {
  typ: "registration_step";
  email: string;
  name: string;
  ph: string;
  tk: string;
  consumer: boolean;
};

const otpPepper = (): string => {
  const p = process.env.MFA_OTP_PEPPER?.trim() || process.env.FIELD_ENCRYPTION_KEY?.trim();
  if (!p) {
    throw new Error("MFA_OTP_PEPPER or FIELD_ENCRYPTION_KEY must be set for registration verification codes");
  }
  return p;
};

export const shouldExposeRegistrationVerificationCode = (): boolean => {
  const nodeEnv = process.env.NODE_ENV?.trim().toLowerCase() ?? "development";
  if (nodeEnv === "production") return false;
  if (process.env.DEV_ONLY_REGISTRATION_EXPOSE_VERIFICATION_CODE === "true") return true;
  return nodeEnv === "test" || nodeEnv === "development";
};

export const corporateFirstVerifiedUserIsAdmin = (): boolean =>
  process.env.CORPORATE_FIRST_USER_ADMIN === "true";

export type RegistrationEligibility =
  | { ok: true; email: string; domain: string; consumer: boolean; tenantKey: string }
  | { ok: false; status: number; error: string; message: string };

export const assessRegistrationEligibility = async (
  input: RegisterStartInput
): Promise<RegistrationEligibility> => {
  const modules = await ensurePlatformModuleSettingsRow();
  if (!modules.selfRegisterEnabled) {
    return {
      ok: false,
      status: 403,
      error: "registration_closed",
      message:
        "Self-service registration is disabled for this platform. Ask your tenant administrator or platform operator for an account."
    };
  }

  const email = input.email.trim().toLowerCase();
  const domain = extractEmailDomain(email);
  if (!domain) {
    return { ok: false, status: 400, error: "validation_error", message: "Invalid email address" };
  }

  const consumer = isConsumerEmailProviderDomain(domain);
  const tenantKey = consumer ? personalTenantKeyFromEmail(email) : domain.toLowerCase();

  const existingTenant = await findTenantByExactName(tenantKey);
  if (existingTenant && existingTenant.realmSelfRegisterEnabled === false) {
    return {
      ok: false,
      status: 403,
      error: "registration_closed",
      message:
        "Self-service registration is not open for this organization. Ask your tenant administrator to add your account."
    };
  }

  if (existingTenant) {
    const existingUser = await findUserByTenantEmail(existingTenant.id, email);
    if (existingUser) {
      return { ok: false, status: 409, error: "conflict", message: AUTH_REGISTRATION_FAILED_MESSAGE };
    }
  }

  return { ok: true, email, domain, consumer, tenantKey };
};

export const signRegistrationTicket = (
  app: FastifyInstance,
  payload: Omit<RegistrationTicketPayload, "typ">
): string =>
  app.jwt.sign(
    {
      typ: "registration_step",
      email: payload.email,
      name: payload.name,
      ph: payload.ph,
      tk: payload.tk,
      consumer: payload.consumer
    },
    { expiresIn: "15m" }
  );

export const parseRegistrationTicket = (raw: unknown): RegistrationTicketPayload | undefined => {
  if (!raw || typeof raw !== "object") return undefined;
  const p = raw as Record<string, unknown>;
  if (p.typ !== "registration_step") return undefined;
  if (typeof p.email !== "string" || typeof p.name !== "string" || typeof p.ph !== "string") return undefined;
  if (typeof p.tk !== "string" || typeof p.consumer !== "boolean") return undefined;
  return {
    typ: "registration_step",
    email: p.email,
    name: p.name,
    ph: p.ph,
    tk: p.tk,
    consumer: p.consumer
  };
};

export const sendRegistrationVerificationCode = async (args: {
  email: string;
  log: { warn: (obj: object, msg?: string) => void };
}): Promise<{ code: string; emailed: boolean }> => {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const sent = await countRecentEmailOtpChallenges(args.email, REGISTRATION_EMAIL_VERIFY_PURPOSE, since);
  if (sent >= 5) {
    throw Object.assign(new Error("Too many codes requested. Try again later."), {
      statusCode: 429,
      error: "rate_limited"
    });
  }

  const code = String(randomInt(100_000, 1_000_000));
  const pepper = otpPepper();
  const codeHash = hashEmailOtp(pepper, args.email, REGISTRATION_EMAIL_VERIFY_PURPOSE, code);
  await insertEmailOtpChallenge({
    subjectKey: args.email,
    purpose: REGISTRATION_EMAIL_VERIFY_PURPOSE,
    codeHash,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000)
  });

  const smtp = await getPlatformSmtpSettingsRow();
  if (!smtp?.smtpEnabled || !smtp.host.trim()) {
    return { code, emailed: false };
  }

  try {
    await sendMailHtml({
      row: smtp,
      to: args.email,
      subject: "Verify your email to finish signing up",
      html: `<p>Your verification code is:</p><p style="font-size:22px;font-weight:bold;letter-spacing:4px">${code}</p><p>This code expires in 15 minutes. If you did not try to sign up, ignore this email.</p>`
    });
    return { code, emailed: true };
  } catch (err) {
    args.log.warn({ err }, "registration verification email send failed");
    throw Object.assign(new Error("Could not send verification email."), {
      statusCode: 502,
      error: "mail_error"
    });
  }
};

export const verifyRegistrationCode = async (email: string, code: string): Promise<boolean> => {
  const pepper = otpPepper();
  const codeHash = hashEmailOtp(pepper, email, REGISTRATION_EMAIL_VERIFY_PURPOSE, code.replace(/\s+/g, ""));
  return verifyAndConsumeEmailOtpChallenge({
    subjectKey: email,
    purpose: REGISTRATION_EMAIL_VERIFY_PURPOSE,
    codeHash
  });
};

const resolveSignupRole = async (
  tenantId: string,
  consumer: boolean
): Promise<"tenant_admin" | "tenant_user"> => {
  if (consumer) return "tenant_user";
  if (!corporateFirstVerifiedUserIsAdmin()) return "tenant_user";
  const admins = await countTenantAdmins(tenantId);
  return admins === 0 ? "tenant_admin" : "tenant_user";
};

export const completeVerifiedRegistration = async (
  app: FastifyInstance,
  ticket: RegistrationTicketPayload
) => {
  const email = ticket.email.trim().toLowerCase();
  const tenantId = (await findOrCreateTenantByName(ticket.tk)).id;

  const existing = await findUserByTenantEmail(tenantId, email);
  if (existing) {
    throw Object.assign(new Error(AUTH_REGISTRATION_FAILED_MESSAGE), {
      statusCode: 409,
      error: "conflict"
    });
  }

  const role = await resolveSignupRole(tenantId, ticket.consumer);
  const user = await insertUser({
    tenantId,
    email,
    passwordHash: ticket.ph,
    displayName: ticket.name.trim() || null,
    role
  });

  await ensureSystemRelationshipTypesForTenant(tenantId);

  const full = await findUserByTenantEmail(tenantId, email);
  if (!full) {
    throw Object.assign(new Error("Could not load user after registration."), {
      statusCode: 500,
      error: "server_error"
    });
  }

  const mfaOut = await completeRealmLoginWithMfa(app, full, tenantId, email);
  await enqueueWelcomeEmail({ userId: user.id, tenantId });

  return { mfaOut, tenantId, role: user.role, email };
};
