/**
 * Authenticated account settings (all roles, including platform `super_admin`).
 *
 * Uses `requireTenantContext` only (no `requireTenantRealm`) so JWTs without `tenantId` still work.
 */

import { randomBytes } from "node:crypto";

import argon2 from "argon2";
import type { FastifyInstance } from "fastify";

import {
  deleteRefreshTokenById,
  findRefreshTokenWithUser,
  getAccountSettingsByUserId,
  getUserPasswordHashById,
  insertRefreshToken,
  listActiveUserDevicesForUser,
  revokeUserDeviceForUser,
  updateAccountSettingsByUserId,
  updateUserPasswordHashById,
  upsertUserMobileDevice
} from "@starter/db";
import {
  accountSettingsPatchSchema,
  changePasswordSchema,
  registerMobileDeviceBodySchema
} from "@starter/shared";

import { enrichAccessTokenSignInput } from "../lib/access-token-context.js";
import { registerAccountGeocodeRoutes } from "./account-geocode.js";
import { signAccessToken } from "../lib/issue-tokens.js";
import { hashRefreshToken } from "../lib/tokens.js";
import { requireTenantContext } from "../plugins/tenant.js";
import { registerAccountMfaRoutes } from "./account-mfa.js";
import { registerAccountSubscriptionRoutes } from "./account-subscription.js";

/** Same sliding window as `routes/auth.ts` for newly issued refresh tokens. */
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const emptyToNull = (s: string | undefined): string | null | undefined => {
  if (s === undefined) return undefined;
  const t = s.trim();
  return t.length === 0 ? null : t;
};

