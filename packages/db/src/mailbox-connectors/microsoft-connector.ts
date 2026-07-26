/**
 * Microsoft Graph mailbox connector and OAuth helpers.
 *
 * Implements `MailConnector` for Outlook/365 mail and calendar via Microsoft Graph, with OAuth
 * authorize/exchange flows and encrypted refresh token storage in `mailbox-repos`.
 *
 * Responsibilities:
 * - Mail folder delta sync, read/star/move/delete, send, and calendar ICS fetch
 * - OAuth authorization URL and code exchange
 * - Access token refresh with encrypted persistence
 *
 * Depends on:
 * - `label-mapping` for Graph well-known folder mapping
 * - Env: `MAILBOX_MICROSOFT_CLIENT_ID`, `MAILBOX_MICROSOFT_CLIENT_SECRET`
 *
 * Security:
 * - Refresh tokens encrypted at rest; reconnect hint on invalid_grant during refresh.
 * - Account rows must be tenant-scoped before token resolution.
 */

import type { MailboxFolder } from "@starter/shared";
import { MAILBOX_OAUTH_RECONNECT_HINT } from "@starter/shared";

import {
  decryptMailboxOAuthToken,
  encryptMailboxOAuthToken,
  updateMailboxAccountSyncState,
  type MailboxAccountRow
} from "../mailbox-repos.js";
import { graphWellKnownFolderNames, mapGraphFolderIdToMailboxFolder } from "./label-mapping.js";
import type {
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
import { MailboxOAuthNotConfiguredError } from "./oauth-config-error.js";

const GRAPH_SCOPES = [
  "Mail.ReadWrite",
  "Mail.Send",
  "Calendars.ReadWrite",
  "offline_access",
  "User.Read"
];

const GRAPH_CAPABILITIES: MailboxProviderCapabilities = {
  readState: true,
  star: true,
  folderMove: true,
  permanentDelete: true,
  emptyTrash: true
};

const getMicrosoftOAuthConfig = () => {
  const clientId = process.env.MAILBOX_MICROSOFT_CLIENT_ID?.trim();
  const clientSecret = process.env.MAILBOX_MICROSOFT_CLIENT_SECRET?.trim();
  const tenantId = process.env.MAILBOX_MICROSOFT_TENANT_ID?.trim() || "common";
  if (!clientId || !clientSecret) {
    throw new MailboxOAuthNotConfiguredError(
      "microsoft",
      "Microsoft mailbox sign-in is not configured. Set MAILBOX_MICROSOFT_CLIENT_ID and MAILBOX_MICROSOFT_CLIENT_SECRET."
    );
  }
  return { clientId, clientSecret, tenantId };
};

const refreshMicrosoftAccessToken = async (account: MailboxAccountRow): Promise<string> => {
  const { clientId, clientSecret, tenantId } = getMicrosoftOAuthConfig();
  if (!account.oauthRefreshTokenEncrypted) throw new Error("Missing Microsoft refresh token");
  const refreshToken = await decryptMailboxOAuthToken(
    account.oauthRefreshTokenEncrypted,
    account.tenantId,
    "oauthRefreshTokenEncrypted"
  );
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: GRAPH_SCOPES.join(" ")
    })
  });
  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { error?: string; error_description?: string };
      if (body.error_description?.trim()) detail = `: ${body.error_description.trim()}`;
      else if (body.error?.trim()) detail = `: ${body.error.trim()}`;
    } catch {
      // response may not be JSON
    }
    let message = `Microsoft token refresh failed: ${res.status}${detail}`;
    const lower = detail.toLowerCase();
    if (
      lower.includes("invalid_grant") ||
      lower.includes("expired") ||
      lower.includes("revoked") ||
      res.status === 401
    ) {
      message += `. ${MAILBOX_OAUTH_RECONNECT_HINT}`;
    }
    throw new Error(message);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number; refresh_token?: string };
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);
  const patch: Parameters<typeof updateMailboxAccountSyncState>[2] = {
    oauthAccessTokenEncrypted: await encryptMailboxOAuthToken(
      data.access_token,
      account.tenantId,
      "oauthAccessTokenEncrypted"
    ),
    oauthAccessTokenExpiresAt: expiresAt
  };
  if (data.refresh_token) {
    await updateMailboxAccountSyncState(account.tenantId, account.id, {
      ...patch,
      oauthRefreshTokenEncrypted: await encryptMailboxOAuthToken(
        data.refresh_token,
        account.tenantId,
        "oauthRefreshTokenEncrypted"
      )
    });
    return data.access_token;
  }
  await updateMailboxAccountSyncState(account.tenantId, account.id, patch);
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
  return refreshMicrosoftAccessToken(account);
};

