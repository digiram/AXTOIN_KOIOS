/**
 * AsyncLocalStorage audit context for field decrypt operations (API request / worker job).
 */

import { AsyncLocalStorage } from "node:async_hooks";

export type FieldCryptoAuditContext = {
  userId?: string | null;
  traceId?: string | null;
};

const storage = new AsyncLocalStorage<FieldCryptoAuditContext>();

/** Runs `fn` with field crypto audit context bound to the current async chain. */
export const runWithFieldCryptoAuditContext = <T>(
  ctx: FieldCryptoAuditContext,
  fn: () => T
): T => storage.run(ctx, fn);

/** Binds audit context for the current async chain (e.g. Fastify onRequest). */
export const enterFieldCryptoAuditContext = (ctx: FieldCryptoAuditContext): void => {
  storage.enterWith(ctx);
};

/** Returns the current audit context, if any. */
export const getFieldCryptoAuditContext = (): FieldCryptoAuditContext | undefined =>
  storage.getStore();
