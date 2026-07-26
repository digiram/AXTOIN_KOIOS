/**
 * Tenant Mailbox API — hybrid inboxes, external sync, calendar.
 */

import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import {
  applyMailboxThreadFolderMove,
  buildGoogleOAuthAuthorizeUrl,
  buildMicrosoftOAuthAuthorizeUrl,
  bulkPatchMailboxThreads,
  createProviderCalendarEvent,
  deleteProviderCalendarEvent,
  updateProviderCalendarEvent,
  createMailConnectorForAccount,
  createMailboxDraft,
  deleteMailboxAccount,
  deleteMailboxAttachment,
  deleteMailboxThreadPermanent,
  deliverInternalMailboxMessage,
  emptyMailboxTrash,
  ensureInternalMailboxAccount,
  ensureLinkedMailboxCalendarForAccount,
  exchangeGoogleOAuthCode,
  exchangeMicrosoftOAuthCode,
  ensurePlatformModuleSettingsRow,
  getMailboxAccountById,
  getMailboxCalendarByAccountId,
  getMailboxInboxById,
  getMailboxAttachmentById,
  getMailboxCalendarById,
  getMailboxCalendarEventById,
  getMailboxCalendarEventBySourceMessageId,
  getMailboxMessageById,
  getMailboxThreadById,
  deleteMailboxAccountMemberForInbox,
  ensureInternalMailboxAccountForAgent,
  getAgentMailboxInbox,
  getWorkforceEmployeeById,
  insertImapMailboxAccount,
  insertImapMailboxAccountForAgent,
  insertMailboxAttachment,
  insertMailboxMessage,
  insertOAuthMailboxAccount,
  insertOAuthMailboxAccountForAgent,
  insertSharedMailboxAccount,
  listMailboxAccountMembers,
  listMailboxAccountsForUser,
  listMailboxConnectionsForInbox,
  listMailboxInboxesForUser,
  upsertMailboxAccountMemberForInbox,
  listMailboxThreadsForInbox,
  listMailboxAttachmentRowsForMessage,
  listMailboxCalendarEvents,
  listMailboxEventAttendees,
  listMailboxMessagesForThread,
  listMailboxThreads,
  MailboxOAuthNotConfiguredError,
  markMailboxMessagesRead,
  markMailboxMessagesUnread,
  mailboxAttachmentStorageExt,
  parseMailboxAddressJson,
  parseAndUpsertIcsInvite,
  extractIcsFromMailboxMessage,
  messageBodyLooksLikeMeetingInvite,
  fetchMicrosoftMessageCalendarIcs,
  resolveMicrosoftAccessToken,
  parseMailboxAddressesJson,
  reassignMailboxAttachmentsMessage,
  replaceMailboxEventAttendees,
  deleteMailboxCalendarEventRow,
  updateMailboxCalendarEventRow,
  resolveMailboxThreadFolderMove,
  reconnectOAuthMailboxAccount,
  updateMailboxEventAttendeeResponse,
  updateMailboxDraftMessage,
  updateMailboxThread,
  upsertMailboxAccountMember,
  upsertMailboxCalendarEventFromProvider,
  userCanAccessMailboxAccount,
  userCanAccessMailboxInbox,
  userCanManageMailboxAccount,
  userCanSendFromMailboxAccount,
  upsertMailboxThread
} from "@starter/db";
import {
  MAILBOX_ATTACHMENT_BLOCKED_EXTENSIONS,
  MAILBOX_ATTACHMENT_MAX_FILE_BYTES,
  MAILBOX_ATTACHMENT_MAX_FILES_PER_MESSAGE,
  MAILBOX_ATTACHMENT_MAX_TOTAL_BYTES,
  mailboxAccountIdParamsSchema,
  mailboxAccountMemberPutBodySchema,
  mailboxAttachmentIdParamsSchema,
  mailboxCalendarEventsQuerySchema,
  mailboxCalendarEventCreateBodySchema,
  mailboxCalendarEventUpdateBodySchema,
  mailboxCalendarEventDeleteBodySchema,
  parseMailboxCalendarEventExtras,
  mailboxComposeBodySchema,
  mailboxConnectionTypeLabel,
  mailboxDraftBodySchema,
  mailboxDraftMessageIdParamsSchema,
  mailboxEventIdParamsSchema,
  mailboxEventRsvpBodySchema,
  mailboxAgentEmployeeIdParamsSchema,
  mailboxAgentImapConnectBodySchema,
  mailboxImapConnectBodySchema,
  mailboxMessageIdParamsSchema,
  mailboxOAuthProviderSchema,
  workforceEmployeeDisplayName,
  mailboxSharedAccountCreateBodySchema,
  mailboxThreadIdParamsSchema,
  mailboxThreadPatchSchema,
  mailboxThreadsBulkPatchSchema,
  mailboxThreadsEmptyTrashQuerySchema,
  mailboxThreadsQuerySchema,
  parseMailboxInternalHeaders,
  resolveModuleRole,
  isMailboxOAuthReconnectRequired
} from "@starter/shared";

import { enqueueMailboxParseInvite, enqueueMailboxSyncAccount } from "../lib/mailbox-queue.js";
import { getMailboxAccountSyncJobs } from "../lib/mailbox-sync-status.js";
import {
  tryPushEmptyProviderTrash,
  tryPushPermanentDelete,
  tryPushThreadFolderMove,
  tryPushThreadReadState,
  tryPushThreadStarState,
  tryPushThreadsBulk
} from "../lib/mailbox-provider-push.js";
import {
  assertMailboxAttachmentUpload,
  deleteMailboxAttachmentBlob,
  readMailboxAttachmentBytes,
  writeMailboxAttachmentBytes
} from "../lib/mailbox-attachment-storage.js";
import { rewriteInvoicingEmailFooterCidsForBrowserPreview } from "../lib/invoicing-email-footer-icons.js";
import { sanitizeMailboxComposeHtml } from "../lib/mailbox-compose-html.js";
import {
  applyRecurrenceScopeToExtras,
  buildCalendarEventExtrasJson,
  resolveCalendarEventAttendees,
  serializeMailboxCalendarEventResponse
} from "../lib/mailbox-calendar-event-mutate.js";
import { requireMailboxModulePermission } from "../plugins/module-permission.js";
import { requireTenantMember } from "../plugins/tenant-member.js";
import { requireTenantRealm } from "../plugins/tenant-realm.js";
import { requireTenantContext } from "../plugins/tenant.js";

const iso = (d: Date) => d.toISOString();

const requireMailboxModuleEnabled = async (_request: FastifyRequest, reply: FastifyReply) => {
  const row = await ensurePlatformModuleSettingsRow();
  if (!row.mailboxEnabled) {
    return reply.code(403).send({
      error: "feature_disabled",
      message: "Mailbox is disabled by the platform administrator."
    });
  }
};

/** Agent mailbox APIs require both mailbox and workforce (HRM) platform flags. */
const assertMailboxAndWorkforceEnabled = async (reply: FastifyReply): Promise<boolean> => {
  const row = await ensurePlatformModuleSettingsRow();
  if (!row.mailboxEnabled || !row.hrmEnabled) {
    await reply.code(403).send({
      error: "feature_disabled",
      message: "Mailbox and Workforce must both be enabled to manage agent mailboxes."
    });
    return false;
  }
  return true;
};

const loadAgentEmployeeOrReply = async (
  tenantId: string,
  employeeId: string,
  reply: FastifyReply
) => {
  const employee = await getWorkforceEmployeeById(tenantId, employeeId);
  if (!employee || employee.employeeKind !== "agent") {
    await reply.code(404).send({ error: "not_found", message: "Agent employee not found." });
    return null;
  }
  return employee;
};


const oauthStateSecret = () => process.env.JWT_ACCESS_SECRET ?? "dev-mailbox-oauth-state";

const signOAuthState = (payload: {
  tenantId: string;
  userId: string;
  provider: string;
  nonce: string;
  accountId?: string;
  employeeId?: string;
}) => {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", oauthStateSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
};

const verifyOAuthState = (state: string) => {
  const [body, sig] = state.split(".");
  if (!body || !sig) throw new Error("invalid_state");
  const expected = createHmac("sha256", oauthStateSecret()).update(body).digest("base64url");
  if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) {
    throw new Error("invalid_state");
  }
  return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
    tenantId: string;
    userId: string;
    provider: string;
    nonce: string;
    accountId?: string;
    employeeId?: string;
  };
};

const mailboxOAuthProviderForAccount = (provider: string): "google" | "microsoft" | null => {
  if (provider === "gmail") return "google";
  if (provider === "microsoft") return "microsoft";
  return null;
};

const normalizeMailboxEmail = (email: string): string => email.trim().toLowerCase();

const serializeAccount = (row: Awaited<ReturnType<typeof getMailboxAccountById>>) => ({
  id: row!.id,
  ownerScope: row!.ownerScope,
  ownerUserId: row!.ownerUserId,
  displayName: row!.displayName,
  emailAddress: row!.emailAddress,
  provider: row!.provider,
  connectionType: mailboxConnectionTypeLabel(row!.provider),
  syncStatus: row!.syncStatus,
  syncError: row!.syncError,
  lastSyncedAt: row!.lastSyncedAt ? iso(row!.lastSyncedAt) : null,
  createdAt: iso(row!.createdAt),
  updatedAt: iso(row!.updatedAt)
});

const serializeInbox = (row: Awaited<ReturnType<typeof getMailboxInboxById>>) => ({
  id: row!.id,
  ownerScope: row!.ownerScope,
  ownerUserId: row!.ownerUserId,
  ownerEmployeeId: row!.ownerEmployeeId,
  displayName: row!.displayName,
  color: row!.color,
  createdAt: iso(row!.createdAt),
  updatedAt: iso(row!.updatedAt)
});

