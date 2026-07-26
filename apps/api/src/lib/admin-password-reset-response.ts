/**
 * Admin-initiated password reset: in **production**, plaintext is only returned when
 * **`ADMIN_PASSWORD_RESET_RETURN_PLAIN=true`** (emergency). The normal production path emails the
 * temporary password instead — see **`admin-password-reset-flow.ts`**.
 */

export type AdminPasswordResetResponseBody =
  | { ok: true; temporaryPassword: string }
  | { ok: true; passwordReset: true; message: string };

export function buildAdminPasswordResetResponse(temporaryPassword: string): AdminPasswordResetResponseBody {
  const allowPlain =
    process.env.NODE_ENV !== "production" || process.env.ADMIN_PASSWORD_RESET_RETURN_PLAIN === "true";
  if (allowPlain) {
    return { ok: true, temporaryPassword };
  }
  return {
    ok: true,
    passwordReset: true,
    message:
      "Password was reset. The new password is not included in this response (production default). " +
      "Share credentials through a secure out-of-band channel. " +
      "Temporary override: set ADMIN_PASSWORD_RESET_RETURN_PLAIN=true on the API (not recommended long-term)."
  };
}
