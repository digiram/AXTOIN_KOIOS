/**
 * Mailbox module repositories — accounts, threads, messages, calendar.
 */

import { randomUUID } from "node:crypto";
import {
  MAILBOX_SYNC_ACCOUNT_POLL_INTERVAL_MS,
  MAILBOX_SYNC_STALE_SYNCING_MS,
  isMailboxOAuthReconnectRequired,
  pickMailboxAccentColor
} from "@starter/shared";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  findEntityIdsByMultiFieldContains,
  getFieldEncryptionMiddleware
} from "./field-encryption/index.js";
import { decryptRowAtBoundary, encryptRowAtBoundary } from "./field-encryption/repo-boundary.js";
import { escapeLike } from "./crm-repos-query-helpers.js";
import {
  encryptMailboxBodiesAtRest
} from "./mailbox-body-at-rest.js";
import {
  buildMailboxInternalHeaders,
  type MailboxAccountMemberRole,
  type MailboxAddress,
  type MailboxEmbeddedSentEmail,
  type MailboxFolder,
  type MailboxInternalSource,
  type MailboxOwnerScope,
  type MailboxProvider
} from "@starter/shared";

import { getDb } from "./client.js";
import * as mysql from "./mysql-schema.js";
import * as pg from "./pg-schema.js";
import { dialectFromEnv } from "./schema.js";
import { decryptSecretAtBoundary, encryptSecretAtBoundary } from "./field-encryption/secret-boundary.js";
import { syncGoogleCalendarDelta, syncMicrosoftCalendarDelta } from "./mailbox-calendar-sync.js";

const mysqlDb = (): MySql2Database<typeof mysql> => getDb() as MySql2Database<typeof mysql>;
const pgDb = (): NodePgDatabase<typeof pg> => getDb() as NodePgDatabase<typeof pg>;

const INTERNAL_EMAIL = "notifications@internal";

export type MailboxInboxRow = {
  id: string;
  tenantId: string;
  ownerScope: MailboxOwnerScope;
  ownerUserId: string | null;
  ownerEmployeeId: string | null;
  displayName: string;
  color: string;
  createdAt: Date;
  updatedAt: Date;
};

export type MailboxAccountRow = {
  id: string;
  tenantId: string;
  mailboxInboxId: string;
  ownerScope: MailboxOwnerScope;
  ownerUserId: string | null;
  ownerEmployeeId: string | null;
  displayName: string;
  emailAddress: string;
  provider: MailboxProvider;
  imapHost: string | null;
  imapPort: number | null;
  imapSecure: boolean;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean;
  username: string | null;
  credentialsEncrypted: string | null;
  oauthRefreshTokenEncrypted: string | null;
  oauthAccessTokenEncrypted: string | null;
  oauthAccessTokenExpiresAt: Date | null;
  syncCursor: string | null;
  syncStatus: string;
  syncError: string | null;
  lastSyncedAt: Date | null;
  webhookSubscriptionId: string | null;
  color: string;
  createdAt: Date;
  updatedAt: Date;
};

export type MailboxThreadRow = {
  id: string;
  tenantId: string;
  accountId: string;
  providerThreadId: string | null;
  subjectNormalized: string;
  snippet: string;
  folder: MailboxFolder;
  previousFolder: string | null;
  lastMessageAt: Date;
  unreadCount: number;
  isStarred: boolean;
  createdAt: Date;
  updatedAt: Date;
  /** Latest message sender JSON — populated for thread list queries only. */
  lastFromJson?: string | null;
  /** Latest message calendar-invite flag — populated for thread list queries only. */
  lastHasCalendarInvite?: boolean;
};

export type MailboxAttachmentRow = {
  id: string;
  tenantId: string;
  messageId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  blobPath: string;
  createdAt: Date;
};

