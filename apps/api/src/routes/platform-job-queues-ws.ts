/**
 * WebSocket: super-admin job queue activity (BullMQ `QueueEvents` → browser push).
 * Clients must pass `?ticket=` from `POST /v1/platform/ws/ticket` (short-lived, single use).
 */

import type { FastifyInstance, FastifyRequest } from "fastify";

import { getUserAccessTokenVersionById } from "@starter/db";

import {
  addJobQueueWsClient,
  ensureJobQueueQueueEvents,
  removeJobQueueWsClient
} from "../lib/job-queue-ws-hub.js";
import { consumeWsTicket } from "../lib/ws-ticket-store.js";

const queryParam = (request: FastifyRequest, key: string): string => {
  const q = request.query as Record<string, string | string[] | undefined>;
  const raw = q[key];
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (Array.isArray(raw) && typeof raw[0] === "string") return raw[0].trim();
  return "";
};

export const registerPlatformJobQueuesWebSocket = async (app: FastifyInstance): Promise<void> => {
  app.get(
    "/ws/job-queues",
    { websocket: true },
    /** @fastify/websocket v10+ passes the `ws` instance first (not `{ socket }`). */
    (socket, request) => {
      void (async () => {
        const ticket = queryParam(request, "ticket");
        let sub: string;
        let tokenVersion: number;

        if (!ticket) {
          socket.close(4001, "missing ticket query param — obtain one via POST /v1/platform/ws/ticket");
          return;
        }
        const claimed = await consumeWsTicket(ticket);
        if (!claimed || claimed.role !== "super_admin" || claimed.tenantId) {
          socket.close(4002, "invalid or expired ticket");
          return;
        }
        sub = claimed.sub;
        tokenVersion = claimed.v;

        const current = await getUserAccessTokenVersionById(sub);
        if (current === undefined || tokenVersion !== current) {
          socket.close(4002, "session invalidated");
          return;
        }

        const ok = await ensureJobQueueQueueEvents();
        if (!ok) {
          socket.close(1011, "could not subscribe to queue events (Redis?)");
          return;
        }

        addJobQueueWsClient(socket);
        try {
          socket.send(JSON.stringify({ type: "job_queues_ready" }));
        } catch {
          removeJobQueueWsClient(socket);
          try {
            socket.close(1011, "send failed");
          } catch {
            /* socket may already be closing */
          }
          return;
        }

        socket.on("close", () => {
          removeJobQueueWsClient(socket);
        });
      })();
    }
  );
};