export const resolveMicrosoftAccessToken = getAccessToken;

type GraphFolderMap = {
  idByFolder: Map<MailboxFolder, string>;
  folderById: Map<string, MailboxFolder>;
};

const loadGraphFolderMap = async (token: string): Promise<GraphFolderMap> => {
  const idByFolder = new Map<MailboxFolder, string>();
  const folderById = new Map<string, MailboxFolder>();
  for (const entry of graphWellKnownFolderNames) {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/me/mailFolders('${entry.wellKnown}')`,
      { headers: { authorization: `Bearer ${token}` } }
    );
    if (!res.ok) continue;
    const data = (await res.json()) as { id: string };
    idByFolder.set(entry.folder, data.id);
    folderById.set(data.id, entry.folder);
  }
  return { idByFolder, folderById };
};

const graphListUrl = (folder: MailboxSyncFolderState["folder"]): string => {
  const wellKnown = folder === "sent" ? "sentitems" : "inbox";
  return `https://graph.microsoft.com/v1.0/me/mailFolders('${wellKnown}')/messages?$top=25&$orderby=receivedDateTime desc&$select=id,conversationId,subject,bodyPreview,body,from,toRecipients,receivedDateTime,internetMessageId,isRead,flag,parentFolderId,hasAttachments,meetingMessageType`;
};

type GraphFileAttachment = {
  "@odata.type"?: string;
  id?: string;
  name?: string;
  contentType?: string;
  contentBytes?: string;
};

const isCalendarAttachmentMeta = (attachment: GraphFileAttachment): boolean => {
  const contentType = attachment.contentType ?? "";
  const name = attachment.name ?? "";
  return contentType.includes("text/calendar") || name.toLowerCase().endsWith(".ics");
};

const decodeGraphAttachmentContent = (attachment: GraphFileAttachment): string | null => {
  if (!attachment.contentBytes) return null;
  return Buffer.from(attachment.contentBytes, "base64").toString("utf8");
};

const fetchGraphAttachmentById = async (
  token: string,
  messageId: string,
  attachmentId: string
): Promise<GraphFileAttachment | null> => {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/messages/${messageId}/attachments/${attachmentId}`,
    { headers: { authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return null;
  return (await res.json()) as GraphFileAttachment;
};

/** Fetch calendar ICS from a synced Microsoft message (invite.ics attachment). */
export const fetchMicrosoftMessageCalendarIcs = async (
  token: string,
  messageId: string
): Promise<string | null> => {
  const res = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${messageId}/attachments`, {
    headers: { authorization: `Bearer ${token}` }
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { value?: GraphFileAttachment[] };
  for (const attachment of data.value ?? []) {
    if (!isCalendarAttachmentMeta(attachment)) continue;
    const inline = decodeGraphAttachmentContent(attachment);
    if (inline?.includes("BEGIN:VCALENDAR")) return inline;
    if (attachment.id) {
      const full = await fetchGraphAttachmentById(token, messageId, attachment.id);
      const decoded = full ? decodeGraphAttachmentContent(full) : null;
      if (decoded?.includes("BEGIN:VCALENDAR")) return decoded;
    }
  }
  return null;
};

const isMicrosoftMeetingMessageType = (value: string | undefined | null): boolean =>
  Boolean(value && value !== "none");

const mapMicrosoftGraphMessage = async (
  token: string,
  m: {
    id: string;
    conversationId: string;
    subject: string;
    bodyPreview: string;
    body: { contentType: string; content: string };
    from: { emailAddress: { address: string; name?: string } };
    toRecipients: { emailAddress: { address: string; name?: string } }[];
    receivedDateTime: string;
    internetMessageId?: string;
    isRead?: boolean;
    flag?: { flagStatus?: string };
    parentFolderId?: string;
    hasAttachments?: boolean;
    meetingMessageType?: string;
  },
  folder: MailboxFolder,
  direction: "inbound" | "outbound"
): Promise<RawMailboxMessage> => {
  const bodyContent = m.body.content ?? "";
  const bodyHasIcs = bodyContent.includes("BEGIN:VCALENDAR");
  const meetingMessage = isMicrosoftMeetingMessageType(m.meetingMessageType);
  let calendarIcs: string | null = bodyHasIcs ? bodyContent.match(/BEGIN:VCALENDAR[\s\S]*?END:VCALENDAR/i)?.[0] ?? bodyContent : null;

  if (!calendarIcs && (meetingMessage || m.hasAttachments)) {
    calendarIcs = await fetchMicrosoftMessageCalendarIcs(token, m.id);
  }

  return {
    providerMessageId: m.id,
    providerThreadId: m.conversationId,
    from: { email: m.from?.emailAddress?.address ?? "", name: m.from?.emailAddress?.name ?? null },
    to: (m.toRecipients ?? []).map((r) => ({
      email: r.emailAddress.address,
      name: r.emailAddress.name ?? null
    })),
    cc: [],
    bcc: [],
    subject: m.subject ?? "",
    snippet: m.bodyPreview ?? "",
    bodyText: m.body.contentType === "text" ? m.body.content : null,
    bodyHtml: m.body.contentType === "html" ? m.body.content : null,
    messageId: m.internetMessageId ?? null,
    inReplyTo: null,
    referencesHeader: null,
    receivedAt: new Date(m.receivedDateTime),
    hasAttachments: Boolean(m.hasAttachments),
    hasCalendarInvite: bodyHasIcs || meetingMessage || Boolean(calendarIcs),
    calendarIcs,
    folder,
    isRead: Boolean(m.isRead),
    isStarred: m.flag?.flagStatus === "flagged",
    direction
  };
};

const graphFolderForPush = (
  folder: MailboxFolder,
  previousFolder: MailboxFolder | null | undefined,
  idByFolder: Map<MailboxFolder, string>
): string | undefined => {
  if (folder === "trash") return idByFolder.get("trash");
  if (folder === "archive") return idByFolder.get("archive");
  if (folder === "inbox") {
    if (previousFolder === "trash" || previousFolder === "archive") {
      return idByFolder.get("inbox");
    }
    return idByFolder.get("inbox");
  }
  return idByFolder.get(folder);
};

export const createMicrosoftConnector = (account: MailboxAccountRow): MailConnector => ({
  getCapabilities() {
    return GRAPH_CAPABILITIES;
  },

  async refreshAuthIfNeeded() {
    await getAccessToken(account);
  },

  async syncDelta(state: MailboxSyncFolderState): Promise<SyncFolderResult> {
    const token = await getAccessToken(account);
    const folderMap = await loadGraphFolderMap(token);
    const url = state.pageCursor ?? graphListUrl(state.folder);
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Graph list failed: ${res.status}`);
    const data = (await res.json()) as {
      value: {
        id: string;
        conversationId: string;
        subject: string;
        bodyPreview: string;
        body: { contentType: string; content: string };
        from: { emailAddress: { address: string; name?: string } };
        toRecipients: { emailAddress: { address: string; name?: string } }[];
        receivedDateTime: string;
        internetMessageId?: string;
        isRead?: boolean;
        flag?: { flagStatus?: string };
        parentFolderId?: string;
        hasAttachments?: boolean;
        meetingMessageType?: string;
      }[];
      "@odata.nextLink"?: string;
    };
    const messages: RawMailboxMessage[] = [];
    for (const m of data.value ?? []) {
      const folder = mapGraphFolderIdToMailboxFolder(m.parentFolderId, folderMap.folderById);
      messages.push(
        await mapMicrosoftGraphMessage(
          token,
          m,
          folder,
          state.folder === "sent" ? "outbound" : "inbound"
        )
      );
    }
    return { messages, pageCursor: data["@odata.nextLink"] ?? null };
  },

  async applyProviderChanges(
    messages: MailboxProviderMessageRef[],
    operation: ProviderPushOperation
  ): Promise<ProviderApplyResult> {
    if (messages.length === 0) return {};
    const token = await getAccessToken(account);
    const folderMap = await loadGraphFolderMap(token);

    for (const ref of messages) {
      if (operation.type === "read") {
        const res = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${ref.providerMessageId}`, {
          method: "PATCH",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ isRead: operation.isRead })
        });
        if (!res.ok) throw new Error(`Graph read-state update failed: ${res.status}`);
      } else if (operation.type === "star") {
        const res = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${ref.providerMessageId}`, {
          method: "PATCH",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({
            flag: { flagStatus: operation.isStarred ? "flagged" : "notFlagged" }
          })
        });
        if (!res.ok) throw new Error(`Graph flag update failed: ${res.status}`);
      } else if (operation.type === "folder") {
        const destinationId = graphFolderForPush(
          operation.folder,
          operation.previousFolder,
          folderMap.idByFolder
        );
        if (!destinationId) continue;
        const res = await fetch(
          `https://graph.microsoft.com/v1.0/me/messages/${ref.providerMessageId}/move`,
          {
            method: "POST",
            headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
            body: JSON.stringify({ destinationId })
          }
        );
        if (!res.ok) throw new Error(`Graph move failed: ${res.status}`);
      } else if (operation.type === "delete" && operation.permanent) {
        const res = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${ref.providerMessageId}`, {
          method: "DELETE",
          headers: { authorization: `Bearer ${token}` }
        });
        if (!res.ok && res.status !== 404) throw new Error(`Graph delete failed: ${res.status}`);
      }
    }
    return {};
  },

  async emptyProviderTrash(): Promise<void> {
    const token = await getAccessToken(account);
    const folderMap = await loadGraphFolderMap(token);
    const trashFolderId = folderMap.idByFolder.get("trash");
    if (!trashFolderId) return;

    let url: string | null =
      `https://graph.microsoft.com/v1.0/me/mailFolders/${trashFolderId}/messages?$top=100&$select=id`;
    while (url) {
      const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Graph trash list failed: ${res.status}`);
      const data = (await res.json()) as {
        value: { id: string }[];
        "@odata.nextLink"?: string;
      };
      for (const message of data.value ?? []) {
        const deleteRes = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${message.id}`, {
          method: "DELETE",
          headers: { authorization: `Bearer ${token}` }
        });
        if (!deleteRes.ok && deleteRes.status !== 404) {
          throw new Error(`Graph trash delete failed: ${deleteRes.status}`);
        }
      }
      url = data["@odata.nextLink"] ?? null;
    }
  },

  async send(message: OutboundMailboxMessage): Promise<SendResult> {
    const token = await getAccessToken(account);
    const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        message: {
          subject: message.subject,
          body: {
            contentType: message.bodyHtml ? "HTML" : "Text",
            content: message.bodyHtml ?? message.bodyText ?? ""
          },
          toRecipients: message.to.map((a) => ({
            emailAddress: { address: a.email, name: a.name ?? undefined }
          }))
        },
        saveToSentItems: true
      })
    });
    if (!res.ok && res.status !== 202) throw new Error(`Graph send failed: ${res.status}`);
    const messageId = `<${Date.now()}@graph.microsoft.com>`;
    return { providerMessageId: messageId, messageId };
  },

  async sendCalendarReply() {
    throw new Error("Microsoft calendar RSVP deferred");
  }
});