export type MailboxMessageRow = {
  id: string;
  tenantId: string;
  accountId: string;
  threadId: string;
  providerMessageId: string | null;
  direction: string;
  fromJson: string;
  toJson: string;
  ccJson: string;
  bccJson: string;
  subject: string;
  snippet: string;
  bodyText: string | null;
  bodyHtml: string | null;
  headersJson: string | null;
  messageId: string | null;
  inReplyTo: string | null;
  referencesHeader: string | null;
  internalSource: string | null;
  actionUrl: string | null;
  relatedEntityKind: string | null;
  relatedEntityId: string | null;
  receivedAt: Date;
  isRead: boolean;
  isDraft: boolean;
  hasAttachments: boolean;
  hasCalendarInvite: boolean;
  sentByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MailboxCalendarEventRow = {
  id: string;
  tenantId: string;
  calendarId: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  allDay: boolean;
  status: string;
  organizerJson: string;
  sourceMessageId: string | null;
  providerEventId: string | null;
  icsUid: string | null;
  icsSequence: number;
  recurrenceJson: string | null;
  createdAt: Date;
  updatedAt: Date;
  calendarName?: string;
  calendarColor?: string;
  calendarSource?: string;
  /** Mailbox connection (account) this event originated from. */
  connectionId?: string | null;
};

export type MailboxCalendarRow = {
  id: string;
  tenantId: string;
  userId: string;
  mailboxAccountId: string | null;
  name: string;
  color: string;
  isPrimary: boolean;
  source: string;
  providerCalendarId: string | null;
  syncCursor: string | null;
  syncStatus: string;
  syncError: string | null;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const mapInboxRow = (row: {
  id: string;
  tenantId: string;
  ownerScope: string;
  ownerUserId: string | null;
  ownerEmployeeId?: string | null;
  displayName: string;
  color: string;
  createdAt: Date;
  updatedAt: Date;
}): MailboxInboxRow => ({
  id: row.id,
  tenantId: row.tenantId,
  ownerScope: row.ownerScope as MailboxOwnerScope,
  ownerUserId: row.ownerUserId,
  ownerEmployeeId: row.ownerEmployeeId ?? null,
  displayName: row.displayName,
  color: row.color,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
});

const mapAccountRow = (row: {
  id: string;
  tenantId: string;
  mailboxInboxId: string;
  ownerScope: string;
  ownerUserId: string | null;
  ownerEmployeeId?: string | null;
  displayName: string;
  emailAddress: string;
  provider: string;
  imapHost: string | null;
  imapPort: number | null;
  imapSecure: boolean;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean;
  username: string | null;
  credentialsEncrypted: string | null;
  oauthRefreshTokenEncrypted: string | null;
  oauthAccessTokenEncrypted: string | null;
  oauthAccessTokenExpiresAt: Date | null;
  syncCursor: string | null;
  syncStatus: string;
  syncError: string | null;
  lastSyncedAt: Date | null;
  webhookSubscriptionId: string | null;
  color: string;
  createdAt: Date;
  updatedAt: Date;
}): MailboxAccountRow => ({
  id: row.id,
  tenantId: row.tenantId,
  mailboxInboxId: row.mailboxInboxId,
  ownerScope: row.ownerScope as MailboxOwnerScope,
  ownerUserId: row.ownerUserId,
  ownerEmployeeId: row.ownerEmployeeId ?? null,
  displayName: row.displayName,
  emailAddress: row.emailAddress,
  provider: row.provider as MailboxProvider,
  imapHost: row.imapHost,
  imapPort: row.imapPort,
  imapSecure: Boolean(row.imapSecure),
  smtpHost: row.smtpHost,
  smtpPort: row.smtpPort,
  smtpSecure: Boolean(row.smtpSecure),
  username: row.username,
  credentialsEncrypted: row.credentialsEncrypted,
  oauthRefreshTokenEncrypted: row.oauthRefreshTokenEncrypted,
  oauthAccessTokenEncrypted: row.oauthAccessTokenEncrypted,
  oauthAccessTokenExpiresAt: row.oauthAccessTokenExpiresAt,
  syncCursor: row.syncCursor,
  syncStatus: row.syncStatus,
  syncError: row.syncError,
  lastSyncedAt: row.lastSyncedAt,
  webhookSubscriptionId: row.webhookSubscriptionId,
  color: row.color,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
});

const ACCOUNTS_TABLE_KEY = "mailbox_accounts";
const THREADS_TABLE_KEY = "mailbox_threads";
const MESSAGES_TABLE_KEY = "mailbox_messages";

type AccountDbRow = {
  id: string;
  tenantId: string;
  mailboxInboxId: string;
  ownerScope: string;
  ownerUserId: string | null;
  ownerEmployeeId?: string | null;
  displayName: string;
  emailAddress: string;
  provider: string;
  imapHost: string | null;
  imapPort: number | null;
  imapSecure: boolean;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean;
  username: string | null;
  credentialsEncrypted: string | null;
  oauthRefreshTokenEncrypted: string | null;
  oauthAccessTokenEncrypted: string | null;
  oauthAccessTokenExpiresAt: Date | null;
  syncCursor: string | null;
  syncStatus: string;
  syncError: string | null;
  lastSyncedAt: Date | null;
  webhookSubscriptionId: string | null;
  color: string;
  createdAt: Date;
  updatedAt: Date;
};

const decryptAccountRow = async (tenantId: string, row: AccountDbRow): Promise<MailboxAccountRow> =>
  decryptRowAtBoundary(ACCOUNTS_TABLE_KEY, tenantId, row as unknown as Record<string, unknown>, (plain) =>
    mapAccountRow(plain as AccountDbRow)
  );

const encryptAccountFields = async (
  tenantId: string,
  row: Record<string, unknown>,
  opts?: { entityId?: string; changedFields?: Set<string> }
): Promise<Record<string, unknown>> => encryptRowAtBoundary(ACCOUNTS_TABLE_KEY, tenantId, row, opts);

const sealAccountIdentity = async (
  tenantId: string,
  entityId: string,
  identity: { displayName: string; emailAddress: string }
): Promise<{ displayName: string; emailAddress: string }> => {
  const encrypted = await encryptAccountFields(tenantId, identity, { entityId });
  return {
    displayName: String(encrypted.displayName ?? identity.displayName),
    emailAddress: String(encrypted.emailAddress ?? identity.emailAddress)
  };
};

type ThreadDbRow = {
  id: string;
  tenantId: string;
  accountId: string;
  providerThreadId: string | null;
  subjectNormalized: string;
  snippet: string;
  folder: string;
  previousFolder: string | null;
  lastMessageAt: Date;
  unreadCount: number;
  isStarred: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const mapPlainThreadRow = (row: ThreadDbRow): MailboxThreadRow => ({
  id: row.id,
  tenantId: row.tenantId,
  accountId: row.accountId,
  providerThreadId: row.providerThreadId,
  subjectNormalized: row.subjectNormalized,
  snippet: row.snippet,
  folder: row.folder as MailboxFolder,
  previousFolder: row.previousFolder ?? null,
  lastMessageAt: row.lastMessageAt,
  unreadCount: row.unreadCount,
  isStarred: Boolean(row.isStarred),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
});

const decryptThreadRow = async (tenantId: string, row: ThreadDbRow): Promise<MailboxThreadRow> =>
  decryptRowAtBoundary(THREADS_TABLE_KEY, tenantId, row as unknown as Record<string, unknown>, (plain) =>
    mapPlainThreadRow(plain as ThreadDbRow)
  );

const sealThreadMetadata = async (
  tenantId: string,
  threadId: string,
  metadata: { subjectNormalized: string; snippet: string }
): Promise<{ subjectNormalized: string; snippet: string }> => {
  const changedFields = new Set(["subjectNormalized", "snippet"]);
  const encrypted = await encryptRowAtBoundary(THREADS_TABLE_KEY, tenantId, metadata, {
    entityId: threadId,
    changedFields
  });
  const middleware = getFieldEncryptionMiddleware();
  if (middleware?.hasSearchIndex()) {
    await middleware.syncSearchTokensForRow({
      tableKey: THREADS_TABLE_KEY,
      tenantId,
      entityId: threadId,
      row: encrypted,
      plainRow: metadata,
      changedFields
    });
  }
  return {
    subjectNormalized: String(encrypted.subjectNormalized ?? metadata.subjectNormalized),
    snippet: String(encrypted.snippet ?? metadata.snippet)
  };
};

const sealMessageMetadata = async (
  tenantId: string,
  messageId: string,
  metadata: {
    subject: string;
    snippet: string;
    headersJson: string | null;
    fromJson?: string;
    toJson?: string;
  }
): Promise<{
  subject: string;
  snippet: string;
  headersJson: string | null;
  fromJson?: string;
  toJson?: string;
}> => {
  const changedFields = new Set(["subject", "snippet"]);
  if (metadata.headersJson != null) changedFields.add("headersJson");
  if (metadata.fromJson != null) changedFields.add("fromJson");
  if (metadata.toJson != null) changedFields.add("toJson");
  const encrypted = await encryptRowAtBoundary(MESSAGES_TABLE_KEY, tenantId, metadata, {
    entityId: messageId,
    changedFields
  });
  return {
    subject: String(encrypted.subject ?? metadata.subject),
    snippet: String(encrypted.snippet ?? metadata.snippet),
    headersJson:
      encrypted.headersJson === undefined
        ? metadata.headersJson
        : (encrypted.headersJson as string | null),
    ...(metadata.fromJson != null
      ? { fromJson: String(encrypted.fromJson ?? metadata.fromJson) }
      : {}),
    ...(metadata.toJson != null ? { toJson: String(encrypted.toJson ?? metadata.toJson) } : {})
  };
};

const appendThreadSearchCondition = async (
  tenantId: string,
  q: string | undefined,
  conditions: unknown[]
): Promise<boolean> => {
  const query = q?.trim() ?? "";
  if (!query) return true;
  const middleware = getFieldEncryptionMiddleware();
  if (middleware?.hasSearchIndex()) {
    const ids = await findEntityIdsByMultiFieldContains(
      tenantId,
      tenantId,
      THREADS_TABLE_KEY,
      query,
      middleware.getSearchKeyB64()!,
      middleware.getNgramSize()
    );
    if (ids.length === 0) return false;
    if (dialectFromEnv() === "mysql") {
      conditions.push(inArray(mysql.mailboxThreads.id, ids));
    } else {
      conditions.push(inArray(pg.mailboxThreads.id, ids));
    }
    return true;
  }
  const pattern = `%${escapeLike(query)}%`;
  if (dialectFromEnv() === "mysql") {
    conditions.push(
      or(
        sql`${mysql.mailboxThreads.subjectNormalized} LIKE ${pattern}`,
        sql`${mysql.mailboxThreads.snippet} LIKE ${pattern}`
      )!
    );
  } else {
    conditions.push(
      or(ilike(pg.mailboxThreads.subjectNormalized, pattern), ilike(pg.mailboxThreads.snippet, pattern))!
    );
  }
  return true;
};

export const encryptMailboxSecret = async (plaintext: string, tenantId: string): Promise<string> =>
  encryptSecretAtBoundary({
    tableKey: ACCOUNTS_TABLE_KEY,
    tenantId,
    fieldName: "credentialsEncrypted",
    plaintext
  });

export const decryptMailboxSecret = async (payload: string, tenantId: string): Promise<string> =>
  decryptSecretAtBoundary({
    tableKey: ACCOUNTS_TABLE_KEY,
    tenantId,
    fieldName: "credentialsEncrypted",
    stored: payload
  });

export const encryptMailboxOAuthToken = async (
  plaintext: string,
  tenantId: string,
  field: "oauthAccessTokenEncrypted" | "oauthRefreshTokenEncrypted"
): Promise<string> =>
  encryptSecretAtBoundary({
    tableKey: ACCOUNTS_TABLE_KEY,
    tenantId,
    fieldName: field,
    plaintext
  });

export const decryptMailboxOAuthToken = async (
  payload: string,
  tenantId: string,
  field: "oauthAccessTokenEncrypted" | "oauthRefreshTokenEncrypted"
): Promise<string> =>
  decryptSecretAtBoundary({
    tableKey: ACCOUNTS_TABLE_KEY,
    tenantId,
    fieldName: field,
    stored: payload
  });

export const parseMailboxAddressJson = (raw: string): MailboxAddress => {
  try {
    const v = JSON.parse(raw) as { email?: string; name?: string | null };
    return { email: String(v.email ?? ""), name: v.name ?? null };
  } catch {
    return { email: "", name: null };
  }
};

export const parseMailboxAddressesJson = (raw: string): MailboxAddress[] => {
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v.map((x) => {
      const item = x as { email?: string; name?: string | null };
      return { email: String(item.email ?? ""), name: item.name ?? null };
    });
  } catch {
    return [];
  }
};

export const getMailboxAccountById = async (
  tenantId: string,
  accountId: string
): Promise<MailboxAccountRow | undefined> => {
  if (dialectFromEnv() === "mysql") {
    const rows = await mysqlDb()
      .select()
      .from(mysql.mailboxAccounts)
      .where(and(eq(mysql.mailboxAccounts.tenantId, tenantId), eq(mysql.mailboxAccounts.id, accountId)))
      .limit(1);
    return rows[0] ? await decryptAccountRow(tenantId, rows[0] as AccountDbRow) : undefined;
  }
  const rows = await pgDb()
    .select()
    .from(pg.mailboxAccounts)
    .where(and(eq(pg.mailboxAccounts.tenantId, tenantId), eq(pg.mailboxAccounts.id, accountId)))
    .limit(1);
  return rows[0] ? await decryptAccountRow(tenantId, rows[0] as AccountDbRow) : undefined;
};

export const getMailboxInboxById = async (
  tenantId: string,
  inboxId: string
): Promise<MailboxInboxRow | undefined> => {
  if (dialectFromEnv() === "mysql") {
    const rows = await mysqlDb()
      .select()
      .from(mysql.mailboxInboxes)
      .where(and(eq(mysql.mailboxInboxes.tenantId, tenantId), eq(mysql.mailboxInboxes.id, inboxId)))
      .limit(1);
    return rows[0] ? mapInboxRow(rows[0]) : undefined;
  }
  const rows = await pgDb()
    .select()
    .from(pg.mailboxInboxes)
    .where(and(eq(pg.mailboxInboxes.tenantId, tenantId), eq(pg.mailboxInboxes.id, inboxId)))
    .limit(1);
  return rows[0] ? mapInboxRow(rows[0]) : undefined;
};

export const getPersonalMailboxInbox = async (
  tenantId: string,
  userId: string
): Promise<MailboxInboxRow | undefined> => {
  if (dialectFromEnv() === "mysql") {
    const rows = await mysqlDb()
      .select()
      .from(mysql.mailboxInboxes)
      .where(
        and(
          eq(mysql.mailboxInboxes.tenantId, tenantId),
          eq(mysql.mailboxInboxes.ownerScope, "user"),
          eq(mysql.mailboxInboxes.ownerUserId, userId)
        )
      )
      .limit(1);
    return rows[0] ? mapInboxRow(rows[0]) : undefined;
  }
  const rows = await pgDb()
    .select()
    .from(pg.mailboxInboxes)
    .where(
      and(
        eq(pg.mailboxInboxes.tenantId, tenantId),
        eq(pg.mailboxInboxes.ownerScope, "user"),
        eq(pg.mailboxInboxes.ownerUserId, userId)
      )
    )
    .limit(1);
  return rows[0] ? mapInboxRow(rows[0]) : undefined;
};

export const ensurePersonalMailboxInbox = async (
  tenantId: string,
  userId: string
): Promise<MailboxInboxRow> => {
  const existing = await getPersonalMailboxInbox(tenantId, userId);
  if (existing) return existing;
  const id = randomUUID();
  const now = new Date();
  const color = await nextInboxAccentColor(tenantId);
  const row = {
    id,
    tenantId,
    ownerScope: "user" as const,
    ownerUserId: userId,
    ownerEmployeeId: null,
    displayName: "My mailbox",
    color,
    createdAt: now,
    updatedAt: now
  };
  if (dialectFromEnv() === "mysql") {
    await mysqlDb().insert(mysql.mailboxInboxes).values(row);
  } else {
    await pgDb().insert(pg.mailboxInboxes).values(row);
  }
  return mapInboxRow(row);
};

export const listMailboxConnectionsForInbox = async (
  tenantId: string,
  inboxId: string
): Promise<MailboxAccountRow[]> => {
  if (dialectFromEnv() === "mysql") {
    const rows = await mysqlDb()
      .select()
      .from(mysql.mailboxAccounts)
      .where(and(eq(mysql.mailboxAccounts.tenantId, tenantId), eq(mysql.mailboxAccounts.mailboxInboxId, inboxId)));
    const decrypted = await Promise.all(rows.map((r) => decryptAccountRow(tenantId, r as AccountDbRow)));
    return decrypted.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }
  const rows = await pgDb()
    .select()
    .from(pg.mailboxAccounts)
    .where(and(eq(pg.mailboxAccounts.tenantId, tenantId), eq(pg.mailboxAccounts.mailboxInboxId, inboxId)));
  const decrypted = await Promise.all(rows.map((r) => decryptAccountRow(tenantId, r as AccountDbRow)));
  return decrypted.sort((a, b) => a.displayName.localeCompare(b.displayName));
};

const countMailboxInboxesForTenant = async (tenantId: string): Promise<number> => {
  if (dialectFromEnv() === "mysql") {
    const rows = await mysqlDb()
      .select({ count: sql<number>`count(*)` })
      .from(mysql.mailboxInboxes)
      .where(eq(mysql.mailboxInboxes.tenantId, tenantId));
    return Number(rows[0]?.count ?? 0);
  }
  const rows = await pgDb()
    .select({ count: sql<number>`count(*)` })
    .from(pg.mailboxInboxes)
    .where(eq(pg.mailboxInboxes.tenantId, tenantId));
  return Number(rows[0]?.count ?? 0);
};

const nextInboxAccentColor = async (tenantId: string): Promise<string> =>
  pickMailboxAccentColor(await countMailboxInboxesForTenant(tenantId));

const nextConnectionAccentColor = async (tenantId: string, inboxId: string): Promise<string> => {
  const connections = await listMailboxConnectionsForInbox(tenantId, inboxId);
  return pickMailboxAccentColor(connections.length);
};

export const listMailboxInboxesForUser = async (
  tenantId: string,
  userId: string,
  options?: { isTenantAdmin?: boolean }
): Promise<MailboxInboxRow[]> => {
  await ensurePersonalMailboxInbox(tenantId, userId);
  await ensureInternalMailboxAccount(tenantId, userId);

  const personal = await getPersonalMailboxInbox(tenantId, userId);
  const personalInboxes = personal ? [personal] : [];

  if (dialectFromEnv() === "mysql") {
    const sharedRows = await mysqlDb()
      .select({ inbox: mysql.mailboxInboxes })
      .from(mysql.mailboxAccountMembers)
      .innerJoin(mysql.mailboxAccounts, eq(mysql.mailboxAccountMembers.accountId, mysql.mailboxAccounts.id))
      .innerJoin(mysql.mailboxInboxes, eq(mysql.mailboxAccounts.mailboxInboxId, mysql.mailboxInboxes.id))
      .where(and(eq(mysql.mailboxAccountMembers.tenantId, tenantId), eq(mysql.mailboxAccountMembers.userId, userId)));
    const shared = sharedRows.map((r) => mapInboxRow(r.inbox));
    let agentAdmin: MailboxInboxRow[] = [];
    if (options?.isTenantAdmin) {
      const agentRows = await mysqlDb()
        .select()
        .from(mysql.mailboxInboxes)
        .where(
          and(eq(mysql.mailboxInboxes.tenantId, tenantId), eq(mysql.mailboxInboxes.ownerScope, "workforce_agent"))
        );
      agentAdmin = agentRows.map((r) => mapInboxRow(r));
    }
    const seen = new Set<string>();
    return [...personalInboxes, ...shared, ...agentAdmin].filter((inbox) => {
      if (seen.has(inbox.id)) return false;
      seen.add(inbox.id);
      return true;
    });
  }

  const sharedRows = await pgDb()
    .select({ inbox: pg.mailboxInboxes })
    .from(pg.mailboxAccountMembers)
    .innerJoin(pg.mailboxAccounts, eq(pg.mailboxAccountMembers.accountId, pg.mailboxAccounts.id))
    .innerJoin(pg.mailboxInboxes, eq(pg.mailboxAccounts.mailboxInboxId, pg.mailboxInboxes.id))
    .where(and(eq(pg.mailboxAccountMembers.tenantId, tenantId), eq(pg.mailboxAccountMembers.userId, userId)));
  const shared = sharedRows.map((r) => mapInboxRow(r.inbox));
  let agentAdmin: MailboxInboxRow[] = [];
  if (options?.isTenantAdmin) {
    const agentRows = await pgDb()
      .select()
      .from(pg.mailboxInboxes)
      .where(and(eq(pg.mailboxInboxes.tenantId, tenantId), eq(pg.mailboxInboxes.ownerScope, "workforce_agent")));
    agentAdmin = agentRows.map((r) => mapInboxRow(r));
  }
  const seen = new Set<string>();
  return [...personalInboxes, ...shared, ...agentAdmin].filter((inbox) => {
    if (seen.has(inbox.id)) return false;
    seen.add(inbox.id);
    return true;
  });
};

const userHasMembershipOnInbox = async (
  tenantId: string,
  userId: string,
  inboxId: string
): Promise<boolean> => {
  const connections = await listMailboxConnectionsForInbox(tenantId, inboxId);
  for (const connection of connections) {
    const role = await getMailboxAccountMemberRole(tenantId, connection.id, userId);
    if (role != null) return true;
  }
  return false;
};

const userMemberRoleOnInbox = async (
  tenantId: string,
  userId: string,
  inboxId: string
): Promise<MailboxAccountMemberRole | null> => {
  const connections = await listMailboxConnectionsForInbox(tenantId, inboxId);
  let best: MailboxAccountMemberRole | null = null;
  const rank = (role: MailboxAccountMemberRole) => (role === "admin" ? 3 : role === "sender" ? 2 : 1);
  for (const connection of connections) {
    const role = await getMailboxAccountMemberRole(tenantId, connection.id, userId);
    if (role == null) continue;
    if (best == null || rank(role) > rank(best)) best = role;
  }
  return best;
};

export const userCanAccessMailboxInbox = async (
  tenantId: string,
  userId: string,
  inbox: MailboxInboxRow,
  isTenantAdmin: boolean
): Promise<boolean> => {
  if (isTenantAdmin) return true;
  if (inbox.ownerScope === "user" && inbox.ownerUserId === userId) return true;
  if (inbox.ownerScope === "tenant_shared" || inbox.ownerScope === "workforce_agent") {
    return userHasMembershipOnInbox(tenantId, userId, inbox.id);
  }
  return false;
};

export const listMailboxAccountsForUser = async (
  tenantId: string,
  userId: string
): Promise<MailboxAccountRow[]> => {
  const inboxes = await listMailboxInboxesForUser(tenantId, userId);
  const connections: MailboxAccountRow[] = [];
  const seen = new Set<string>();
  for (const inbox of inboxes) {
    for (const connection of await listMailboxConnectionsForInbox(tenantId, inbox.id)) {
      if (seen.has(connection.id)) continue;
      seen.add(connection.id);
      connections.push(connection);
    }
  }
  return connections;
};

export const getMailboxAccountMemberRole = async (
  tenantId: string,
  accountId: string,
  userId: string
): Promise<MailboxAccountMemberRole | null> => {
  if (dialectFromEnv() === "mysql") {
    const rows = await mysqlDb()
      .select()
      .from(mysql.mailboxAccountMembers)
      .where(
        and(
          eq(mysql.mailboxAccountMembers.tenantId, tenantId),
          eq(mysql.mailboxAccountMembers.accountId, accountId),
          eq(mysql.mailboxAccountMembers.userId, userId)
        )
      )
      .limit(1);
    return rows[0] ? (rows[0].role as MailboxAccountMemberRole) : null;
  }
  const rows = await pgDb()
    .select()
    .from(pg.mailboxAccountMembers)
    .where(
      and(
        eq(pg.mailboxAccountMembers.tenantId, tenantId),
        eq(pg.mailboxAccountMembers.accountId, accountId),
        eq(pg.mailboxAccountMembers.userId, userId)
      )
    )
    .limit(1);
  return rows[0] ? (rows[0].role as MailboxAccountMemberRole) : null;
};

/** Personal owner or shared/agent member with at least viewer. */
export const userCanAccessMailboxAccount = async (
  tenantId: string,
  userId: string,
  account: MailboxAccountRow,
  isTenantAdmin: boolean
): Promise<boolean> => {
  if (isTenantAdmin) return true;
  if (account.ownerScope === "user" && account.ownerUserId === userId) return true;
  if (account.ownerScope === "tenant_shared") {
    const role = await getMailboxAccountMemberRole(tenantId, account.id, userId);
    return role != null;
  }
  if (account.ownerScope === "workforce_agent") {
    return userHasMembershipOnInbox(tenantId, userId, account.mailboxInboxId);
  }
  return false;
};

export const userCanSendFromMailboxAccount = async (
  tenantId: string,
  userId: string,
  account: MailboxAccountRow,
  isTenantAdmin: boolean
): Promise<boolean> => {
  if (account.provider === "internal") return false;
  if (isTenantAdmin) return true;
  if (account.ownerScope === "user" && account.ownerUserId === userId) return true;
  if (account.ownerScope === "tenant_shared") {
    const role = await getMailboxAccountMemberRole(tenantId, account.id, userId);
    return role === "sender" || role === "admin";
  }
  if (account.ownerScope === "workforce_agent") {
    const role = await userMemberRoleOnInbox(tenantId, userId, account.mailboxInboxId);
    return role === "sender" || role === "admin";
  }
  return false;
};

/** Tenant admin or shared/agent member with admin role. */
export const userCanManageMailboxAccount = async (
  tenantId: string,
  userId: string,
  account: MailboxAccountRow,
  isTenantAdmin: boolean
): Promise<boolean> => {
  if (isTenantAdmin) return true;
  if (account.ownerScope === "tenant_shared") {
    const role = await getMailboxAccountMemberRole(tenantId, account.id, userId);
    return role === "admin";
  }
  if (account.ownerScope === "workforce_agent") {
    const role = await userMemberRoleOnInbox(tenantId, userId, account.mailboxInboxId);
    return role === "admin";
  }
  return false;
};

export const ensureInternalMailboxAccount = async (
  tenantId: string,
  userId: string
): Promise<MailboxAccountRow> => {
  const inbox = await ensurePersonalMailboxInbox(tenantId, userId);
  const connections = await listMailboxConnectionsForInbox(tenantId, inbox.id);
  const internal = connections.find((a) => a.provider === "internal");
  if (internal) return internal;

  const id = randomUUID();
  const now = new Date();
  const color = await nextConnectionAccentColor(tenantId, inbox.id);
  const row = {
    id,
    tenantId,
    mailboxInboxId: inbox.id,
    ownerScope: "user" as const,
    ownerUserId: userId,
    ownerEmployeeId: null,
    displayName: "System notifications",
    emailAddress: INTERNAL_EMAIL,
    provider: "internal" as const,
    imapHost: null,
    imapPort: null,
    imapSecure: true,
    smtpHost: null,
    smtpPort: null,
    smtpSecure: true,
    username: null,
    credentialsEncrypted: null,
    oauthRefreshTokenEncrypted: null,
    oauthAccessTokenEncrypted: null,
    oauthAccessTokenExpiresAt: null,
    syncCursor: null,
    syncStatus: "idle",
    syncError: null,
    lastSyncedAt: null,
    webhookSubscriptionId: null,
    color,
    createdAt: now,
    updatedAt: now
  };

  const identity = await sealAccountIdentity(tenantId, id, {
    displayName: row.displayName,
    emailAddress: row.emailAddress
  });
  const writeRow = { ...row, ...identity };

  if (dialectFromEnv() === "mysql") {
    await mysqlDb().insert(mysql.mailboxAccounts).values(writeRow);
  } else {
    await pgDb().insert(pg.mailboxAccounts).values(writeRow);
  }
  return (await getMailboxAccountById(tenantId, id))!;
};

export const insertImapMailboxAccount = async (input: {
  tenantId: string;
  userId: string;
  displayName: string;
  emailAddress: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  username: string;
  password: string;
}): Promise<MailboxAccountRow> => {
  const inbox = await ensurePersonalMailboxInbox(input.tenantId, input.userId);
  const id = randomUUID();
  const now = new Date();
  const color = await nextConnectionAccentColor(input.tenantId, inbox.id);
  const credentialsEncrypted = await encryptMailboxSecret(
    JSON.stringify({ password: input.password }),
    input.tenantId
  );
  const row = {
    id,
    tenantId: input.tenantId,
    mailboxInboxId: inbox.id,
    ownerScope: "user" as const,
    ownerUserId: input.userId,
    ownerEmployeeId: null,
    displayName: input.displayName || input.emailAddress,
    emailAddress: input.emailAddress,
    provider: "imap" as const,
    imapHost: input.imapHost,
    imapPort: input.imapPort,
    imapSecure: input.imapSecure,
    smtpHost: input.smtpHost,
    smtpPort: input.smtpPort,
    smtpSecure: input.smtpSecure,
    username: input.username,
    credentialsEncrypted,
    oauthRefreshTokenEncrypted: null,
    oauthAccessTokenEncrypted: null,
    oauthAccessTokenExpiresAt: null,
    syncCursor: null,
    syncStatus: "idle",
    syncError: null,
    lastSyncedAt: null,
    webhookSubscriptionId: null,
    color,
    createdAt: now,
    updatedAt: now
  };
  const identity = await sealAccountIdentity(input.tenantId, id, {
    displayName: row.displayName,
    emailAddress: row.emailAddress
  });
  const writeRow = { ...row, ...identity };
  if (dialectFromEnv() === "mysql") {
    await mysqlDb().insert(mysql.mailboxAccounts).values(writeRow);
  } else {
    await pgDb().insert(pg.mailboxAccounts).values(writeRow);
  }
  return (await getMailboxAccountById(input.tenantId, id))!;
};

export const insertOAuthMailboxAccount = async (input: {
  tenantId: string;
  userId: string;
  provider: "gmail" | "microsoft";
  displayName: string;
  emailAddress: string;
  refreshToken: string;
  accessToken: string;
  accessTokenExpiresAt: Date;
}): Promise<MailboxAccountRow> => {
  const inbox = await ensurePersonalMailboxInbox(input.tenantId, input.userId);
  const id = randomUUID();
  const now = new Date();
  const color = await nextConnectionAccentColor(input.tenantId, inbox.id);
  const row = {
    id,
    tenantId: input.tenantId,
    mailboxInboxId: inbox.id,
    ownerScope: "user" as const,
    ownerUserId: input.userId,
    ownerEmployeeId: null,
    displayName: input.displayName,
    emailAddress: input.emailAddress,
    provider: input.provider,
    imapHost: null,
    imapPort: null,
    imapSecure: true,
    smtpHost: null,
    smtpPort: null,
    smtpSecure: true,
    username: input.emailAddress,
    credentialsEncrypted: null,
    oauthRefreshTokenEncrypted: await encryptMailboxOAuthToken(
      input.refreshToken,
      input.tenantId,
      "oauthRefreshTokenEncrypted"
    ),
    oauthAccessTokenEncrypted: await encryptMailboxOAuthToken(
      input.accessToken,
      input.tenantId,
      "oauthAccessTokenEncrypted"
    ),
    oauthAccessTokenExpiresAt: input.accessTokenExpiresAt,
    syncCursor: null,
    syncStatus: "idle",
    syncError: null,
    lastSyncedAt: null,
    webhookSubscriptionId: null,
    color,
    createdAt: now,
    updatedAt: now
  };
  const identity = await sealAccountIdentity(input.tenantId, id, {
    displayName: row.displayName,
    emailAddress: row.emailAddress
  });
  const writeRow = { ...row, ...identity };
  if (dialectFromEnv() === "mysql") {
    await mysqlDb().insert(mysql.mailboxAccounts).values(writeRow);
  } else {
    await pgDb().insert(pg.mailboxAccounts).values(writeRow);
  }
  const account = (await getMailboxAccountById(input.tenantId, id))!;
  await ensureLinkedMailboxCalendarForAccount({
    tenantId: input.tenantId,
    userId: input.userId,
    accountId: account.id,
    provider: input.provider,
    displayName: input.displayName
  });
  return account;
};

export const reconnectOAuthMailboxAccount = async (input: {
  tenantId: string;
  accountId: string;
  refreshToken: string;
  accessToken: string;
  accessTokenExpiresAt: Date;
  emailAddress: string;
  displayName: string;
}): Promise<MailboxAccountRow | null> => {
  const existing = await getMailboxAccountById(input.tenantId, input.accountId);
  if (!existing) return null;
  if (existing.provider !== "gmail" && existing.provider !== "microsoft") return null;

  const now = new Date();
  const identity = await sealAccountIdentity(input.tenantId, input.accountId, {
    displayName: input.displayName,
    emailAddress: input.emailAddress
  });
  const set = {
    emailAddress: identity.emailAddress,
    displayName: identity.displayName,
    username: input.emailAddress,
    oauthRefreshTokenEncrypted: await encryptMailboxOAuthToken(
      input.refreshToken,
      input.tenantId,
      "oauthRefreshTokenEncrypted"
    ),
    oauthAccessTokenEncrypted: await encryptMailboxOAuthToken(
      input.accessToken,
      input.tenantId,
      "oauthAccessTokenEncrypted"
    ),
    oauthAccessTokenExpiresAt: input.accessTokenExpiresAt,
    syncStatus: "idle",
    syncError: null,
    updatedAt: now
  };

  if (dialectFromEnv() === "mysql") {
    await mysqlDb()
      .update(mysql.mailboxAccounts)
      .set(set)
      .where(
        and(eq(mysql.mailboxAccounts.tenantId, input.tenantId), eq(mysql.mailboxAccounts.id, input.accountId))
      );
  } else {
    await pgDb()
      .update(pg.mailboxAccounts)
      .set(set)
      .where(and(eq(pg.mailboxAccounts.tenantId, input.tenantId), eq(pg.mailboxAccounts.id, input.accountId)));
  }

  return (await getMailboxAccountById(input.tenantId, input.accountId)) ?? null;
};

export const insertSharedMailboxAccount = async (input: {
  tenantId: string;
  displayName: string;
  emailAddress: string;
  createdByUserId: string;
}): Promise<MailboxAccountRow> => {
  const inboxId = randomUUID();
  const now = new Date();
  const inboxColor = await nextInboxAccentColor(input.tenantId);
  const connectionColor = pickMailboxAccentColor(0);
  const inboxRow = {
    id: inboxId,
    tenantId: input.tenantId,
    ownerScope: "tenant_shared" as const,
    ownerUserId: null,
    ownerEmployeeId: null,
    displayName: input.displayName,
    color: inboxColor,
    createdAt: now,
    updatedAt: now
  };
  const row = {
    id: inboxId,
    tenantId: input.tenantId,
    mailboxInboxId: inboxId,
    ownerScope: "tenant_shared" as const,
    ownerUserId: null,
    ownerEmployeeId: null,
    displayName: input.displayName,
    emailAddress: input.emailAddress,
    provider: "internal" as const,
    imapHost: null,
    imapPort: null,
    imapSecure: true,
    smtpHost: null,
    smtpPort: null,
    smtpSecure: true,
    username: null,
    credentialsEncrypted: null,
    oauthRefreshTokenEncrypted: null,
    oauthAccessTokenEncrypted: null,
    oauthAccessTokenExpiresAt: null,
    syncCursor: null,
    syncStatus: "idle",
    syncError: null,
    lastSyncedAt: null,
    webhookSubscriptionId: null,
    color: connectionColor,
    createdAt: now,
    updatedAt: now
  };
  const identity = await sealAccountIdentity(input.tenantId, inboxId, {
    displayName: row.displayName,
    emailAddress: row.emailAddress
  });
  const writeRow = { ...row, ...identity };
  if (dialectFromEnv() === "mysql") {
    await mysqlDb().insert(mysql.mailboxInboxes).values(inboxRow);
    await mysqlDb().insert(mysql.mailboxAccounts).values(writeRow);
    await mysqlDb().insert(mysql.mailboxAccountMembers).values({
      id: randomUUID(),
      tenantId: input.tenantId,
      accountId: inboxId,
      userId: input.createdByUserId,
      role: "admin",
      createdAt: now
    });
  } else {
    await pgDb().insert(pg.mailboxInboxes).values(inboxRow);
    await pgDb().insert(pg.mailboxAccounts).values(writeRow);
    await pgDb().insert(pg.mailboxAccountMembers).values({
      id: randomUUID(),
      tenantId: input.tenantId,
      accountId: inboxId,
      userId: input.createdByUserId,
      role: "admin",
      createdAt: now
    });
  }
  return (await getMailboxAccountById(input.tenantId, inboxId))!;
};

export const getAgentMailboxInbox = async (
  tenantId: string,
  employeeId: string
): Promise<MailboxInboxRow | undefined> => {
  if (dialectFromEnv() === "mysql") {
    const rows = await mysqlDb()
      .select()
      .from(mysql.mailboxInboxes)
      .where(
        and(
          eq(mysql.mailboxInboxes.tenantId, tenantId),
          eq(mysql.mailboxInboxes.ownerScope, "workforce_agent"),
          eq(mysql.mailboxInboxes.ownerEmployeeId, employeeId)
        )
      )
      .limit(1);
    return rows[0] ? mapInboxRow(rows[0]) : undefined;
  }
  const rows = await pgDb()
    .select()
    .from(pg.mailboxInboxes)
    .where(
      and(
        eq(pg.mailboxInboxes.tenantId, tenantId),
        eq(pg.mailboxInboxes.ownerScope, "workforce_agent"),
        eq(pg.mailboxInboxes.ownerEmployeeId, employeeId)
      )
    )
    .limit(1);
  return rows[0] ? mapInboxRow(rows[0]) : undefined;
};

export const ensureAgentMailboxInbox = async (
  tenantId: string,
  employeeId: string,
  displayName: string
): Promise<MailboxInboxRow> => {
  const existing = await getAgentMailboxInbox(tenantId, employeeId);
  if (existing) {
    if (existing.displayName !== displayName && displayName.trim()) {
      const now = new Date();
      if (dialectFromEnv() === "mysql") {
        await mysqlDb()
          .update(mysql.mailboxInboxes)
          .set({ displayName, updatedAt: now })
          .where(and(eq(mysql.mailboxInboxes.tenantId, tenantId), eq(mysql.mailboxInboxes.id, existing.id)));
      } else {
        await pgDb()
          .update(pg.mailboxInboxes)
          .set({ displayName, updatedAt: now })
          .where(and(eq(pg.mailboxInboxes.tenantId, tenantId), eq(pg.mailboxInboxes.id, existing.id)));
      }
      return { ...existing, displayName, updatedAt: now };
    }
    return existing;
  }
  const id = randomUUID();
  const now = new Date();
  const color = await nextInboxAccentColor(tenantId);
  const row = {
    id,
    tenantId,
    ownerScope: "workforce_agent" as const,
    ownerUserId: null,
    ownerEmployeeId: employeeId,
    displayName: displayName.trim() || "Agent mailbox",
    color,
    createdAt: now,
    updatedAt: now
  };
  if (dialectFromEnv() === "mysql") {
    await mysqlDb().insert(mysql.mailboxInboxes).values(row);
  } else {
    await pgDb().insert(pg.mailboxInboxes).values(row);
  }
  return mapInboxRow(row);
};

export const ensureInternalMailboxAccountForAgent = async (
  tenantId: string,
  employeeId: string,
  displayName: string
): Promise<MailboxAccountRow> => {
  const inbox = await ensureAgentMailboxInbox(tenantId, employeeId, displayName);
  const connections = await listMailboxConnectionsForInbox(tenantId, inbox.id);
  const internal = connections.find((a) => a.provider === "internal");
  if (internal) return internal;

  const id = randomUUID();
  const now = new Date();
  const color = await nextConnectionAccentColor(tenantId, inbox.id);
  const row = {
    id,
    tenantId,
    mailboxInboxId: inbox.id,
    ownerScope: "workforce_agent" as const,
    ownerUserId: null,
    ownerEmployeeId: employeeId,
    displayName: "System notifications",
    emailAddress: INTERNAL_EMAIL,
    provider: "internal" as const,
    imapHost: null,
    imapPort: null,
    imapSecure: true,
    smtpHost: null,
    smtpPort: null,
    smtpSecure: true,
    username: null,
    credentialsEncrypted: null,
    oauthRefreshTokenEncrypted: null,
    oauthAccessTokenEncrypted: null,
    oauthAccessTokenExpiresAt: null,
    syncCursor: null,
    syncStatus: "idle",
    syncError: null,
    lastSyncedAt: null,
    webhookSubscriptionId: null,
    color,
    createdAt: now,
    updatedAt: now
  };
  const identity = await sealAccountIdentity(tenantId, id, {
    displayName: row.displayName,
    emailAddress: row.emailAddress
  });
  const writeRow = { ...row, ...identity };
  if (dialectFromEnv() === "mysql") {
    await mysqlDb().insert(mysql.mailboxAccounts).values(writeRow);
  } else {
    await pgDb().insert(pg.mailboxAccounts).values(writeRow);
  }
  const created = (await getMailboxAccountById(tenantId, id))!;
  await copyMailboxAccountMembersFromInboxSiblings(tenantId, inbox.id, created.id);
  return created;
};

const copyMailboxAccountMembersFromInboxSiblings = async (
  tenantId: string,
  inboxId: string,
  targetAccountId: string
): Promise<void> => {
  const connections = await listMailboxConnectionsForInbox(tenantId, inboxId);
  const source = connections.find((c) => c.id !== targetAccountId);
  if (!source) return;
  const members = await listMailboxAccountMembers(tenantId, source.id);
  for (const member of members) {
    await upsertMailboxAccountMember({
      tenantId,
      accountId: targetAccountId,
      userId: member.userId,
      role: member.role
    });
  }
};

/** Upsert a member onto every connection in an agent (or shared) inbox. */
export const upsertMailboxAccountMemberForInbox = async (input: {
  tenantId: string;
  inboxId: string;
  userId: string;
  role: MailboxAccountMemberRole;
}): Promise<void> => {
  const connections = await listMailboxConnectionsForInbox(input.tenantId, input.inboxId);
  for (const connection of connections) {
    await upsertMailboxAccountMember({
      tenantId: input.tenantId,
      accountId: connection.id,
      userId: input.userId,
      role: input.role
    });
  }
};

export const deleteMailboxAccountMember = async (
  tenantId: string,
  accountId: string,
  userId: string
): Promise<boolean> => {
  if (dialectFromEnv() === "mysql") {
    const result = await mysqlDb()
      .delete(mysql.mailboxAccountMembers)
      .where(
        and(
          eq(mysql.mailboxAccountMembers.tenantId, tenantId),
          eq(mysql.mailboxAccountMembers.accountId, accountId),
          eq(mysql.mailboxAccountMembers.userId, userId)
        )
      );
    return Number((result as { rowsAffected?: number }).rowsAffected ?? 0) > 0 || true;
  }
  await pgDb()
    .delete(pg.mailboxAccountMembers)
    .where(
      and(
        eq(pg.mailboxAccountMembers.tenantId, tenantId),
        eq(pg.mailboxAccountMembers.accountId, accountId),
        eq(pg.mailboxAccountMembers.userId, userId)
      )
    );
  return true;
};

export const deleteMailboxAccountMemberForInbox = async (
  tenantId: string,
  inboxId: string,
  userId: string
): Promise<void> => {
  const connections = await listMailboxConnectionsForInbox(tenantId, inboxId);
  for (const connection of connections) {
    await deleteMailboxAccountMember(tenantId, connection.id, userId);
  }
};

export const insertImapMailboxAccountForAgent = async (input: {
  tenantId: string;
  employeeId: string;
  inboxDisplayName: string;
  displayName: string;
  emailAddress: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  username: string;
  password: string;
}): Promise<MailboxAccountRow> => {
  await ensureInternalMailboxAccountForAgent(input.tenantId, input.employeeId, input.inboxDisplayName);
  const inbox = await ensureAgentMailboxInbox(input.tenantId, input.employeeId, input.inboxDisplayName);
  const id = randomUUID();
  const now = new Date();
  const color = await nextConnectionAccentColor(input.tenantId, inbox.id);
  const credentialsEncrypted = await encryptMailboxSecret(
    JSON.stringify({ password: input.password }),
    input.tenantId
  );
  const row = {
    id,
    tenantId: input.tenantId,
    mailboxInboxId: inbox.id,
    ownerScope: "workforce_agent" as const,
    ownerUserId: null,
    ownerEmployeeId: input.employeeId,
    displayName: input.displayName || input.emailAddress,
    emailAddress: input.emailAddress,
    provider: "imap" as const,
    imapHost: input.imapHost,
    imapPort: input.imapPort,
    imapSecure: input.imapSecure,
    smtpHost: input.smtpHost,
    smtpPort: input.smtpPort,
    smtpSecure: input.smtpSecure,
    username: input.username,
    credentialsEncrypted,
    oauthRefreshTokenEncrypted: null,
    oauthAccessTokenEncrypted: null,
    oauthAccessTokenExpiresAt: null,
    syncCursor: null,
    syncStatus: "idle",
    syncError: null,
    lastSyncedAt: null,
    webhookSubscriptionId: null,
    color,
    createdAt: now,
    updatedAt: now
  };
  const identity = await sealAccountIdentity(input.tenantId, id, {
    displayName: row.displayName,
    emailAddress: row.emailAddress
  });
  const writeRow = { ...row, ...identity };
  if (dialectFromEnv() === "mysql") {
    await mysqlDb().insert(mysql.mailboxAccounts).values(writeRow);
  } else {
    await pgDb().insert(pg.mailboxAccounts).values(writeRow);
  }
  const created = (await getMailboxAccountById(input.tenantId, id))!;
  await copyMailboxAccountMembersFromInboxSiblings(input.tenantId, inbox.id, created.id);
  return created;
};

export const insertOAuthMailboxAccountForAgent = async (input: {
  tenantId: string;
  employeeId: string;
  inboxDisplayName: string;
  /** Calendar rows still require a real user; use the connecting operator. */
  calendarUserId: string;
  provider: "gmail" | "microsoft";
  displayName: string;
  emailAddress: string;
  refreshToken: string;
  accessToken: string;
  accessTokenExpiresAt: Date;
}): Promise<MailboxAccountRow> => {
  await ensureInternalMailboxAccountForAgent(input.tenantId, input.employeeId, input.inboxDisplayName);
  const inbox = await ensureAgentMailboxInbox(input.tenantId, input.employeeId, input.inboxDisplayName);
  const id = randomUUID();
  const now = new Date();
  const color = await nextConnectionAccentColor(input.tenantId, inbox.id);
  const row = {
    id,
    tenantId: input.tenantId,
    mailboxInboxId: inbox.id,
    ownerScope: "workforce_agent" as const,
    ownerUserId: null,
    ownerEmployeeId: input.employeeId,
    displayName: input.displayName,
    emailAddress: input.emailAddress,
    provider: input.provider,
    imapHost: null,
    imapPort: null,
    imapSecure: true,
    smtpHost: null,
    smtpPort: null,
    smtpSecure: true,
    username: input.emailAddress,
    credentialsEncrypted: null,
    oauthRefreshTokenEncrypted: await encryptMailboxOAuthToken(
      input.refreshToken,
      input.tenantId,
      "oauthRefreshTokenEncrypted"
    ),
    oauthAccessTokenEncrypted: await encryptMailboxOAuthToken(
      input.accessToken,
      input.tenantId,
      "oauthAccessTokenEncrypted"
    ),
    oauthAccessTokenExpiresAt: input.accessTokenExpiresAt,
    syncCursor: null,
    syncStatus: "idle",
    syncError: null,
    lastSyncedAt: null,
    webhookSubscriptionId: null,
    color,
    createdAt: now,
    updatedAt: now
  };
  const identity = await sealAccountIdentity(input.tenantId, id, {
    displayName: row.displayName,
    emailAddress: row.emailAddress
  });
  const writeRow = { ...row, ...identity };
  if (dialectFromEnv() === "mysql") {
    await mysqlDb().insert(mysql.mailboxAccounts).values(writeRow);
  } else {
    await pgDb().insert(pg.mailboxAccounts).values(writeRow);
  }
  const account = (await getMailboxAccountById(input.tenantId, id))!;
  await copyMailboxAccountMembersFromInboxSiblings(input.tenantId, inbox.id, account.id);
  await ensureLinkedMailboxCalendarForAccount({
    tenantId: input.tenantId,
    userId: input.calendarUserId,
    accountId: account.id,
    provider: input.provider,
    displayName: input.displayName
  });
  return account;
};

export const deleteMailboxAccount = async (tenantId: string, accountId: string): Promise<void> => {
  if (dialectFromEnv() === "mysql") {
    await mysqlDb()
      .delete(mysql.mailboxAccounts)
      .where(and(eq(mysql.mailboxAccounts.tenantId, tenantId), eq(mysql.mailboxAccounts.id, accountId)));
    return;
  }
  await pgDb()
    .delete(pg.mailboxAccounts)
    .where(and(eq(pg.mailboxAccounts.tenantId, tenantId), eq(pg.mailboxAccounts.id, accountId)));
};

type MailboxThreadLatestMessageMeta = {
  fromJson: string;
  hasCalendarInvite: boolean;
};

const fetchLatestMessageMetaByThreadIds = async (
  tenantId: string,
  threadIds: string[]
): Promise<Map<string, MailboxThreadLatestMessageMeta>> => {
  if (threadIds.length === 0) return new Map();

  const map = new Map<string, MailboxThreadLatestMessageMeta>();
  if (dialectFromEnv() === "mysql") {
    const rows = await mysqlDb()
      .select({
        threadId: mysql.mailboxMessages.threadId,
        fromJson: mysql.mailboxMessages.fromJson,
        hasCalendarInvite: mysql.mailboxMessages.hasCalendarInvite,
        receivedAt: mysql.mailboxMessages.receivedAt
      })
      .from(mysql.mailboxMessages)
      .where(
        and(
          eq(mysql.mailboxMessages.tenantId, tenantId),
          inArray(mysql.mailboxMessages.threadId, threadIds)
        )
      )
      .orderBy(desc(mysql.mailboxMessages.receivedAt));
    for (const row of rows) {
      if (!map.has(row.threadId)) {
        map.set(row.threadId, {
          fromJson: row.fromJson,
          hasCalendarInvite: Boolean(row.hasCalendarInvite)
        });
      }
    }
    return map;
  }

  const rows = await pgDb()
    .select({
      threadId: pg.mailboxMessages.threadId,
      fromJson: pg.mailboxMessages.fromJson,
      hasCalendarInvite: pg.mailboxMessages.hasCalendarInvite,
      receivedAt: pg.mailboxMessages.receivedAt
    })
    .from(pg.mailboxMessages)
    .where(and(eq(pg.mailboxMessages.tenantId, tenantId), inArray(pg.mailboxMessages.threadId, threadIds)))
    .orderBy(desc(pg.mailboxMessages.receivedAt));
  for (const row of rows) {
    if (!map.has(row.threadId)) {
      map.set(row.threadId, {
        fromJson: row.fromJson,
        hasCalendarInvite: Boolean(row.hasCalendarInvite)
      });
    }
  }
  return map;
};

const attachLastMessageFromToThreads = async (
  tenantId: string,
  threads: MailboxThreadRow[]
): Promise<MailboxThreadRow[]> => {
  if (threads.length === 0) return threads;
  const metaByThread = await fetchLatestMessageMetaByThreadIds(
    tenantId,
    threads.map((thread) => thread.id)
  );
  return threads.map((thread) => {
    const meta = metaByThread.get(thread.id);
    return {
      ...thread,
      lastFromJson: meta?.fromJson ?? null,
      lastHasCalendarInvite: meta?.hasCalendarInvite ?? false
    };
  });
};

export const listMailboxThreads = async (input: {
  tenantId: string;
  accountId: string;
  folder: MailboxFolder;
  q?: string;
  limit: number;
  offset: number;
}): Promise<MailboxThreadRow[]> => {
  const conditions: unknown[] = [
    eq(
      dialectFromEnv() === "mysql" ? mysql.mailboxThreads.tenantId : pg.mailboxThreads.tenantId,
      input.tenantId
    ),
    eq(
      dialectFromEnv() === "mysql" ? mysql.mailboxThreads.accountId : pg.mailboxThreads.accountId,
      input.accountId
    ),
    eq(
      dialectFromEnv() === "mysql" ? mysql.mailboxThreads.folder : pg.mailboxThreads.folder,
      input.folder
    )
  ];
  if (!(await appendThreadSearchCondition(input.tenantId, input.q, conditions))) {
    return [];
  }
  if (dialectFromEnv() === "mysql") {
    const rows = await mysqlDb()
      .select()
      .from(mysql.mailboxThreads)
      .where(and(...(conditions as Parameters<typeof and>)))
      .orderBy(desc(mysql.mailboxThreads.lastMessageAt))
      .limit(input.limit)
      .offset(input.offset);
    const threads = await Promise.all(rows.map((r) => decryptThreadRow(input.tenantId, r as ThreadDbRow)));
    return attachLastMessageFromToThreads(input.tenantId, threads);
  }
  const rows = await pgDb()
    .select()
    .from(pg.mailboxThreads)
    .where(and(...(conditions as Parameters<typeof and>)))
    .orderBy(desc(pg.mailboxThreads.lastMessageAt))
    .limit(input.limit)
    .offset(input.offset);
  const threads = await Promise.all(rows.map((r) => decryptThreadRow(input.tenantId, r as ThreadDbRow)));
  return attachLastMessageFromToThreads(input.tenantId, threads);
};

export const listMailboxThreadsForInbox = async (input: {
  tenantId: string;
  inboxId: string;
  connectionId?: string;
  folder: MailboxFolder;
  q?: string;
  limit: number;
  offset: number;
}): Promise<MailboxThreadRow[]> => {
  const connections = await listMailboxConnectionsForInbox(input.tenantId, input.inboxId);
  let connectionIds = connections.map((c) => c.id);
  if (connectionIds.length === 0) return [];
  if (input.connectionId) {
    if (!connectionIds.includes(input.connectionId)) return [];
    connectionIds = [input.connectionId];
  }

  const conditions: unknown[] = [
    eq(
      dialectFromEnv() === "mysql" ? mysql.mailboxThreads.tenantId : pg.mailboxThreads.tenantId,
      input.tenantId
    ),
    inArray(
      dialectFromEnv() === "mysql" ? mysql.mailboxThreads.accountId : pg.mailboxThreads.accountId,
      connectionIds
    ),
    eq(
      dialectFromEnv() === "mysql" ? mysql.mailboxThreads.folder : pg.mailboxThreads.folder,
      input.folder
    )
  ];
  if (!(await appendThreadSearchCondition(input.tenantId, input.q, conditions))) {
    return [];
  }
  if (dialectFromEnv() === "mysql") {
    const rows = await mysqlDb()
      .select()
      .from(mysql.mailboxThreads)
      .where(and(...(conditions as Parameters<typeof and>)))
      .orderBy(desc(mysql.mailboxThreads.lastMessageAt))
      .limit(input.limit)
      .offset(input.offset);
    const threads = await Promise.all(rows.map((r) => decryptThreadRow(input.tenantId, r as ThreadDbRow)));
    return attachLastMessageFromToThreads(input.tenantId, threads);
  }
  const rows = await pgDb()
    .select()
    .from(pg.mailboxThreads)
    .where(and(...(conditions as Parameters<typeof and>)))
    .orderBy(desc(pg.mailboxThreads.lastMessageAt))
    .limit(input.limit)
    .offset(input.offset);
  const threads = await Promise.all(rows.map((r) => decryptThreadRow(input.tenantId, r as ThreadDbRow)));
  return attachLastMessageFromToThreads(input.tenantId, threads);
};

export const getMailboxThreadById = async (
  tenantId: string,
  threadId: string
): Promise<MailboxThreadRow | undefined> => {
  if (dialectFromEnv() === "mysql") {
    const rows = await mysqlDb()
      .select()
      .from(mysql.mailboxThreads)
      .where(and(eq(mysql.mailboxThreads.tenantId, tenantId), eq(mysql.mailboxThreads.id, threadId)))
      .limit(1);
    return rows[0] ? await decryptThreadRow(tenantId, rows[0] as ThreadDbRow) : undefined;
  }
  const rows = await pgDb()
    .select()
    .from(pg.mailboxThreads)
    .where(and(eq(pg.mailboxThreads.tenantId, tenantId), eq(pg.mailboxThreads.id, threadId)))
    .limit(1);
  return rows[0] ? await decryptThreadRow(tenantId, rows[0] as ThreadDbRow) : undefined;
};

type MailboxMessageDbRow = {
  id: string;
  tenantId: string;
  accountId: string;
  threadId: string;
  providerMessageId: string | null;
  direction: string;
  fromJson: string;
  toJson: string;
  ccJson: string;
  bccJson: string;
  subject: string;
  snippet: string;
  bodyText: string | null;
  bodyHtml: string | null;
  headersJson: string | null;
  messageId: string | null;
  inReplyTo: string | null;
  referencesHeader: string | null;
  internalSource: string | null;
  actionUrl: string | null;
  relatedEntityKind: string | null;
  relatedEntityId: string | null;
  receivedAt: Date;
  isRead: boolean;
  isDraft: boolean;
  hasAttachments: boolean;
  hasCalendarInvite: boolean;
  sentByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const mapPlainMessageRow = (r: MailboxMessageDbRow): MailboxMessageRow => ({
  id: r.id,
  tenantId: r.tenantId,
  accountId: r.accountId,
  threadId: r.threadId,
  providerMessageId: r.providerMessageId,
  direction: r.direction,
  fromJson: r.fromJson,
  toJson: r.toJson,
  ccJson: r.ccJson,
  bccJson: r.bccJson,
  subject: r.subject,
  snippet: r.snippet,
  bodyText: r.bodyText,
  bodyHtml: r.bodyHtml,
  headersJson: r.headersJson,
  messageId: r.messageId,
  inReplyTo: r.inReplyTo,
  referencesHeader: r.referencesHeader,
  internalSource: r.internalSource,
  actionUrl: r.actionUrl,
  relatedEntityKind: r.relatedEntityKind,
  relatedEntityId: r.relatedEntityId,
  receivedAt: r.receivedAt,
  isRead: Boolean(r.isRead),
  isDraft: Boolean(r.isDraft),
  hasAttachments: Boolean(r.hasAttachments),
  hasCalendarInvite: Boolean(r.hasCalendarInvite),
  sentByUserId: r.sentByUserId,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt
});

const decryptMessageRow = async (tenantId: string, r: MailboxMessageDbRow): Promise<MailboxMessageRow> =>
  decryptRowAtBoundary(MESSAGES_TABLE_KEY, tenantId, r as unknown as Record<string, unknown>, (plain) =>
    mapPlainMessageRow(plain as MailboxMessageDbRow)
  );

export const listMailboxMessagesForThread = async (
  tenantId: string,
  threadId: string
): Promise<MailboxMessageRow[]> => {

  if (dialectFromEnv() === "mysql") {
    const rows = await mysqlDb()
      .select()
      .from(mysql.mailboxMessages)
      .where(and(eq(mysql.mailboxMessages.tenantId, tenantId), eq(mysql.mailboxMessages.threadId, threadId)))
      .orderBy(mysql.mailboxMessages.receivedAt);
    return Promise.all(rows.map((r) => decryptMessageRow(tenantId, r as MailboxMessageDbRow)));
  }
  const rows = await pgDb()
    .select()
    .from(pg.mailboxMessages)
    .where(and(eq(pg.mailboxMessages.tenantId, tenantId), eq(pg.mailboxMessages.threadId, threadId)))
    .orderBy(pg.mailboxMessages.receivedAt);
  return Promise.all(rows.map((r) => decryptMessageRow(tenantId, r as MailboxMessageDbRow)));
};

export const getMailboxMessageById = async (
  tenantId: string,
  messageId: string
): Promise<MailboxMessageRow | undefined> => {
  if (dialectFromEnv() === "mysql") {
    const rows = await mysqlDb()
      .select()
      .from(mysql.mailboxMessages)
      .where(and(eq(mysql.mailboxMessages.tenantId, tenantId), eq(mysql.mailboxMessages.id, messageId)))
      .limit(1);
    return rows[0] ? await decryptMessageRow(tenantId, rows[0] as MailboxMessageDbRow) : undefined;
  }
  const rows = await pgDb()
    .select()
    .from(pg.mailboxMessages)
    .where(and(eq(pg.mailboxMessages.tenantId, tenantId), eq(pg.mailboxMessages.id, messageId)))
    .limit(1);
  return rows[0] ? await decryptMessageRow(tenantId, rows[0] as MailboxMessageDbRow) : undefined;
};

export const upsertMailboxThread = async (input: {
  tenantId: string;
  accountId: string;
  providerThreadId?: string | null;
  subjectNormalized: string;
  snippet: string;
  folder: MailboxFolder;
  lastMessageAt: Date;
  unreadDelta?: number;
}): Promise<MailboxThreadRow> => {
  const now = new Date();
  if (input.providerThreadId) {
    if (dialectFromEnv() === "mysql") {
      const existing = await mysqlDb()
        .select()
        .from(mysql.mailboxThreads)
        .where(
          and(
            eq(mysql.mailboxThreads.accountId, input.accountId),
            eq(mysql.mailboxThreads.providerThreadId, input.providerThreadId)
          )
        )
        .limit(1);
      if (existing[0]) {
        const incoming = input.unreadDelta ?? 0;
        const skipUnread =
          incoming > 0 && (existing[0].folder === "trash" || existing[0].folder === "drafts");
        const unreadCount = skipUnread
          ? existing[0].unreadCount
          : existing[0].unreadCount + incoming;
        const sealed = await sealThreadMetadata(input.tenantId, existing[0].id, {
          subjectNormalized: input.subjectNormalized,
          snippet: input.snippet
        });
        await mysqlDb()
          .update(mysql.mailboxThreads)
          .set({
            subjectNormalized: sealed.subjectNormalized,
            snippet: sealed.snippet,
            lastMessageAt: input.lastMessageAt,
            unreadCount,
            updatedAt: now
          })
          .where(eq(mysql.mailboxThreads.id, existing[0].id));
        return (await getMailboxThreadById(input.tenantId, existing[0].id))!;
      }
    } else {
      const existing = await pgDb()
        .select()
        .from(pg.mailboxThreads)
        .where(
          and(
            eq(pg.mailboxThreads.accountId, input.accountId),
            eq(pg.mailboxThreads.providerThreadId, input.providerThreadId)
          )
        )
        .limit(1);
      if (existing[0]) {
        const incoming = input.unreadDelta ?? 0;
        const skipUnread =
          incoming > 0 && (existing[0].folder === "trash" || existing[0].folder === "drafts");
        const unreadCount = skipUnread
          ? existing[0].unreadCount
          : existing[0].unreadCount + incoming;
        const sealed = await sealThreadMetadata(input.tenantId, existing[0].id, {
          subjectNormalized: input.subjectNormalized,
          snippet: input.snippet
        });
        await pgDb()
          .update(pg.mailboxThreads)
          .set({
            subjectNormalized: sealed.subjectNormalized,
            snippet: sealed.snippet,
            lastMessageAt: input.lastMessageAt,
            unreadCount,
            updatedAt: now
          })
          .where(eq(pg.mailboxThreads.id, existing[0].id));
        return (await getMailboxThreadById(input.tenantId, existing[0].id))!;
      }
    }
  }
  const id = randomUUID();
  const sealed = await sealThreadMetadata(input.tenantId, id, {
    subjectNormalized: input.subjectNormalized,
    snippet: input.snippet
  });
  const row = {
    id,
    tenantId: input.tenantId,
    accountId: input.accountId,
    providerThreadId: input.providerThreadId ?? null,
    subjectNormalized: sealed.subjectNormalized,
    snippet: sealed.snippet,
    folder: input.folder,
    lastMessageAt: input.lastMessageAt,
    unreadCount: input.unreadDelta ?? 1,
    isStarred: false,
    createdAt: now,
    updatedAt: now
  };
  if (dialectFromEnv() === "mysql") {
    await mysqlDb().insert(mysql.mailboxThreads).values(row);
  } else {
    await pgDb().insert(pg.mailboxThreads).values(row);
  }
  return (await getMailboxThreadById(input.tenantId, id))!;
};

export const insertMailboxMessage = async (input: {
  tenantId: string;
  accountId: string;
  threadId: string;
  providerMessageId?: string | null;
  direction: string;
  from: MailboxAddress;
  to: MailboxAddress[];
  cc?: MailboxAddress[];
  bcc?: MailboxAddress[];
  subject: string;
  snippet: string;
  bodyText?: string | null;
  bodyHtml?: string | null;
  headersJson?: string | null;
  messageId?: string | null;
  inReplyTo?: string | null;
  referencesHeader?: string | null;
  internalSource?: MailboxInternalSource | null;
  actionUrl?: string | null;
  relatedEntityKind?: string | null;
  relatedEntityId?: string | null;
  receivedAt?: Date;
  isRead?: boolean;
  isDraft?: boolean;
  hasAttachments?: boolean;
  hasCalendarInvite?: boolean;
  sentByUserId?: string | null;
}): Promise<MailboxMessageRow> => {
  const id = randomUUID();
  const now = new Date();
  const fromJsonPlain = JSON.stringify(input.from);
  const toJsonPlain = JSON.stringify(input.to);
  const sealed = await sealMessageMetadata(input.tenantId, id, {
    subject: input.subject,
    snippet: input.snippet,
    headersJson: input.headersJson ?? null,
    fromJson: fromJsonPlain,
    toJson: toJsonPlain
  });
  const sealedBodies = await encryptMailboxBodiesAtRest(input.tenantId, id, {
    bodyText: input.bodyText ?? null,
    bodyHtml: input.bodyHtml ?? null
  });
  const row = {
    id,
    tenantId: input.tenantId,
    accountId: input.accountId,
    threadId: input.threadId,
    providerMessageId: input.providerMessageId ?? null,
    direction: input.direction,
    fromJson: sealed.fromJson ?? fromJsonPlain,
    toJson: sealed.toJson ?? toJsonPlain,
    ccJson: JSON.stringify(input.cc ?? []),
    bccJson: JSON.stringify(input.bcc ?? []),
    subject: sealed.subject,
    snippet: sealed.snippet,
    bodyText: sealedBodies.bodyText,
    bodyHtml: sealedBodies.bodyHtml,
    headersJson: sealed.headersJson,
    messageId: input.messageId ?? null,
    inReplyTo: input.inReplyTo ?? null,
    referencesHeader: input.referencesHeader ?? null,
    internalSource: input.internalSource ?? null,
    actionUrl: input.actionUrl ?? null,
    relatedEntityKind: input.relatedEntityKind ?? null,
    relatedEntityId: input.relatedEntityId ?? null,
    receivedAt: input.receivedAt ?? now,
    isRead: input.isRead ?? false,
    isDraft: input.isDraft ?? false,
    hasAttachments: input.hasAttachments ?? false,
    hasCalendarInvite: input.hasCalendarInvite ?? false,
    sentByUserId: input.sentByUserId ?? null,
    createdAt: now,
    updatedAt: now
  };
  if (dialectFromEnv() === "mysql") {
    await mysqlDb().insert(mysql.mailboxMessages).values(row);
  } else {
    await pgDb().insert(pg.mailboxMessages).values(row);
  }
  return (await getMailboxMessageById(input.tenantId, id))!;
};

export const createMailboxDraft = async (input: {
  tenantId: string;
  userId: string;
  accountId: string;
  subject?: string;
  bodyText?: string | null;
  bodyHtml?: string | null;
  to?: MailboxAddress[];
  cc?: MailboxAddress[];
  bcc?: MailboxAddress[];
}): Promise<{ message: MailboxMessageRow; thread: MailboxThreadRow }> => {
  const account = await getMailboxAccountById(input.tenantId, input.accountId);
  if (!account) throw new Error("account_not_found");

  const subject = input.subject?.trim() ?? "";
  const bodyText = input.bodyText ?? "";
  const snippet = (bodyText.trim() || subject || "(no subject)").slice(0, 200);
  const now = new Date();
  const thread = await upsertMailboxThread({
    tenantId: input.tenantId,
    accountId: input.accountId,
    subjectNormalized: subject || "(no subject)",
    snippet,
    folder: "drafts",
    lastMessageAt: now,
    unreadDelta: 0
  });
  const message = await insertMailboxMessage({
    tenantId: input.tenantId,
    accountId: input.accountId,
    threadId: thread.id,
    direction: "outbound",
    from: { email: account.emailAddress, name: account.displayName },
    to: input.to ?? [],
    cc: input.cc ?? [],
    bcc: input.bcc ?? [],
    subject: subject || "(no subject)",
    snippet,
    bodyText: input.bodyText ?? null,
    bodyHtml: input.bodyHtml ?? null,
    receivedAt: now,
    isRead: true,
    isDraft: true,
    sentByUserId: input.userId
  });
  return { message, thread };
};

export const updateMailboxDraftMessage = async (
  tenantId: string,
  messageId: string,
  patch: {
    accountId?: string;
    to?: MailboxAddress[];
    cc?: MailboxAddress[];
    bcc?: MailboxAddress[];
    subject?: string;
    bodyText?: string | null;
    bodyHtml?: string | null;
  }
): Promise<MailboxMessageRow | undefined> => {
  const existing = await getMailboxMessageById(tenantId, messageId);
  if (!existing?.isDraft) return undefined;

  const subject = patch.subject !== undefined ? patch.subject.trim() : existing.subject;
  const bodyText = patch.bodyText !== undefined ? patch.bodyText : existing.bodyText;
  const snippet = (bodyText?.trim() || subject || "(no subject)").slice(0, 200);
  const now = new Date();
  const nextAccountId = patch.accountId ?? existing.accountId;
  const account = await getMailboxAccountById(tenantId, nextAccountId);
  if (!account) return undefined;

  const toJsonPlain = JSON.stringify(patch.to ?? parseMailboxAddressesJson(existing.toJson));
  const fromJsonPlain = JSON.stringify({ email: account.emailAddress, name: account.displayName });
  const sealedMessage = await sealMessageMetadata(tenantId, messageId, {
    subject: subject || "(no subject)",
    snippet,
    headersJson: existing.headersJson,
    fromJson: fromJsonPlain,
    toJson: toJsonPlain
  });
  const sealedThread = await sealThreadMetadata(tenantId, existing.threadId, {
    subjectNormalized: subject || "(no subject)",
    snippet
  });

  const sealedBodies = await encryptMailboxBodiesAtRest(tenantId, messageId, {
    bodyText: bodyText ?? null,
    bodyHtml: patch.bodyHtml !== undefined ? patch.bodyHtml : existing.bodyHtml
  });

  const set: Record<string, unknown> = {
    updatedAt: now,
    subject: sealedMessage.subject,
    snippet: sealedMessage.snippet,
    headersJson: sealedMessage.headersJson,
    bodyText: sealedBodies.bodyText,
    bodyHtml: sealedBodies.bodyHtml,
    toJson: sealedMessage.toJson ?? toJsonPlain,
    ccJson: JSON.stringify(patch.cc ?? parseMailboxAddressesJson(existing.ccJson)),
    bccJson: JSON.stringify(patch.bcc ?? parseMailboxAddressesJson(existing.bccJson)),
    fromJson: sealedMessage.fromJson ?? fromJsonPlain
  };
  if (nextAccountId !== existing.accountId) {
    set.accountId = nextAccountId;
  }

  if (dialectFromEnv() === "mysql") {
    await mysqlDb()
      .update(mysql.mailboxMessages)
      .set(set)
      .where(and(eq(mysql.mailboxMessages.tenantId, tenantId), eq(mysql.mailboxMessages.id, messageId)));
  } else {
    await pgDb()
      .update(pg.mailboxMessages)
      .set(set)
      .where(and(eq(pg.mailboxMessages.tenantId, tenantId), eq(pg.mailboxMessages.id, messageId)));
  }

  const threadSet: Record<string, unknown> = {
    updatedAt: now,
    subjectNormalized: sealedThread.subjectNormalized,
    snippet: sealedThread.snippet,
    lastMessageAt: now
  };
  if (nextAccountId !== existing.accountId) {
    threadSet.accountId = nextAccountId;
  }
  if (dialectFromEnv() === "mysql") {
    await mysqlDb()
      .update(mysql.mailboxThreads)
      .set(threadSet)
      .where(and(eq(mysql.mailboxThreads.tenantId, tenantId), eq(mysql.mailboxThreads.id, existing.threadId)));
  } else {
    await pgDb()
      .update(pg.mailboxThreads)
      .set(threadSet)
      .where(and(eq(pg.mailboxThreads.tenantId, tenantId), eq(pg.mailboxThreads.id, existing.threadId)));
  }

  return getMailboxMessageById(tenantId, messageId);
};

export const updateMailboxThread = async (
  tenantId: string,
  threadId: string,
  patch: { isStarred?: boolean; folder?: MailboxFolder; unreadCount?: number }
): Promise<void> => {
  const now = new Date();
  const set: Record<string, unknown> = { updatedAt: now };
  if (patch.isStarred !== undefined) set.isStarred = patch.isStarred;
  if (patch.folder !== undefined) set.folder = patch.folder;
  if (patch.unreadCount !== undefined) set.unreadCount = patch.unreadCount;
  if (dialectFromEnv() === "mysql") {
    await mysqlDb()
      .update(mysql.mailboxThreads)
      .set(set)
      .where(and(eq(mysql.mailboxThreads.tenantId, tenantId), eq(mysql.mailboxThreads.id, threadId)));
    return;
  }
  await pgDb()
    .update(pg.mailboxThreads)
    .set(set)
    .where(and(eq(pg.mailboxThreads.tenantId, tenantId), eq(pg.mailboxThreads.id, threadId)));
};

export const markMailboxMessagesRead = async (tenantId: string, threadId: string): Promise<void> => {
  const now = new Date();
  if (dialectFromEnv() === "mysql") {
    await mysqlDb()
      .update(mysql.mailboxMessages)
      .set({ isRead: true, updatedAt: now })
      .where(and(eq(mysql.mailboxMessages.tenantId, tenantId), eq(mysql.mailboxMessages.threadId, threadId)));
    await mysqlDb()
      .update(mysql.mailboxThreads)
      .set({ unreadCount: 0, updatedAt: now })
      .where(and(eq(mysql.mailboxThreads.tenantId, tenantId), eq(mysql.mailboxThreads.id, threadId)));
    return;
  }
  await pgDb()
    .update(pg.mailboxMessages)
    .set({ isRead: true, updatedAt: now })
    .where(and(eq(pg.mailboxMessages.tenantId, tenantId), eq(pg.mailboxMessages.threadId, threadId)));
  await pgDb()
    .update(pg.mailboxThreads)
    .set({ unreadCount: 0, updatedAt: now })
    .where(and(eq(pg.mailboxThreads.tenantId, tenantId), eq(pg.mailboxThreads.id, threadId)));
};

export const deliverInternalMailboxMessage = async (input: {
  tenantId: string;
  recipientUserId: string;
  source: MailboxInternalSource;
  subject: string;
  bodyHtml: string;
  actionUrl?: string;
  relatedEntityKind?: string;
  relatedEntityId?: string;
  embeddedSentEmail?: MailboxEmbeddedSentEmail;
}): Promise<MailboxMessageRow> => {
  const account = await ensureInternalMailboxAccount(input.tenantId, input.recipientUserId);
  const now = new Date();
  const snippet = input.bodyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
  const thread = await upsertMailboxThread({
    tenantId: input.tenantId,
    accountId: account.id,
    subjectNormalized: input.subject,
    snippet,
    folder: "inbox",
    lastMessageAt: now,
    unreadDelta: 1
  });
  return insertMailboxMessage({
    tenantId: input.tenantId,
    accountId: account.id,
    threadId: thread.id,
    direction: "internal",
    from: { email: INTERNAL_EMAIL, name: "System" },
    to: [{ email: account.emailAddress, name: account.displayName }],
    subject: input.subject,
    snippet,
    bodyHtml: input.bodyHtml,
    bodyText: snippet,
    headersJson: input.embeddedSentEmail
      ? buildMailboxInternalHeaders({ embeddedSentEmail: input.embeddedSentEmail })
      : null,
    internalSource: input.source,
    actionUrl: input.actionUrl,
    relatedEntityKind: input.relatedEntityKind,
    relatedEntityId: input.relatedEntityId,
    receivedAt: now,
    isRead: false
  });
};

export const listAccountsDueForSync = async (
  limit: number,
  options?: { pollIntervalMs?: number; staleSyncingMs?: number }
): Promise<MailboxAccountRow[]> => {
  const cap = Math.min(Math.max(1, limit), 1000);
  const now = new Date();
  const pollIntervalMs = options?.pollIntervalMs ?? MAILBOX_SYNC_ACCOUNT_POLL_INTERVAL_MS;
  const staleSyncingMs = options?.staleSyncingMs ?? MAILBOX_SYNC_STALE_SYNCING_MS;
  const dueBefore = new Date(now.getTime() - pollIntervalMs);
  const staleSyncingBefore = new Date(now.getTime() - staleSyncingMs);

  if (dialectFromEnv() === "mysql") {
    const rows = await mysqlDb()
      .select()
      .from(mysql.mailboxAccounts)
      .where(
        and(
          or(
            eq(mysql.mailboxAccounts.provider, "imap"),
            eq(mysql.mailboxAccounts.provider, "gmail"),
            eq(mysql.mailboxAccounts.provider, "microsoft")
          ),
          or(
            sql`${mysql.mailboxAccounts.syncStatus} <> 'syncing'`,
            isNull(mysql.mailboxAccounts.updatedAt),
            lt(mysql.mailboxAccounts.updatedAt, staleSyncingBefore)
          ),
          or(isNull(mysql.mailboxAccounts.lastSyncedAt), lt(mysql.mailboxAccounts.lastSyncedAt, dueBefore))
        )
      )
      .orderBy(asc(sql`COALESCE(${mysql.mailboxAccounts.lastSyncedAt}, '1970-01-01')`))
    .limit(cap);
    const accounts = await Promise.all(
      rows.map((r) => decryptAccountRow(r.tenantId, r as AccountDbRow))
    );
    return accounts.filter(
      (row) =>
        !(
          row.syncStatus === "error" && isMailboxOAuthReconnectRequired(row.syncError)
        )
    );
  }
  const rows = await pgDb()
    .select()
    .from(pg.mailboxAccounts)
    .where(
      and(
        or(
          eq(pg.mailboxAccounts.provider, "imap"),
          eq(pg.mailboxAccounts.provider, "gmail"),
          eq(pg.mailboxAccounts.provider, "microsoft")
        ),
        or(
          sql`${pg.mailboxAccounts.syncStatus} <> 'syncing'`,
          isNull(pg.mailboxAccounts.updatedAt),
          lt(pg.mailboxAccounts.updatedAt, staleSyncingBefore)
        ),
        or(isNull(pg.mailboxAccounts.lastSyncedAt), lt(pg.mailboxAccounts.lastSyncedAt, dueBefore))
      )
    )
    .orderBy(asc(sql`COALESCE(${pg.mailboxAccounts.lastSyncedAt}, '1970-01-01'::timestamptz)`))
    .limit(cap);
  const accounts = await Promise.all(
    rows.map((r) => decryptAccountRow(r.tenantId, r as AccountDbRow))
  );
  return accounts.filter(
    (row) =>
      !(
        row.syncStatus === "error" && isMailboxOAuthReconnectRequired(row.syncError)
      )
  );
};

export const updateMailboxAccountSyncState = async (
  tenantId: string,
  accountId: string,
  patch: {
    syncCursor?: string | null;
    syncStatus?: string;
    syncError?: string | null;
    lastSyncedAt?: Date;
    oauthAccessTokenEncrypted?: string | null;
    oauthAccessTokenExpiresAt?: Date | null;
    oauthRefreshTokenEncrypted?: string | null;
  }
): Promise<void> => {
  const now = new Date();
  const set: Record<string, unknown> = { updatedAt: now };
  if (patch.syncCursor !== undefined) set.syncCursor = patch.syncCursor;
  if (patch.syncStatus !== undefined) set.syncStatus = patch.syncStatus;
  if (patch.syncError !== undefined) set.syncError = patch.syncError;
  if (patch.lastSyncedAt !== undefined) set.lastSyncedAt = patch.lastSyncedAt;
  if (patch.oauthAccessTokenEncrypted !== undefined)
    set.oauthAccessTokenEncrypted = patch.oauthAccessTokenEncrypted;
  if (patch.oauthAccessTokenExpiresAt !== undefined)
    set.oauthAccessTokenExpiresAt = patch.oauthAccessTokenExpiresAt;
  if (patch.oauthRefreshTokenEncrypted !== undefined)
    set.oauthRefreshTokenEncrypted = patch.oauthRefreshTokenEncrypted;
  if (dialectFromEnv() === "mysql") {
    await mysqlDb()
      .update(mysql.mailboxAccounts)
      .set(set)
      .where(and(eq(mysql.mailboxAccounts.tenantId, tenantId), eq(mysql.mailboxAccounts.id, accountId)));
    return;
  }
  await pgDb()
    .update(pg.mailboxAccounts)
    .set(set)
    .where(and(eq(pg.mailboxAccounts.tenantId, tenantId), eq(pg.mailboxAccounts.id, accountId)));
};

export const ensurePrimaryMailboxCalendar = async (
  tenantId: string,
  userId: string
): Promise<{ id: string }> => {
  if (dialectFromEnv() === "mysql") {
    const existing = await mysqlDb()
      .select()
      .from(mysql.mailboxCalendars)
      .where(
        and(
          eq(mysql.mailboxCalendars.tenantId, tenantId),
          eq(mysql.mailboxCalendars.userId, userId),
          eq(mysql.mailboxCalendars.isPrimary, true)
        )
      )
      .limit(1);
    if (existing[0]) return { id: existing[0].id };
    const id = randomUUID();
    await mysqlDb().insert(mysql.mailboxCalendars).values({
      id,
      tenantId,
      userId,
      name: "Calendar",
      color: "#3b82f6",
      isPrimary: true,
      source: "native",
      createdAt: new Date(),
      updatedAt: new Date()
    });
    return { id };
  }
  const existing = await pgDb()
    .select()
    .from(pg.mailboxCalendars)
    .where(
      and(
        eq(pg.mailboxCalendars.tenantId, tenantId),
        eq(pg.mailboxCalendars.userId, userId),
        eq(pg.mailboxCalendars.isPrimary, true)
      )
    )
    .limit(1);
  if (existing[0]) return { id: existing[0].id };
  const id = randomUUID();
  await pgDb().insert(pg.mailboxCalendars).values({
    id,
    tenantId,
    userId,
    name: "Calendar",
    color: "#3b82f6",
    isPrimary: true,
    source: "native",
    createdAt: new Date(),
    updatedAt: new Date()
  });
  return { id };
};

const mapCalendarRow = (row: {
  id: string;
  tenantId: string;
  userId: string;
  mailboxAccountId: string | null;
  name: string;
  color: string;
  isPrimary: boolean;
  source: string;
  providerCalendarId: string | null;
  syncCursor: string | null;
  syncStatus: string;
  syncError: string | null;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): MailboxCalendarRow => ({
  id: row.id,
  tenantId: row.tenantId,
  userId: row.userId,
  mailboxAccountId: row.mailboxAccountId,
  name: row.name,
  color: row.color,
  isPrimary: Boolean(row.isPrimary),
  source: row.source,
  providerCalendarId: row.providerCalendarId,
  syncCursor: row.syncCursor,
  syncStatus: row.syncStatus,
  syncError: row.syncError,
  lastSyncedAt: row.lastSyncedAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
});

export const ensureLinkedMailboxCalendarForAccount = async (input: {
  tenantId: string;
  userId: string;
  accountId: string;
  provider: "gmail" | "microsoft";
  displayName: string;
}): Promise<{ id: string }> => {
  const existing = await getMailboxCalendarByAccountId(input.tenantId, input.accountId);
  if (existing) return { id: existing.id };

  const id = randomUUID();
  const now = new Date();
  const source = input.provider === "gmail" ? "google" : "microsoft";
  const row = {
    id,
    tenantId: input.tenantId,
    userId: input.userId,
    mailboxAccountId: input.accountId,
    name: input.provider === "gmail" ? "Gmail" : "Outlook",
    color: input.provider === "gmail" ? "#ea4335" : "#0078d4",
    isPrimary: false,
    source,
    providerCalendarId: "primary",
    syncCursor: null,
    syncStatus: "idle",
    syncError: null,
    lastSyncedAt: null,
    createdAt: now,
    updatedAt: now
  };
  if (dialectFromEnv() === "mysql") {
    await mysqlDb().insert(mysql.mailboxCalendars).values(row);
  } else {
    await pgDb().insert(pg.mailboxCalendars).values(row);
  }
  return { id };
};

export const getMailboxCalendarByAccountId = async (
  tenantId: string,
  accountId: string
): Promise<MailboxCalendarRow | undefined> => {
  if (dialectFromEnv() === "mysql") {
    const rows = await mysqlDb()
      .select()
      .from(mysql.mailboxCalendars)
      .where(
        and(eq(mysql.mailboxCalendars.tenantId, tenantId), eq(mysql.mailboxCalendars.mailboxAccountId, accountId))
      )
      .limit(1);
    return rows[0] ? mapCalendarRow(rows[0]) : undefined;
  }
  const rows = await pgDb()
    .select()
    .from(pg.mailboxCalendars)
    .where(and(eq(pg.mailboxCalendars.tenantId, tenantId), eq(pg.mailboxCalendars.mailboxAccountId, accountId)))
    .limit(1);
  return rows[0] ? mapCalendarRow(rows[0]) : undefined;
};

export const listMailboxCalendarsForUser = async (
  tenantId: string,
  userId: string
): Promise<MailboxCalendarRow[]> => {
  if (dialectFromEnv() === "mysql") {
    const rows = await mysqlDb()
      .select()
      .from(mysql.mailboxCalendars)
      .where(and(eq(mysql.mailboxCalendars.tenantId, tenantId), eq(mysql.mailboxCalendars.userId, userId)));
    return rows.map(mapCalendarRow);
  }
  const rows = await pgDb()
    .select()
    .from(pg.mailboxCalendars)
    .where(and(eq(pg.mailboxCalendars.tenantId, tenantId), eq(pg.mailboxCalendars.userId, userId)));
  return rows.map(mapCalendarRow);
};

export const updateMailboxCalendarSyncState = async (
  tenantId: string,
  calendarId: string,
  patch: {
    syncCursor?: string | null;
    syncStatus?: string;
    syncError?: string | null;
    lastSyncedAt?: Date | null;
  }
): Promise<void> => {
  const now = new Date();
  const set: Record<string, unknown> = { updatedAt: now };
  if (patch.syncCursor !== undefined) set.syncCursor = patch.syncCursor;
  if (patch.syncStatus !== undefined) set.syncStatus = patch.syncStatus;
  if (patch.syncError !== undefined) set.syncError = patch.syncError;
  if (patch.lastSyncedAt !== undefined) set.lastSyncedAt = patch.lastSyncedAt;
  if (dialectFromEnv() === "mysql") {
    await mysqlDb()
      .update(mysql.mailboxCalendars)
      .set(set)
      .where(and(eq(mysql.mailboxCalendars.tenantId, tenantId), eq(mysql.mailboxCalendars.id, calendarId)));
    return;
  }
  await pgDb()
    .update(pg.mailboxCalendars)
    .set(set)
    .where(and(eq(pg.mailboxCalendars.tenantId, tenantId), eq(pg.mailboxCalendars.id, calendarId)));
};

export const upsertMailboxCalendarEventFromProvider = async (input: {
  tenantId: string;
  calendarId: string;
  providerEventId: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  allDay: boolean;
  status: string;
  organizer: MailboxAddress;
}): Promise<string> => {
  const now = new Date();
  const findExisting = async (): Promise<string | undefined> => {
    if (dialectFromEnv() === "mysql") {
      const rows = await mysqlDb()
        .select()
        .from(mysql.mailboxCalendarEvents)
        .where(
          and(
            eq(mysql.mailboxCalendarEvents.tenantId, input.tenantId),
            eq(mysql.mailboxCalendarEvents.calendarId, input.calendarId),
            eq(mysql.mailboxCalendarEvents.providerEventId, input.providerEventId)
          )
        )
        .limit(1);
      return rows[0]?.id;
    }
    const rows = await pgDb()
      .select()
      .from(pg.mailboxCalendarEvents)
      .where(
        and(
          eq(pg.mailboxCalendarEvents.tenantId, input.tenantId),
          eq(pg.mailboxCalendarEvents.calendarId, input.calendarId),
          eq(pg.mailboxCalendarEvents.providerEventId, input.providerEventId)
        )
      )
      .limit(1);
    return rows[0]?.id;
  };

  const existingId = await findExisting();
  if (existingId) {
    const values = {
      title: input.title,
      description: input.description,
      location: input.location,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      timezone: input.timezone,
      allDay: input.allDay,
      status: input.status,
      organizerJson: JSON.stringify(input.organizer),
      updatedAt: now
    };
    if (dialectFromEnv() === "mysql") {
      await mysqlDb()
        .update(mysql.mailboxCalendarEvents)
        .set(values)
        .where(eq(mysql.mailboxCalendarEvents.id, existingId));
    } else {
      await pgDb().update(pg.mailboxCalendarEvents).set(values).where(eq(pg.mailboxCalendarEvents.id, existingId));
    }
    return existingId;
  }

  const id = randomUUID();
  const row = {
    id,
    tenantId: input.tenantId,
    calendarId: input.calendarId,
    title: input.title,
    description: input.description,
    location: input.location,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    timezone: input.timezone,
    allDay: input.allDay,
    status: input.status,
    organizerJson: JSON.stringify(input.organizer),
    sourceMessageId: null,
    providerEventId: input.providerEventId,
    icsUid: null,
    icsSequence: 0,
    recurrenceJson: null,
    createdAt: now,
    updatedAt: now
  };
  if (dialectFromEnv() === "mysql") {
    await mysqlDb().insert(mysql.mailboxCalendarEvents).values(row);
  } else {
    await pgDb().insert(pg.mailboxCalendarEvents).values(row);
  }
  return id;
};

export const listMailboxCalendarEvents = async (input: {
  tenantId: string;
  userId: string;
  from?: Date;
  to?: Date;
  limit: number;
  connectionId?: string;
}): Promise<MailboxCalendarEventRow[]> => {
  await ensurePrimaryMailboxCalendar(input.tenantId, input.userId);
  const calendars = await listMailboxCalendarsForUser(input.tenantId, input.userId);
  const calendarIds = calendars.map((c) => c.id);
  if (calendarIds.length === 0) return [];

  const calendarById = new Map(calendars.map((c) => [c.id, c]));
  const conditions = [
    eq(
      dialectFromEnv() === "mysql"
        ? mysql.mailboxCalendarEvents.tenantId
        : pg.mailboxCalendarEvents.tenantId,
      input.tenantId
    ),
    inArray(
      dialectFromEnv() === "mysql"
        ? mysql.mailboxCalendarEvents.calendarId
        : pg.mailboxCalendarEvents.calendarId,
      calendarIds
    )
  ];
  if (input.from) {
    conditions.push(
      gte(
        dialectFromEnv() === "mysql"
          ? mysql.mailboxCalendarEvents.startsAt
          : pg.mailboxCalendarEvents.startsAt,
        input.from
      )
    );
  }
  if (input.to) {
    conditions.push(
      lte(
        dialectFromEnv() === "mysql"
          ? mysql.mailboxCalendarEvents.endsAt
          : pg.mailboxCalendarEvents.endsAt,
        input.to
      )
    );
  }

  if (dialectFromEnv() === "mysql") {
    const rows = await mysqlDb()
      .select()
      .from(mysql.mailboxCalendarEvents)
      .where(and(...conditions))
      .orderBy(mysql.mailboxCalendarEvents.startsAt)
      .limit(input.limit);
    return enrichMailboxCalendarEventRows(input.tenantId, rows, calendarById, input.connectionId);
  }
  const rows = await pgDb()
    .select()
    .from(pg.mailboxCalendarEvents)
    .where(and(...conditions))
    .orderBy(pg.mailboxCalendarEvents.startsAt)
    .limit(input.limit);
  return enrichMailboxCalendarEventRows(input.tenantId, rows, calendarById, input.connectionId);
};

type MailboxCalendarEventDbRow = {
  id: string;
  tenantId: string;
  calendarId: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  allDay: boolean;
  status: string;
  organizerJson: string;
  sourceMessageId: string | null;
  providerEventId: string | null;
  icsUid: string | null;
  icsSequence: number;
  recurrenceJson: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const enrichMailboxCalendarEventRows = async (
  tenantId: string,
  rows: MailboxCalendarEventDbRow[],
  calendarById: Map<string, MailboxCalendarRow>,
  connectionIdFilter?: string
): Promise<MailboxCalendarEventRow[]> => {
  const sourceMessageIds = [
    ...new Set(rows.map((row) => row.sourceMessageId).filter((id): id is string => Boolean(id)))
  ];
  const accountIdByMessageId = new Map<string, string>();
  if (sourceMessageIds.length > 0) {
    if (dialectFromEnv() === "mysql") {
      const messageRows = await mysqlDb()
        .select({
          id: mysql.mailboxMessages.id,
          accountId: mysql.mailboxMessages.accountId
        })
        .from(mysql.mailboxMessages)
        .where(
          and(
            eq(mysql.mailboxMessages.tenantId, tenantId),
            inArray(mysql.mailboxMessages.id, sourceMessageIds)
          )
        );
      for (const messageRow of messageRows) {
        accountIdByMessageId.set(messageRow.id, messageRow.accountId);
      }
    } else {
      const messageRows = await pgDb()
        .select({
          id: pg.mailboxMessages.id,
          accountId: pg.mailboxMessages.accountId
        })
        .from(pg.mailboxMessages)
        .where(
          and(eq(pg.mailboxMessages.tenantId, tenantId), inArray(pg.mailboxMessages.id, sourceMessageIds))
        );
      for (const messageRow of messageRows) {
        accountIdByMessageId.set(messageRow.id, messageRow.accountId);
      }
    }
  }

  const events = rows.map((row) => {
    const calendar = calendarById.get(row.calendarId);
    const connectionId =
      calendar?.mailboxAccountId ??
      (row.sourceMessageId ? (accountIdByMessageId.get(row.sourceMessageId) ?? null) : null);
    return {
      id: row.id,
      tenantId: row.tenantId,
      calendarId: row.calendarId,
      title: row.title,
      description: row.description,
      location: row.location,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      timezone: row.timezone,
      allDay: Boolean(row.allDay),
      status: row.status,
      organizerJson: row.organizerJson,
      sourceMessageId: row.sourceMessageId,
      providerEventId: row.providerEventId ?? null,
      icsUid: row.icsUid,
      icsSequence: row.icsSequence,
      recurrenceJson: row.recurrenceJson,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      calendarName: calendar?.name,
      calendarColor: calendar?.color,
      calendarSource: calendar?.source,
      connectionId
    };
  });

  if (!connectionIdFilter) return events;
  return events.filter((event) => event.connectionId === connectionIdFilter);
};

export const upsertMailboxCalendarEventFromIcs = async (input: {
  tenantId: string;
  userId: string;
  sourceMessageId: string;
  icsUid: string;
  icsSequence: number;
  title: string;
  description?: string | null;
  location?: string | null;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  allDay: boolean;
  status: string;
  organizer: MailboxAddress;
  attendees: MailboxAddress[];
  cancelled: boolean;
}): Promise<MailboxCalendarEventRow> => {
  const calendar = await ensurePrimaryMailboxCalendar(input.tenantId, input.userId);
  const now = new Date();
  const status = input.cancelled ? "cancelled" : input.status;

  const findExisting = async (): Promise<string | undefined> => {
    if (dialectFromEnv() === "mysql") {
      const rows = await mysqlDb()
        .select()
        .from(mysql.mailboxCalendarEvents)
        .where(
          and(
            eq(mysql.mailboxCalendarEvents.tenantId, input.tenantId),
            eq(mysql.mailboxCalendarEvents.calendarId, calendar.id),
            eq(mysql.mailboxCalendarEvents.icsUid, input.icsUid)
          )
        )
        .limit(1);
      return rows[0]?.id;
    }
    const rows = await pgDb()
      .select()
      .from(pg.mailboxCalendarEvents)
      .where(
        and(
          eq(pg.mailboxCalendarEvents.tenantId, input.tenantId),
          eq(pg.mailboxCalendarEvents.calendarId, calendar.id),
          eq(pg.mailboxCalendarEvents.icsUid, input.icsUid)
        )
      )
      .limit(1);
    return rows[0]?.id;
  };

  let existingId = await findExisting();
  if (existingId) {
    if (dialectFromEnv() === "mysql") {
      await mysqlDb()
        .update(mysql.mailboxCalendarEvents)
        .set({
          title: input.title,
          description: input.description ?? null,
          location: input.location ?? null,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          timezone: input.timezone,
          allDay: input.allDay,
          status,
          organizerJson: JSON.stringify(input.organizer),
          sourceMessageId: input.sourceMessageId,
          icsSequence: input.icsSequence,
          updatedAt: now
        })
        .where(eq(mysql.mailboxCalendarEvents.id, existingId));
    } else {
      await pgDb()
        .update(pg.mailboxCalendarEvents)
        .set({
          title: input.title,
          description: input.description ?? null,
          location: input.location ?? null,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          timezone: input.timezone,
          allDay: input.allDay,
          status,
          organizerJson: JSON.stringify(input.organizer),
          sourceMessageId: input.sourceMessageId,
          icsSequence: input.icsSequence,
          updatedAt: now
        })
        .where(eq(pg.mailboxCalendarEvents.id, existingId));
    }
  } else {
    const id = randomUUID();
    const row = {
      id,
      tenantId: input.tenantId,
      calendarId: calendar.id,
      title: input.title,
      description: input.description ?? null,
      location: input.location ?? null,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      timezone: input.timezone,
      allDay: input.allDay,
      status,
      organizerJson: JSON.stringify(input.organizer),
      sourceMessageId: input.sourceMessageId,
      providerEventId: null,
      icsUid: input.icsUid,
      icsSequence: input.icsSequence,
      recurrenceJson: null,
      createdAt: now,
      updatedAt: now
    };
    if (dialectFromEnv() === "mysql") {
      await mysqlDb().insert(mysql.mailboxCalendarEvents).values(row);
    } else {
      await pgDb().insert(pg.mailboxCalendarEvents).values(row);
    }
    existingId = id;
  }

  const eventId = existingId!;
  if (dialectFromEnv() === "mysql") {
    await mysqlDb()
      .delete(mysql.mailboxEventAttendees)
      .where(eq(mysql.mailboxEventAttendees.eventId, eventId));
    for (const att of input.attendees) {
      await mysqlDb().insert(mysql.mailboxEventAttendees).values({
        id: randomUUID(),
        tenantId: input.tenantId,
        eventId,
        email: att.email,
        displayName: att.name ?? null,
        response: "needs_action",
        createdAt: now,
        updatedAt: now
      });
    }
    const rows = await mysqlDb()
      .select()
      .from(mysql.mailboxCalendarEvents)
      .where(eq(mysql.mailboxCalendarEvents.id, eventId))
      .limit(1);
    const r = rows[0]!;
    return {
      id: r.id,
      tenantId: r.tenantId,
      calendarId: r.calendarId,
      title: r.title,
      description: r.description,
      location: r.location,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      timezone: r.timezone,
      allDay: Boolean(r.allDay),
      status: r.status,
      organizerJson: r.organizerJson,
      sourceMessageId: r.sourceMessageId,
      providerEventId: r.providerEventId ?? null,
      icsUid: r.icsUid,
      icsSequence: r.icsSequence,
      recurrenceJson: r.recurrenceJson,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    };
  }
  await pgDb().delete(pg.mailboxEventAttendees).where(eq(pg.mailboxEventAttendees.eventId, eventId));
  for (const att of input.attendees) {
    await pgDb().insert(pg.mailboxEventAttendees).values({
      id: randomUUID(),
      tenantId: input.tenantId,
      eventId,
      email: att.email,
      displayName: att.name ?? null,
      response: "needs_action",
      createdAt: now,
      updatedAt: now
    });
  }
  const rows = await pgDb()
    .select()
    .from(pg.mailboxCalendarEvents)
    .where(eq(pg.mailboxCalendarEvents.id, eventId))
    .limit(1);
  const r = rows[0]!;
  return {
    id: r.id,
    tenantId: r.tenantId,
    calendarId: r.calendarId,
    title: r.title,
    description: r.description,
    location: r.location,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    timezone: r.timezone,
    allDay: Boolean(r.allDay),
    status: r.status,
    organizerJson: r.organizerJson,
    sourceMessageId: r.sourceMessageId,
    providerEventId: r.providerEventId ?? null,
    icsUid: r.icsUid,
    icsSequence: r.icsSequence,
    recurrenceJson: r.recurrenceJson,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
  };
};

export const getMailboxCalendarEventById = async (
  tenantId: string,
  eventId: string
): Promise<MailboxCalendarEventRow | undefined> => {
  if (dialectFromEnv() === "mysql") {
    const rows = await mysqlDb()
      .select()
      .from(mysql.mailboxCalendarEvents)
      .where(
        and(eq(mysql.mailboxCalendarEvents.tenantId, tenantId), eq(mysql.mailboxCalendarEvents.id, eventId))
      )
      .limit(1);
    const r = rows[0];
    if (!r) return undefined;
    return {
      id: r.id,
      tenantId: r.tenantId,
      calendarId: r.calendarId,
      title: r.title,
      description: r.description,
      location: r.location,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      timezone: r.timezone,
      allDay: Boolean(r.allDay),
      status: r.status,
      organizerJson: r.organizerJson,
      sourceMessageId: r.sourceMessageId,
      providerEventId: r.providerEventId ?? null,
      icsUid: r.icsUid,
      icsSequence: r.icsSequence,
      recurrenceJson: r.recurrenceJson,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    };
  }
  const rows = await pgDb()
    .select()
    .from(pg.mailboxCalendarEvents)
    .where(and(eq(pg.mailboxCalendarEvents.tenantId, tenantId), eq(pg.mailboxCalendarEvents.id, eventId)))
    .limit(1);
  const r = rows[0];
  if (!r) return undefined;
  return {
    id: r.id,
    tenantId: r.tenantId,
    calendarId: r.calendarId,
    title: r.title,
    description: r.description,
    location: r.location,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    timezone: r.timezone,
    allDay: Boolean(r.allDay),
    status: r.status,
    organizerJson: r.organizerJson,
    sourceMessageId: r.sourceMessageId,
    providerEventId: r.providerEventId ?? null,
    icsUid: r.icsUid,
    icsSequence: r.icsSequence,
    recurrenceJson: r.recurrenceJson,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
  };
};

export const getMailboxCalendarEventBySourceMessageId = async (
  tenantId: string,
  sourceMessageId: string
): Promise<MailboxCalendarEventRow | undefined> => {
  if (dialectFromEnv() === "mysql") {
    const rows = await mysqlDb()
      .select()
      .from(mysql.mailboxCalendarEvents)
      .where(
        and(
          eq(mysql.mailboxCalendarEvents.tenantId, tenantId),
          eq(mysql.mailboxCalendarEvents.sourceMessageId, sourceMessageId)
        )
      )
      .limit(1);
    const r = rows[0];
    if (!r) return undefined;
    return {
      id: r.id,
      tenantId: r.tenantId,
      calendarId: r.calendarId,
      title: r.title,
      description: r.description,
      location: r.location,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      timezone: r.timezone,
      allDay: Boolean(r.allDay),
      status: r.status,
      organizerJson: r.organizerJson,
      sourceMessageId: r.sourceMessageId,
      providerEventId: r.providerEventId ?? null,
      icsUid: r.icsUid,
      icsSequence: r.icsSequence,
      recurrenceJson: r.recurrenceJson,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    };
  }
  const rows = await pgDb()
    .select()
    .from(pg.mailboxCalendarEvents)
    .where(
      and(
        eq(pg.mailboxCalendarEvents.tenantId, tenantId),
        eq(pg.mailboxCalendarEvents.sourceMessageId, sourceMessageId)
      )
    )
    .limit(1);
  const r = rows[0];
  if (!r) return undefined;
  return {
    id: r.id,
    tenantId: r.tenantId,
    calendarId: r.calendarId,
    title: r.title,
    description: r.description,
    location: r.location,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    timezone: r.timezone,
    allDay: Boolean(r.allDay),
    status: r.status,
    organizerJson: r.organizerJson,
    sourceMessageId: r.sourceMessageId,
    providerEventId: r.providerEventId ?? null,
    icsUid: r.icsUid,
    icsSequence: r.icsSequence,
    recurrenceJson: r.recurrenceJson,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
  };
};

export const replaceMailboxEventAttendees = async (input: {
  tenantId: string;
  eventId: string;
  attendees: MailboxAddress[];
}): Promise<void> => {
  const now = new Date();
  if (dialectFromEnv() === "mysql") {
    await mysqlDb()
      .delete(mysql.mailboxEventAttendees)
      .where(eq(mysql.mailboxEventAttendees.eventId, input.eventId));
    if (input.attendees.length > 0) {
      await mysqlDb().insert(mysql.mailboxEventAttendees).values(
        input.attendees.map((attendee) => ({
          id: randomUUID(),
          tenantId: input.tenantId,
          eventId: input.eventId,
          email: attendee.email,
          displayName: attendee.name ?? null,
          response: "needs_action",
          createdAt: now,
          updatedAt: now
        }))
      );
    }
    return;
  }
  await pgDb().delete(pg.mailboxEventAttendees).where(eq(pg.mailboxEventAttendees.eventId, input.eventId));
  if (input.attendees.length > 0) {
    await pgDb().insert(pg.mailboxEventAttendees).values(
      input.attendees.map((attendee) => ({
        tenantId: input.tenantId,
        eventId: input.eventId,
        email: attendee.email,
        displayName: attendee.name ?? null,
        response: "needs_action"
      }))
    );
  }
};

export type MailboxEventAttendeeRow = {
  id: string;
  email: string;
  displayName: string | null;
  response: string;
};

export const listMailboxEventAttendees = async (
  tenantId: string,
  eventId: string
): Promise<MailboxEventAttendeeRow[]> => {
  if (dialectFromEnv() === "mysql") {
    const rows = await mysqlDb()
      .select()
      .from(mysql.mailboxEventAttendees)
      .where(
        and(eq(mysql.mailboxEventAttendees.tenantId, tenantId), eq(mysql.mailboxEventAttendees.eventId, eventId))
      );
    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      response: row.response
    }));
  }
  const rows = await pgDb()
    .select()
    .from(pg.mailboxEventAttendees)
    .where(and(eq(pg.mailboxEventAttendees.tenantId, tenantId), eq(pg.mailboxEventAttendees.eventId, eventId)));
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    response: row.response
  }));
};

