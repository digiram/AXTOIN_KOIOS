/**
 * Gmail mailbox connector and Google OAuth helpers.
 *
 * Implements `MailConnector` for Gmail API sync/send and exposes OAuth authorize/exchange helpers
 * used by mailbox connect routes. Refresh tokens are encrypted at rest via `mailbox-repos`.
 *
 * Responsibilities:
 * - Gmail history/delta sync, label mutations, send, and calendar RSVP
 * - OAuth authorization URL and code exchange with scope validation
 * - Access token refresh with encrypted persistence
 *
 * Depends on:
 * - `google-fetch`, `google-oauth-errors`, `label-mapping`, `calendar-reply-ics`
 * - Env: `MAILBOX_GOOGLE_CLIENT_ID`, `MAILBOX_GOOGLE_CLIENT_SECRET`
 *
 * Security:
 * - OAuth refresh tokens encrypted via `encryptMailboxOAuthToken`; never expose to clients or logs.
 * - Required Gmail scopes enforced after token exchange.
 */

import type { MailboxFolder } from "@starter/shared";

import {
  decryptMailboxOAuthToken,
  decryptMailboxSecret,
  encryptMailboxOAuthToken,
  updateMailboxAccountSyncState,
  type MailboxAccountRow
} from "../mailbox-repos.js";
import { mapGmailLabelsToMailboxState } from "./label-mapping.js";
import type {
  CalendarReplyInput,
  MailConnector,
  MailboxProviderCapabilities,
  MailboxProviderMessageRef,
  MailboxSyncFolderState,
  OutboundMailboxMessage,
  ProviderApplyResult,
  ProviderPushOperation,
  RawMailboxMessage,
  SendResult,
  SyncFolderResult
} from "./types.js";
import { buildCalendarReplyIcs, buildCalendarReplySubject } from "./calendar-reply-ics.js";
import { MailboxOAuthNotConfiguredError } from "./oauth-config-error.js";
import { formatGoogleOAuthFailure } from "./google-oauth-errors.js";
import { googleFetch } from "./google-fetch.js";
import nodemailer from "nodemailer";

const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/userinfo.email"
];

const GMAIL_CAPABILITIES: MailboxProviderCapabilities = {
  readState: true,
  star: true,
  folderMove: true,
  permanentDelete: true,
  emptyTrash: true
};

const throwGoogleApiError = async (
  res: Response,
  context: string,
  options?: { tokenRefresh?: boolean }
): Promise<never> => {
  throw new Error(await formatGoogleOAuthFailure(res, context, options));
};

const assertGmailScopesGranted = (scope: string | undefined): void => {
  const granted = new Set((scope ?? "").split(/\s+/).filter(Boolean));
  const required = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.modify"
  ];
  const missing = required.filter((s) => !granted.has(s));
  if (missing.length > 0) {
    throw new Error(
      `Google OAuth did not grant required Gmail scopes (${missing.join(", ")}). ` +
        "Disconnect and reconnect, approving all requested permissions."
    );
  }
};

const getGoogleOAuthConfig = () => {
  const clientId = process.env.MAILBOX_GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.MAILBOX_GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new MailboxOAuthNotConfiguredError(
      "google",
      "Google mailbox sign-in is not configured. Set MAILBOX_GOOGLE_CLIENT_ID and MAILBOX_GOOGLE_CLIENT_SECRET."
    );
  }
  return { clientId, clientSecret };
};

const refreshGoogleAccessToken = async (account: MailboxAccountRow): Promise<string> => {
  const { clientId, clientSecret } = getGoogleOAuthConfig();
  if (!account.oauthRefreshTokenEncrypted) throw new Error("Missing Google refresh token");
  const refreshToken = await decryptMailboxOAuthToken(
    account.oauthRefreshTokenEncrypted,
    account.tenantId,
    "oauthRefreshTokenEncrypted"
  );
  const res = await googleFetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })
  });
  if (!res.ok) await throwGoogleApiError(res, "Google token refresh", { tokenRefresh: true });
  const data = (await res.json()) as { access_token: string; expires_in: number };
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);
  await updateMailboxAccountSyncState(account.tenantId, account.id, {
    oauthAccessTokenEncrypted: await encryptMailboxOAuthToken(
      data.access_token,
      account.tenantId,
      "oauthAccessTokenEncrypted"
    ),
    oauthAccessTokenExpiresAt: expiresAt
  });
  return data.access_token;
};

