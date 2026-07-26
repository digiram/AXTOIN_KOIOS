/**
 * Mailbox connector factory and re-exports.
 *
 * Selects the correct provider implementation (IMAP, Gmail, Microsoft) for a connected
 * mailbox account and re-exports OAuth helpers and connector types for API routes.
 *
 * Responsibilities:
 * - `createMailConnectorForAccount` — provider dispatch
 * - Public re-export surface for connector modules and shared types
 *
 * Depends on:
 * - `gmail-connector`, `microsoft-connector`, `imap-smtp-connector`
 * - `mailbox-repos` for decrypted account rows
 *
 * Security:
 * - Account rows must be loaded with tenant-scoped repo queries before connector creation.
 * - OAuth exchange helpers persist encrypted tokens via `mailbox-repos`; never return refresh tokens to clients.
 */

import type { MailboxAccountRow } from "../mailbox-repos.js";
import { createGmailConnector } from "./gmail-connector.js";
import { createImapSmtpConnector } from "./imap-smtp-connector.js";
import { createMicrosoftConnector } from "./microsoft-connector.js";
import type { MailConnector } from "./types.js";

/** Instantiates the mail connector for the account's configured provider. */
export const createMailConnectorForAccount = async (account: MailboxAccountRow): Promise<MailConnector> => {
  switch (account.provider) {
    case "imap":
      return createImapSmtpConnector(account);
    case "gmail":
      return createGmailConnector(account);
    case "microsoft":
      return createMicrosoftConnector(account);
    default:
      throw new Error(`No connector for provider: ${account.provider}`);
  }
};

export * from "./types.js";
export { MailboxOAuthNotConfiguredError, type MailboxOAuthProviderId } from "./oauth-config-error.js";
export {
  buildGoogleOAuthAuthorizeUrl,
  exchangeGoogleOAuthCode,
  createGmailConnector
} from "./gmail-connector.js";
export {
  buildMicrosoftOAuthAuthorizeUrl,
  exchangeMicrosoftOAuthCode,
  createMicrosoftConnector,
  fetchMicrosoftMessageCalendarIcs,
  resolveMicrosoftAccessToken
} from "./microsoft-connector.js";
export { createImapSmtpConnector } from "./imap-smtp-connector.js";