export const updateMailboxCalendarEventRow = async (input: {
  tenantId: string;
  eventId: string;
  title?: string;
  description?: string | null;
  location?: string | null;
  startsAt?: Date;
  endsAt?: Date;
  timezone?: string;
  allDay?: boolean;
  status?: string;
  recurrenceJson?: string | null;
}): Promise<boolean> => {
  const now = new Date();
  const values: Record<string, unknown> = { updatedAt: now };
  if (input.title !== undefined) values.title = input.title;
  if (input.description !== undefined) values.description = input.description;
  if (input.location !== undefined) values.location = input.location;
  if (input.startsAt !== undefined) values.startsAt = input.startsAt;
  if (input.endsAt !== undefined) values.endsAt = input.endsAt;
  if (input.timezone !== undefined) values.timezone = input.timezone;
  if (input.allDay !== undefined) values.allDay = input.allDay;
  if (input.status !== undefined) values.status = input.status;
  if (input.recurrenceJson !== undefined) values.recurrenceJson = input.recurrenceJson;

  if (dialectFromEnv() === "mysql") {
    const result = await mysqlDb()
      .update(mysql.mailboxCalendarEvents)
      .set(values)
      .where(
        and(eq(mysql.mailboxCalendarEvents.tenantId, input.tenantId), eq(mysql.mailboxCalendarEvents.id, input.eventId))
      );
    return (result as { affectedRows?: number }).affectedRows !== 0;
  }
  const rows = await pgDb()
    .update(pg.mailboxCalendarEvents)
    .set(values)
    .where(and(eq(pg.mailboxCalendarEvents.tenantId, input.tenantId), eq(pg.mailboxCalendarEvents.id, input.eventId)))
    .returning({ id: pg.mailboxCalendarEvents.id });
  return rows.length > 0;
};

