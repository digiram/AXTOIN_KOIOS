/**
 * `@starter/shared` — cross-package contracts (API, web, mobile).
 *
 * Keep **request validation schemas** (Zod) here so clients cannot drift from server expectations.
 * Types inferred via `z.infer` propagate to TypeScript consumers without duplicating interfaces.
 */

import { z } from "zod";

export {
  DEFAULT_API_LISTEN_PORT,
  resolveApiListenPort,
  resolveWorkerHealthListenPort
} from "./api-listen-port.js";

export {
  DATABASE_QUEUE_DEFAULTS,
  databaseDialectFromEnv,
  queueStrategyFromEnv,
  sqlDialectSupportsLocalQueue,
  usesDatabaseBackend,
  usesRedisBackend,
  type DatabaseDialect,
  type QueueStrategy
} from "./queue-backend.js";

export {
  API_CSP_DIRECTIVES,
  apiHttpContentSecurityPolicy,
  cspHttpHeaderBytes,
  hostnameFromOrigin,
  metaContentSecurityPolicy,
  parseCommaSeparatedHosts,
  resolveCspMode,
  securityHeaders,
  shouldUseMetaCspOnly,
  serializeCspDirectives,
  STRIPE_CSP_HOSTS,
  WEB_IMG_SRC_HOSTS,
  type CspEnv,
  type CspMode,
  type MetaCspOptions,
  type SecurityHeadersOptions
} from "./content-security-policy.js";

export {
  CONSUMER_EMAIL_PROVIDER_DOMAINS,
  extractEmailDomain,
  isConsumerEmailProviderDomain,
  normalizeRegistrationEmail
} from "./email-domain.js";

/**
 * Login: **`email` + `password` only**. The API resolves **platform** (`super_admin`, no tenant) vs **realm** users by
 * trying the super-admin row first, then deriving `tenant_id` from the **email domain** (same rules as registration).
 */
export const loginSchema = z
  .object({
    email: z.string().trim().min(1).max(320),
    password: z.string().min(8)
  })
  .strict();

/** Optional body for `POST /auth/logout` — revoke all refresh sessions when authenticated. */
export const logoutSchema = z
  .object({
    revokeAll: z.boolean().optional()
  })
  .strict();

/**
 * Registration: **email domain** selects the realm (`tenants.name` = lowercase domain for corporate mail;
 * consumer domains get a deterministic personal tenant — see API). `name` is display-only for now.
 */
export const registerSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().trim().email(),
  password: z.string().min(8)
});

/** Step 1 of signup — same fields as `registerSchema`; sends an email verification code. */
export const registerStartSchema = registerSchema;

/** Step 2 — completes signup after the verification code is entered. */
export const registerVerifySchema = z
  .object({
    registrationTicket: z.string().min(1),
    code: z.string().min(4).max(16)
  })
  .strict();

export type LoginInput = z.infer<typeof loginSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;
export type RegisterStartInput = z.infer<typeof registerStartSchema>;
export type RegisterVerifyInput = z.infer<typeof registerVerifySchema>;

/** Platform operator (no tenant); realm owner; realm member. */
export const userRoleSchema = z.enum(["super_admin", "tenant_admin", "tenant_user"]);
export type UserRole = z.infer<typeof userRoleSchema>;

/** Populated after auth middleware resolves JWT — handy for future shared handlers. */
export type TenantContext = {
  userId: string;
  /** Present for realm sessions; omitted for platform super-admin tokens. */
  tenantId?: string;
};

/** Stable JSON error shape returned by Fastify routes on failures. */
export type ApiErrorBody = {
  error: string;
  message: string;
};

export {
  accountClockTimeFormatSchema,
  accountSettingsPatchSchema,
  changePasswordSchema,
  currencyFormatSchema,
  dateTimeFormatSchema,
  measurementSystemSchema,
  type AccountSettingsPatchInput,
  type ChangePasswordInput
} from "./account-settings.js";

export {
  calendarYmdInTimezone,
  DATE_TIME_FORMAT_IDS,
  DATE_TIME_FORMAT_LABELS,
  displayLocaleFromRegionalDateFormat,
  formatRegionalCalendarDate,
  regionalDateFormatFamily,
  type DateTimeFormatId,
  type RegionalDateFormatFamily
} from "./regional-date-format.js";