const getAccessToken = async (account: MailboxAccountRow): Promise<string> => {
  const expires = account.oauthAccessTokenExpiresAt?.getTime() ?? 0;
  if (account.oauthAccessTokenEncrypted && expires > Date.now() + 60_000) {
    return decryptMailboxOAuthToken(
      account.oauthAccessTokenEncrypted,
      account.tenantId,
      "oauthAccessTokenEncrypted"
    );
  }
  return refreshGoogleAccessToken(account);
};

export const resolveGmailAccessToken = getAccessToken;

type GmailMimePart = {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailMimePart[];
};

const decodeGmailBody = (payload: GmailMimePart): { text?: string; html?: string; ics?: string } => {
  const out: { text?: string; html?: string; ics?: string } = {};
  const walk = (part: GmailMimePart) => {
    const mime = part.mimeType ?? "";
    const data = part.body?.data;
    if (data) {
      const decoded = Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
      if (mime === "text/plain") out.text = decoded;
      if (mime === "text/html") out.html = decoded;
      if (mime === "text/calendar") out.ics = decoded;
    }
    for (const child of part.parts ?? []) {
      walk(child);
    }
  };
  walk(payload);
  return out;
};

const gmailLabelForFolder = (folder: MailboxSyncFolderState["folder"]): string =>
  folder === "sent" ? "SENT" : "INBOX";

const gmailFolderPushLabels = (
  operation: Extract<ProviderPushOperation, { type: "folder" }>
): { add: string[]; remove: string[] } => {
  const add: string[] = [];
  const remove: string[] = [];
  if (operation.folder === "trash") {
    add.push("TRASH");
    remove.push("INBOX");
  } else if (operation.folder === "archive") {
    remove.push("INBOX");
  } else if (operation.folder === "inbox") {
    add.push("INBOX");
    remove.push("TRASH");
  } else if (operation.folder === "sent") {
    add.push("SENT");
  }
  return { add, remove };
};