export const deleteMailboxCalendarEventRow = async (tenantId: string, eventId: string): Promise<boolean> => {
  if (dialectFromEnv() === "mysql") {
    const result = await mysqlDb()
      .delete(mysql.mailboxCalendarEvents)
      .where(and(eq(mysql.mailboxCalendarEvents.tenantId, tenantId), eq(mysql.mailboxCalendarEvents.id, eventId)));
    return (result as { affectedRows?: number }).affectedRows !== 0;
  }
  const rows = await pgDb()
    .delete(pg.mailboxCalendarEvents)
    .where(and(eq(pg.mailboxCalendarEvents.tenantId, tenantId), eq(pg.mailboxCalendarEvents.id, eventId)))
    .returning({ id: pg.mailboxCalendarEvents.id });
  return rows.length > 0;
};

export const getMailboxCalendarById = async (
  tenantId: string,
  calendarId: string
): Promise<MailboxCalendarRow | undefined> => {
  if (dialectFromEnv() === "mysql") {
    const rows = await mysqlDb()
      .select()
      .from(mysql.mailboxCalendars)
      .where(and(eq(mysql.mailboxCalendars.tenantId, tenantId), eq(mysql.mailboxCalendars.id, calendarId)))
      .limit(1);
    const row = rows[0];
    return row ? mapCalendarRow(row) : undefined;
  }
  const rows = await pgDb()
    .select()
    .from(pg.mailboxCalendars)
    .where(and(eq(pg.mailboxCalendars.tenantId, tenantId), eq(pg.mailboxCalendars.id, calendarId)))
    .limit(1);
  const row = rows[0];
  return row ? mapCalendarRow(row) : undefined;
};