const serializeConnection = (row: NonNullable<Awaited<ReturnType<typeof getMailboxAccountById>>>) => ({
  id: row.id,
  inboxId: row.mailboxInboxId,
  displayName: row.displayName,
  emailAddress: row.emailAddress,
  provider: row.provider,
  connectionType: mailboxConnectionTypeLabel(row.provider),
  isSystemNotifications: row.provider === "internal",
  color: row.color,
  syncStatus: row.syncStatus,
  syncError: row.syncError,
  lastSyncedAt: row.lastSyncedAt ? iso(row.lastSyncedAt) : null,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt)
});

const serializeThread = (row: Awaited<ReturnType<typeof getMailboxThreadById>>) => ({
  id: row!.id,
  accountId: row!.accountId,
  subject: row!.subjectNormalized,
  snippet: row!.snippet,
  folder: row!.folder,
  lastMessageAt: iso(row!.lastMessageAt),
  unreadCount: row!.unreadCount,
  isStarred: row!.isStarred,
  from: row!.lastFromJson ? parseMailboxAddressJson(row!.lastFromJson) : null,
  hasCalendarInvite: Boolean(row!.lastHasCalendarInvite)
});

const serializeMessage = async (
  tenantId: string,
  row: Awaited<ReturnType<typeof getMailboxMessageById>>,
  attachments: Awaited<ReturnType<typeof listMailboxAttachmentRowsForMessage>> = [],
  userId?: string,
  account?: Awaited<ReturnType<typeof getMailboxAccountById>>
) => {
  const { embeddedSentEmail } = parseMailboxInternalHeaders(row!.headersJson);
  let calendarEvent = row!.hasCalendarInvite
    ? await getMailboxCalendarEventBySourceMessageId(tenantId, row!.id)
    : undefined;
  const shouldRepairCalendarInvite =
    !calendarEvent &&
    userId &&
    (row!.hasCalendarInvite || messageBodyLooksLikeMeetingInvite(row!));
  if (shouldRepairCalendarInvite) {
    let icsContent = extractIcsFromMailboxMessage(row!);
    if (
      !icsContent &&
      account?.provider === "microsoft" &&
      account.oauthRefreshTokenEncrypted &&
      row!.providerMessageId
    ) {
      try {
        const token = await resolveMicrosoftAccessToken(account);
        icsContent = await fetchMicrosoftMessageCalendarIcs(token, row!.providerMessageId);
      } catch {
        // Best-effort provider fetch; thread read should still succeed.
      }
    }
    if (icsContent) {
      try {
        await parseAndUpsertIcsInvite({
          tenantId,
          userId,
          sourceMessageId: row!.id,
          icsContent
        });
        calendarEvent = await getMailboxCalendarEventBySourceMessageId(tenantId, row!.id);
      } catch {
        // Invite parsing is best-effort; thread read should still succeed.
      }
    }
  }
  const hasCalendarInvite = row!.hasCalendarInvite || Boolean(calendarEvent);
  return {
    id: row!.id,
    threadId: row!.threadId,
    accountId: row!.accountId,
    direction: row!.direction,
    from: parseMailboxAddressJson(row!.fromJson),
    to: parseMailboxAddressesJson(row!.toJson),
    cc: parseMailboxAddressesJson(row!.ccJson),
    bcc: parseMailboxAddressesJson(row!.bccJson),
    subject: row!.subject,
    snippet: row!.snippet,
    bodyText: row!.bodyText,
    bodyHtml: row!.bodyHtml,
    internalSource: row!.internalSource,
    actionUrl: row!.actionUrl,
    relatedEntityKind: row!.relatedEntityKind,
    relatedEntityId: row!.relatedEntityId,
    embeddedSentEmail: embeddedSentEmail
      ? {
          ...embeddedSentEmail,
          bodyHtml: await rewriteInvoicingEmailFooterCidsForBrowserPreview(embeddedSentEmail.bodyHtml)
        }
      : null,
    receivedAt: iso(row!.receivedAt),
    isRead: row!.isRead,
    isDraft: row!.isDraft,
    hasAttachments: row!.hasAttachments,
    hasCalendarInvite,
    calendarInvite: calendarEvent
      ? {
          eventId: calendarEvent.id,
          status: calendarEvent.status,
          organizer: parseMailboxAddressJson(calendarEvent.organizerJson)
        }
      : null,
    attachments: attachments.map((a) => ({
      id: a.id,
      filename: a.filename,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes
    }))
  };
};

const resolveComposeAccount = async (
  tenantId: string,
  userId: string,
  isTenantAdmin: boolean,
  preferredAccountId?: string
) => {
  await ensureInternalMailboxAccount(tenantId, userId);
  const accounts = await listMailboxAccountsForUser(tenantId, userId);
  const tryAccount = async (account: (typeof accounts)[number]) => {
    const allowed = await userCanAccessMailboxAccount(tenantId, userId, account, isTenantAdmin);
    return allowed ? account : null;
  };
  if (preferredAccountId) {
    const account = accounts.find((a) => a.id === preferredAccountId);
    if (!account) return null;
    return tryAccount(account);
  }
  const external = accounts.filter((a) => a.provider !== "internal");
  for (const account of external.length > 0 ? external : accounts) {
    const picked = await tryAccount(account);
    if (picked) return picked;
  }
  return null;
};

