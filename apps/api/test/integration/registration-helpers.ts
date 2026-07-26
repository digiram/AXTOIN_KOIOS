/**
 * Integration helpers for self-registration via `/v1/auth/register/*`.
 *
 * Opens platform self-registration and completes register/start + verify flows.
 */

import type { FastifyInstance } from "fastify";

import { ensurePlatformModuleSettingsRow, upsertPlatformModuleSettingsRow } from "@starter/db";

import { jsonBody } from "./helpers.js";

export const ensureSelfRegistrationOpen = async (): Promise<void> => {
  await ensurePlatformModuleSettingsRow();
  await upsertPlatformModuleSettingsRow({ selfRegisterEnabled: true });
};

export const registerUserViaApi = async (
  app: FastifyInstance,
  input: { name: string; email: string; password: string }
): Promise<{
  accessToken: string;
  refreshToken: string;
  tenantId: string;
}> => {
  const start = await app.inject({
    method: "POST",
    url: "/v1/auth/register/start",
    ...jsonBody(input)
  });
  if (start.statusCode !== 200) {
    throw new Error(`register/start failed (${start.statusCode}): ${start.body}`);
  }
  const started = start.json() as {
    registrationTicket: string;
    verificationCode?: string;
  };
  if (!started.verificationCode) {
    throw new Error("register/start did not return verificationCode (enable test env or DEV_ONLY_REGISTRATION_EXPOSE_VERIFICATION_CODE)");
  }

  const verify = await app.inject({
    method: "POST",
    url: "/v1/auth/register/verify",
    ...jsonBody({
      registrationTicket: started.registrationTicket,
      code: started.verificationCode
    })
  });
  if (verify.statusCode !== 200) {
    throw new Error(`register/verify failed (${verify.statusCode}): ${verify.body}`);
  }
  const body = verify.json() as {
    accessToken: string;
    refreshToken: string;
    tenantId: string;
  };
  return body;
};