export const updateMailboxEventAttendeeResponse = async (
  tenantId: string,
  eventId: string,
  email: string,
  response: string
): Promise<void> => {
  const now = new Date();
  if (dialectFromEnv() === "mysql") {
    await mysqlDb()
      .update(mysql.mailboxEventAttendees)
      .set({ response, updatedAt: now })
      .where(
        and(
          eq(mysql.mailboxEventAttendees.tenantId, tenantId),
          eq(mysql.mailboxEventAttendees.eventId, eventId),
          eq(mysql.mailboxEventAttendees.email, email)
        )
      );
    return;
  }
  await pgDb()
    .update(pg.mailboxEventAttendees)
    .set({ response, updatedAt: now })
    .where(
      and(
        eq(pg.mailboxEventAttendees.tenantId, tenantId),
        eq(pg.mailboxEventAttendees.eventId, eventId),
        eq(pg.mailboxEventAttendees.email, email)
      )
    );
};

export const upsertMailboxAccountMember = async (input: {
  tenantId: string;
  accountId: string;
  userId: string;
  role: MailboxAccountMemberRole;
}): Promise<void> => {
  const now = new Date();
  if (dialectFromEnv() === "mysql") {
    const existing = await mysqlDb()
      .select()
      .from(mysql.mailboxAccountMembers)
      .where(
        and(
          eq(mysql.mailboxAccountMembers.accountId, input.accountId),
          eq(mysql.mailboxAccountMembers.userId, input.userId)
        )
      )
      .limit(1);
    if (existing[0]) {
      await mysqlDb()
        .update(mysql.mailboxAccountMembers)
        .set({ role: input.role })
        .where(eq(mysql.mailboxAccountMembers.id, existing[0].id));
      return;
    }
    await mysqlDb().insert(mysql.mailboxAccountMembers).values({
      id: randomUUID(),
      tenantId: input.tenantId,
      accountId: input.accountId,
      userId: input.userId,
      role: input.role,
      createdAt: now
    });
    return;
  }
  const existing = await pgDb()
    .select()
    .from(pg.mailboxAccountMembers)
    .where(
      and(
        eq(pg.mailboxAccountMembers.accountId, input.accountId),
        eq(pg.mailboxAccountMembers.userId, input.userId)
      )
    )
    .limit(1);
  if (existing[0]) {
    await pgDb()
      .update(pg.mailboxAccountMembers)
      .set({ role: input.role })
      .where(eq(pg.mailboxAccountMembers.id, existing[0].id));
    return;
  }
  await pgDb().insert(pg.mailboxAccountMembers).values({
    id: randomUUID(),
    tenantId: input.tenantId,
    accountId: input.accountId,
    userId: input.userId,
    role: input.role,
    createdAt: now
  });
};

