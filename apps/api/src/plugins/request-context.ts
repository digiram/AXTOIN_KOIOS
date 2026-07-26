/**
 * Request correlation id — accepts `X-Request-Id` or generates a UUID; echoes on response.
 */

import { randomUUID } from "node:crypto";
import { enterFieldCryptoAuditContext } from "@starter/db";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

const HEADER = "x-request-id";

export const registerRequestContext = async (app: FastifyInstance): Promise<void> => {
  app.addHook("onRequest", async (request, reply) => {
    const incoming = request.headers[HEADER];
    const id =
      typeof incoming === "string" && incoming.trim().length > 0 && incoming.length <= 128
        ? incoming.trim()
        : randomUUID();
    request.requestId = id;
    reply.header("X-Request-Id", id);
    request.log = request.log.child({ requestId: id });
    enterFieldCryptoAuditContext({ traceId: id, userId: null });
  });
};

declare module "fastify" {
  interface FastifyRequest {
    requestId?: string;
  }
}

export const requestIdFrom = (request: FastifyRequest, reply?: FastifyReply): string =>
  request.requestId ?? (typeof reply?.getHeader(HEADER) === "string" ? String(reply.getHeader(HEADER)) : randomUUID());