const modifyGmailMessage = async (
  token: string,
  providerMessageId: string,
  addLabelIds: string[],
  removeLabelIds: string[]
): Promise<void> => {
  if (addLabelIds.length === 0 && removeLabelIds.length === 0) return;
  const res = await googleFetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${providerMessageId}/modify`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ addLabelIds, removeLabelIds })
    }
  );
  if (!res.ok) await throwGoogleApiError(res, "Gmail modify");
};

const sendGmailRawMime = async (token: string, mail: nodemailer.SendMailOptions): Promise<{ id: string }> => {
  const transport = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: "windows"
  } as nodemailer.TransportOptions);
  const info = await transport.sendMail(mail);
  const rawMessage = (info as { message?: Buffer }).message;
  if (!rawMessage) throw new Error("Gmail raw message build failed");
  const raw = rawMessage.toString("base64url");
  const res = await googleFetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ raw })
  });
  if (!res.ok) await throwGoogleApiError(res, "Gmail send");
  return (await res.json()) as { id: string };
};

export const createGmailConnector = (account: MailboxAccountRow): MailConnector => ({
  getCapabilities() {
    return GMAIL_CAPABILITIES;
  },

  async refreshAuthIfNeeded() {
    await getAccessToken(account);
  },

  async syncDelta(state: MailboxSyncFolderState): Promise<SyncFolderResult> {
    const token = await getAccessToken(account);
    const labelId = gmailLabelForFolder(state.folder);
    const params = new URLSearchParams({ maxResults: "25", labelIds: labelId });
    if (state.pageCursor) params.set("pageToken", state.pageCursor);
    const listRes = await googleFetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`, {
      headers: { authorization: `Bearer ${token}` }
    });
    if (!listRes.ok) await throwGoogleApiError(listRes, "Gmail list");
    const listData = (await listRes.json()) as {
      messages?: { id: string; threadId: string }[];
      nextPageToken?: string;
    };
    const messages: RawMailboxMessage[] = [];
    for (const ref of listData.messages ?? []) {
      const msgRes = await googleFetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${ref.id}?format=full`,
        { headers: { authorization: `Bearer ${token}` } }
      );
      if (!msgRes.ok) continue;
      const msgData = (await msgRes.json()) as {
        id: string;
        threadId: string;
        internalDate: string;
        labelIds?: string[];
        payload: GmailMimePart & { headers?: { name: string; value: string }[] };
      };
      const headers = msgData.payload.headers ?? [];
      const getHeader = (name: string) =>
        headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
      const bodies = decodeGmailBody(msgData.payload);
      const mailboxState = mapGmailLabelsToMailboxState(msgData.labelIds ?? []);
      messages.push({
        providerMessageId: msgData.id,
        providerThreadId: msgData.threadId,
        from: { email: getHeader("From").match(/<([^>]+)>/)?.[1] ?? getHeader("From"), name: null },
        to: getHeader("To")
          .split(",")
          .map((s) => ({ email: s.trim().match(/<([^>]+)>/)?.[1] ?? s.trim(), name: null })),
        cc: [],
        bcc: [],
        subject: getHeader("Subject"),
        snippet: bodies.text?.slice(0, 200) ?? "",
        bodyText: bodies.text ?? null,
        bodyHtml: bodies.html ?? null,
        messageId: getHeader("Message-ID") || null,
        inReplyTo: getHeader("In-Reply-To") || null,
        referencesHeader: getHeader("References") || null,
        receivedAt: new Date(Number(msgData.internalDate)),
        hasAttachments: false,
        hasCalendarInvite: Boolean(bodies.ics),
        calendarIcs: bodies.ics ?? null,
        folder: mailboxState.folder,
        isRead: mailboxState.isRead,
        isStarred: mailboxState.isStarred,
        direction: state.folder === "sent" ? "outbound" : "inbound"
      });
    }
    return { messages, pageCursor: listData.nextPageToken ?? null };
  },

  async applyProviderChanges(
    messages: MailboxProviderMessageRef[],
    operation: ProviderPushOperation
  ): Promise<ProviderApplyResult> {
    if (messages.length === 0) return {};
    const token = await getAccessToken(account);
    for (const ref of messages) {
      if (operation.type === "read") {
        await modifyGmailMessage(
          token,
          ref.providerMessageId,
          operation.isRead ? [] : ["UNREAD"],
          operation.isRead ? ["UNREAD"] : []
        );
      } else if (operation.type === "star") {
        await modifyGmailMessage(
          token,
          ref.providerMessageId,
          operation.isStarred ? ["STARRED"] : [],
          operation.isStarred ? [] : ["STARRED"]
        );
      } else if (operation.type === "folder") {
        const { add, remove } = gmailFolderPushLabels(operation);
        await modifyGmailMessage(token, ref.providerMessageId, add, remove);
      } else if (operation.type === "delete" && operation.permanent) {
        const res = await googleFetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${ref.providerMessageId}`,
          { method: "DELETE", headers: { authorization: `Bearer ${token}` } }
        );
        if (!res.ok) await throwGoogleApiError(res, "Gmail delete");
      }
    }
    return {};
  },

  async emptyProviderTrash(): Promise<void> {
    const token = await getAccessToken(account);
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({ maxResults: "100", labelIds: "TRASH" });
      if (pageToken) params.set("pageToken", pageToken);
      const listRes = await googleFetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`, {
        headers: { authorization: `Bearer ${token}` }
      });
      if (!listRes.ok) await throwGoogleApiError(listRes, "Gmail trash list");
      const listData = (await listRes.json()) as {
        messages?: { id: string }[];
        nextPageToken?: string;
      };
      for (const ref of listData.messages ?? []) {
        const res = await googleFetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${ref.id}`,
          { method: "DELETE", headers: { authorization: `Bearer ${token}` } }
        );
        if (!res.ok) await throwGoogleApiError(res, "Gmail trash delete");
      }
      pageToken = listData.nextPageToken;
    } while (pageToken);
  },

  async send(message: OutboundMailboxMessage): Promise<SendResult> {
    const token = await getAccessToken(account);
    const data = await sendGmailRawMime(token, {
      from: account.displayName
        ? `"${account.displayName}" <${account.emailAddress}>`
        : account.emailAddress,
      to: message.to.map((a) => (a.name ? `"${a.name}" <${a.email}>` : a.email)).join(", "),
      cc:
        message.cc.map((a) => (a.name ? `"${a.name}" <${a.email}>` : a.email)).join(", ") || undefined,
      bcc:
        message.bcc.map((a) => (a.name ? `"${a.name}" <${a.email}>` : a.email)).join(", ") || undefined,
      subject: message.subject,
      text: message.bodyText,
      html: message.bodyHtml,
      inReplyTo: message.inReplyTo ?? undefined,
      references: message.referencesHeader ?? undefined,
      attachments: message.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.mimeType
      }))
    });
    return { providerMessageId: data.id, messageId: data.id };
  },

  async sendCalendarReply(input: CalendarReplyInput): Promise<void> {
    const token = await getAccessToken(account);
    const ics = buildCalendarReplyIcs(input);
    const subject = buildCalendarReplySubject(input.response, input.title);
    const from = account.displayName
      ? `"${account.displayName}" <${account.emailAddress}>`
      : account.emailAddress;
    await sendGmailRawMime(token, {
      from,
      to: input.organizerEmail,
      subject,
      text: subject,
      attachments: [
        {
          filename: "invite.ics",
          content: ics,
          contentType: "text/calendar; charset=UTF-8; method=REPLY"
        }
      ]
    });
  }
});

