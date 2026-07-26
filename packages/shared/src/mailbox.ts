/**
 * Mailbox module contracts.
 *
 * Provider enums, account/member schemas, folder/message validation, calendar
 * extras, and IMAP sync settings for the optional mailbox module.
 *
 * Responsibilities:
 * - Export mailbox provider, scope, folder, and member role enums
 * - Validate account CRUD, message compose, and sync configuration bodies
 *
 * Related:
 * - `docs/mailbox-module.md`
 * - `calendar-event.ts`, `mailbox-sync-errors.ts`
 *
 * Security:
 * - OAuth tokens and IMAP credentials stored encrypted in API; not in schemas.
 */
import { z } from "zod";

export const MAILBOX_PROVIDERS = ["internal", "gmail", "microsoft", "imap"] as const;
export type MailboxProvider = (typeof MAILBOX_PROVIDERS)[number];
export const mailboxProviderSchema = z.enum(MAILBOX_PROVIDERS);

export const mailboxConnectionTypeLabel = (provider: MailboxProvider): string => {
  switch (provider) {
    case "gmail":
      return "Gmail";
    case "microsoft":
      return "Office 365";
    case "imap":
      return "IMAP/SMTP";
    case "internal":
      return "System notifications";
    default:
      return provider;
  }
};

export const MAILBOX_OWNER_SCOPES = ["user", "tenant_shared", "workforce_agent"] as const;
export type MailboxOwnerScope = (typeof MAILBOX_OWNER_SCOPES)[number];
export const mailboxOwnerScopeSchema = z.enum(MAILBOX_OWNER_SCOPES);

export const MAILBOX_ACCOUNT_MEMBER_ROLES = ["viewer", "sender", "admin"] as const;
export type MailboxAccountMemberRole = (typeof MAILBOX_ACCOUNT_MEMBER_ROLES)[number];
export const mailboxAccountMemberRoleSchema = z.enum(MAILBOX_ACCOUNT_MEMBER_ROLES);

export const MAILBOX_FOLDERS = ["inbox", "sent", "drafts", "trash", "archive"] as const;
export type MailboxFolder = (typeof MAILBOX_FOLDERS)[number];
export const mailboxFolderSchema = z.enum(MAILBOX_FOLDERS);

export const MAILBOX_MESSAGE_DIRECTIONS = ["inbound", "outbound", "internal"] as const;
export type MailboxMessageDirection = (typeof MAILBOX_MESSAGE_DIRECTIONS)[number];

export const MAILBOX_INTERNAL_SOURCES = ["invoicing", "crm", "system"] as const;
export type MailboxInternalSource = (typeof MAILBOX_INTERNAL_SOURCES)[number];

export const MAILBOX_SYNC_STATUSES = ["idle", "syncing", "error"] as const;
export type MailboxSyncStatus = (typeof MAILBOX_SYNC_STATUSES)[number];

/** Distinct accent colors for multiple mailboxes / connected accounts (left-border cues). */
export const MAILBOX_ACCENT_COLORS = [
  "#6366f1",
  "#0891b2",
  "#059669",
  "#d97706",
  "#db2777",
  "#7c3aed",
  "#dc2626",
  "#0d9488"
] as const;

export type MailboxAccentColor = (typeof MAILBOX_ACCENT_COLORS)[number];

export const pickMailboxAccentColor = (index: number): MailboxAccentColor =>
  MAILBOX_ACCENT_COLORS[((index % MAILBOX_ACCENT_COLORS.length) + MAILBOX_ACCENT_COLORS.length) % MAILBOX_ACCENT_COLORS.length]!;

export const MAILBOX_EVENT_STATUSES = ["confirmed", "tentative", "cancelled"] as const;
export type MailboxEventStatus = (typeof MAILBOX_EVENT_STATUSES)[number];

export const MAILBOX_ATTENDEE_RESPONSES = [
  "needs_action",
  "accepted",
  "declined",
  "tentative"
] as const;
export type MailboxAttendeeResponse = (typeof MAILBOX_ATTENDEE_RESPONSES)[number];

export const mailboxAddressSchema = z.object({
  email: z.string().email().max(320),
  name: z.string().max(512).optional().nullable()
});

export type MailboxAddress = z.infer<typeof mailboxAddressSchema>;

