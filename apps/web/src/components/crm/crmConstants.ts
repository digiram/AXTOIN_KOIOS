/**
 * crmConstants
 *
 * CRM activity type and direction labels for timeline UI and log forms.
 *
 * Responsibilities:
 * - Canonical activity type ordering and human-readable labels
 * - Tab order for the log-activity widget
 * - Inbound/outbound direction labels for call and mail activities
 *
 * Related:
 * - `ActivityTimeline`; `@starter/shared` CRM activity types
 */
import type { CrmActivityDirection, CrmActivityType } from "@starter/shared";

/** All CRM activity types shown in filters and type pickers. */
export const CRM_ACTIVITY_TYPES: CrmActivityType[] = [
  "CALL",
  "MEETING",
  "CONVERSATION",
  "NOTE",
  "EMAIL",
  "MAIL"
];

/** Tab order in the log-activity widget (matches common CRM flows). */
export const CRM_ACTIVITY_LOG_FORM_TAB_ORDER: CrmActivityType[] = [
  "NOTE",
  "CALL",
  "MAIL",
  "EMAIL",
  "MEETING",
  "CONVERSATION"
];

/** Human-readable label for each CRM activity type. */
export const CRM_ACTIVITY_TYPE_LABELS: Record<CrmActivityType, string> = {
  CALL: "Call",
  MEETING: "Meeting",
  CONVERSATION: "Conversation",
  NOTE: "Note",
  EMAIL: "Email",
  MAIL: "Mail"
};

/** Inbound/outbound values for activities that record direction. */
export const CRM_ACTIVITY_DIRECTIONS: CrmActivityDirection[] = ["INBOUND", "OUTBOUND"];

/** Display labels for {@link CRM_ACTIVITY_DIRECTIONS}. */
export const CRM_ACTIVITY_DIRECTION_LABELS: Record<CrmActivityDirection, string> = {
  INBOUND: "Inbound",
  OUTBOUND: "Outbound"
};