export const listMailboxAccountMembers = async (
  tenantId: string,
  accountId: string
): Promise<{ id: string; userId: string; role: MailboxAccountMemberRole }[]> => {
  if (dialectFromEnv() === "mysql") {
    const rows = await mysqlDb()
      .select()
      .from(mysql.mailboxAccountMembers)
      .where(
        and(
          eq(mysql.mailboxAccountMembers.tenantId, tenantId),
          eq(mysql.mailboxAccountMembers.accountId, accountId)
        )
      );
    return rows.map((r) => ({ id: r.id, userId: r.userId, role: r.role as MailboxAccountMemberRole }));
  }
  const rows = await pgDb()
    .select()
    .from(pg.mailboxAccountMembers)
    .where(
      and(eq(pg.mailboxAccountMembers.tenantId, tenantId), eq(pg.mailboxAccountMembers.accountId, accountId))
    );
  return rows.map((r) => ({ id: r.id, userId: r.userId, role: r.role as MailboxAccountMemberRole }));
};

export const messageExistsByProviderId = async (
  accountId: string,
  providerMessageId: string
): Promise<boolean> => {
  const row = await getMailboxMessageIdByProviderId(accountId, providerMessageId);
  return row != null;
};

export const getMailboxMessageIdByProviderId = async (
  accountId: string,
  providerMessageId: string
): Promise<{ id: string; threadId: string } | undefined> => {
  if (dialectFromEnv() === "mysql") {
    const rows = await mysqlDb()
      .select({ id: mysql.mailboxMessages.id, threadId: mysql.mailboxMessages.threadId })
      .from(mysql.mailboxMessages)
      .where(
        and(
          eq(mysql.mailboxMessages.accountId, accountId),
          eq(mysql.mailboxMessages.providerMessageId, providerMessageId)
        )
      )
      .limit(1);
    return rows[0];
  }
  const rows = await pgDb()
    .select({ id: pg.mailboxMessages.id, threadId: pg.mailboxMessages.threadId })
    .from(pg.mailboxMessages)
    .where(
      and(
        eq(pg.mailboxMessages.accountId, accountId),
        eq(pg.mailboxMessages.providerMessageId, providerMessageId)
      )
    )
    .limit(1);
  return rows[0];
};

