/**
 * Short-lived WebSocket tickets (Redis when available, else in-process Map).
 */

import { getCacheStore } from "./cache-store/index.js";
import { usesDatabaseBackend } from "@starter/shared";

export type WsTicketPayload = {
  sub: string;
  role: string;
  tenantId?: string;
  v: number;
};

const TTL_SEC = 60;
const NAMESPACE = "ws-ticket";

const memory = new Map<string, { payload: WsTicketPayload; exp: number }>();

export const storeWsTicket = async (ticket: string, payload: WsTicketPayload): Promise<void> => {
  const body = JSON.stringify(payload);
  if (usesDatabaseBackend()) {
    await getCacheStore().set(NAMESPACE, ticket, body, TTL_SEC);
    return;
  }
  const url = process.env.REDIS_URL?.trim();
  if (url) {
    try {
      await getCacheStore().set(NAMESPACE, ticket, body, TTL_SEC);
      return;
    } catch {
      /* fall through */
    }
  }
  memory.set(ticket, { payload, exp: Date.now() + TTL_SEC * 1000 });
};

export const consumeWsTicket = async (ticket: string): Promise<WsTicketPayload | undefined> => {
  if (usesDatabaseBackend()) {
    const raw = await getCacheStore().get(NAMESPACE, ticket);
    if (!raw) return undefined;
    await getCacheStore().del(NAMESPACE, ticket);
    return JSON.parse(raw) as WsTicketPayload;
  }
  const url = process.env.REDIS_URL?.trim();
  if (url) {
    try {
      const raw = await getCacheStore().get(NAMESPACE, ticket);
      if (!raw) return undefined;
      await getCacheStore().del(NAMESPACE, ticket);
      return JSON.parse(raw) as WsTicketPayload;
    } catch {
      /* fall through */
    }
  }
  const row = memory.get(ticket);
  memory.delete(ticket);
  if (!row || row.exp < Date.now()) return undefined;
  return row.payload;
};
