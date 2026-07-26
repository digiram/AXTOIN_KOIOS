/**
 * Refresh-token rotation with reuse detection via consumed-hash cache.
 * When a rotated token is presented again, all refresh sessions for that user are revoked.
 */

import { createHash } from "node:crypto";

import { deleteRefreshTokenById, deleteRefreshTokensByUserId, type RefreshWithUser } from "@starter/db";

import { getCacheStore } from "./cache-store/index.js";
import { logSecurityEvent, type AuditLogger } from "./security-audit-log.js";

const CONSUMED_REFRESH_NAMESPACE = "auth:refresh-consumed:v1";

const consumedTtlSec = (expiresAt: Date): number =>
  Math.max(60, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));

export const markRefreshTokenConsumed = async (tokenRow: RefreshWithUser, tokenHash: string): Promise<void> => {
  const ttl = consumedTtlSec(tokenRow.expiresAt);
  await getCacheStore().set(CONSUMED_REFRESH_NAMESPACE, tokenHash, tokenRow.userId, ttl);
  await deleteRefreshTokenById(tokenRow.tokenId);
};

export const findRefreshReuseUserId = async (tokenHash: string): Promise<string | null> =>
  getCacheStore().get(CONSUMED_REFRESH_NAMESPACE, tokenHash);

export const handleRefreshTokenReuse = async (args: {
  tokenHash: string;
  requestId?: string;
  log?: AuditLogger;
}): Promise<boolean> => {
  const userId = await findRefreshReuseUserId(args.tokenHash);
  if (!userId) return false;

  await deleteRefreshTokensByUserId(userId);
  logSecurityEvent(args.log, {
    action: "auth.refresh_token_reuse",
    actorUserId: userId,
    requestId: args.requestId,
    outcome: "sessions_revoked"
  });
  args.log?.info({ userId, requestId: args.requestId }, "Refresh token reuse detected — all sessions revoked");
  return true;
};

/** Stable cache key for login lockout (email only, no plaintext in Redis). */
export const loginAttemptKey = (email: string): string =>
  createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