export const reconcileMailboxMessageFromProvider = async (input: {
  tenantId: string;
  accountId: string;
  providerMessageId: string;
  isRead: boolean;
  isStarred: boolean;
  folder: MailboxFolder;
}): Promise<boolean> => {
  const existing = await getMailboxMessageIdByProviderId(input.accountId, input.providerMessageId);
  if (!existing) return false;

  const thread = await getMailboxThreadById(input.tenantId, existing.threadId);
  if (!thread) return false;

  const now = new Date();
  const messageSet = { isRead: input.isRead, updatedAt: now };
  if (dialectFromEnv() === "mysql") {
    await mysqlDb()
      .update(mysql.mailboxMessages)
      .set(messageSet)
      .where(
        and(
          eq(mysql.mailboxMessages.tenantId, input.tenantId),
          eq(mysql.mailboxMessages.id, existing.id),
          eq(mysql.mailboxMessages.isDraft, false)
        )
      );
  } else {
    await pgDb()
      .update(pg.mailboxMessages)
      .set(messageSet)
      .where(
        and(
          eq(pg.mailboxMessages.tenantId, input.tenantId),
          eq(pg.mailboxMessages.id, existing.id),
          eq(pg.mailboxMessages.isDraft, false)
        )
      );
  }

  const messages = await listMailboxMessagesForThread(input.tenantId, existing.threadId);
  const unreadCount = messages.filter((m) => !m.isDraft && !m.isRead).length;
  const threadSet = {
    folder: input.folder,
    isStarred: input.isStarred,
    unreadCount,
    updatedAt: now
  };
  if (dialectFromEnv() === "mysql") {
    await mysqlDb()
      .update(mysql.mailboxThreads)
      .set(threadSet)
      .where(
        and(eq(mysql.mailboxThreads.tenantId, input.tenantId), eq(mysql.mailboxThreads.id, existing.threadId))
      );
  } else {
    await pgDb()
      .update(pg.mailboxThreads)
      .set(threadSet)
      .where(
        and(eq(pg.mailboxThreads.tenantId, input.tenantId), eq(pg.mailboxThreads.id, existing.threadId))
      );
  }
  return true;
};

