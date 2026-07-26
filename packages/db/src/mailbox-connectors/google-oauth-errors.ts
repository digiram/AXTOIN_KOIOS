/**
 * Google OAuth and Gmail API error formatting.
 *
 * Parses Google error JSON bodies and appends operator-friendly hints for scope, API enablement,
 * and invalid_grant reconnect flows used by Gmail mailbox connectors.
 *
 * Responsibilities:
 * - Normalize Google OAuth/API failure responses into user-facing messages
 * - Append reconnect hints when refresh tokens are revoked
 *
 * Depends on:
 * - `@starter/shared` `MAILBOX_OAUTH_RECONNECT_HINT`
 *
 * Security:
 * - Never include access or refresh tokens in formatted messages.
 */

import { MAILBOX_OAUTH_RECONNECT_HINT } from "@starter/shared";

type GoogleNestedError = {
  message?: string;
  status?: string;
  errors?: { reason?: string; message?: string }[];
};

const parseGoogleErrorBody = async (
  res: Response
): Promise<{ message?: string; oauthErrorCode?: string }> => {
  try {
    const body: unknown = await res.json();
    if (!body || typeof body !== "object") return {};

    const record = body as {
      error?: string | GoogleNestedError;
      error_description?: string;
    };

    if (typeof record.error === "string") {
      const description = record.error_description?.trim();
      return {
        oauthErrorCode: record.error,
        message: description ? `${record.error}: ${description}` : record.error
      };
    }

    const nestedError = record.error;
    if (!nestedError || typeof nestedError !== "object") return {};

    const googleMessage = nestedError.message?.trim();
    if (!googleMessage) return {};
    const reason = nestedError.errors?.[0]?.reason;
    if (reason && !googleMessage.toLowerCase().includes(reason.toLowerCase())) {
      return { message: `${googleMessage} (${reason})`, oauthErrorCode: reason };
    }
    return { message: googleMessage, oauthErrorCode: reason };
  } catch {
    return {};
  }
};

/** Formats Google OAuth/API failures with operator hints for scope, enablement, and reconnect. */
export const formatGoogleOAuthFailure = async (
  res: Response,
  context: string,
  options?: { tokenRefresh?: boolean }
): Promise<string> => {
  const { message: googleMessage, oauthErrorCode } = await parseGoogleErrorBody(res);

  let message = `${context} failed: ${res.status}`;
  if (googleMessage) message += `: ${googleMessage}`;

  const lower = (googleMessage ?? oauthErrorCode ?? "").toLowerCase();
  if (options?.tokenRefresh && (oauthErrorCode === "invalid_grant" || lower.includes("invalid_grant"))) {
    message += `. ${MAILBOX_OAUTH_RECONNECT_HINT}`;
    return message;
  }

  if (res.status === 403) {
    if (lower.includes("insufficient") && lower.includes("scope")) {
      message += ". Disconnect and reconnect the account, approving all Gmail permissions.";
    } else if (
      lower.includes("not been used") ||
      lower.includes("disabled") ||
      lower.includes("access not configured")
    ) {
      message +=
        ". Enable Gmail API on the Google Cloud project used for MAILBOX_GOOGLE_CLIENT_ID (see docs/mailbox-module.md).";
    }
  }

  return message;
};
