/**
 * Per-user account settings and password change contracts.
 *
 * Regional formatting, timezone, and home address fields for the signed-in
 * realm user (`/account/settings`). Re-exports date format enum from regional helpers.
 *
 * Responsibilities:
 * - Validate PATCH bodies for account profile and locale preferences
 * - Validate password change with current and new password
 *
 * Related:
 * - `regional-date-format.ts`; tenant defaults in `tenant-realm-settings.ts`
 *
 * Security:
 * - Password change requires current password verification on API.
 */
import { z } from "zod";

import { dateTimeFormatSchema } from "./regional-date-format.js";

export const measurementSystemSchema = z.enum(["si", "imperial"]);
export const currencyFormatSchema = z.enum(["comma_dot", "dot_comma", "space_comma"]);
export { dateTimeFormatSchema };
/** User clock preference; omit or null to follow tenant Finance default. */
export const accountClockTimeFormatSchema = z.enum(["12h", "24h"]);

/** Partial update for `/account/settings` PATCH (ISO-oriented fields). */
export const accountSettingsPatchSchema = z
  .object({
    displayName: z.string().trim().max(200).optional(),
    countryCode: z
      .string()
      .trim()
      .length(2)
      .regex(/^[A-Za-z]{2}$/)
      .transform((s) => s.toUpperCase())
      .optional(),
    measurementSystem: measurementSystemSchema.optional(),
    timezone: z.string().trim().max(128).optional(),
    currencyCode: z
      .string()
      .trim()
      .length(3)
      .regex(/^[A-Za-z]{3}$/)
      .transform((s) => s.toUpperCase())
      .optional(),
    currencyFormat: currencyFormatSchema.optional(),
    dateTimeFormat: dateTimeFormatSchema.optional(),
    timeFormat: accountClockTimeFormatSchema.nullable().optional(),
    homeAddressLine1: z.string().trim().max(512).optional(),
    homeAddressLine2: z.string().trim().max(512).optional(),
    homePostalCode: z.string().trim().max(32).optional(),
    homeCity: z.string().trim().max(255).optional(),
    homeState: z.string().trim().max(255).optional(),
    homeCountry: z.string().trim().max(255).optional()
  })
  .strict();

export type AccountSettingsPatchInput = z.infer<typeof accountSettingsPatchSchema>;

/** Validates password change with current and new password (`POST /account/password`). */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(500),
    newPassword: z.string().min(8).max(500)
  })
  .strict();

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
