/**
 * Platform SMTP row field encryption (host, username, password).
 */

import { decryptRowAtBoundary, encryptRowAtBoundary } from "./repo-boundary.js";
import { sensitiveFieldsForTable } from "./registry.js";

export const PLATFORM_SMTP_TABLE_KEY = "platform_smtp_settings";

export const openPlatformSmtpRow = async (
  row: Record<string, unknown>
): Promise<Record<string, unknown>> =>
  decryptRowAtBoundary(PLATFORM_SMTP_TABLE_KEY, null, row, (plain) => plain);

export const sealPlatformSmtpFields = async (
  row: Record<string, unknown>,
  entityId: string,
  changedFields?: Set<string>
): Promise<Record<string, unknown>> =>
  encryptRowAtBoundary(PLATFORM_SMTP_TABLE_KEY, null, row, { entityId, changedFields });

export const sealPlatformSmtpPatch = async (
  patch: Record<string, unknown>,
  entityId: string
): Promise<Record<string, unknown>> => {
  const sensitive = sensitiveFieldsForTable(PLATFORM_SMTP_TABLE_KEY);
  const changedFields = new Set(
    Object.keys(patch).filter((key) => sensitive.includes(key))
  );
  if (changedFields.size === 0) return patch;
  return sealPlatformSmtpFields(patch, entityId, changedFields);
};