export {
  platformRealmFilterSchema,
  platformTenantsQuerySchema,
  platformUserCreateBodySchema,
  platformUserIdParamsSchema,
  platformUsersQuerySchema,
  platformUsersSortSchema,
  type PlatformTenantsQueryInput,
  type PlatformUserCreateBody,
  type PlatformUserIdParams,
  type PlatformUsersQueryInput
} from "./platform-users.js";

export {
  PLATFORM_QUEUE_TEST_JOB_NAME,
  SUBSCRIPTION_BILLING_RENEWAL_SCAN_JOB_NAME,
  SUBSCRIPTION_BILLING_RENEWAL_CHARGE_JOB_NAME,
  platformJobConcreteStateSchema,
  platformJobQueueIdParamsSchema,
  platformJobQueueIdSchema,
  platformJobStateSchema,
  platformJobsListQuerySchema,
  type PlatformJobConcreteState,
  type PlatformJobQueueId,
  type PlatformJobQueueIdParams,
  type PlatformJobQueuesResponse,
  type PlatformJobState,
  type PlatformJobsListQueryInput
} from "./platform-jobs.js";

export {
  platformMailSmtpPutBodySchema,
  type PlatformMailSmtpPutBodyInput
} from "./platform-mail.js";

export {
  tenantMailSmtpPutBodySchema,
  type TenantMailSmtpPutBodyInput
} from "./tenant-mail.js";

export { mailSmtpTestBodySchema, type MailSmtpTestBodyInput } from "./mail-smtp-test.js";

export {
  DEFAULT_PLATFORM_ACCEPTED_PAYMENT_METHODS,
  PLATFORM_PAYMENT_METHOD_IDS,
  parseAcceptedPaymentMethodsJson,
  platformGeolocationPutBodySchema,
  platformModuleSettingsPutBodySchema,
  platformPaymentAdyenEnvironmentSchema,
  platformPaymentMethodIdSchema,
  platformPaymentProviderSchema,
  platformPaymentPutBodySchema,
  serializeAcceptedPaymentMethods,
  type PlatformGeolocationPutBodyInput,
  type PlatformModuleSettingsPutBodyInput,
  type PlatformPaymentMethodId,
  type PlatformPaymentPutBodyInput
} from "./platform-integrations.js";

export { addDaysUtc, addMonthsUtc, firstPeriodPriceCents, isV1SubscriberPlan } from "./subscription-billing.js";

export {
  realmSubscriptionCancelBodySchema,
  realmSubscriptionCreateBodySchema,
  realmSubscriptionSchedulePlanChangeBodySchema,
  subscriptionCancelEffectiveSchema,
  subscriptionStatusSchema,
  type RealmSubscriptionCancelBodyInput,
  type RealmSubscriptionCreateBodyInput,
  type RealmSubscriptionSchedulePlanChangeBodyInput,
  type SubscriptionCancelEffective,
  type SubscriptionStatus
} from "./realm-subscriptions.js";

export {
  platformSubscriptionPaymentsExportQuerySchema,
  platformSubscriptionPaymentsListQuerySchema,
  platformSubscriptionPlanAuditListQuerySchema,
  platformSubscriptionPlanCreateBodySchema,
  platformSubscriptionPlanIdParamsSchema,
  platformSubscriptionPaymentIdParamsSchema,
  platformSubscriptionPlanSetDisabledBodySchema,
  platformSubscriptionPlanUpdateBodySchema,
  platformSubscriptionSettingsPutBodySchema,
  subscriptionBillingScopeSchema,
  subscriptionDurationUnitSchema,
  subscriptionPaymentStatusSchema,
  type PlatformSubscriptionPaymentsExportQueryInput,
  type PlatformSubscriptionPaymentsListQueryInput,
  type PlatformSubscriptionPlanAuditListQueryInput,
  type PlatformSubscriptionPlanCreateBodyInput,
  type PlatformSubscriptionPlanSetDisabledBodyInput,
  type PlatformSubscriptionPlanUpdateBodyInput,
  type PlatformSubscriptionSettingsPutBodyInput,
  type SubscriptionBillingScope,
  type SubscriptionDurationUnit,
  type SubscriptionPaymentStatus
} from "./platform-subscriptions.js";

export {
  tenantRealmGeneralPutBodySchema,
  tenantSelfRegistrationQuerySchema,
  type TenantRealmGeneralPutBodyInput,
  type TenantSelfRegistrationQueryInput
} from "./tenant-realm-settings.js";