export const buildMicrosoftOAuthAuthorizeUrl = (input: {
  redirectUri: string;
  state: string;
  loginHint?: string;
}): string => {
  const { clientId, tenantId } = getMicrosoftOAuthConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: GRAPH_SCOPES.join(" "),
    state: input.state
  });
  const loginHint = input.loginHint?.trim();
  if (loginHint) params.set("login_hint", loginHint);
  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params}`;
};

export const exchangeMicrosoftOAuthCode = async (input: {
  code: string;
  redirectUri: string;
}): Promise<{ refreshToken: string; accessToken: string; expiresIn: number; email: string }> => {
  const { clientId, clientSecret, tenantId } = getMicrosoftOAuthConfig();
  const tokenRes = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: input.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: input.redirectUri,
      grant_type: "authorization_code",
      scope: GRAPH_SCOPES.join(" ")
    })
  });
  if (!tokenRes.ok) throw new Error(`Microsoft token exchange failed: ${tokenRes.status}`);
  const tokens = (await tokenRes.json()) as {
    refresh_token?: string;
    access_token: string;
    expires_in: number;
  };
  if (!tokens.refresh_token) throw new Error("Microsoft did not return a refresh token");
  const profileRes = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { authorization: `Bearer ${tokens.access_token}` }
  });
  if (!profileRes.ok) throw new Error("Failed to fetch Microsoft profile");
  const profile = (await profileRes.json()) as { mail?: string; userPrincipalName: string };
  return {
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token,
    expiresIn: tokens.expires_in,
    email: profile.mail ?? profile.userPrincipalName
  };
};
