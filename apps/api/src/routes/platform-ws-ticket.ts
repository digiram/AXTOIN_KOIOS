/**
 * Short-lived WebSocket ticket (replaces `accessToken` query param on job-queue WS).
 */

import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";

import { getUserAccessTokenVersionById } from "@starter/db";

import { storeWsTicket } from "../lib/ws-ticket-store.js";
import { requireTenantContext } from "../plugins/tenant.js";

/** JWT verified by `requireTenantContext`; super-admin sessions have no `tenantId`. */

type JwtPayload = {
  sub: string;
  role?: string;
  tenantId?: string;
  v?: string;
};

const tokenVersionFromPayload = (v: unknown): number => {
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.floor(v));
  if (typeof v === "string") {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }
  return 0;
};

export const registerPlatformWsTicketRoutes = async (app: FastifyInstance): Promise<void> => {
  app.post(
    "/ws/ticket",
    { preHandler: requireTenantContext },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      if (payload.role !== "super_admin" || payload.tenantId) {
        return reply.code(403).send({
          error: "forbidden",
          message: "Platform super administrator required"
        });
      }
      const current = await getUserAccessTokenVersionById(payload.sub);
      if (current === undefined) {
        return reply.code(401).send({ error: "unauthorized", message: "Valid access token required" });
      }
      if (tokenVersionFromPayload(payload.v) !== current) {
        return reply.code(401).send({ error: "unauthorized", message: "Session invalidated. Sign in again." });
      }

      const ticket = randomBytes(24).toString("base64url");
      await storeWsTicket(ticket, {
        sub: payload.sub,
        role: payload.role ?? "super_admin",
        v: current
      });
      return { ticket, expiresInSeconds: 60 };
    }
  );
};