export {
  workforceEmployeeCreateSchema,
  workforceEmployeeDisplayName,
  workforceEmployeeDocumentParamsSchema,
  workforceEmployeeIdParamsSchema,
  workforceEmployeeKindSchema,
  workforceEmployeePatchSchema,
  workforceEmployeesListQuerySchema,
  workforceOrgUnitCreateSchema,
  workforceOrgUnitIdParamsSchema,
  workforceOrgUnitPatchSchema,
  workforceSocialProviderSchema,
  workforceWorkScheduleDayCodeSchema,
  workforceWorkScheduleDayShortLabel,
  workforceWorkScheduleEntrySchema,
  workforceWorkScheduleSchema,
  workforceWorkTimeKindSchema,
  isLinkedinProfileHost,
  parseWorkforceWorkScheduleJson,
  stringifyWorkforceWorkScheduleForDb,
  type WorkforceEmployeeCreateInput,
  type WorkforceEmployeeDocumentParams,
  type WorkforceEmployeeIdParams,
  type WorkforceEmployeeKind,
  type WorkforceEmployeePatchInput,
  type WorkforceEmployeesListQueryInput,
  type WorkforceOrgUnitCreateInput,
  type WorkforceOrgUnitIdParams,
  type WorkforceOrgUnitPatchInput,
  type WorkforceSocialProvider,
  type WorkforceWorkScheduleDayCode,
  type WorkforceWorkScheduleEntry,
  type WorkforceWorkTimeKind
} from "./workforce.js";

export {
  COMPANY_SUBSCRIPTION_CADENCE_KINDS,
  COMPANY_SUBSCRIPTION_CADENCE_UNITS,
  COMPANY_SUBSCRIPTION_KINDS,
  COMPANY_SUBSCRIPTION_SEAT_STATUSES,
  COMPANY_SUBSCRIPTION_STATUSES,
  isSeatedCompanySubscription,
  isSingularCompanySubscription,
  subscriptionKindLabel,
  companySubscriptionBillingMetadataSchema,
  companySubscriptionCadenceFieldsSchema,
  companySubscriptionCadenceKindSchema,
  companySubscriptionCadenceUnitSchema,
  companySubscriptionKindSchema,
  companySubscriptionPlanCreateSchema,
  companySubscriptionPlanIdOnlyParamsSchema,
  companySubscriptionPlanParamsSchema,
  companySubscriptionPlanPatchSchema,
  companySubscriptionProviderCreateSchema,
  companySubscriptionProviderDocumentParamsSchema,
  companySubscriptionProviderIdOnlyParamsSchema,
  companySubscriptionProviderIdParamsSchema,
  companySubscriptionProviderPatchSchema,
  companySubscriptionProvidersListQuerySchema,
  companySubscriptionSeatCreateSchema,
  companySubscriptionSeatParamsSchema,
  companySubscriptionSeatPatchSchema,
  companySubscriptionSeatStatusSchema,
  companySubscriptionStatusSchema,
  parseCompanySubscriptionBillingMetadataJson,
  stringifyCompanySubscriptionBillingMetadataForDb,
  type CompanySubscriptionBillingMetadata,
  type CompanySubscriptionCadenceKind,
  type CompanySubscriptionKind,
  type CompanySubscriptionPlanCreateInput,
  type CompanySubscriptionPlanPatchInput,
  type CompanySubscriptionProviderCreateInput,
  type CompanySubscriptionProviderPatchInput,
  type CompanySubscriptionProvidersListQueryInput,
  type CompanySubscriptionSeatCreateInput,
  type CompanySubscriptionSeatPatchInput,
  type CompanySubscriptionSeatStatus,
  type CompanySubscriptionStatus
} from "./company-subscriptions.js";

export {
  addBillingCadenceToIsoDate,
  deriveRenewalAndEndFromStart,
  type BillingCadencePeriodInput,
  type CompanySubscriptionCadenceUnit
} from "./company-subscription-cadence-dates.js";

export {
  amountMinorPerMonth,
  planMonthlyCostMinor,
  planSeatMultiplier,
  sumPlansMonthlyCostMinor,
  type RecurringCostCadenceInput
} from "./company-subscription-recurring-cost.js";

