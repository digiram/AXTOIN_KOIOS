/**
 * Invoicing email moment guard.
 *
 * Shared helpers that return a 409 `email_disabled` result when a tenant's
 * invoicing configuration has disabled a specific outbound email moment.
 *
 * Responsibilities:
 * - Map document kinds to email moment keys
 * - Centralize the disabled-response shape for route handlers
 */

import type { InvoicingConfigurationRow } from "@starter/db";
import {
  INVOICING_EMAIL_MOMENT_DISABLED_MESSAGE,
  invoicingDocumentKindToEmailMomentKey,
  invoicingEmailMomentIsEnabled,
  type InvoicingDocumentKind,
  type InvoicingEmailMomentKey
} from "@starter/shared";

export type InvoicingEmailDisabledResult = {
  ok: false;
  status: 409;
  error: "email_disabled";
  message: string;
};

/** Standard 409 response when an invoicing email moment is disabled in tenant configuration. */
export const invoicingEmailDisabledResult = (): InvoicingEmailDisabledResult => ({
  ok: false,
  status: 409,
  error: "email_disabled",
  message: INVOICING_EMAIL_MOMENT_DISABLED_MESSAGE
});

export const invoicingEmailMomentDisabledForConfiguration = (
  cfg: Pick<InvoicingConfigurationRow, "emailMomentsEnabled" | "paymentRemindersEnabled">,
  key: InvoicingEmailMomentKey
): InvoicingEmailDisabledResult | null =>
  invoicingEmailMomentIsEnabled(cfg, key) ? null : invoicingEmailDisabledResult();

export const invoicingDocumentEmailDisabledForConfiguration = (
  cfg: Pick<InvoicingConfigurationRow, "emailMomentsEnabled" | "paymentRemindersEnabled">,
  kind: InvoicingDocumentKind
): InvoicingEmailDisabledResult | null =>
  invoicingEmailMomentDisabledForConfiguration(cfg, invoicingDocumentKindToEmailMomentKey(kind));