export const registerAccountRoutes = async (app: FastifyInstance) => {
  await registerAccountGeocodeRoutes(app);
  registerAccountMfaRoutes(app);
  registerAccountSubscriptionRoutes(app);

  app.get(
    "/settings",
    { preHandler: requireTenantContext },
    async (request, reply) => {
      const userId = request.userId;
      if (!userId) {
        return reply.code(401).send({ error: "unauthorized", message: "Valid access token required" });
      }
      const row = await getAccountSettingsByUserId(userId);
      if (!row) {
        return reply.code(404).send({ error: "not_found", message: "User not found" });
      }
      return {
        email: row.email,
        displayName: row.displayName,
        countryCode: row.countryCode,
        measurementSystem: row.measurementSystem,
        timezone: row.timezone,
        currencyCode: row.currencyCode,
        currencyFormat: row.currencyFormat,
        dateTimeFormat: row.dateTimeFormat,
        timeFormat: row.timeFormat,
        homeAddressLine1: row.homeAddressLine1,
        homeAddressLine2: row.homeAddressLine2,
        homePostalCode: row.homePostalCode,
        homeCity: row.homeCity,
        homeState: row.homeState,
        homeCountry: row.homeCountry
      };
    }
  );

  app.patch(
    "/settings",
    { preHandler: requireTenantContext },
    async (request, reply) => {
      const userId = request.userId;
      if (!userId) {
        return reply.code(401).send({ error: "unauthorized", message: "Valid access token required" });
      }

      const parsed = accountSettingsPatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
      }

      const body = parsed.data;
      const patch: Parameters<typeof updateAccountSettingsByUserId>[1] = {};

      if (body.displayName !== undefined) {
        patch.displayName = emptyToNull(body.displayName) ?? null;
      }
      if (body.countryCode !== undefined) {
        patch.countryCode = body.countryCode;
      }
      if (body.measurementSystem !== undefined) {
        patch.measurementSystem = body.measurementSystem;
      }
      if (body.timezone !== undefined) {
        patch.timezone = emptyToNull(body.timezone) ?? null;
      }
      if (body.currencyCode !== undefined) {
        patch.currencyCode = body.currencyCode;
      }
      if (body.currencyFormat !== undefined) {
        patch.currencyFormat = body.currencyFormat;
      }
      if (body.dateTimeFormat !== undefined) {
        patch.dateTimeFormat = body.dateTimeFormat;
      }
      if (body.timeFormat !== undefined) {
        patch.timeFormat = body.timeFormat;
      }
      if (body.homeAddressLine1 !== undefined) {
        patch.homeAddressLine1 = emptyToNull(body.homeAddressLine1) ?? null;
      }
      if (body.homeAddressLine2 !== undefined) {
        patch.homeAddressLine2 = emptyToNull(body.homeAddressLine2) ?? null;
      }
      if (body.homePostalCode !== undefined) {
        patch.homePostalCode = emptyToNull(body.homePostalCode) ?? null;
      }
      if (body.homeCity !== undefined) {
        patch.homeCity = emptyToNull(body.homeCity) ?? null;
      }
      if (body.homeState !== undefined) {
        patch.homeState = emptyToNull(body.homeState) ?? null;
      }
      if (body.homeCountry !== undefined) {
        patch.homeCountry = emptyToNull(body.homeCountry) ?? null;
      }

      await updateAccountSettingsByUserId(userId, patch);
      const row = await getAccountSettingsByUserId(userId);
      if (!row) {
        return reply.code(404).send({ error: "not_found", message: "User not found" });
      }
      return {
        email: row.email,
        displayName: row.displayName,
        countryCode: row.countryCode,
        measurementSystem: row.measurementSystem,
        timezone: row.timezone,
        currencyCode: row.currencyCode,
        currencyFormat: row.currencyFormat,
        dateTimeFormat: row.dateTimeFormat,
        timeFormat: row.timeFormat,
        homeAddressLine1: row.homeAddressLine1,
        homeAddressLine2: row.homeAddressLine2,
        homePostalCode: row.homePostalCode,
        homeCity: row.homeCity,
        homeState: row.homeState,
        homeCountry: row.homeCountry
      };
    }
  );

  app.post(
    "/change-password",
    { preHandler: requireTenantContext },
    async (request, reply) => {
      const userId = request.userId;
      if (!userId) {
        return reply.code(401).send({ error: "unauthorized", message: "Valid access token required" });
      }

      const parsed = changePasswordSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
      }

      const hash = await getUserPasswordHashById(userId);
      if (!hash) {
        return reply.code(404).send({ error: "not_found", message: "User not found" });
      }

      const valid = await argon2.verify(hash, parsed.data.currentPassword);
      if (!valid) {
        return reply
          .code(400)
          .send({ error: "invalid_password", message: "Current password is incorrect" });
      }

      const nextHash = await argon2.hash(parsed.data.newPassword);
      await updateUserPasswordHashById(userId, nextHash);
      return { changed: true };
    }
  );

  app.get(
    "/devices",
    { preHandler: requireTenantContext },
    async (request, reply) => {
      const userId = request.userId;
      if (!userId) {
        return reply.code(401).send({ error: "unauthorized", message: "Valid access token required" });
      }
      const rows = await listActiveUserDevicesForUser(userId);
      return {
        devices: rows.map((d) => ({
          id: d.id,
          platform: d.platform,
          label: d.label,
          installKeyPreview: d.installKey.length > 8 ? `${d.installKey.slice(0, 4)}…${d.installKey.slice(-4)}` : "••••",
          createdAt: d.createdAt.toISOString(),
          lastSeenAt: d.lastSeenAt.toISOString()
        }))
      };
    }
  );

  app.delete<{ Params: { deviceId: string } }>(
    "/devices/:deviceId",
    { preHandler: requireTenantContext },
    async (request, reply) => {
      const userId = request.userId;
      if (!userId) {
        return reply.code(401).send({ error: "unauthorized", message: "Valid access token required" });
      }
      const deviceId = request.params.deviceId?.trim();
      if (!deviceId) {
        return reply.code(400).send({ error: "validation_error", message: "deviceId is required" });
      }
      const ok = await revokeUserDeviceForUser(userId, deviceId);
      if (!ok) {
        return reply.code(404).send({ error: "not_found", message: "Device not found" });
      }
      return { revoked: true };
    }
  );

  /**
   * Registers or updates a mobile install (React Native). Optionally replaces the current refresh token with one
   * bound to `user_devices.id` so revocation applies (see `docs/mobile-devices.md`).
   */
  app.post(
    "/devices/register",
    { preHandler: requireTenantContext },
    async (request, reply) => {
      const userId = request.userId;
      if (!userId) {
        return reply.code(401).send({ error: "unauthorized", message: "Valid access token required" });
      }

      const parsed = registerMobileDeviceBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
      }

      const body = parsed.data;
      const deviceId = await upsertUserMobileDevice(userId, {
        installKey: body.installKey,
        platform: body.platform,
        label: body.label,
        pushToken: body.pushToken
      });

      const row = await listActiveUserDevicesForUser(userId);
      const mine = row.find((r) => r.id === deviceId);
      const deviceOut = mine && {
        id: mine.id,
        platform: mine.platform,
        label: mine.label,
        createdAt: mine.createdAt.toISOString(),
        lastSeenAt: mine.lastSeenAt.toISOString()
      };

      if (!body.refreshToken) {
        return {
          device: deviceOut ?? { id: deviceId, platform: body.platform }
        };
      }

      const tokenRow = await findRefreshTokenWithUser(hashRefreshToken(body.refreshToken));
      if (!tokenRow || tokenRow.userId !== userId) {
        return reply.code(400).send({
          error: "invalid_refresh_token",
          message: "Refresh token is invalid or does not belong to this session"
        });
      }
      if (tokenRow.expiresAt.getTime() <= Date.now()) {
        await deleteRefreshTokenById(tokenRow.tokenId);
        return reply.code(400).send({
          error: "invalid_refresh_token",
          message: "Refresh token is expired"
        });
      }

      await deleteRefreshTokenById(tokenRow.tokenId);
      const refreshToken = randomBytes(32).toString("base64url");
      await insertRefreshToken({
        userId: tokenRow.userId,
        tenantId: tokenRow.tenantId,
        userDeviceId: deviceId,
        tokenHash: hashRefreshToken(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS)
      });

      const accessToken = signAccessToken(
        app,
        await enrichAccessTokenSignInput({
          userId,
          email: tokenRow.email,
          role: tokenRow.role,
          tenantId: tokenRow.tenantId,
          accessTokenVersion: tokenRow.accessTokenVersion
        })
      );

      const out: {
        device: {
          id: string;
          platform: string;
          label: string | null;
          createdAt: string;
          lastSeenAt: string;
        };
        accessToken: string;
        refreshToken: string;
        tenantId?: string;
        role: string;
      } = {
        device:
          deviceOut ?? {
            id: deviceId,
            platform: body.platform,
            label: body.label ?? null,
            createdAt: new Date().toISOString(),
            lastSeenAt: new Date().toISOString()
          },
        accessToken,
        refreshToken,
        role: tokenRow.role
      };
      if (tokenRow.tenantId) {
        out.tenantId = tokenRow.tenantId;
      }

      return out;
    }
  );
};
