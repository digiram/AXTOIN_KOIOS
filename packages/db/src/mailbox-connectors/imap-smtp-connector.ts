/**
 * IMAP/SMTP mailbox connector.
 *
 * Implements `MailConnector` for generic IMAP inboxes using ImapFlow for sync and Nodemailer for
 * outbound SMTP. Credentials are decrypted from the mailbox account row at connect time.
 *
 * Responsibilities:
 * - Delta sync for inbox and sent folders with UID-based provider message ids
 * - Apply read/star/folder/delete operations via IMAP flags and moves
 * - Send mail and calendar RSVP replies over SMTP
 *
 * Depends on:
 * - `imapflow`, `nodemailer`, `mailparser`
 * - `mailbox-repos.decryptMailboxSecret`
 *
 * Security:
 * - IMAP/SMTP passwords are decrypted in-memory only; never log credentials or full message bodies.
 * - Account must be loaded with tenant-scoped repo queries before connector creation.
 */

import type { MailboxFolder } from "@starter/shared";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { simpleParser } from "mailparser";

import {
  decryptMailboxSecret,
  type MailboxAccountRow
} from "../mailbox-repos.js";
import type {
  MailConnector,
  MailboxProviderCapabilities,
  MailboxProviderMessageRef,
  MailboxSyncFolderState,
  OutboundMailboxMessage,
  ProviderApplyResult,
  ProviderIdUpdate,
  ProviderPushOperation,
  RawMailboxMessage,
  SendResult,
  SyncFolderResult
} from "./types.js";

const IMAP_CAPABILITIES: MailboxProviderCapabilities = {
  readState: true,
  star: true,
  folderMove: true,
  permanentDelete: true,
  emptyTrash: true
};

const parseAddressField = (field: import("mailparser").AddressObject | import("mailparser").AddressObject[] | undefined) => {
  if (!field) return [];
  const obj = Array.isArray(field) ? field[0] : field;
  return (obj?.value ?? []).map((a) => ({ email: a.address ?? "", name: a.name ?? null }));
};

const parseFromField = (field: import("mailparser").AddressObject | import("mailparser").AddressObject[] | undefined) => {
  const list = parseAddressField(field);
  return list[0] ?? { email: "", name: null };
};

type ImapSpecialMailboxes = {
  inbox: string;
  sent: string | null;
  trash: string | null;
  archive: string | null;
};

const resolveImapSpecialMailboxes = async (client: ImapFlow): Promise<ImapSpecialMailboxes> => {
  const mailboxes = await client.list();
  const bySpecial = new Map<string, string>();
  for (const box of mailboxes) {
    for (const special of box.specialUse ?? []) {
      bySpecial.set(special.toLowerCase(), box.path);
    }
  }
  const pick = (...candidates: string[]): string | null => {
    for (const candidate of candidates) {
      const special = bySpecial.get(candidate.toLowerCase());
      if (special) return special;
      const match = mailboxes.find((box) => box.path.toLowerCase() === candidate.toLowerCase());
      if (match) return match.path;
    }
    return null;
  };
  return {
    inbox: pick("\\Inbox", "INBOX") ?? "INBOX",
    sent: pick("\\Sent", "Sent", "Sent Items", "Sent Messages", "[Gmail]/Sent Mail"),
    trash: pick("\\Trash", "Trash", "Deleted", "Deleted Items", "[Gmail]/Trash"),
    archive: pick("\\Archive", "Archive", "[Gmail]/All Mail")
  };
};

const imapProviderMessageId = (mailboxPath: string, uid: number): string => `${mailboxPath}:${uid}`;

const parseImapProviderMessageId = (
  providerMessageId: string
): { mailboxPath: string; uid: number } | undefined => {
  const separator = providerMessageId.lastIndexOf(":");
  if (separator <= 0) return undefined;
  const mailboxPath = providerMessageId.slice(0, separator);
  const uid = Number(providerMessageId.slice(separator + 1));
  if (!mailboxPath || !Number.isFinite(uid)) return undefined;
  return { mailboxPath, uid };
};

const imapMailboxForSync = (special: ImapSpecialMailboxes, folder: MailboxSyncFolderState["folder"]): string => {
  if (folder === "sent" && special.sent) return special.sent;
  return special.inbox;
};

const imapMailboxForFolderPush = (
  special: ImapSpecialMailboxes,
  folder: MailboxFolder,
  previousFolder?: MailboxFolder | null
): string | null => {
  if (folder === "trash") return special.trash;
  if (folder === "archive") return special.archive;
  if (folder === "inbox") {
    if (previousFolder === "trash" || previousFolder === "archive") return special.inbox;
    return special.inbox;
  }
  if (folder === "sent") return special.sent;
  return null;
};