export {
  INVOICING_DOCUMENT_KINDS,
  INVOICING_DOCUMENT_THEME_COLORS,
  INVOICING_QUOTE_STATUSES,
  INVOICING_OFFER_STATUSES,
  INVOICING_INVOICE_STATUSES,
  invoicingCatalogItemCreateSchema,
  invoicingCatalogItemPatchSchema,
  invoicingCatalogListQuerySchema,
  invoicingCatalogItemIdParamsSchema,
  invoicingConfigurationPutSchema,
  invoicingDocumentsListQuerySchema,
  invoicingDocumentKindLabel,
  invoicingDocumentThemeColorLabel,
  invoicingDocumentThemeColorSchema,
  defaultInvoicingTermsTextForKind,
  DEFAULT_QUOTE_VALIDITY_DAYS,
  DEFAULT_PAYMENT_TERM_DAYS,
  DEFAULT_INVOICING_TAX_RATE_OPTIONS,
  defaultQuoteExpiryDate,
  quoteValidityDaysFromDates,
  quoteExpiryDateFromValidityDays,
  resolveQuoteExpiryDate,
  resolveInvoicingPaymentTermDays,
  formatInvoicingPaymentTermDays,
  formatInvoicingStatus,
  invoicingTaxRateOptionSchema,
  invoicingTaxRateOptionsSchema,
  parseInvoicingTaxRateOptions,
  invoicingTaxRateOptionLabel,
  defaultInvoicingTaxRateBps,
  formatInvoicingCustomerBillingAddress,
  formatInvoicingMoneyMinor,
  formatInvoicingIsoDate,
  escapeInvoicingEmailHtml,
  type InvoicingTaxRateOption,
  invoicingQuoteCreateSchema,
  invoicingQuotePatchSchema,
  invoicingQuoteIdParamsSchema,
  invoicingOfferIdParamsSchema,
  invoicingInvoiceIdParamsSchema,
  invoicingPromoteToOfferBodySchema,
  invoicingSendOfferBodySchema,
  invoicingSendDocumentEmailBodySchema,
  type InvoicingSendDocumentEmailBodyInput,
  invoicingSendInvoiceBodySchema,
  invoicingPromoteToInvoiceBodySchema,
  invoicingDemoteToQuoteBodySchema,
  invoicingAcceptOfferBodySchema,
  invoicingRejectOfferBodySchema,
  invoicingPublicOfferResponseTokenParamsSchema,
  invoicingPublicOfferDecisionBodySchema,
  type InvoicingPublicOfferDecisionBodyInput,
  INVOICING_OFFER_RESPONSE_TOKEN_BYTE_LENGTH,
  invoicingDisputeInvoiceBodySchema,
  invoicingAcknowledgeInvoiceDisputeBodySchema,
  invoicingDenyInvoiceDisputeBodySchema,
  type InvoicingAcknowledgeInvoiceDisputeBodyInput,
  type InvoicingDenyInvoiceDisputeBodyInput,
  invoicingRegisterInvoicePaymentBodySchema,
  invoicingPaymentsListQuerySchema,
  INITIAL_INVOICING_DOCUMENT_REVISION,
  invoicingAuditEventKindLabel,
  invoicingAuditEventKindSequence,
  compareInvoicingAuditEventsByRecency,
  invoicingDocumentPathSegment,
  compareInvoicingRevisions,
  INVOICING_AUDIT_EVENT_KINDS,
  nextInvoicingOfferRevision,
  formatInvoicingOfferDisplayNumber,
  formatInvoicingInvoiceDisplayNumber,
  formatInvoicingQuoteDocumentNumber,
  INVOICING_QUOTE_RANDOM_ID_ALPHABET,
  INVOICING_QUOTE_RANDOM_ID_LENGTH,
  isDeletableQuoteStatus,
  isEditableQuoteStatus,
  isOfferPendingDecision,
  canSendQuoteEmail,
  canSendOfferEmail,
  canSendInvoiceEmail,
  canPromoteOfferToInvoice,
  canDemoteOfferToQuote,
  canDemoteInvoiceToQuote,
  canRegisterInvoicePayment,
  canDisputeInvoice,
  canResolveInvoiceDispute,
  type InvoicingInvoiceDisputeResolution,
  type InvoicingAuditEventRecencyInput,
  sliceInvoiceDisputeCycleEventsAfterDispute,
  resolveInvoiceDisputeResolutionFromAuditEvents,
  resolveInvoiceCustomerDisputeNoteFromAuditEvents,
  resolveInvoiceCustomerDisputeNoteForSidebar,
  hasInvoiceDisputeAcknowledgmentRecordedInCurrentCycle,
  hasInvoiceDisputeAcknowledgmentFollowUp,
  canApplyDisputeAcknowledgmentFollowUp,
  invoicingDisputeAcknowledgmentDiscountBodySchema,
  invoicingDisputeAcknowledgmentFullCreditBodySchema,
  type InvoicingDisputeAcknowledgmentDiscountBodyInput,
  type InvoicingDisputeAcknowledgmentFullCreditBodyInput,
  formatInvoicingDisputeDiscountLineDescription,
  formatInvoicingDisputeFullCreditLineDescription,
  canArchiveInvoice,
  formatInvoicingPaymentCreditLineDescription,
  isInvoicingPaymentLineKind,
  parseInvoicingJson,
  parseInvoicingIssuerSnapshot,
  resolveInvoicingIssuerSnapshot,
  invoicingIssuerSnapshotHasDetails,
  stringifyInvoicingJson,
  type InvoicingCatalogItemCreateInput,
  type InvoicingCatalogItemPatchInput,
  type InvoicingCatalogListQueryInput,
  type InvoicingConfigurationPutInput,
  type InvoicingDefaultTermsConfiguration,
  type InvoicingCustomerSnapshot,
  type InvoicingIssuerSnapshot,
  type InvoicingDocumentKind,
  type InvoicingDocumentThemeColor,
  type InvoicingDocumentsListQueryInput,
  type InvoicingInvoiceStatus,
  type InvoicingLineItemInput,
  type InvoicingOfferStatus,
  type InvoicingQuoteCreateInput,
  type InvoicingQuotePatchInput,
  type InvoicingQuoteStatus,
  type InvoicingRegisterInvoicePaymentInput,
  type InvoicingPaymentsListQueryInput,
  type InvoicingTaxBreakdownEntry
} from "./invoicing.js";