export const applyMailboxProviderIdUpdates = async (
  tenantId: string,
  accountId: string,
  updates: { from: string; to: string }[]
): Promise<void> => {
  for (const update of updates) {
    if (dialectFromEnv() === "mysql") {
      await mysqlDb()
        .update(mysql.mailboxMessages)
        .set({ providerMessageId: update.to, updatedAt: new Date() })
        .where(
          and(
            eq(mysql.mailboxMessages.tenantId, tenantId),
            eq(mysql.mailboxMessages.accountId, accountId),
            eq(mysql.mailboxMessages.providerMessageId, update.from)
          )
        );
    } else {
      await pgDb()
        .update(pg.mailboxMessages)
        .set({ providerMessageId: update.to, updatedAt: new Date() })
        .where(
          and(
            eq(pg.mailboxMessages.tenantId, tenantId),
            eq(pg.mailboxMessages.accountId, accountId),
            eq(pg.mailboxMessages.providerMessageId, update.from)
          )
        );
    }
  }
};

export const resolveMailboxThreadFolderMove = (
  thread: MailboxThreadRow,
  targetFolder: MailboxFolder
): { folder: MailboxFolder; previousFolder: string | null } | { error: string } => {
  if (targetFolder === "archive" && thread.folder !== "inbox") {
    return { error: "archive_inbox_only" };
  }
  if (targetFolder === thread.folder) {
    return { folder: thread.folder, previousFolder: thread.previousFolder };
  }
  if (targetFolder === "trash") {
    return { folder: "trash", previousFolder: thread.folder };
  }
  if (targetFolder === "inbox" && thread.folder === "trash") {
    const restore = (thread.previousFolder as MailboxFolder | null) ?? "inbox";
    return { folder: restore, previousFolder: null };
  }
  if (targetFolder === "inbox" && thread.folder === "archive") {
    return { folder: "inbox", previousFolder: null };
  }
  return { folder: targetFolder, previousFolder: thread.previousFolder };
};

export const applyMailboxThreadFolderMove = async (
  tenantId: string,
  threadId: string,
  targetFolder: MailboxFolder
): Promise<MailboxThreadRow | undefined> => {
  const thread = await getMailboxThreadById(tenantId, threadId);
  if (!thread) return undefined;
  const resolved = resolveMailboxThreadFolderMove(thread, targetFolder);
  if ("error" in resolved) return undefined;
  const now = new Date();
  const set = {
    folder: resolved.folder,
    previousFolder: resolved.previousFolder,
    updatedAt: now
  };
  if (dialectFromEnv() === "mysql") {
    await mysqlDb()
      .update(mysql.mailboxThreads)
      .set(set)
      .where(and(eq(mysql.mailboxThreads.tenantId, tenantId), eq(mysql.mailboxThreads.id, threadId)));
  } else {
    await pgDb()
      .update(pg.mailboxThreads)
      .set(set)
      .where(and(eq(pg.mailboxThreads.tenantId, tenantId), eq(pg.mailboxThreads.id, threadId)));
  }
  return getMailboxThreadById(tenantId, threadId);
};

export const markMailboxMessagesUnread = async (tenantId: string, threadId: string): Promise<void> => {
  const messages = await listMailboxMessagesForThread(tenantId, threadId);
  const unreadCount = messages.filter((m) => !m.isDraft).length || 1;
  const now = new Date();
  if (dialectFromEnv() === "mysql") {
    await mysqlDb()
      .update(mysql.mailboxMessages)
      .set({ isRead: false, updatedAt: now })
      .where(
        and(
          eq(mysql.mailboxMessages.tenantId, tenantId),
          eq(mysql.mailboxMessages.threadId, threadId),
          eq(mysql.mailboxMessages.isDraft, false)
        )
      );
    await mysqlDb()
      .update(mysql.mailboxThreads)
      .set({ unreadCount, updatedAt: now })
      .where(and(eq(mysql.mailboxThreads.tenantId, tenantId), eq(mysql.mailboxThreads.id, threadId)));
    return;
  }
  await pgDb()
    .update(pg.mailboxMessages)
    .set({ isRead: false, updatedAt: now })
    .where(
      and(
        eq(pg.mailboxMessages.tenantId, tenantId),
        eq(pg.mailboxMessages.threadId, threadId),
        eq(pg.mailboxMessages.isDraft, false)
      )
    );
  await pgDb()
    .update(pg.mailboxThreads)
    .set({ unreadCount, updatedAt: now })
    .where(and(eq(pg.mailboxThreads.tenantId, tenantId), eq(pg.mailboxThreads.id, threadId)));
};

export const bulkPatchMailboxThreads = async (input: {
  tenantId: string;
  accountId: string;
  threadIds: string[];
  isRead?: boolean;
  isStarred?: boolean;
  folder?: MailboxFolder;
}): Promise<MailboxThreadRow[]> =>
  bulkPatchMailboxThreadsForInbox({
    tenantId: input.tenantId,
    inboxId: input.accountId,
    threadIds: input.threadIds,
    isRead: input.isRead,
    isStarred: input.isStarred,
    folder: input.folder
  });

export const bulkPatchMailboxThreadsForInbox = async (input: {
  tenantId: string;
  inboxId: string;
  threadIds: string[];
  isRead?: boolean;
  isStarred?: boolean;
  folder?: MailboxFolder;
}): Promise<MailboxThreadRow[]> => {
  const connectionIds = new Set(
    (await listMailboxConnectionsForInbox(input.tenantId, input.inboxId)).map((c) => c.id)
  );
  const updated: MailboxThreadRow[] = [];
  for (const threadId of input.threadIds) {
    const thread = await getMailboxThreadById(input.tenantId, threadId);
    if (!thread || !connectionIds.has(thread.accountId)) continue;
    if (input.isRead === true) await markMailboxMessagesRead(input.tenantId, threadId);
    if (input.isRead === false) await markMailboxMessagesUnread(input.tenantId, threadId);
    if (input.folder) await applyMailboxThreadFolderMove(input.tenantId, threadId, input.folder);
    if (input.isStarred !== undefined) {
      await updateMailboxThread(input.tenantId, threadId, { isStarred: input.isStarred });
    }
    const row = await getMailboxThreadById(input.tenantId, threadId);
    if (row) updated.push(row);
  }
  return updated;
};

export const listMailboxAttachmentRowsForMessage = async (
  tenantId: string,
  messageId: string
): Promise<MailboxAttachmentRow[]> => {
  const mapRow = (r: {
    id: string;
    tenantId: string;
    messageId: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    blobPath: string;
    createdAt: Date;
  }): MailboxAttachmentRow => ({
    id: r.id,
    tenantId: r.tenantId,
    messageId: r.messageId,
    filename: r.filename,
    mimeType: r.mimeType,
    sizeBytes: Number(r.sizeBytes),
    blobPath: r.blobPath,
    createdAt: r.createdAt
  });
  if (dialectFromEnv() === "mysql") {
    const rows = await mysqlDb()
      .select()
      .from(mysql.mailboxAttachments)
      .where(
        and(eq(mysql.mailboxAttachments.tenantId, tenantId), eq(mysql.mailboxAttachments.messageId, messageId))
      );
    return rows.map(mapRow);
  }
  const rows = await pgDb()
    .select()
    .from(pg.mailboxAttachments)
    .where(and(eq(pg.mailboxAttachments.tenantId, tenantId), eq(pg.mailboxAttachments.messageId, messageId)));
  return rows.map(mapRow);
};

export const getMailboxAttachmentById = async (
  tenantId: string,
  attachmentId: string
): Promise<MailboxAttachmentRow | undefined> => {
  if (dialectFromEnv() === "mysql") {
    const rows = await mysqlDb()
      .select()
      .from(mysql.mailboxAttachments)
      .where(
        and(eq(mysql.mailboxAttachments.tenantId, tenantId), eq(mysql.mailboxAttachments.id, attachmentId))
      )
      .limit(1);
    const r = rows[0];
    return r
      ? {
          id: r.id,
          tenantId: r.tenantId,
          messageId: r.messageId,
          filename: r.filename,
          mimeType: r.mimeType,
          sizeBytes: Number(r.sizeBytes),
          blobPath: r.blobPath,
          createdAt: r.createdAt
        }
      : undefined;
  }
  const rows = await pgDb()
    .select()
    .from(pg.mailboxAttachments)
    .where(and(eq(pg.mailboxAttachments.tenantId, tenantId), eq(pg.mailboxAttachments.id, attachmentId)))
    .limit(1);
  const r = rows[0];
  return r
    ? {
        id: r.id,
        tenantId: r.tenantId,
        messageId: r.messageId,
        filename: r.filename,
        mimeType: r.mimeType,
        sizeBytes: Number(r.sizeBytes),
        blobPath: r.blobPath,
        createdAt: r.createdAt
      }
    : undefined;
};

export const insertMailboxAttachment = async (input: {
  tenantId: string;
  messageId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  blobPath: string;
}): Promise<MailboxAttachmentRow> => {
  const id = randomUUID();
  const now = new Date();
  const row = {
    id,
    tenantId: input.tenantId,
    messageId: input.messageId,
    filename: input.filename,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    blobPath: input.blobPath,
    createdAt: now
  };
  if (dialectFromEnv() === "mysql") {
    await mysqlDb().insert(mysql.mailboxAttachments).values(row);
  } else {
    await pgDb().insert(pg.mailboxAttachments).values(row);
  }
  await setMailboxMessageHasAttachments(input.tenantId, input.messageId, true);
  return (await getMailboxAttachmentById(input.tenantId, id))!;
};

export const deleteMailboxAttachment = async (
  tenantId: string,
  attachmentId: string
): Promise<MailboxAttachmentRow | undefined> => {
  const row = await getMailboxAttachmentById(tenantId, attachmentId);
  if (!row) return undefined;
  if (dialectFromEnv() === "mysql") {
    await mysqlDb()
      .delete(mysql.mailboxAttachments)
      .where(and(eq(mysql.mailboxAttachments.tenantId, tenantId), eq(mysql.mailboxAttachments.id, attachmentId)));
  } else {
    await pgDb()
      .delete(pg.mailboxAttachments)
      .where(and(eq(pg.mailboxAttachments.tenantId, tenantId), eq(pg.mailboxAttachments.id, attachmentId)));
  }
  const remaining = await listMailboxAttachmentRowsForMessage(tenantId, row.messageId);
  if (remaining.length === 0) {
    await setMailboxMessageHasAttachments(tenantId, row.messageId, false);
  }
  return row;
};

export const setMailboxMessageHasAttachments = async (
  tenantId: string,
  messageId: string,
  hasAttachments: boolean
): Promise<void> => {
  const now = new Date();
  if (dialectFromEnv() === "mysql") {
    await mysqlDb()
      .update(mysql.mailboxMessages)
      .set({ hasAttachments, updatedAt: now })
      .where(and(eq(mysql.mailboxMessages.tenantId, tenantId), eq(mysql.mailboxMessages.id, messageId)));
    return;
  }
  await pgDb()
    .update(pg.mailboxMessages)
    .set({ hasAttachments, updatedAt: now })
    .where(and(eq(pg.mailboxMessages.tenantId, tenantId), eq(pg.mailboxMessages.id, messageId)));
};

export const reassignMailboxAttachmentsMessage = async (
  tenantId: string,
  fromMessageId: string,
  toMessageId: string
): Promise<void> => {
  if (dialectFromEnv() === "mysql") {
    await mysqlDb()
      .update(mysql.mailboxAttachments)
      .set({ messageId: toMessageId })
      .where(
        and(
          eq(mysql.mailboxAttachments.tenantId, tenantId),
          eq(mysql.mailboxAttachments.messageId, fromMessageId)
        )
      );
  } else {
    await pgDb()
      .update(pg.mailboxAttachments)
      .set({ messageId: toMessageId })
      .where(
        and(
          eq(pg.mailboxAttachments.tenantId, tenantId),
          eq(pg.mailboxAttachments.messageId, fromMessageId)
        )
      );
  }
  const attachments = await listMailboxAttachmentRowsForMessage(tenantId, toMessageId);
  await setMailboxMessageHasAttachments(tenantId, toMessageId, attachments.length > 0);
};

export const deleteMailboxThreadPermanent = async (
  tenantId: string,
  threadId: string
): Promise<string[]> => {
  const messages = await listMailboxMessagesForThread(tenantId, threadId);
  const blobPaths: string[] = [];
  for (const message of messages) {
    const attachments = await listMailboxAttachmentRowsForMessage(tenantId, message.id);
    blobPaths.push(...attachments.map((a) => a.blobPath));
  }
  if (dialectFromEnv() === "mysql") {
    await mysqlDb()
      .delete(mysql.mailboxThreads)
      .where(and(eq(mysql.mailboxThreads.tenantId, tenantId), eq(mysql.mailboxThreads.id, threadId)));
  } else {
    await pgDb()
      .delete(pg.mailboxThreads)
      .where(and(eq(pg.mailboxThreads.tenantId, tenantId), eq(pg.mailboxThreads.id, threadId)));
  }
  return blobPaths;
};

export const emptyMailboxTrash = async (
  tenantId: string,
  inboxId: string
): Promise<string[]> => {
  const blobPaths: string[] = [];
  const pageSize = 500;
  let offset = 0;
  while (true) {
    const threads = await listMailboxThreadsForInbox({
      tenantId,
      inboxId,
      folder: "trash",
      limit: pageSize,
      offset
    });
    if (threads.length === 0) break;
    for (const thread of threads) {
      const paths = await deleteMailboxThreadPermanent(tenantId, thread.id);
      blobPaths.push(...paths);
    }
    if (threads.length < pageSize) break;
    offset += pageSize;
  }
  return blobPaths;
};

export const syncLinkedMailboxCalendarForAccount = async (
  tenantId: string,
  accountId: string
): Promise<{ upserted: number }> => {
  const account = await getMailboxAccountById(tenantId, accountId);
  if (!account || (account.provider !== "gmail" && account.provider !== "microsoft")) {
    return { upserted: 0 };
  }
  const calendar = await getMailboxCalendarByAccountId(tenantId, accountId);
  if (!calendar) return { upserted: 0 };

  await updateMailboxCalendarSyncState(tenantId, calendar.id, { syncStatus: "syncing", syncError: null });
  try {
    let syncCursor = calendar.syncCursor;
    const result =
      account.provider === "gmail"
        ? await syncGoogleCalendarDelta({
            account,
            providerCalendarId: calendar.providerCalendarId ?? "primary",
            syncCursor
          })
        : await syncMicrosoftCalendarDelta({ account, syncCursor });

    if (result.resetCursor) syncCursor = null;

    let upserted = 0;
    for (const event of result.events) {
      await upsertMailboxCalendarEventFromProvider({
        tenantId,
        calendarId: calendar.id,
        providerEventId: event.providerEventId,
        title: event.title,
        description: event.description,
        location: event.location,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        timezone: event.timezone,
        allDay: event.allDay,
        status: event.status,
        organizer: event.organizer
      });
      upserted += 1;
    }

    await updateMailboxCalendarSyncState(tenantId, calendar.id, {
      syncCursor: result.resetCursor ? result.cursor : result.cursor ?? syncCursor,
      syncStatus: "idle",
      syncError: null,
      lastSyncedAt: new Date()
    });
    return { upserted };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateMailboxCalendarSyncState(tenantId, calendar.id, {
      syncStatus: "error",
      syncError: message,
      lastSyncedAt: new Date()
    });
    throw err;
  }
};