export const mailboxThreadsQuerySchema = z.object({
  accountId: z.string().uuid(),
  connectionId: z.string().uuid().optional(),
  folder: mailboxFolderSchema.default("inbox"),
  q: z.string().trim().max(256).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

export const mailboxThreadIdParamsSchema = z.object({
  threadId: z.string().uuid()
});

export const mailboxMessageIdParamsSchema = z.object({
  messageId: z.string().uuid()
});

export const mailboxAccountIdParamsSchema = z.object({
  accountId: z.string().uuid()
});

export const mailboxThreadPatchSchema = z
  .object({
    isRead: z.boolean().optional(),
    isStarred: z.boolean().optional(),
    folder: mailboxFolderSchema.optional()
  })
  .strict()
  .refine((b) => b.isRead !== undefined || b.isStarred !== undefined || b.folder !== undefined, {
    message: "Provide at least one field to update"
  });

export const mailboxThreadsBulkPatchSchema = z
  .object({
    accountId: z.string().uuid(),
    threadIds: z.array(z.string().uuid()).min(1).max(100),
    isRead: z.boolean().optional(),
    isStarred: z.boolean().optional(),
    folder: mailboxFolderSchema.optional()
  })
  .strict()
  .refine(
    (b) => b.isRead !== undefined || b.isStarred !== undefined || b.folder !== undefined,
    { message: "Provide at least one field to update" }
  );

export const mailboxThreadsEmptyTrashQuerySchema = z.object({
  accountId: z.string().uuid()
});

export const mailboxAttachmentIdParamsSchema = z.object({
  messageId: z.string().uuid(),
  attachmentId: z.string().uuid()
});

export const MAILBOX_ATTACHMENT_MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAILBOX_ATTACHMENT_MAX_FILES_PER_MESSAGE = 10;
export const MAILBOX_ATTACHMENT_MAX_TOTAL_BYTES = 50 * 1024 * 1024;

export const MAILBOX_ATTACHMENT_BLOCKED_EXTENSIONS = new Set([
  "exe",
  "bat",
  "cmd",
  "com",
  "scr",
  "vbs",
  "js",
  "jse",
  "wsf",
  "wsh",
  "msi",
  "dll",
  "appx",
  "apk"
]);

export const mailboxImapConnectBodySchema = z
  .object({
    displayName: z.string().trim().max(255).optional(),
    emailAddress: z.string().trim().email().max(320),
    imapHost: z.string().trim().min(1).max(255),
    imapPort: z.coerce.number().int().min(1).max(65535).default(993),
    imapSecure: z.boolean().default(true),
    smtpHost: z.string().trim().min(1).max(255),
    smtpPort: z.coerce.number().int().min(1).max(65535).default(587),
    smtpSecure: z.boolean().default(true),
    username: z.string().trim().min(1).max(512),
    password: z.string().min(1).max(512)
  })
  .strict();

/** Connect IMAP/SMTP to a workforce agent employee mailbox (not the caller's personal inbox). */
export const mailboxAgentImapConnectBodySchema = mailboxImapConnectBodySchema;

export const mailboxAgentEmployeeIdParamsSchema = z
  .object({
    employeeId: z.string().uuid()
  })
  .strict();

export const mailboxAccountMemberDeleteParamsSchema = z
  .object({
    accountId: z.string().uuid(),
    userId: z.string().uuid()
  })
  .strict();

export const mailboxSharedAccountCreateBodySchema = z
  .object({
    displayName: z.string().trim().min(1).max(255),
    emailAddress: z.string().trim().email().max(320)
  })
  .strict();

export const mailboxAccountMemberPutBodySchema = z
  .object({
    userId: z.string().uuid(),
    role: mailboxAccountMemberRoleSchema
  })
  .strict();

export const mailboxComposeBodySchema = z
  .object({
    accountId: z.string().uuid(),
    to: z.array(mailboxAddressSchema).min(1).max(50),
    cc: z.array(mailboxAddressSchema).max(50).optional().default([]),
    bcc: z.array(mailboxAddressSchema).max(50).optional().default([]),
    subject: z.string().trim().max(1024),
    bodyHtml: z.string().max(500_000).optional(),
    bodyText: z.string().max(500_000).optional(),
    inReplyToMessageId: z.string().uuid().optional(),
    draftMessageId: z.string().uuid().optional(),
    attachmentIds: z.array(z.string().uuid()).max(MAILBOX_ATTACHMENT_MAX_FILES_PER_MESSAGE).optional()
  })
  .strict();

export const mailboxDraftBodySchema = z
  .object({
    accountId: z.string().uuid().optional(),
    to: z.array(mailboxAddressSchema).max(50).optional().default([]),
    cc: z.array(mailboxAddressSchema).max(50).optional().default([]),
    bcc: z.array(mailboxAddressSchema).max(50).optional().default([]),
    subject: z.string().trim().max(1024).optional().default(""),
    bodyHtml: z.string().max(500_000).optional(),
    bodyText: z.string().max(500_000).optional()
  })
  .strict();

export const mailboxDraftMessageIdParamsSchema = z.object({
  messageId: z.string().uuid()
});

export const mailboxCalendarEventsQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  connectionId: z.string().uuid().optional()
});