export const createImapSmtpConnector = (account: MailboxAccountRow): MailConnector => {
  const getPassword = async (): Promise<string> => {
    if (!account.credentialsEncrypted) throw new Error("Missing IMAP credentials");
    const raw = await decryptMailboxSecret(account.credentialsEncrypted, account.tenantId);
    const parsed = JSON.parse(raw) as { password?: string };
    return String(parsed.password ?? "");
  };

  const connectClient = async (): Promise<ImapFlow> => {
    const client = new ImapFlow({
      host: account.imapHost!,
      port: account.imapPort ?? 993,
      secure: account.imapSecure,
      auth: { user: account.username!, pass: await getPassword() }
    });
    await client.connect();
    return client;
  };

  return {
    getCapabilities() {
      return IMAP_CAPABILITIES;
    },

    async refreshAuthIfNeeded() {
      /* no-op for password auth */
    },

    async syncDelta(state: MailboxSyncFolderState): Promise<SyncFolderResult> {
      const client = await connectClient();
      try {
        const special = await resolveImapSpecialMailboxes(client);
        const mailboxPath = imapMailboxForSync(special, state.folder);
        const lock = await client.getMailboxLock(mailboxPath);
        try {
          const since = state.pageCursor
            ? new Date(state.pageCursor)
            : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          const messages: RawMailboxMessage[] = [];
          for await (const msg of client.fetch({ since }, { uid: true, source: true, flags: true })) {
            if (!msg.source) continue;
            const parsed = await simpleParser(msg.source);
            const calendarPart = parsed.attachments.find(
              (a) => a.contentType?.includes("text/calendar") || a.filename?.endsWith(".ics")
            );
            const icsContent = calendarPart ? calendarPart.content.toString("utf8") : null;
            const fileAttachments = (parsed.attachments ?? [])
              .filter(
                (a) =>
                  a !== calendarPart &&
                  !a.contentType?.includes("text/calendar") &&
                  !a.filename?.endsWith(".ics")
              )
              .map((a) => ({
                filename: a.filename || "attachment",
                mimeType: a.contentType || "application/octet-stream",
                content: Buffer.isBuffer(a.content) ? a.content : Buffer.from(a.content)
              }));
            const flags = new Set(
              Array.from(msg.flags ?? []).map((flag: string) => flag.toLowerCase())
            );
            messages.push({
              providerMessageId: imapProviderMessageId(mailboxPath, msg.uid),
              from: parseFromField(parsed.from),
              to: parseAddressField(parsed.to),
              cc: parseAddressField(parsed.cc),
              bcc: parseAddressField(parsed.bcc),
              subject: parsed.subject ?? "",
              snippet: (parsed.text ?? "").slice(0, 200),
              bodyText: parsed.text ?? null,
              bodyHtml: typeof parsed.html === "string" ? parsed.html : null,
              messageId: parsed.messageId ?? null,
              inReplyTo: parsed.inReplyTo ?? null,
              referencesHeader: Array.isArray(parsed.references)
                ? parsed.references.join(" ")
                : parsed.references ?? null,
              receivedAt: parsed.date ?? new Date(),
              hasAttachments: fileAttachments.length > 0,
              hasCalendarInvite: Boolean(icsContent),
              calendarIcs: icsContent,
              attachments: fileAttachments,
              folder: state.folder === "sent" ? "sent" : "inbox",
              isRead: flags.has("\\seen"),
              isStarred: flags.has("\\flagged"),
              direction: state.folder === "sent" ? "outbound" : "inbound"
            });
          }
          return { messages, pageCursor: new Date().toISOString() };
        } finally {
          lock.release();
        }
      } finally {
        await client.logout();
      }
    },

    async applyProviderChanges(
      messages: MailboxProviderMessageRef[],
      operation: ProviderPushOperation
    ): Promise<ProviderApplyResult> {
      if (messages.length === 0) return {};
      const client = await connectClient();
      const providerIdUpdates: ProviderIdUpdate[] = [];
      try {
        const special = await resolveImapSpecialMailboxes(client);
        const grouped = new Map<string, number[]>();
        for (const message of messages) {
          const parsed = parseImapProviderMessageId(message.providerMessageId);
          if (!parsed) continue;
          const list = grouped.get(parsed.mailboxPath) ?? [];
          list.push(parsed.uid);
          grouped.set(parsed.mailboxPath, list);
        }

        for (const [mailboxPath, uids] of grouped) {
          if (uids.length === 0) continue;

          if (operation.type === "read") {
            const lock = await client.getMailboxLock(mailboxPath);
            try {
              if (operation.isRead) {
                await client.messageFlagsAdd(uids, ["\\Seen"], { uid: true });
              } else {
                await client.messageFlagsRemove(uids, ["\\Seen"], { uid: true });
              }
            } finally {
              lock.release();
            }
            continue;
          }

          if (operation.type === "star") {
            const lock = await client.getMailboxLock(mailboxPath);
            try {
              if (operation.isStarred) {
                await client.messageFlagsAdd(uids, ["\\Flagged"], { uid: true });
              } else {
                await client.messageFlagsRemove(uids, ["\\Flagged"], { uid: true });
              }
            } finally {
              lock.release();
            }
            continue;
          }

          if (operation.type === "folder") {
            const destination = imapMailboxForFolderPush(special, operation.folder, operation.previousFolder);
            if (!destination) continue;
            const lock = await client.getMailboxLock(mailboxPath);
            try {
              const moveResult = await client.messageMove(uids, destination, { uid: true });
              if (moveResult && typeof moveResult === "object" && "uidMap" in moveResult && moveResult.uidMap) {
                for (const [sourceUid, destinationUid] of moveResult.uidMap) {
                  providerIdUpdates.push({
                    from: imapProviderMessageId(mailboxPath, Number(sourceUid)),
                    to: imapProviderMessageId(destination, Number(destinationUid))
                  });
                }
              }
            } finally {
              lock.release();
            }
            continue;
          }

          if (operation.type === "delete" && operation.permanent) {
            const mailboxCandidates = new Set<string>([mailboxPath]);
            if (operation.sourceFolder === "trash" && special.trash) {
              mailboxCandidates.add(special.trash);
            }
            let deleted = false;
            for (const candidate of mailboxCandidates) {
              const lock = await client.getMailboxLock(candidate);
              try {
                const deleteResult = await client.messageDelete(uids, { uid: true });
                if (deleteResult) {
                  deleted = true;
                  break;
                }
              } finally {
                lock.release();
              }
            }
            if (!deleted && special.trash) {
              const lock = await client.getMailboxLock(special.trash);
              try {
                for (const ref of messages) {
                  if (!ref.messageId?.trim()) continue;
                  const found = await client.search(
                    { header: { "Message-ID": ref.messageId.trim() } },
                    { uid: true }
                  );
                  if (Array.isArray(found) && found.length > 0) {
                    await client.messageDelete(found, { uid: true });
                  }
                }
              } finally {
                lock.release();
              }
            }
          }
        }
      } finally {
        await client.logout();
      }
      return providerIdUpdates.length > 0 ? { providerIdUpdates } : {};
    },

    async emptyProviderTrash(): Promise<void> {
      const client = await connectClient();
      try {
        const special = await resolveImapSpecialMailboxes(client);
        if (!special.trash) return;
        const lock = await client.getMailboxLock(special.trash);
        try {
          const uids: number[] = [];
          for await (const msg of client.fetch("1:*", { uid: true })) {
            if (msg.uid) uids.push(msg.uid);
          }
          if (uids.length > 0) {
            await client.messageDelete(uids, { uid: true });
          }
        } finally {
          lock.release();
        }
      } finally {
        await client.logout();
      }
    },

    async send(message: OutboundMailboxMessage): Promise<SendResult> {
      const transport = nodemailer.createTransport({
        host: account.smtpHost!,
        port: account.smtpPort ?? 587,
        secure: account.smtpSecure,
        auth: { user: account.username!, pass: await getPassword() }
      });
      const messageId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@${account.emailAddress.split("@")[1] ?? "mail"}>`;
      const info = await transport.sendMail({
        from: account.displayName
          ? `"${account.displayName}" <${account.emailAddress}>`
          : account.emailAddress,
        to: message.to.map((a) => (a.name ? `"${a.name}" <${a.email}>` : a.email)).join(", "),
        cc: message.cc.map((a) => (a.name ? `"${a.name}" <${a.email}>` : a.email)).join(", ") || undefined,
        bcc: message.bcc.map((a) => (a.name ? `"${a.name}" <${a.email}>` : a.email)).join(", ") || undefined,
        subject: message.subject,
        text: message.bodyText,
        html: message.bodyHtml,
        inReplyTo: message.inReplyTo ?? undefined,
        references: message.referencesHeader ?? undefined,
        messageId,
        attachments: message.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
          contentType: a.mimeType
        }))
      });
      return { providerMessageId: info.messageId ?? messageId, messageId };
    },

    async sendCalendarReply() {
      throw new Error("Calendar RSVP via IMAP/SMTP not yet implemented for generic providers");
    }
  };
};
