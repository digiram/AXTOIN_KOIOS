/**
 * Mobile device registration for push and per-device refresh binding.
 *
 * Post-login body schema for Expo/React Native installs linking an opaque
 * refresh token row to a device install key.
 *
 * Responsibilities:
 * - Validate device platform, label, optional push token, and refresh binding
 *
 * Related:
 * - `apps/mobile` auth flow; API `user_devices` repository
 *
 * Security:
 * - Refresh token binds rotation/revocation to this install; never log tokens.
 */
import { z } from "zod";

/** Platforms supported for React Native installs (FCM / future push wiring). */
export const mobileDevicePlatformSchema = z.enum(["ios", "android"]);
export type MobileDevicePlatform = z.infer<typeof mobileDevicePlatformSchema>;

/**
 * Called after successful login once the mobile app has an access token.
 * Optional `refreshToken` binds the current opaque refresh row to this install (`user_devices` +
 * `refresh_tokens.user_device_id`) so rotation and revocation apply per device.
 */
export const registerMobileDeviceBodySchema = z
  .object({
    installKey: z.string().min(8).max(256),
    platform: mobileDevicePlatformSchema,
    label: z.string().trim().max(255).optional(),
    pushToken: z.union([z.string().max(4096), z.null()]).optional(),
    refreshToken: z.string().min(1).optional()
  })
  .strict();

export type RegisterMobileDeviceBodyInput = z.infer<typeof registerMobileDeviceBodySchema>;