export const mailboxEventIdParamsSchema = z.object({
  eventId: z.string().uuid()
});

export const mailboxEventRsvpBodySchema = z
  .object({
    response: z.enum(["accepted", "declined", "tentative"])
  })
  .strict();

import {
  calendarLocationTypeSchema,
  calendarRecurrenceFreqSchema,
  calendarRecurrenceScopeSchema,
  calendarReminderCodeSchema
} from "./calendar-event.js";

const mailboxCalendarEventFieldsSchema = z.object({
  title: z.string().trim().min(1).max(1024),
  description: z.string().max(50_000).optional(),
  location: z.string().trim().max(1024).optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  timezone: z.string().trim().min(1).max(64).optional(),
  allDay: z.boolean().optional().default(false),
  attendees: z.array(mailboxAddressSchema).max(50).optional().default([]),
  attendeeIds: z.array(z.string().uuid()).max(50).optional().default([]),
  addVideoMeeting: z.boolean().optional().default(false),
  busy: z.boolean().optional().default(true),
  isPrivate: z.boolean().optional().default(false),
  reminders: z.array(calendarReminderCodeSchema).max(8).optional().default(["10m"]),
  locationType: calendarLocationTypeSchema.optional().default("in_person"),
  recurrenceInterval: z.number().int().min(1).max(999).optional().default(1),
  recurrenceFreq: calendarRecurrenceFreqSchema.optional().default("none"),
  stopRecurrenceDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
});

export const mailboxCalendarEventCreateBodySchema = mailboxCalendarEventFieldsSchema
  .extend({
    connectionId: z.string().uuid()
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.recurrenceFreq !== "none" && !value.stopRecurrenceDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "stopRecurrenceDate required when recurrence is set",
        path: ["stopRecurrenceDate"]
      });
    }
  });

export const mailboxCalendarEventUpdateBodySchema = mailboxCalendarEventFieldsSchema
  .partial()
  .extend({
    recurrenceScope: calendarRecurrenceScopeSchema.optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.recurrenceFreq !== undefined && value.recurrenceFreq !== "none" && value.stopRecurrenceDate === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "stopRecurrenceDate required when recurrence is set",
        path: ["stopRecurrenceDate"]
      });
    }
  });

export const mailboxCalendarEventDeleteBodySchema = z
  .object({
    recurrenceScope: calendarRecurrenceScopeSchema.optional(),
    occurrenceDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
  })
  .strict();

export const MAILBOX_SYNC_SCAN_JOB_NAME = "mailbox-sync-scan";
export const MAILBOX_SYNC_ACCOUNT_JOB_NAME = "mailbox-sync-account";
export const MAILBOX_SYNC_CALENDAR_JOB_NAME = "mailbox-sync-calendar";
export const MAILBOX_PARSE_INVITE_JOB_NAME = "mailbox-parse-invite";

/** Max accounts enqueued per background scan (fan-out batch). */
export const MAILBOX_SYNC_SCAN_BATCH = 100;

/** Minimum interval between automatic poll syncs for the same account. */
export const MAILBOX_SYNC_ACCOUNT_POLL_INTERVAL_MS = 300_000;

/** Accounts stuck in `syncing` longer than this are eligible for re-queue. */
export const MAILBOX_SYNC_STALE_SYNCING_MS = 900_000;

/** BullMQ custom job ids must not contain `:` (reserved delimiter). */
export const mailboxSyncScanJobId = (hourBucket: string): string =>
  `${MAILBOX_SYNC_SCAN_JOB_NAME}-${hourBucket}`;

export const mailboxSyncAccountJobId = (accountId: string): string =>
  `${MAILBOX_SYNC_ACCOUNT_JOB_NAME}-${accountId}`;

export const mailboxSyncCalendarJobId = (accountId: string): string =>
  `${MAILBOX_SYNC_CALENDAR_JOB_NAME}-${accountId}`;

export const mailboxParseInviteJobId = (messageId: string): string =>
  `${MAILBOX_PARSE_INVITE_JOB_NAME}-${messageId}`;

/** Shared BullMQ options for mailbox sync jobs (producer + worker). */
export const mailboxSyncJobDefaults = {
  removeOnComplete: { age: 3600 },
  removeOnFail: { age: 86_400 },
  attempts: 5,
  backoff: { type: "exponential" as const, delay: 30_000 }
};

export const MAILBOX_INTERNAL_HEADERS_VERSION = 1;