export const registerTenantMailboxRoutes = async (app: FastifyInstance) => {
  app.get(
    "/availability",
    { preHandler: [requireTenantContext, requireTenantRealm, requireTenantMember] },
    async (request) => {
      const row = await ensurePlatformModuleSettingsRow();
      const mailboxRole = row.mailboxEnabled
        ? resolveModuleRole("mailbox", request.role ?? "tenant_user", request.moduleRoles ?? {})
        : null;
      return { mailboxEnabled: row.mailboxEnabled, mailboxRole };
    }
  );

  await app.register(async (mailboxScope) => {
    mailboxScope.addHook("preHandler", requireTenantContext);
    mailboxScope.addHook("preHandler", requireTenantRealm);
    mailboxScope.addHook("preHandler", requireTenantMember);
    mailboxScope.addHook("preHandler", requireMailboxModuleEnabled);
    mailboxScope.addHook("preHandler", requireMailboxModulePermission);

    mailboxScope.get("/accounts", async (request) => {
      const tenantId = request.tenantId!;
      const userId = request.userId!;
      const inboxes = await listMailboxInboxesForUser(tenantId, userId, {
        isTenantAdmin: request.role === "tenant_admin"
      });
      const accounts = await Promise.all(
        inboxes.map(async (inbox) => {
          const connections = await listMailboxConnectionsForInbox(tenantId, inbox.id);
          return {
            ...serializeInbox(inbox),
            connections: connections.map((connection) => serializeConnection(connection))
          };
        })
      );
      return { accounts };
    });

    mailboxScope.get("/inboxes/:inboxId/connections", async (request, reply) => {
      const params = mailboxAccountIdParamsSchema.safeParse({ accountId: (request.params as { inboxId: string }).inboxId });
      if (!params.success) return reply.code(400).send({ error: "validation_error" });
      const inbox = await getMailboxInboxById(request.tenantId!, params.data.accountId);
      if (!inbox) return reply.code(404).send({ error: "not_found" });
      const allowed = await userCanAccessMailboxInbox(
        request.tenantId!,
        request.userId!,
        inbox,
        request.role === "tenant_admin"
      );
      if (!allowed) return reply.code(403).send({ error: "forbidden" });
      const connections = await listMailboxConnectionsForInbox(request.tenantId!, inbox.id);
      return { connections: connections.map((connection) => serializeConnection(connection)) };
    });

    mailboxScope.post("/accounts/imap", async (request, reply) => {
      const parsed = mailboxImapConnectBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
      }
      const tenantId = request.tenantId!;
      const userId = request.userId!;
      const account = await insertImapMailboxAccount({
        tenantId,
        userId,
        displayName: parsed.data.displayName ?? parsed.data.emailAddress,
        ...parsed.data
      });
      await enqueueMailboxSyncAccount({ tenantId, accountId: account.id });
      return reply.code(201).send({ connection: serializeConnection(account) });
    });

    mailboxScope.post("/accounts/shared", async (request, reply) => {
      const parsed = mailboxSharedAccountCreateBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
      }
      if (request.role !== "tenant_admin") {
        return reply.code(403).send({ error: "forbidden", message: "Only tenant administrators can create shared mailboxes." });
      }
      const account = await insertSharedMailboxAccount({
        tenantId: request.tenantId!,
        createdByUserId: request.userId!,
        ...parsed.data
      });
      const inbox = await getMailboxInboxById(request.tenantId!, account.mailboxInboxId);
      return reply.code(201).send({ account: inbox ? serializeInbox(inbox) : serializeConnection(account) });
    });

    mailboxScope.delete("/accounts/:accountId", async (request, reply) => {
      const params = mailboxAccountIdParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "validation_error" });
      const account = await getMailboxAccountById(request.tenantId!, params.data.accountId);
      if (!account) return reply.code(404).send({ error: "not_found" });
      if (account.provider === "internal") {
        return reply.code(400).send({ error: "cannot_delete_internal", message: "Internal accounts cannot be removed." });
      }
      const isTenantAdmin = request.role === "tenant_admin";
      const allowed =
        account.ownerScope === "user"
          ? await userCanAccessMailboxAccount(request.tenantId!, request.userId!, account, isTenantAdmin)
          : await userCanManageMailboxAccount(request.tenantId!, request.userId!, account, isTenantAdmin);
      if (!allowed) return reply.code(403).send({ error: "forbidden" });
      await deleteMailboxAccount(request.tenantId!, account.id);
      return reply.code(204).send();
    });

    mailboxScope.get("/accounts/:accountId/members", async (request, reply) => {
      const params = mailboxAccountIdParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "validation_error" });
      const account = await getMailboxAccountById(request.tenantId!, params.data.accountId);
      if (!account || (account.ownerScope !== "tenant_shared" && account.ownerScope !== "workforce_agent")) {
        return reply.code(404).send({ error: "not_found" });
      }
      const allowed = await userCanAccessMailboxAccount(
        request.tenantId!,
        request.userId!,
        account,
        request.role === "tenant_admin"
      );
      if (!allowed) return reply.code(403).send({ error: "forbidden" });
      const members = await listMailboxAccountMembers(request.tenantId!, account.id);
      return { members };
    });

    mailboxScope.put("/accounts/:accountId/members", async (request, reply) => {
      const params = mailboxAccountIdParamsSchema.safeParse(request.params);
      const body = mailboxAccountMemberPutBodySchema.safeParse(request.body);
      if (!params.success || !body.success) return reply.code(400).send({ error: "validation_error" });
      const account = await getMailboxAccountById(request.tenantId!, params.data.accountId);
      if (!account || (account.ownerScope !== "tenant_shared" && account.ownerScope !== "workforce_agent")) {
        return reply.code(404).send({ error: "not_found" });
      }
      const canManage = await userCanManageMailboxAccount(
        request.tenantId!,
        request.userId!,
        account,
        request.role === "tenant_admin"
      );
      if (!canManage) return reply.code(403).send({ error: "forbidden" });
      if (account.ownerScope === "workforce_agent") {
        await upsertMailboxAccountMemberForInbox({
          tenantId: request.tenantId!,
          inboxId: account.mailboxInboxId,
          userId: body.data.userId,
          role: body.data.role
        });
      } else {
        await upsertMailboxAccountMember({
          tenantId: request.tenantId!,
          accountId: account.id,
          userId: body.data.userId,
          role: body.data.role
        });
      }
      return reply.code(204).send();
    });


    mailboxScope.get("/agents/:employeeId/accounts", async (request, reply) => {
      if (!(await assertMailboxAndWorkforceEnabled(reply))) return;
      const params = mailboxAgentEmployeeIdParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "validation_error" });
      const employee = await loadAgentEmployeeOrReply(request.tenantId!, params.data.employeeId, reply);
      if (!employee) return;
      const inbox = await getAgentMailboxInbox(request.tenantId!, employee.id);
      if (!inbox) return { connections: [] as const, inbox: null };
      const allowed = await userCanAccessMailboxInbox(
        request.tenantId!,
        request.userId!,
        inbox,
        request.role === "tenant_admin"
      );
      if (!allowed) return reply.code(403).send({ error: "forbidden" });
      const connections = await listMailboxConnectionsForInbox(request.tenantId!, inbox.id);
      return {
        inbox: serializeInbox(inbox),
        connections: connections.map((connection) => serializeConnection(connection))
      };
    });

    mailboxScope.post("/agents/:employeeId/accounts/imap", async (request, reply) => {
      if (!(await assertMailboxAndWorkforceEnabled(reply))) return;
      const params = mailboxAgentEmployeeIdParamsSchema.safeParse(request.params);
      const parsed = mailboxAgentImapConnectBodySchema.safeParse(request.body);
      if (!params.success || !parsed.success) {
        return reply.code(400).send({ error: "validation_error", details: parsed.success ? undefined : parsed.error.flatten() });
      }
      if (request.role !== "tenant_admin") {
        return reply.code(403).send({ error: "forbidden", message: "Only tenant administrators can connect agent mailboxes." });
      }
      const employee = await loadAgentEmployeeOrReply(request.tenantId!, params.data.employeeId, reply);
      if (!employee) return;
      const inboxDisplayName = workforceEmployeeDisplayName(employee.firstName, employee.lastName);
      const account = await insertImapMailboxAccountForAgent({
        tenantId: request.tenantId!,
        employeeId: employee.id,
        inboxDisplayName,
        displayName: parsed.data.displayName ?? parsed.data.emailAddress,
        ...parsed.data
      });
      await enqueueMailboxSyncAccount({ tenantId: request.tenantId!, accountId: account.id });
      return reply.code(201).send({ connection: serializeConnection(account) });
    });

    mailboxScope.get("/agents/:employeeId/oauth/:provider/start", async (request, reply) => {
      if (!(await assertMailboxAndWorkforceEnabled(reply))) return;
      const params = mailboxAgentEmployeeIdParamsSchema.safeParse({
        employeeId: (request.params as { employeeId: string }).employeeId
      });
      const provider = mailboxOAuthProviderSchema.safeParse((request.params as { provider: string }).provider);
      if (!params.success || !provider.success) return reply.code(400).send({ error: "validation_error" });
      if (request.role !== "tenant_admin") {
        return reply.code(403).send({ error: "forbidden", message: "Only tenant administrators can connect agent mailboxes." });
      }
      const employee = await loadAgentEmployeeOrReply(request.tenantId!, params.data.employeeId, reply);
      if (!employee) return;
      const apiOrigin = process.env.API_PUBLIC_ORIGIN ?? `http://localhost:${process.env.API_PORT ?? "3000"}`;
      const redirectUri = `${apiOrigin}/v1/tenant/mailbox/oauth/${provider.data}/callback`;
      const state = signOAuthState({
        tenantId: request.tenantId!,
        userId: request.userId!,
        provider: provider.data,
        nonce: randomBytes(16).toString("hex"),
        employeeId: employee.id
      });
      try {
        const url =
          provider.data === "google"
            ? buildGoogleOAuthAuthorizeUrl({ redirectUri, state })
            : buildMicrosoftOAuthAuthorizeUrl({ redirectUri, state });
        return { url };
      } catch (err) {
        if (err instanceof MailboxOAuthNotConfiguredError) {
          return reply.code(503).send({ error: err.code, message: err.message });
        }
        throw err;
      }
    });

    mailboxScope.get("/agents/:employeeId/members", async (request, reply) => {
      if (!(await assertMailboxAndWorkforceEnabled(reply))) return;
      const params = mailboxAgentEmployeeIdParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "validation_error" });
      const employee = await loadAgentEmployeeOrReply(request.tenantId!, params.data.employeeId, reply);
      if (!employee) return;
      const inbox = await getAgentMailboxInbox(request.tenantId!, employee.id);
      if (!inbox) return { members: [] as const };
      const allowed = await userCanAccessMailboxInbox(
        request.tenantId!,
        request.userId!,
        inbox,
        request.role === "tenant_admin"
      );
      if (!allowed) return reply.code(403).send({ error: "forbidden" });
      const connections = await listMailboxConnectionsForInbox(request.tenantId!, inbox.id);
      const byUser = new Map<string, { id: string; userId: string; role: "viewer" | "sender" | "admin" }>();
      for (const connection of connections) {
        for (const member of await listMailboxAccountMembers(request.tenantId!, connection.id)) {
          if (!byUser.has(member.userId)) byUser.set(member.userId, member);
        }
      }
      return { members: [...byUser.values()] };
    });

    mailboxScope.put("/agents/:employeeId/members", async (request, reply) => {
      if (!(await assertMailboxAndWorkforceEnabled(reply))) return;
      const params = mailboxAgentEmployeeIdParamsSchema.safeParse(request.params);
      const body = mailboxAccountMemberPutBodySchema.safeParse(request.body);
      if (!params.success || !body.success) return reply.code(400).send({ error: "validation_error" });
      if (request.role !== "tenant_admin") {
        return reply.code(403).send({ error: "forbidden" });
      }
      const employee = await loadAgentEmployeeOrReply(request.tenantId!, params.data.employeeId, reply);
      if (!employee) return;
      const inboxDisplayName = workforceEmployeeDisplayName(employee.firstName, employee.lastName);
      await ensureInternalMailboxAccountForAgent(request.tenantId!, employee.id, inboxDisplayName);
      const inbox = await getAgentMailboxInbox(request.tenantId!, employee.id);
      if (!inbox) return reply.code(500).send({ error: "inbox_missing" });
      await upsertMailboxAccountMemberForInbox({
        tenantId: request.tenantId!,
        inboxId: inbox.id,
        userId: body.data.userId,
        role: body.data.role
      });
      return reply.code(204).send();
    });

    mailboxScope.delete("/agents/:employeeId/members/:userId", async (request, reply) => {
      if (!(await assertMailboxAndWorkforceEnabled(reply))) return;
      const params = mailboxAgentEmployeeIdParamsSchema.safeParse({
        employeeId: (request.params as { employeeId: string }).employeeId
      });
      const userId =
        typeof (request.params as { userId?: string }).userId === "string"
          ? (request.params as { userId: string }).userId
          : null;
      if (!params.success || !userId) return reply.code(400).send({ error: "validation_error" });
      if (request.role !== "tenant_admin") {
        return reply.code(403).send({ error: "forbidden" });
      }
      const employee = await loadAgentEmployeeOrReply(request.tenantId!, params.data.employeeId, reply);
      if (!employee) return;
      const inbox = await getAgentMailboxInbox(request.tenantId!, employee.id);
      if (!inbox) return reply.code(404).send({ error: "not_found" });
      await deleteMailboxAccountMemberForInbox(request.tenantId!, inbox.id, userId);
      return reply.code(204).send();
    });

    mailboxScope.get("/oauth/:provider/start", async (request, reply) => {
      const provider = mailboxOAuthProviderSchema.safeParse((request.params as { provider: string }).provider);
      if (!provider.success) return reply.code(400).send({ error: "validation_error" });
      const apiOrigin = process.env.API_PUBLIC_ORIGIN ?? `http://localhost:${process.env.API_PORT ?? "3000"}`;
      const redirectUri = `${apiOrigin}/v1/tenant/mailbox/oauth/${provider.data}/callback`;
      const state = signOAuthState({
        tenantId: request.tenantId!,
        userId: request.userId!,
        provider: provider.data,
        nonce: randomBytes(16).toString("hex")
      });
      try {
        const url =
          provider.data === "google"
            ? buildGoogleOAuthAuthorizeUrl({ redirectUri, state })
            : buildMicrosoftOAuthAuthorizeUrl({ redirectUri, state });
        return { url };
      } catch (err) {
        if (err instanceof MailboxOAuthNotConfiguredError) {
          return reply.code(503).send({
            error: err.code,
            message: err.message
          });
        }
        throw err;
      }
    });

    mailboxScope.post("/accounts/:accountId/reconnect/start", async (request, reply) => {
      const params = mailboxAccountIdParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "validation_error" });
      const account = await getMailboxAccountById(request.tenantId!, params.data.accountId);
      if (!account) return reply.code(404).send({ error: "not_found" });
      if (account.provider === "internal") {
        return reply.code(400).send({ error: "cannot_reconnect_internal" });
      }
      const oauthProvider = mailboxOAuthProviderForAccount(account.provider);
      if (!oauthProvider) {
        return reply.code(400).send({
          error: "reconnect_not_supported",
          message: "Only Gmail and Microsoft 365 accounts can be reconnected here."
        });
      }
      const allowed = await userCanAccessMailboxAccount(
        request.tenantId!,
        request.userId!,
        account,
        request.role === "tenant_admin"
      );
      if (!allowed) return reply.code(403).send({ error: "forbidden" });
      if (
        account.syncStatus !== "error" ||
        !account.syncError ||
        !isMailboxOAuthReconnectRequired(account.syncError)
      ) {
        return reply.code(400).send({
          error: "reconnect_not_needed",
          message: "This account does not need to be reconnected right now."
        });
      }

      const apiOrigin = process.env.API_PUBLIC_ORIGIN ?? `http://localhost:${process.env.API_PORT ?? "3000"}`;
      const redirectUri = `${apiOrigin}/v1/tenant/mailbox/oauth/${oauthProvider}/callback`;
      const state = signOAuthState({
        tenantId: request.tenantId!,
        userId: request.userId!,
        provider: oauthProvider,
        nonce: randomBytes(16).toString("hex"),
        accountId: account.id
      });
      try {
        const url =
          oauthProvider === "google"
            ? buildGoogleOAuthAuthorizeUrl({
                redirectUri,
                state,
                loginHint: account.emailAddress
              })
            : buildMicrosoftOAuthAuthorizeUrl({
                redirectUri,
                state,
                loginHint: account.emailAddress
              });
        return { url };
      } catch (err) {
        if (err instanceof MailboxOAuthNotConfiguredError) {
          return reply.code(503).send({
            error: err.code,
            message: err.message
          });
        }
        throw err;
      }
    });

    mailboxScope.get("/threads", async (request, reply) => {
      const parsed = mailboxThreadsQuerySchema.safeParse(request.query);
      if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
      let inbox = await getMailboxInboxById(request.tenantId!, parsed.data.accountId);
      let connectionId = parsed.data.connectionId;
      if (!inbox) {
        const connection = await getMailboxAccountById(request.tenantId!, parsed.data.accountId);
        if (connection) {
          inbox = await getMailboxInboxById(request.tenantId!, connection.mailboxInboxId);
          connectionId = connectionId ?? connection.id;
        }
      }
      if (!inbox) return reply.code(404).send({ error: "not_found" });
      const allowed = await userCanAccessMailboxInbox(
        request.tenantId!,
        request.userId!,
        inbox,
        request.role === "tenant_admin"
      );
      if (!allowed) return reply.code(403).send({ error: "forbidden" });
      const threads = await listMailboxThreadsForInbox({
        tenantId: request.tenantId!,
        inboxId: inbox.id,
        connectionId,
        folder: parsed.data.folder,
        q: parsed.data.q,
        limit: parsed.data.limit,
        offset: parsed.data.offset
      });
      return { threads: threads.map((t) => serializeThread(t)) };
    });

    mailboxScope.get("/threads/:threadId", async (request, reply) => {
      const params = mailboxThreadIdParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "validation_error" });
      const thread = await getMailboxThreadById(request.tenantId!, params.data.threadId);
      if (!thread) return reply.code(404).send({ error: "not_found" });
      const account = await getMailboxAccountById(request.tenantId!, thread.accountId);
      if (!account) return reply.code(404).send({ error: "not_found" });
      const allowed = await userCanAccessMailboxAccount(
        request.tenantId!,
        request.userId!,
        account,
        request.role === "tenant_admin"
      );
      if (!allowed) return reply.code(403).send({ error: "forbidden" });
      const messages = await listMailboxMessagesForThread(request.tenantId!, thread.id);
      const serialized = await Promise.all(
        messages.map(async (m) => {
          const attachments = m.hasAttachments
            ? await listMailboxAttachmentRowsForMessage(request.tenantId!, m.id)
            : [];
          return serializeMessage(request.tenantId!, m, attachments, request.userId!, account);
        })
      );
      return { thread: serializeThread(thread), messages: serialized };
    });

    mailboxScope.patch("/threads/:threadId", async (request, reply) => {
      const params = mailboxThreadIdParamsSchema.safeParse(request.params);
      const body = mailboxThreadPatchSchema.safeParse(request.body);
      if (!params.success || !body.success) return reply.code(400).send({ error: "validation_error" });
      const thread = await getMailboxThreadById(request.tenantId!, params.data.threadId);
      if (!thread) return reply.code(404).send({ error: "not_found" });
      const account = await getMailboxAccountById(request.tenantId!, thread.accountId);
      if (!account) return reply.code(404).send({ error: "not_found" });
      const allowed = await userCanAccessMailboxAccount(
        request.tenantId!,
        request.userId!,
        account,
        request.role === "tenant_admin"
      );
      if (!allowed) return reply.code(403).send({ error: "forbidden" });
      if (body.data.isRead === true) await markMailboxMessagesRead(request.tenantId!, thread.id);
      if (body.data.isRead === false) await markMailboxMessagesUnread(request.tenantId!, thread.id);
      if (body.data.isRead !== undefined) {
        await tryPushThreadReadState({
          log: request.log,
          tenantId: request.tenantId!,
          account,
          threadId: thread.id,
          isRead: body.data.isRead
        });
      }
      if (body.data.folder) {
        const resolved = resolveMailboxThreadFolderMove(thread, body.data.folder);
        if ("error" in resolved) {
          return reply.code(400).send({
            error: resolved.error,
            message: "Only inbox messages can be archived."
          });
        }
        await applyMailboxThreadFolderMove(request.tenantId!, thread.id, body.data.folder);
        await tryPushThreadFolderMove({
          log: request.log,
          tenantId: request.tenantId!,
          account,
          threadId: thread.id,
          folder: resolved.folder,
          previousFolder: thread.folder
        });
      }
      if (body.data.isStarred !== undefined) {
        await updateMailboxThread(request.tenantId!, thread.id, { isStarred: body.data.isStarred });
        await tryPushThreadStarState({
          log: request.log,
          tenantId: request.tenantId!,
          account,
          threadId: thread.id,
          isStarred: body.data.isStarred
        });
      }
      const updated = await getMailboxThreadById(request.tenantId!, thread.id);
      return { thread: serializeThread(updated) };
    });

    mailboxScope.post("/threads/bulk", async (request, reply) => {
      const body = mailboxThreadsBulkPatchSchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });
      const inbox = await getMailboxInboxById(request.tenantId!, body.data.accountId);
      if (!inbox) return reply.code(404).send({ error: "not_found" });
      const allowed = await userCanAccessMailboxInbox(
        request.tenantId!,
        request.userId!,
        inbox,
        request.role === "tenant_admin"
      );
      if (!allowed) return reply.code(403).send({ error: "forbidden" });
      if (body.data.folder === "archive") {
        for (const threadId of body.data.threadIds) {
          const thread = await getMailboxThreadById(request.tenantId!, threadId);
          if (thread && thread.folder !== "inbox") {
            return reply.code(400).send({
              error: "archive_inbox_only",
              message: "Only inbox messages can be archived."
            });
          }
        }
      }
      const folderPushContext =
        body.data.folder != null
          ? (
              await Promise.all(
                body.data.threadIds.map(async (threadId) => {
                  const thread = await getMailboxThreadById(request.tenantId!, threadId);
                  const account = thread
                    ? await getMailboxAccountById(request.tenantId!, thread.accountId)
                    : undefined;
                  return thread && account
                    ? { threadId, account, previousFolder: thread.folder }
                    : undefined;
                })
              )
            ).filter((entry): entry is NonNullable<typeof entry> => entry != null)
          : [];
      const threads = await bulkPatchMailboxThreads({
        tenantId: request.tenantId!,
        accountId: body.data.accountId,
        threadIds: body.data.threadIds,
        isRead: body.data.isRead,
        isStarred: body.data.isStarred,
        folder: body.data.folder
      });
      if (body.data.isRead !== undefined) {
        await tryPushThreadsBulk({
          log: request.log,
          tenantId: request.tenantId!,
          threadIds: body.data.threadIds,
          operation: { type: "read", isRead: body.data.isRead }
        });
      }
      if (body.data.isStarred !== undefined) {
        await tryPushThreadsBulk({
          log: request.log,
          tenantId: request.tenantId!,
          threadIds: body.data.threadIds,
          operation: { type: "star", isStarred: body.data.isStarred }
        });
      }
      if (body.data.folder) {
        for (const entry of folderPushContext) {
          const thread = await getMailboxThreadById(request.tenantId!, entry.threadId);
          if (!thread) continue;
          const resolved = resolveMailboxThreadFolderMove(
            { ...thread, folder: entry.previousFolder },
            body.data.folder!
          );
          if ("error" in resolved) continue;
          await tryPushThreadFolderMove({
            log: request.log,
            tenantId: request.tenantId!,
            account: entry.account,
            threadId: entry.threadId,
            folder: resolved.folder,
            previousFolder: entry.previousFolder
          });
        }
      }
      return { threads: threads.map((t) => serializeThread(t)) };
    });

    mailboxScope.delete("/threads/trash", async (request, reply) => {
      const parsed = mailboxThreadsEmptyTrashQuerySchema.safeParse(request.query);
      if (!parsed.success) return reply.code(400).send({ error: "validation_error" });
      const inbox = await getMailboxInboxById(request.tenantId!, parsed.data.accountId);
      if (!inbox) return reply.code(404).send({ error: "not_found" });
      const allowed = await userCanAccessMailboxInbox(
        request.tenantId!,
        request.userId!,
        inbox,
        request.role === "tenant_admin"
      );
      if (!allowed) return reply.code(403).send({ error: "forbidden" });
      await tryPushEmptyProviderTrash({
        log: request.log,
        tenantId: request.tenantId!,
        inboxId: inbox.id
      });
      const blobPaths = await emptyMailboxTrash(request.tenantId!, inbox.id);
      for (const blobPath of blobPaths) {
        await deleteMailboxAttachmentBlob(blobPath);
      }
      return reply.code(204).send();
    });

    mailboxScope.delete("/threads/:threadId", async (request, reply) => {
      const params = mailboxThreadIdParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "validation_error" });
      const thread = await getMailboxThreadById(request.tenantId!, params.data.threadId);
      if (!thread) return reply.code(404).send({ error: "not_found" });
      if (thread.folder !== "trash" && thread.folder !== "drafts") {
        return reply.code(400).send({ error: "not_in_trash", message: "Move the thread to trash before deleting permanently." });
      }
      const account = await getMailboxAccountById(request.tenantId!, thread.accountId);
      if (!account) return reply.code(404).send({ error: "not_found" });
      const allowed = await userCanAccessMailboxAccount(
        request.tenantId!,
        request.userId!,
        account,
        request.role === "tenant_admin"
      );
      if (!allowed) return reply.code(403).send({ error: "forbidden" });
      await tryPushPermanentDelete({
        log: request.log,
        tenantId: request.tenantId!,
        account,
        threadId: thread.id,
        sourceFolder: thread.folder
      });
      const blobPaths = await deleteMailboxThreadPermanent(request.tenantId!, thread.id);
      for (const blobPath of blobPaths) {
        await deleteMailboxAttachmentBlob(blobPath);
      }
      return reply.code(204).send();
    });

    mailboxScope.post("/compose/drafts", async (request, reply) => {
      const parsed = mailboxDraftBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
      const account = await resolveComposeAccount(
        request.tenantId!,
        request.userId!,
        request.role === "tenant_admin",
        parsed.data.accountId
      );
      if (!account) return reply.code(404).send({ error: "not_found", message: "No mailbox account available." });
      const safeBodyHtml = sanitizeMailboxComposeHtml(parsed.data.bodyHtml) ?? undefined;
      const { message, thread } = await createMailboxDraft({
        tenantId: request.tenantId!,
        userId: request.userId!,
        accountId: account.id,
        subject: parsed.data.subject,
        bodyText: parsed.data.bodyText,
        bodyHtml: safeBodyHtml,
        to: parsed.data.to,
        cc: parsed.data.cc,
        bcc: parsed.data.bcc
      });
      return reply.code(201).send({ message: await serializeMessage(request.tenantId!, message), thread: serializeThread(thread) });
    });

    mailboxScope.get("/compose/drafts/:messageId", async (request, reply) => {
      const params = mailboxDraftMessageIdParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "validation_error" });
      const message = await getMailboxMessageById(request.tenantId!, params.data.messageId);
      if (!message?.isDraft) return reply.code(404).send({ error: "not_found" });
      const account = await getMailboxAccountById(request.tenantId!, message.accountId);
      if (!account) return reply.code(404).send({ error: "not_found" });
      const allowed = await userCanAccessMailboxAccount(
        request.tenantId!,
        request.userId!,
        account,
        request.role === "tenant_admin"
      );
      if (!allowed) return reply.code(403).send({ error: "forbidden" });
      const thread = await getMailboxThreadById(request.tenantId!, message.threadId);
      return { message: await serializeMessage(request.tenantId!, message), thread: thread ? serializeThread(thread) : null };
    });

    mailboxScope.patch("/compose/drafts/:messageId", async (request, reply) => {
      const params = mailboxDraftMessageIdParamsSchema.safeParse(request.params);
      const body = mailboxDraftBodySchema.safeParse(request.body ?? {});
      if (!params.success || !body.success) {
        return reply.code(400).send({ error: "validation_error", details: body.success ? undefined : body.error.flatten() });
      }
      const existing = await getMailboxMessageById(request.tenantId!, params.data.messageId);
      if (!existing?.isDraft) return reply.code(404).send({ error: "not_found" });
      const existingAccount = await getMailboxAccountById(request.tenantId!, existing.accountId);
      if (!existingAccount) return reply.code(404).send({ error: "not_found" });
      const allowed = await userCanAccessMailboxAccount(
        request.tenantId!,
        request.userId!,
        existingAccount,
        request.role === "tenant_admin"
      );
      if (!allowed) return reply.code(403).send({ error: "forbidden" });
      let nextAccountId = existing.accountId;
      if (body.data.accountId && body.data.accountId !== existing.accountId) {
        const account = await resolveComposeAccount(
          request.tenantId!,
          request.userId!,
          request.role === "tenant_admin",
          body.data.accountId
        );
        if (!account) return reply.code(404).send({ error: "not_found" });
        nextAccountId = account.id;
      }
      const updated = await updateMailboxDraftMessage(request.tenantId!, params.data.messageId, {
        accountId: nextAccountId,
        to: body.data.to,
        cc: body.data.cc,
        bcc: body.data.bcc,
        subject: body.data.subject,
        bodyText: body.data.bodyText,
        bodyHtml:
          body.data.bodyHtml === undefined
            ? undefined
            : sanitizeMailboxComposeHtml(body.data.bodyHtml) ?? undefined
      });
      if (!updated) return reply.code(404).send({ error: "not_found" });
      const thread = await getMailboxThreadById(request.tenantId!, updated.threadId);
      return { message: await serializeMessage(request.tenantId!, updated), thread: thread ? serializeThread(thread) : null };
    });

    mailboxScope.post("/compose/send", async (request, reply) => {
      const parsed = mailboxComposeBodySchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
      const account = await getMailboxAccountById(request.tenantId!, parsed.data.accountId);
      if (!account) return reply.code(404).send({ error: "not_found" });
      const canSend = await userCanSendFromMailboxAccount(
        request.tenantId!,
        request.userId!,
        account,
        request.role === "tenant_admin"
      );
      if (!canSend) return reply.code(403).send({ error: "forbidden" });
      const connector = await createMailConnectorForAccount(account);
      let inReplyTo: string | null = null;
      let referencesHeader: string | null = null;
      if (parsed.data.inReplyToMessageId) {
        const prior = await getMailboxMessageById(request.tenantId!, parsed.data.inReplyToMessageId);
        if (prior) {
          inReplyTo = prior.messageId;
          referencesHeader = prior.referencesHeader
            ? `${prior.referencesHeader} ${prior.messageId ?? ""}`.trim()
            : prior.messageId;
        }
      }
      const tenantId = request.tenantId!;
      const attachmentSourceMessageId = parsed.data.draftMessageId ?? null;
      let attachmentRows = attachmentSourceMessageId
        ? await listMailboxAttachmentRowsForMessage(tenantId, attachmentSourceMessageId)
        : [];
      if (parsed.data.attachmentIds?.length) {
        const selected = await Promise.all(
          parsed.data.attachmentIds.map((id) => getMailboxAttachmentById(tenantId, id))
        );
        attachmentRows = selected.filter((row): row is NonNullable<typeof row> => row != null);
      }
      const outboundAttachments: { filename: string; mimeType: string; content: Buffer }[] = [];
      for (const row of attachmentRows) {
        const bytes = await readMailboxAttachmentBytes(row.blobPath, { tenantId });
        outboundAttachments.push({
          filename: row.filename,
          mimeType: row.mimeType,
          content: bytes
        });
      }
      const safeBodyHtml = sanitizeMailboxComposeHtml(parsed.data.bodyHtml) ?? undefined;
      const sendResult = await connector.send({
        to: parsed.data.to,
        cc: parsed.data.cc ?? [],
        bcc: parsed.data.bcc ?? [],
        subject: parsed.data.subject,
        bodyHtml: safeBodyHtml,
        bodyText: parsed.data.bodyText,
        inReplyTo,
        referencesHeader,
        attachments: outboundAttachments
      });
      const now = new Date();
      const snippet = (parsed.data.bodyText ?? safeBodyHtml?.replace(/<[^>]+>/g, " ") ?? "").slice(0, 200);
      const thread = await upsertMailboxThread({
        tenantId: request.tenantId!,
        accountId: account.id,
        subjectNormalized: parsed.data.subject,
        snippet,
        folder: "sent",
        lastMessageAt: now,
        unreadDelta: 0
      });
      const message = await insertMailboxMessage({
        tenantId: request.tenantId!,
        accountId: account.id,
        threadId: thread.id,
        providerMessageId: sendResult.providerMessageId,
        direction: "outbound",
        from: { email: account.emailAddress, name: account.displayName },
        to: parsed.data.to,
        cc: parsed.data.cc,
        bcc: parsed.data.bcc,
        subject: parsed.data.subject,
        snippet,
        bodyHtml: safeBodyHtml,
        bodyText: parsed.data.bodyText,
        messageId: sendResult.messageId,
        inReplyTo,
        referencesHeader,
        receivedAt: now,
        isRead: true,
        hasAttachments: outboundAttachments.length > 0,
        sentByUserId: request.userId!
      });
      if (parsed.data.draftMessageId && attachmentRows.length > 0) {
        await reassignMailboxAttachmentsMessage(tenantId, parsed.data.draftMessageId, message.id);
      }
      if (parsed.data.draftMessageId) {
        const draft = await getMailboxMessageById(tenantId, parsed.data.draftMessageId);
        if (draft?.isDraft) {
          await applyMailboxThreadFolderMove(tenantId, draft.threadId, "trash");
        }
      }
      const sentAttachments = await listMailboxAttachmentRowsForMessage(tenantId, message.id);
      return reply.code(201).send({ message: await serializeMessage(tenantId, message, sentAttachments) });
    });

    mailboxScope.post("/compose/drafts/:messageId/attachments", async (request, reply) => {
      const params = mailboxDraftMessageIdParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "validation_error" });
      const message = await getMailboxMessageById(request.tenantId!, params.data.messageId);
      if (!message?.isDraft) return reply.code(404).send({ error: "not_found" });
      const account = await getMailboxAccountById(request.tenantId!, message.accountId);
      if (!account) return reply.code(404).send({ error: "not_found" });
      const allowed = await userCanAccessMailboxAccount(
        request.tenantId!,
        request.userId!,
        account,
        request.role === "tenant_admin"
      );
      if (!allowed) return reply.code(403).send({ error: "forbidden" });
      const existing = await listMailboxAttachmentRowsForMessage(request.tenantId!, message.id);
      if (existing.length >= MAILBOX_ATTACHMENT_MAX_FILES_PER_MESSAGE) {
        return reply.code(400).send({ error: "attachment_limit", message: "Too many attachments on this draft." });
      }
      const totalBytes = existing.reduce((sum, row) => sum + row.sizeBytes, 0);
      const file = await request.file({ limits: { fileSize: MAILBOX_ATTACHMENT_MAX_FILE_BYTES } });
      if (!file) return reply.code(400).send({ error: "validation_error", message: "File is required." });
      const filename = file.filename?.trim() || "attachment";
      const bytes = await file.toBuffer();
      try {
        assertMailboxAttachmentUpload({ filename, sizeBytes: bytes.length });
      } catch {
        return reply.code(400).send({ error: "attachment_rejected", message: "Attachment type or size is not allowed." });
      }
      const ext = mailboxAttachmentStorageExt(filename);
      if (MAILBOX_ATTACHMENT_BLOCKED_EXTENSIONS.has(ext)) {
        return reply.code(400).send({ error: "attachment_rejected", message: "Attachment type is not allowed." });
      }
      if (totalBytes + bytes.length > MAILBOX_ATTACHMENT_MAX_TOTAL_BYTES) {
        return reply.code(400).send({ error: "attachment_limit", message: "Total attachment size exceeded." });
      }
      const attachmentId = randomUUID();
      const { blobPath } = await writeMailboxAttachmentBytes({
        tenantId: request.tenantId!,
        messageId: message.id,
        attachmentId,
        filename,
        bytes
      });
      const row = await insertMailboxAttachment({
        tenantId: request.tenantId!,
        messageId: message.id,
        filename,
        mimeType: file.mimetype || "application/octet-stream",
        sizeBytes: bytes.length,
        blobPath
      });
      return reply.code(201).send({
        attachment: {
          id: row.id,
          filename: row.filename,
          mimeType: row.mimeType,
          sizeBytes: row.sizeBytes
        }
      });
    });

    mailboxScope.delete("/compose/drafts/:messageId/attachments/:attachmentId", async (request, reply) => {
      const params = mailboxAttachmentIdParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "validation_error" });
      const message = await getMailboxMessageById(request.tenantId!, params.data.messageId);
      if (!message?.isDraft) return reply.code(404).send({ error: "not_found" });
      const account = await getMailboxAccountById(request.tenantId!, message.accountId);
      if (!account) return reply.code(404).send({ error: "not_found" });
      const allowed = await userCanAccessMailboxAccount(
        request.tenantId!,
        request.userId!,
        account,
        request.role === "tenant_admin"
      );
      if (!allowed) return reply.code(403).send({ error: "forbidden" });
      const attachment = await getMailboxAttachmentById(request.tenantId!, params.data.attachmentId);
      if (!attachment || attachment.messageId !== message.id) {
        return reply.code(404).send({ error: "not_found" });
      }
      const deleted = await deleteMailboxAttachment(request.tenantId!, attachment.id);
      if (!deleted) return reply.code(404).send({ error: "not_found" });
      try {
        await deleteMailboxAttachmentBlob(deleted.blobPath);
      } catch {
        request.log.warn({ attachmentId: deleted.id }, "mailbox_attachment_blob_delete_failed");
      }
      return reply.code(204).send();
    });

    mailboxScope.get("/messages/:messageId/attachments", async (request, reply) => {
      const params = mailboxMessageIdParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "validation_error" });
      const message = await getMailboxMessageById(request.tenantId!, params.data.messageId);
      if (!message) return reply.code(404).send({ error: "not_found" });
      const account = await getMailboxAccountById(request.tenantId!, message.accountId);
      if (!account) return reply.code(404).send({ error: "not_found" });
      const allowed = await userCanAccessMailboxAccount(
        request.tenantId!,
        request.userId!,
        account,
        request.role === "tenant_admin"
      );
      if (!allowed) return reply.code(403).send({ error: "forbidden" });
      const attachments = await listMailboxAttachmentRowsForMessage(request.tenantId!, message.id);
      return {
        attachments: attachments.map((a) => ({
          id: a.id,
          filename: a.filename,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes
        }))
      };
    });

    mailboxScope.get("/messages/:messageId/attachments/:attachmentId", async (request, reply) => {
      const params = mailboxAttachmentIdParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "validation_error" });
      const attachment = await getMailboxAttachmentById(request.tenantId!, params.data.attachmentId);
      if (!attachment || attachment.messageId !== params.data.messageId) {
        return reply.code(404).send({ error: "not_found" });
      }
      const message = await getMailboxMessageById(request.tenantId!, attachment.messageId);
      if (!message) return reply.code(404).send({ error: "not_found" });
      const account = await getMailboxAccountById(request.tenantId!, message.accountId);
      if (!account) return reply.code(404).send({ error: "not_found" });
      const allowed = await userCanAccessMailboxAccount(
        request.tenantId!,
        request.userId!,
        account,
        request.role === "tenant_admin"
      );
      if (!allowed) return reply.code(403).send({ error: "forbidden" });
      const bytes = await readMailboxAttachmentBytes(attachment.blobPath, { tenantId: request.tenantId! });
      return reply
        .header("content-type", attachment.mimeType)
        .header("content-disposition", `attachment; filename="${attachment.filename.replace(/"/g, "")}"`)
        .send(bytes);
    });

    mailboxScope.get("/calendar/events", async (request, reply) => {
      const parsed = mailboxCalendarEventsQuerySchema.safeParse(request.query);
      if (!parsed.success) return reply.code(400).send({ error: "validation_error" });
      const events = await listMailboxCalendarEvents({
        tenantId: request.tenantId!,
        userId: request.userId!,
        from: parsed.data.from ? new Date(parsed.data.from) : undefined,
        to: parsed.data.to ? new Date(parsed.data.to) : undefined,
        limit: parsed.data.limit,
        connectionId: parsed.data.connectionId
      });
      return {
        events: events.map((e) => {
          const extras = parseMailboxCalendarEventExtras(e.recurrenceJson);
          return {
            id: e.id,
            title: e.title,
            description: e.description,
            location: e.location,
            startsAt: iso(e.startsAt),
            endsAt: iso(e.endsAt),
            timezone: e.timezone,
            allDay: e.allDay,
            status: e.status,
            organizer: parseMailboxAddressJson(e.organizerJson),
            sourceMessageId: e.sourceMessageId,
            icsUid: e.icsUid,
            providerEventId: e.providerEventId,
            calendarName: e.calendarName ?? null,
            calendarColor: e.calendarColor ?? null,
            calendarSource: e.calendarSource ?? null,
            connectionId: e.connectionId ?? null,
            busy: extras.busy ?? true,
            isPrivate: extras.private ?? false,
            reminders: extras.reminders ?? ["10m"],
            locationType: extras.locationType ?? "in_person",
            recurrenceFreq: extras.recurrenceFreq ?? "none",
            recurrenceInterval: extras.recurrenceInterval ?? 1,
            stopRecurrenceDate: extras.stopRecurrenceDate ?? null,
            rrule: extras.rrule ?? null,
            exceptionDates: extras.exceptionDates ?? []
          };
        })
      };
    });

    mailboxScope.get("/calendar/events/:eventId", async (request, reply) => {
      const params = mailboxEventIdParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "validation_error" });
      const event = await getMailboxCalendarEventById(request.tenantId!, params.data.eventId);
      if (!event) return reply.code(404).send({ error: "not_found" });
      const calendar = await getMailboxCalendarById(request.tenantId!, event.calendarId);
      const attendees = await listMailboxEventAttendees(request.tenantId!, event.id);
      return {
        event: serializeMailboxCalendarEventResponse({
          event,
          calendar: calendar
            ? {
                name: calendar.name,
                color: calendar.color,
                source: calendar.source,
                mailboxAccountId: calendar.mailboxAccountId
              }
            : null,
          attendees
        })
      };
    });

    mailboxScope.post("/calendar/events", async (request, reply) => {
      const body = mailboxCalendarEventCreateBodySchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: "validation_error" });

      const account = await getMailboxAccountById(request.tenantId!, body.data.connectionId);
      if (!account) return reply.code(404).send({ error: "not_found" });
      if (account.provider !== "gmail" && account.provider !== "microsoft") {
        return reply.code(400).send({ error: "provider_not_supported" });
      }

      const allowed = await userCanAccessMailboxAccount(
        request.tenantId!,
        request.userId!,
        account,
        request.role === "tenant_admin"
      );
      if (!allowed) return reply.code(403).send({ error: "forbidden" });

      const startsAt = new Date(body.data.startsAt);
      const endsAt = new Date(body.data.endsAt);
      if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
        return reply.code(400).send({ error: "invalid_time_range" });
      }

      const calendar = await getMailboxCalendarByAccountId(request.tenantId!, account.id);
      if (!calendar) {
        await ensureLinkedMailboxCalendarForAccount({
          tenantId: request.tenantId!,
          userId: request.userId!,
          accountId: account.id,
          provider: account.provider,
          displayName: account.displayName
        });
      }
      const linkedCalendar = await getMailboxCalendarByAccountId(request.tenantId!, account.id);
      if (!linkedCalendar) return reply.code(500).send({ error: "calendar_unavailable" });

      const timezone = body.data.timezone?.trim() || "UTC";
      const attendees = await resolveCalendarEventAttendees(request.tenantId!, body.data);
      const recurrenceJson = buildCalendarEventExtrasJson(body.data, null);
      const extras = parseMailboxCalendarEventExtras(recurrenceJson);
      const addVideoMeeting =
        body.data.addVideoMeeting ||
        (body.data.locationType === "by_call" && !(body.data.location ?? "").trim());

      let created;
      try {
        created = await createProviderCalendarEvent(account.provider, {
          account,
          providerCalendarId: linkedCalendar.providerCalendarId ?? "primary",
          title: body.data.title,
          description: body.data.description ?? null,
          location: body.data.location ?? null,
          startsAt,
          endsAt,
          timezone,
          allDay: body.data.allDay,
          attendees,
          addVideoMeeting,
          busy: body.data.busy,
          isPrivate: body.data.isPrivate,
          reminders: body.data.reminders,
          rrule: extras.rrule ?? null,
          locationType: body.data.locationType
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.code(502).send({ error: "provider_create_failed", message });
      }

      const eventId = await upsertMailboxCalendarEventFromProvider({
        tenantId: request.tenantId!,
        calendarId: linkedCalendar.id,
        providerEventId: created.providerEventId,
        title: created.title,
        description: created.description,
        location: created.location,
        startsAt: created.startsAt,
        endsAt: created.endsAt,
        timezone: created.timezone,
        allDay: created.allDay,
        status: created.status,
        organizer: created.organizer
      });

      await updateMailboxCalendarEventRow({
        tenantId: request.tenantId!,
        eventId,
        recurrenceJson
      });

      if (attendees.length > 0) {
        await replaceMailboxEventAttendees({
          tenantId: request.tenantId!,
          eventId,
          attendees
        });
      }

      const event = await getMailboxCalendarEventById(request.tenantId!, eventId);
      if (!event) return reply.code(500).send({ error: "event_persist_failed" });

      return reply.code(201).send({
        event: serializeMailboxCalendarEventResponse({
          event,
          calendar: {
            name: linkedCalendar.name,
            color: linkedCalendar.color,
            source: linkedCalendar.source,
            mailboxAccountId: account.id
          },
          attendees: await listMailboxEventAttendees(request.tenantId!, eventId)
        })
      });
    });

    mailboxScope.put("/calendar/events/:eventId", async (request, reply) => {
      const params = mailboxEventIdParamsSchema.safeParse(request.params);
      const body = mailboxCalendarEventUpdateBodySchema.safeParse(request.body);
      if (!params.success || !body.success) return reply.code(400).send({ error: "validation_error" });

      const existing = await getMailboxCalendarEventById(request.tenantId!, params.data.eventId);
      if (!existing) return reply.code(404).send({ error: "not_found" });
      if (!existing.providerEventId) return reply.code(400).send({ error: "event_not_editable" });

      const calendar = await getMailboxCalendarById(request.tenantId!, existing.calendarId);
      if (!calendar?.mailboxAccountId) return reply.code(400).send({ error: "calendar_unavailable" });
      const account = await getMailboxAccountById(request.tenantId!, calendar.mailboxAccountId);
      if (!account || (account.provider !== "gmail" && account.provider !== "microsoft")) {
        return reply.code(400).send({ error: "provider_not_supported" });
      }

      const allowed = await userCanAccessMailboxAccount(
        request.tenantId!,
        request.userId!,
        account,
        request.role === "tenant_admin"
      );
      if (!allowed) return reply.code(403).send({ error: "forbidden" });

      const merged = {
        title: body.data.title ?? existing.title,
        description: body.data.description ?? existing.description ?? undefined,
        location: body.data.location ?? existing.location ?? undefined,
        startsAt: body.data.startsAt ?? existing.startsAt.toISOString(),
        endsAt: body.data.endsAt ?? existing.endsAt.toISOString(),
        timezone: body.data.timezone ?? existing.timezone,
        allDay: body.data.allDay ?? existing.allDay,
        attendees: body.data.attendees,
        attendeeIds: body.data.attendeeIds,
        addVideoMeeting: body.data.addVideoMeeting,
        busy: body.data.busy,
        isPrivate: body.data.isPrivate,
        reminders: body.data.reminders,
        locationType: body.data.locationType,
        recurrenceInterval: body.data.recurrenceInterval,
        recurrenceFreq: body.data.recurrenceFreq,
        stopRecurrenceDate: body.data.stopRecurrenceDate
      };

      const startsAt = new Date(merged.startsAt);
      const endsAt = new Date(merged.endsAt);
      if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
        return reply.code(400).send({ error: "invalid_time_range" });
      }

      let recurrenceJson = buildCalendarEventExtrasJson(merged, existing.recurrenceJson);
      if (body.data.recurrenceScope) {
        recurrenceJson = applyRecurrenceScopeToExtras({
          recurrenceJson,
          scope: body.data.recurrenceScope,
          occurrenceDate: merged.startsAt.slice(0, 10)
        }).recurrenceJson;
      }

      const attendees = await resolveCalendarEventAttendees(request.tenantId!, merged);
      const extras = parseMailboxCalendarEventExtras(recurrenceJson);
      const addVideoMeeting =
        merged.addVideoMeeting ||
        (merged.locationType === "by_call" && !(merged.location ?? "").trim());

      try {
        await updateProviderCalendarEvent(account.provider, {
          account,
          providerCalendarId: calendar.providerCalendarId ?? "primary",
          providerEventId: existing.providerEventId,
          title: merged.title,
          description: merged.description ?? null,
          location: merged.location ?? null,
          startsAt,
          endsAt,
          timezone: merged.timezone,
          allDay: merged.allDay,
          attendees,
          addVideoMeeting: Boolean(addVideoMeeting),
          busy: merged.busy,
          isPrivate: merged.isPrivate,
          reminders: merged.reminders,
          rrule: extras.rrule ?? null,
          locationType: merged.locationType
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.code(502).send({ error: "provider_update_failed", message });
      }

      await updateMailboxCalendarEventRow({
        tenantId: request.tenantId!,
        eventId: existing.id,
        title: merged.title,
        description: merged.description ?? null,
        location: merged.location ?? null,
        startsAt,
        endsAt,
        timezone: merged.timezone,
        allDay: merged.allDay,
        recurrenceJson
      });
      await replaceMailboxEventAttendees({
        tenantId: request.tenantId!,
        eventId: existing.id,
        attendees
      });

      const event = await getMailboxCalendarEventById(request.tenantId!, existing.id);
      if (!event) return reply.code(500).send({ error: "event_persist_failed" });

      return {
        event: serializeMailboxCalendarEventResponse({
          event,
          calendar: {
            name: calendar.name,
            color: calendar.color,
            source: calendar.source,
            mailboxAccountId: calendar.mailboxAccountId
          },
          attendees: await listMailboxEventAttendees(request.tenantId!, existing.id)
        })
      };
    });

    mailboxScope.delete("/calendar/events/:eventId", async (request, reply) => {
      const params = mailboxEventIdParamsSchema.safeParse(request.params);
      const body = mailboxCalendarEventDeleteBodySchema.safeParse(request.body ?? {});
      if (!params.success || !body.success) return reply.code(400).send({ error: "validation_error" });

      const existing = await getMailboxCalendarEventById(request.tenantId!, params.data.eventId);
      if (!existing) return reply.code(404).send({ error: "not_found" });

      const calendar = await getMailboxCalendarById(request.tenantId!, existing.calendarId);
      const scope = body.data.recurrenceScope ?? "series";
      const occurrenceDate = body.data.occurrenceDate ?? existing.startsAt.toISOString().slice(0, 10);
      const scoped = applyRecurrenceScopeToExtras({
        recurrenceJson: existing.recurrenceJson,
        scope,
        occurrenceDate
      });

      if (!scoped.deleteEntireSeries) {
        await updateMailboxCalendarEventRow({
          tenantId: request.tenantId!,
          eventId: existing.id,
          recurrenceJson: scoped.recurrenceJson
        });
        return reply.code(204).send();
      }

      if (existing.providerEventId && calendar?.mailboxAccountId) {
        const account = await getMailboxAccountById(request.tenantId!, calendar.mailboxAccountId);
        if (account && (account.provider === "gmail" || account.provider === "microsoft")) {
          const allowed = await userCanAccessMailboxAccount(
            request.tenantId!,
            request.userId!,
            account,
            request.role === "tenant_admin"
          );
          if (!allowed) return reply.code(403).send({ error: "forbidden" });
          try {
            await deleteProviderCalendarEvent(account.provider, {
              account,
              providerCalendarId: calendar.providerCalendarId ?? "primary",
              providerEventId: existing.providerEventId
            });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return reply.code(502).send({ error: "provider_delete_failed", message });
          }
        }
      }

      await deleteMailboxCalendarEventRow(request.tenantId!, existing.id);
      return reply.code(204).send();
    });

    mailboxScope.post("/calendar/events/:eventId/rsvp", async (request, reply) => {
      const params = mailboxEventIdParamsSchema.safeParse(request.params);
      const body = mailboxEventRsvpBodySchema.safeParse(request.body);
      if (!params.success || !body.success) return reply.code(400).send({ error: "validation_error" });
      const event = await getMailboxCalendarEventById(request.tenantId!, params.data.eventId);
      if (!event) return reply.code(404).send({ error: "not_found" });
      const organizer = parseMailboxAddressJson(event.organizerJson);
      const accounts = await listMailboxAccountsForUser(request.tenantId!, request.userId!);
      const sendAccount = accounts.find((a) => a.provider !== "internal");
      if (sendAccount) {
        const connector = await createMailConnectorForAccount(sendAccount);
        await connector.sendCalendarReply({
          icsUid: event.icsUid ?? event.id,
          icsSequence: event.icsSequence,
          organizerEmail: organizer.email,
          attendeeEmail: sendAccount.emailAddress,
          attendeeName: sendAccount.displayName,
          response: body.data.response,
          title: event.title,
          startsAt: event.startsAt,
          endsAt: event.endsAt
        });
      }
      await updateMailboxEventAttendeeResponse(
        request.tenantId!,
        event.id,
        accounts[0]?.emailAddress ?? "",
        body.data.response
      );
      return reply.code(204).send();
    });

    mailboxScope.post("/accounts/:accountId/sync", async (request, reply) => {
      const params = mailboxAccountIdParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "validation_error" });
      const account = await getMailboxAccountById(request.tenantId!, params.data.accountId);
      if (!account) return reply.code(404).send({ error: "not_found" });
      if (account.provider === "internal") {
        return reply.code(400).send({ error: "cannot_sync_internal" });
      }
      const allowed = await userCanAccessMailboxAccount(
        request.tenantId!,
        request.userId!,
        account,
        request.role === "tenant_admin"
      );
      if (!allowed) return reply.code(403).send({ error: "forbidden" });
      const result = await enqueueMailboxSyncAccount({
        tenantId: request.tenantId!,
        accountId: account.id,
        priority: 1
      });
      return { enqueued: result.enqueued, jobId: result.jobId };
    });

    mailboxScope.get("/accounts/:accountId/sync-status", async (request, reply) => {
      const params = mailboxAccountIdParamsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: "validation_error" });
      const account = await getMailboxAccountById(request.tenantId!, params.data.accountId);
      if (!account) return reply.code(404).send({ error: "not_found" });
      if (account.provider === "internal") {
        return reply.code(400).send({ error: "cannot_sync_internal" });
      }
      const allowed = await userCanAccessMailboxAccount(
        request.tenantId!,
        request.userId!,
        account,
        request.role === "tenant_admin"
      );
      if (!allowed) return reply.code(403).send({ error: "forbidden" });

      const calendar = await getMailboxCalendarByAccountId(request.tenantId!, account.id);
      const jobs = await getMailboxAccountSyncJobs(account.id);

      return {
        account: {
          syncStatus: account.syncStatus,
          syncError: account.syncError,
          lastSyncedAt: account.lastSyncedAt ? iso(account.lastSyncedAt) : null
        },
        calendar: calendar
          ? {
              syncStatus: calendar.syncStatus,
              syncError: calendar.syncError,
              lastSyncedAt: calendar.lastSyncedAt ? iso(calendar.lastSyncedAt) : null
            }
          : null,
        jobs
      };
    });
  });
};