export {
  MAILBOX_PROVIDERS,
  MAILBOX_FOLDERS,
  MAILBOX_SYNC_SCAN_JOB_NAME,
  MAILBOX_SYNC_ACCOUNT_JOB_NAME,
  MAILBOX_SYNC_CALENDAR_JOB_NAME,
  MAILBOX_PARSE_INVITE_JOB_NAME,
  MAILBOX_SYNC_SCAN_BATCH,
  MAILBOX_SYNC_ACCOUNT_POLL_INTERVAL_MS,
  MAILBOX_SYNC_STALE_SYNCING_MS,
  mailboxSyncScanJobId,
  mailboxSyncAccountJobId,
  mailboxSyncCalendarJobId,
  mailboxParseInviteJobId,
  mailboxSyncJobDefaults,
  mailboxThreadsQuerySchema,
  mailboxThreadIdParamsSchema,
  mailboxMessageIdParamsSchema,
  mailboxAccountIdParamsSchema,
  mailboxThreadPatchSchema,
  mailboxThreadsBulkPatchSchema,
  mailboxThreadsEmptyTrashQuerySchema,
  mailboxAttachmentIdParamsSchema,
  MAILBOX_ATTACHMENT_MAX_FILE_BYTES,
  MAILBOX_ATTACHMENT_MAX_FILES_PER_MESSAGE,
  MAILBOX_ATTACHMENT_MAX_TOTAL_BYTES,
  MAILBOX_ATTACHMENT_BLOCKED_EXTENSIONS,
  mailboxImapConnectBodySchema,
  mailboxAgentImapConnectBodySchema,
  mailboxAgentEmployeeIdParamsSchema,
  mailboxAccountMemberDeleteParamsSchema,
  mailboxSharedAccountCreateBodySchema,
  mailboxAccountMemberPutBodySchema,
  mailboxComposeBodySchema,
  mailboxDraftBodySchema,
  mailboxDraftMessageIdParamsSchema,
  mailboxCalendarEventsQuerySchema,
  mailboxCalendarEventCreateBodySchema,
  mailboxCalendarEventUpdateBodySchema,
  mailboxCalendarEventDeleteBodySchema,
  mailboxEventIdParamsSchema,
  mailboxEventRsvpBodySchema,
  mailboxAccountSyncStatusResponseSchema,
  mailboxAccountSyncTriggerResponseSchema,
  mailboxOAuthProviderSchema,
  MAILBOX_SYNC_JOB_KINDS,
  MAILBOX_SYNC_JOB_STATES,
  buildMailboxInternalHeaders,
  parseMailboxInternalHeaders,
  mailboxConnectionTypeLabel,
  MAILBOX_ACCENT_COLORS,
  pickMailboxAccentColor,
  type MailboxAccentColor,
  type MailboxProvider,
  type MailboxFolder,
  type MailboxAddress,
  type MailboxAccountMemberRole,
  type MailboxOwnerScope,
  type MailboxInternalSource,
  type MailboxEmbeddedSentEmail,
  type MailboxEmbeddedSentEmailKind,
  type MailboxImapConnectBodyInput,
  type MailboxComposeBodyInput,
  type MailboxEventRsvpBodyInput,
  type MailboxCalendarEventCreateBodyInput,
  type MailboxCalendarEventUpdateBodyInput,
  type MailboxCalendarEventDeleteBodyInput,
  type MailboxAccountSyncStatusResponse,
  type MailboxAccountSyncTriggerResponse,
  type MailboxSyncJobStatus,
  type MailboxSyncLaneStatus,
  type MailboxSyncJobKind,
  type MailboxSyncJobState
} from "./mailbox.js";

