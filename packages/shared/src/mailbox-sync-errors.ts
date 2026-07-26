/** User-visible hint appended when OAuth refresh cannot recover without reconnect. */
export const MAILBOX_OAUTH_RECONNECT_HINT =
  "Disconnect this account in Mailbox settings and connect it again to restore sync.";

const RECONNECT_MARKERS = [
  "invalid_grant",
  "disconnect and reconnect",
  "disconnect this account",
  "sign in again",
  "reconnect the account",
  "token has been expired or revoked",
  "refresh token has been revoked"
] as const;

/** True when sync failed because OAuth credentials need user reconnect (non-retryable). */
export const isMailboxOAuthReconnectRequired = (syncError: string | null | undefined): boolean => {
  if (!syncError) return false;
  const lower = syncError.toLowerCase();
  if (RECONNECT_MARKERS.some((marker) => lower.includes(marker))) return true;
  return /(?:google|microsoft) token refresh failed: (400|401)\b/i.test(syncError);
};
