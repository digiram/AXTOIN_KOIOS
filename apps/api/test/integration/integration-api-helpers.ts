/**
 * Shared HTTP helpers for API integration tests.
 */

import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";

import { upsertPlatformModuleSettingsRow, type PlatformModuleSettingsPatch } from "@starter/db";

import { authHeader, jsonBody } from "./helpers.js";

export const enablePlatformModules = async (patch: PlatformModuleSettingsPatch): Promise<void> => {
  await upsertPlatformModuleSettingsRow(patch);
};

export const loginViaApi = async (
  app: FastifyInstance,
  email: string,
  password: string
): Promise<string> => {
  const res = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    ...jsonBody({ email, password })
  });
  assert.equal(res.statusCode, 200, res.body);
  return (res.json() as { accessToken: string }).accessToken;
};

export const createCrmOrganization = async (
  app: FastifyInstance,
  accessToken: string,
  name: string
): Promise<string> => {
  const res = await app.inject({
    method: "POST",
    url: "/v1/tenant/crm/organizations",
    ...authHeader(accessToken),
    ...jsonBody({ name })
  });
  assert.equal(res.statusCode, 200, res.body);
  return (res.json() as { id: string }).id;
};

export const todayIsoDate = (): string => new Date().toISOString().slice(0, 10);