export {
  isMailboxOAuthReconnectRequired,
  MAILBOX_OAUTH_RECONNECT_HINT
} from "./mailbox-sync-errors.js";

export {
  CALENDAR_REMINDER_CODES,
  CALENDAR_RECURRENCE_FREQS,
  CALENDAR_RECURRENCE_SCOPES,
  CALENDAR_LOCATION_TYPES,
  buildCalendarRrule,
  computeRecurrencePreview,
  defaultStopRecurrenceDate,
  parseCalendarRrule,
  parseMailboxCalendarEventExtras,
  serializeMailboxCalendarEventExtras,
  dateToYmd,
  ymdToLocalDate,
  reminderCodeToMinutes,
  type CalendarReminderCode,
  type CalendarRecurrenceFreq,
  type CalendarRecurrenceScope,
  type CalendarLocationType,
  type MailboxCalendarEventExtras
} from "./calendar-event.js";

export {
  invoicingDocumentEmailThemeHex,
  type InvoicingDocumentEmailThemeHex
} from "./invoicing-document-email-theme.js";

export {
  aggregateInvoicingLinesWithTaxBreakdown,
  computeInvoicingLineTotals,
  sumInvoicingDocumentTotalsFromStoredLines,
  type ComputedInvoicingLine,
  type InvoicingStoredLineTotals
} from "./invoicing-totals.js";

export {
  INVOICING_LIFECYCLE_SCAN_JOB_NAME,
  INVOICING_EXPIRE_OFFER_JOB_NAME,
  INVOICING_MARK_INVOICE_OVERDUE_JOB_NAME,
  INVOICING_PAYMENT_REMINDER_JOB_NAME,
  INVOICING_PAYMENT_REMINDER_EMAIL_JOB_NAME,
  INVOICING_PAYMENT_REMINDER_KINDS,
  DEFAULT_INVOICING_REMINDER_FIRST_OFFSET_DAYS,
  DEFAULT_INVOICING_REMINDER_SECOND_OFFSET_DAYS,
  todayIsoDateUtc,
  addDaysToIsoDate,
  computeInvoiceDueDateFromFinalizedAt,
  computeInvoiceDueDateFromPartialAnchor,
  isQuoteSoftExpired,
  isOfferPastValidity,
  isInvoicingOfferCustomerResponseAllowed,
  formatInvoicingPublicOfferDecisionProof,
  resolveOfferExpiryDateForSend,
  defaultOfferExpiryDateForSend,
  resolvePaymentTermDaysForFinalize,
  resolveInvoiceDueDateForSend,
  defaultInvoiceDueDateForSend,
  resolveInvoicingReminderOffsets,
  invoicingPaymentReminderTriggerDate,
  invoicePaymentTermDaysResolved,
  type InvoicingPaymentReminderKind,
  type InvoicingPaymentReminderEmailJobPayload,
  type InvoicingReminderScheduleConfiguration
} from "./invoicing-lifecycle.js";