export const buildGoogleOAuthAuthorizeUrl = (input: {
  redirectUri: string;
  state: string;
  loginHint?: string;
}): string => {
  const { clientId } = getGoogleOAuthConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state: input.state
  });
  const loginHint = input.loginHint?.trim();
  if (loginHint) params.set("login_hint", loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
};

const fetchGoogleAccountEmail = async (accessToken: string): Promise<string> => {
  const profileRes = await googleFetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { authorization: `Bearer ${accessToken}` }
  });
  if (profileRes.ok) {
    const profile = (await profileRes.json()) as { emailAddress?: string };
    if (profile.emailAddress?.trim()) return profile.emailAddress.trim();
  }
  if (!profileRes.ok) await throwGoogleApiError(profileRes, "Gmail API access check");

  const userinfoRes = await googleFetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { authorization: `Bearer ${accessToken}` }
  });
  if (userinfoRes.ok) {
    const info = (await userinfoRes.json()) as { email?: string };
    if (info.email?.trim()) return info.email.trim();
  }

  const profileDetail = profileRes.ok ? "no email in response" : `${profileRes.status}`;
  const userinfoDetail = userinfoRes.ok ? "no email in response" : `${userinfoRes.status}`;
  throw new Error(
    `Could not resolve Google account email (Gmail profile: ${profileDetail}; userinfo: ${userinfoDetail}). ` +
      "Ensure Gmail API is enabled on the Google Cloud project for mail sync."
  );
};

export const exchangeGoogleOAuthCode = async (input: {
  code: string;
  redirectUri: string;
}): Promise<{ refreshToken: string; accessToken: string; expiresIn: number; email: string }> => {
  const { clientId, clientSecret } = getGoogleOAuthConfig();
  const tokenRes = await googleFetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: input.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: input.redirectUri,
      grant_type: "authorization_code"
    })
  });
  if (!tokenRes.ok) await throwGoogleApiError(tokenRes, "Google token exchange");
  const tokens = (await tokenRes.json()) as {
    refresh_token?: string;
    access_token: string;
    expires_in: number;
    scope?: string;
  };
  if (!tokens.refresh_token) throw new Error("Google did not return a refresh token");
  assertGmailScopesGranted(tokens.scope);
  const email = await fetchGoogleAccountEmail(tokens.access_token);
  return {
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token,
    expiresIn: tokens.expires_in,
    email
  };
};
