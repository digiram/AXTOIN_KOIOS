/**
 * Shared tenant registration for integration / IDOR matrix tests.
 */

import type { FastifyInstance } from "fastify";

import { ensureSelfRegistrationOpen, registerUserViaApi } from "./registration-helpers.js";

export type RegisteredTenant = {
  domain: string;
  email: string;
  password: string;
  accessToken: string;
  tenantId: string;
};

export const registerTenantAdmin = async (
  app: FastifyInstance,
  domain: string,
  password = "Password123!"
): Promise<RegisteredTenant> => {
  await ensureSelfRegistrationOpen();
  const email = `owner@${domain}`;
  const prevCorpAdmin = process.env.CORPORATE_FIRST_USER_ADMIN;
  process.env.CORPORATE_FIRST_USER_ADMIN = "true";
  try {
    const body = await registerUserViaApi(app, { name: "Integration Admin", email, password });
    return {
      domain,
      email,
      password,
      accessToken: body.accessToken,
      tenantId: body.tenantId
    };
  } finally {
    if (prevCorpAdmin === undefined) delete process.env.CORPORATE_FIRST_USER_ADMIN;
    else process.env.CORPORATE_FIRST_USER_ADMIN = prevCorpAdmin;
  }
};