export {
  INVOICING_EMAIL_MOMENT_DEFINITIONS,
  INVOICING_EMAIL_MOMENT_DISABLED_MESSAGE,
  INVOICING_EMAIL_MOMENT_KEYS,
  defaultInvoicingEmailMomentsEnabled,
  invoicingDocumentKindToEmailMomentKey,
  invoicingEmailMomentIsEnabled,
  invoicingEmailMomentKeySchema,
  invoicingEmailMomentsPatchSchema,
  isInvoicingEmailMomentEnabled,
  parseInvoicingEmailMomentsOverrides,
  resolveInvoicingEmailMomentsEnabled,
  serializeInvoicingEmailMomentsForApi,
  type InvoicingEmailMomentApiRow,
  type InvoicingEmailMomentCategory,
  type InvoicingEmailMomentDefinition,
  type InvoicingEmailMomentKey,
  type InvoicingEmailMomentsConfiguration,
  type InvoicingEmailMomentsEnabled,
  type InvoicingEmailMomentsPatchInput
} from "./invoicing-email-moments.js";

export {
  BDR_STAGE_KEYS,
  DEFAULT_SALES_FUNNEL_BDR_STAGES,
  DEFAULT_SALES_FUNNEL_SALES_STAGES,
  SALES_FUNNEL_PIPELINES,
  SALES_FUNNEL_STAGE_OUTCOMES,
  SALES_STAGE_KEYS,
  isSalesFunnelModuleAvailable,
  salesFunnelPipelineSchema,
  salesFunnelPipelineStagesPatchSchema,
  salesFunnelStageOutcomeSchema,
  type SalesFunnelDefaultStage,
  type SalesFunnelPipeline,
  type SalesFunnelPipelineStagesPatchInput,
  type SalesFunnelStageOutcome
} from "./sales-funnel.js";

export {
  salesFunnelStageCreateSchema,
  salesFunnelStageIdParamsSchema,
  salesFunnelStagePatchSchema,
  salesFunnelStageReorderSchema,
  type SalesFunnelStageCreateInput,
  type SalesFunnelStagePatchInput,
  type SalesFunnelStageReorderInput
} from "./sales-funnel-stages.js";

export {
  SALES_FUNNEL_MANUAL_ACTIVITY_TYPES,
  parseSalesFunnelActivityContactIds,
  salesFunnelManualActivitySchema,
  type SalesFunnelManualActivityInput,
  type SalesFunnelManualActivityType
} from "./sales-funnel-activities.js";

export {
  parseSalesFunnelTagsJson,
  salesFunnelBdrLeadCreateSchema,
  salesFunnelBdrLeadIdParamsSchema,
  salesFunnelBdrLeadNoteSchema,
  salesFunnelBdrLeadPromoteSchema,
  salesFunnelBdrLeadPatchSchema,
  salesFunnelBdrLeadStagePatchSchema,
  salesFunnelBdrLeadsListQuerySchema,
  stringifySalesFunnelTags,
  type SalesFunnelBdrLeadCreateInput,
  type SalesFunnelBdrLeadIdParams,
  type SalesFunnelBdrLeadPatchInput,
  type SalesFunnelBdrLeadPromoteInput,
  type SalesFunnelBdrLeadsListQueryInput
} from "./sales-funnel-leads.js";

export {
  salesFunnelDealOutcomeBucketSchema,
  salesFunnelSalesDealCreateSchema,
  salesFunnelSalesDealIdParamsSchema,
  salesFunnelSalesDealNoteSchema,
  salesFunnelSalesDealPatchSchema,
  salesFunnelSalesDealStagePatchSchema,
  salesFunnelSalesDealsListQuerySchema,
  type SalesFunnelSalesDealCreateInput,
  type SalesFunnelSalesDealIdParams,
  type SalesFunnelSalesDealPatchInput,
  type SalesFunnelSalesDealsListQueryInput
} from "./sales-funnel-deals.js";

export {
  salesFunnelContactLinkSchema,
  resolveSalesFunnelContactsPatch,
  type SalesFunnelContactLink
} from "./sales-funnel-contacts.js";

export {
  salesFunnelContactRoleCreateSchema,
  salesFunnelContactRoleIdParamsSchema,
  type SalesFunnelContactRoleCreateInput,
  type SalesFunnelContactRoleIdParams
} from "./sales-funnel-contact-roles.js";

