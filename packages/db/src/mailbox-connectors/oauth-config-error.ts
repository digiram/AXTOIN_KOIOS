/**
 * Mailbox OAuth configuration errors.
 *
 * Thrown when Google or Microsoft mailbox OAuth env vars are missing so routes can return
 * a stable `oauth_not_configured` code instead of a generic 500.
 *
 * Responsibilities:
 * - Typed provider id for OAuth setup failures
 * - `MailboxOAuthNotConfiguredError` for missing client id/secret configuration
 *
 * Security:
 * - Error messages describe missing configuration only; never include secrets or tokens.
 */

/** OAuth provider identifiers for mailbox connect flows. */
export type MailboxOAuthProviderId = "google" | "microsoft";

/** Raised when mailbox OAuth client credentials are not configured for a provider. */
export class MailboxOAuthNotConfiguredError extends Error {
  readonly code = "oauth_not_configured" as const;

  constructor(
    public readonly provider: MailboxOAuthProviderId,
    message: string
  ) {
    super(message);
    this.name = "MailboxOAuthNotConfiguredError";
  }
}