export const MAILBOX_EMBEDDED_SENT_EMAIL_KINDS = ["quote", "offer", "invoice"] as const;
export type MailboxEmbeddedSentEmailKind = (typeof MAILBOX_EMBEDDED_SENT_EMAIL_KINDS)[number];

export const mailboxEmbeddedSentEmailSchema = z.object({
  kind: z.enum(MAILBOX_EMBEDDED_SENT_EMAIL_KINDS),
  displayNumber: z.string().trim().min(1).max(64),
  to: z.string().trim().email().max(320),
  subject: z.string().trim().max(1024),
  bodyHtml: z.string().max(500_000)
});

export type MailboxEmbeddedSentEmail = z.infer<typeof mailboxEmbeddedSentEmailSchema>;

export const mailboxInternalHeadersSchema = z.object({
  v: z.literal(MAILBOX_INTERNAL_HEADERS_VERSION).default(MAILBOX_INTERNAL_HEADERS_VERSION),
  embeddedSentEmail: mailboxEmbeddedSentEmailSchema.optional()
});

export type MailboxInternalHeaders = z.infer<typeof mailboxInternalHeadersSchema>;

export const buildMailboxInternalHeaders = (input: {
  embeddedSentEmail?: MailboxEmbeddedSentEmail;
}): string => JSON.stringify({ v: MAILBOX_INTERNAL_HEADERS_VERSION, ...input });

export const parseMailboxInternalHeaders = (
  headersJson: string | null | undefined
): Pick<MailboxInternalHeaders, "embeddedSentEmail"> => {
  if (!headersJson?.trim()) return {};
  try {
    const parsed = mailboxInternalHeadersSchema.safeParse(JSON.parse(headersJson));
    return parsed.success ? { embeddedSentEmail: parsed.data.embeddedSentEmail } : {};
  } catch {
    return {};
  }
};

export const mailboxOAuthProviderSchema = z.enum(["google", "microsoft"]);

export const MAILBOX_SYNC_JOB_KINDS = ["mail", "calendar"] as const;
export type MailboxSyncJobKind = (typeof MAILBOX_SYNC_JOB_KINDS)[number];

export const MAILBOX_SYNC_JOB_STATES = [
  "waiting",
  "active",
  "completed",
  "failed",
  "delayed",
  "unknown"
] as const;
export type MailboxSyncJobState = (typeof MAILBOX_SYNC_JOB_STATES)[number];

export const mailboxSyncJobStatusSchema = z.object({
  kind: z.enum(MAILBOX_SYNC_JOB_KINDS),
  name: z.string(),
  label: z.string(),
  jobId: z.string(),
  state: z.enum(MAILBOX_SYNC_JOB_STATES),
  detail: z.string().nullable(),
  failedReason: z.string().nullable(),
  processedOn: z.number().nullable(),
  finishedOn: z.number().nullable()
});

export const mailboxSyncLaneStatusSchema = z.object({
  syncStatus: z.enum(MAILBOX_SYNC_STATUSES),
  syncError: z.string().nullable(),
  lastSyncedAt: z.string().datetime().nullable()
});

export const mailboxAccountSyncStatusResponseSchema = z.object({
  account: mailboxSyncLaneStatusSchema,
  calendar: mailboxSyncLaneStatusSchema.nullable(),
  jobs: z.array(mailboxSyncJobStatusSchema)
});

export const mailboxAccountSyncTriggerResponseSchema = z.object({
  enqueued: z.boolean(),
  jobId: z.string()
});

export type MailboxSyncJobStatus = z.infer<typeof mailboxSyncJobStatusSchema>;
export type MailboxSyncLaneStatus = z.infer<typeof mailboxSyncLaneStatusSchema>;
export type MailboxAccountSyncStatusResponse = z.infer<typeof mailboxAccountSyncStatusResponseSchema>;
export type MailboxAccountSyncTriggerResponse = z.infer<typeof mailboxAccountSyncTriggerResponseSchema>;

export type MailboxThreadsQueryInput = z.infer<typeof mailboxThreadsQuerySchema>;
export type MailboxImapConnectBodyInput = z.infer<typeof mailboxImapConnectBodySchema>;
export type MailboxComposeBodyInput = z.infer<typeof mailboxComposeBodySchema>;
export type MailboxEventRsvpBodyInput = z.infer<typeof mailboxEventRsvpBodySchema>;
export type MailboxCalendarEventCreateBodyInput = z.infer<typeof mailboxCalendarEventCreateBodySchema>;
export type MailboxCalendarEventUpdateBodyInput = z.infer<typeof mailboxCalendarEventUpdateBodySchema>;
export type MailboxCalendarEventDeleteBodyInput = z.infer<typeof mailboxCalendarEventDeleteBodySchema>;