/** OAuth callbacks — outside protected scope (browser redirect, state carries tenant/user). */
export const registerTenantMailboxOAuthRoutes = async (app: FastifyInstance) => {
  app.get("/oauth/:provider/callback", async (request, reply) => {
    const provider = mailboxOAuthProviderSchema.safeParse((request.params as { provider: string }).provider);
    const code = typeof (request.query as { code?: string }).code === "string" ? (request.query as { code: string }).code : null;
    const stateRaw = typeof (request.query as { state?: string }).state === "string" ? (request.query as { state: string }).state : null;
    if (!provider.success || !code || !stateRaw) {
      return reply.code(400).send({ error: "validation_error" });
    }
    let state: ReturnType<typeof verifyOAuthState>;
    try {
      state = verifyOAuthState(stateRaw);
    } catch {
      return reply.code(400).send({ error: "invalid_state" });
    }
    const apiOrigin = process.env.API_PUBLIC_ORIGIN ?? `http://localhost:${process.env.API_PORT ?? "3000"}`;
    const redirectUri = `${apiOrigin}/v1/tenant/mailbox/oauth/${provider.data}/callback`;
    const webOrigin = process.env.WEB_PUBLIC_ORIGIN ?? "http://localhost:5173";
    try {
      const tokens =
        provider.data === "google"
          ? await exchangeGoogleOAuthCode({ code, redirectUri })
          : await exchangeMicrosoftOAuthCode({ code, redirectUri });

      if (state.accountId) {
        const existing = await getMailboxAccountById(state.tenantId, state.accountId);
        const providerOk = existing && mailboxOAuthProviderForAccount(existing.provider) === provider.data;
        const ownerOk =
          existing &&
          (existing.ownerUserId === state.userId ||
            (existing.ownerScope === "workforce_agent" && Boolean(state.userId)));
        if (!existing || !providerOk || !ownerOk) {
          return reply.redirect(`${webOrigin}/admin/mailbox/accounts?oauth_error=1`);
        }
        if (normalizeMailboxEmail(tokens.email) !== normalizeMailboxEmail(existing.emailAddress)) {
          const errPath =
            existing.ownerScope === "workforce_agent" && existing.ownerEmployeeId
              ? `/admin/workforce/employees/${existing.ownerEmployeeId}?mailbox_oauth_error=email_mismatch`
              : `/admin/mailbox/accounts?oauth_error=email_mismatch`;
          return reply.redirect(`${webOrigin}${errPath}`);
        }
        const account = await reconnectOAuthMailboxAccount({
          tenantId: state.tenantId,
          accountId: existing.id,
          refreshToken: tokens.refreshToken,
          accessToken: tokens.accessToken,
          accessTokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
          emailAddress: tokens.email,
          displayName: tokens.email
        });
        if (!account) {
          return reply.redirect(`${webOrigin}/admin/mailbox/accounts?oauth_error=1`);
        }
        await enqueueMailboxSyncAccount({ tenantId: state.tenantId, accountId: account.id });
        if (account.ownerScope === "workforce_agent" && account.ownerEmployeeId) {
          return reply.redirect(
            `${webOrigin}/admin/workforce/employees/${account.ownerEmployeeId}?mailbox_reconnected=1`
          );
        }
        return reply.redirect(`${webOrigin}/admin/mailbox/accounts?reconnected=${account.id}`);
      }

      if (state.employeeId) {
        const employee = await getWorkforceEmployeeById(state.tenantId, state.employeeId);
        if (!employee || employee.employeeKind !== "agent") {
          return reply.redirect(`${webOrigin}/admin/mailbox/accounts?oauth_error=1`);
        }
        const inboxDisplayName = workforceEmployeeDisplayName(employee.firstName, employee.lastName);
        const account = await insertOAuthMailboxAccountForAgent({
          tenantId: state.tenantId,
          employeeId: employee.id,
          inboxDisplayName,
          calendarUserId: state.userId,
          provider: provider.data === "google" ? "gmail" : "microsoft",
          displayName: tokens.email,
          emailAddress: tokens.email,
          refreshToken: tokens.refreshToken,
          accessToken: tokens.accessToken,
          accessTokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000)
        });
        await enqueueMailboxSyncAccount({ tenantId: state.tenantId, accountId: account.id });
        return reply.redirect(
          `${webOrigin}/admin/workforce/employees/${employee.id}?mailbox_connected=1`
        );
      }

      const account = await insertOAuthMailboxAccount({
        tenantId: state.tenantId,
        userId: state.userId,
        provider: provider.data === "google" ? "gmail" : "microsoft",
        displayName: tokens.email,
        emailAddress: tokens.email,
        refreshToken: tokens.refreshToken,
        accessToken: tokens.accessToken,
        accessTokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000)
      });
      await enqueueMailboxSyncAccount({ tenantId: state.tenantId, accountId: account.id });
      return reply.redirect(`${webOrigin}/admin/mailbox/accounts?connected=${account.id}`);
    } catch (err) {
      request.log.error({ err }, "mailbox oauth callback failed");
      return reply.redirect(`${webOrigin}/admin/mailbox/accounts?oauth_error=1`);
    }
  });
};

export { deliverInternalMailboxMessage };
