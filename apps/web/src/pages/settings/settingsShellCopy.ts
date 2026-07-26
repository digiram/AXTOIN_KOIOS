/**
 * Settings Shell Copy.
 *
 * Single source for AppShell header title and subtitle on account settings routes.
 *
 * Responsibilities:
 * - Export SETTINGS_SHELL_TITLE and SETTINGS_SHELL_SUBTITLE for layouts and AccountSettingsPage
 * - Keep shell chrome copy aligned when settings tabs change
 *
 * Related:
 * - Route: /admin/settings
 * - AccountSettingsPage.tsx
 */
/** AppShell header title when account settings is active. */
export const SETTINGS_SHELL_TITLE = "Settings";

/** AppShell header subtitle for account settings. */
export const SETTINGS_SHELL_SUBTITLE =
  "Account preferences, region, and how dates and amounts are shown.";