export {
  authMfaEmailSendBodySchema,
  authMfaVerifyBodySchema,
  mfaEmailConfirmBodySchema,
  mfaTotpVerifyBodySchema
} from "./mfa.js";

export {
  crmActivitiesQuerySchema,
  crmActivityCreateSchema,
  crmActivityListDateFieldSchema,
  crmActivityListDatePresetSchema,
  crmActivityTypeSchema,
  crmAddressEntrySchema,
  crmAddressErrorsNested,
  crmAddressEntryHasContent,
  crmAddressFormRowToEntry,
  crmAddressRowHasContent,
  formatCrmAddressEntryOneLine,
  formatCrmPrimaryAddressLine,
  formatCrmPrimaryAddressCity,
  crmChannelEntrySchema,
  crmChannelPhoneValueSchema,
  crmContactCreateSchema,
  crmContactPatchSchema,
  crmEmailChannelEntrySchema,
  crmEntityKindSchema,
  crmGeocodeSearchQuerySchema,
  crmIdParamsSchema,
  crmListQuerySchema,
  crmOrganizationCreateSchema,
  crmOrganizationMarketingTagCreateSchema,
  crmOrganizationMarketingTagIdParamsSchema,
  crmOrganizationMarketSegmentCreateSchema,
  crmOrganizationSegmentIdParamsSchema,
  crmOrganizationPatchSchema,
  crmPhoneChannelEntrySchema,
  crmRelationshipCreateSchema,
  crmRelationshipsQuerySchema,
  CRM_SYSTEM_RELATIONSHIP_TYPE_DEFINITIONS,
  crmRelationshipTypeCreateSchema,
  isReservedCrmRelationshipTypeName,
  crmSimplePhoneDigitsCountOk,
  crmChannelErrorsByRow,
  toCrmAddressPayload,
  validateCrmAddressFormRows,
  validateCrmEmailFormRows,
  validateCrmPhoneFormRows,
  crmActivityDirectionSchema,
  type CrmActivitiesQueryInput,
  type CrmActivityDirection,
  type CrmActivityListDateField,
  type CrmActivityListDatePreset,
  type CrmActivityType,
  type CrmAddressEntry,
  type CrmAddressFieldError,
  type CrmAddressFormRowInput,
  type CrmChannelFormRowError,
  type CrmChannelEntry,
  type CrmEntityKind
} from "./crm.js";

export {
  tenantUserIdParamsSchema,
  tenantUsersQuerySchema,
  tenantUsersSortSchema,
  type TenantUserIdParams,
  type TenantUsersQueryInput
} from "./tenant-users.js";

export {
  MODULE_LABELS,
  MODULE_PERMISSION_COLUMNS,
  MODULE_PERMISSION_UI_COLUMNS,
  MODULE_ROLE_DESCRIPTIONS,
  MODULE_ROLE_LABELS,
  MODULE_ROLES,
  TENANT_MODULE_KEYS,
  applyModulePermissionToggle,
  applyUiPermissionToggle,
  emptyModulePermissionFlags,
  emptyModulePermissionUiFlags,
  moduleRoleToPermissionFlags,
  moduleRoleToUiPermissionFlags,
  moduleRolesMapToPermissionMatrix,
  moduleRolesMapToUiPermissionMatrix,
  permissionFlagsToModuleRole,
  permissionMatrixToModuleRolesMap,
  permissionMatrixToModuleRolesPatchBody,
  storageFlagsToUi,
  uiPermissionFlagsToModuleRole,
  uiPermissionMatrixToModuleRolesPatchBody,
  uiToStorageFlags,
  httpMethodToModulePermission,
  isTenantAdminRole,
  modulePermissionAllowed,
  moduleRoleSchema,
  parseModuleRolesClaim,
  resolveModuleRole,
  serializeModuleRolesClaim,
  tenantModuleKeySchema,
  tenantUserModuleRolesPatchSchema,
  type ModulePermission,
  type ModulePermissionFlags,
  type ModulePermissionToggle,
  type ModulePermissionUiFlags,
  type ModulePermissionUiKey,
  type ModuleRole,
  type TenantModuleKey,
  type TenantModuleRolesMap,
  type TenantUserModuleRolesPatchInput
} from "./module-roles.js";

export {
  mobileDevicePlatformSchema,
  registerMobileDeviceBodySchema,
  type MobileDevicePlatform,
  type RegisterMobileDeviceBodyInput
} from "./user-devices.js";
