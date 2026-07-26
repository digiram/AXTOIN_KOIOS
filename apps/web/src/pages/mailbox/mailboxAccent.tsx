/**
 * Mailbox Accent.
 *
 * Supporting module for tenant mailbox: mailbox Accent.
 *
 * Responsibilities:
 * - Provide types, helpers, or components consumed by mailbox pages
 *
 * Related:
 * - Route: /admin/mailbox
 */
import type { CSSProperties, ReactNode } from "react";
import { pickMailboxAccentColor } from "@starter/shared";

import type { MailboxAccount, MailboxConnection } from "./mailboxTypes.js";

/** React component for mailbox UI. */
export const MAILBOX_ACCENT_BORDER_WIDTH_PX = 4;
/** Thinner origin stripe on calendar chips and day-detail rows. */
export const MAILBOX_CALENDAR_ACCENT_BORDER_WIDTH_PX = 3;

/** Shared constant or class token for mailbox presentation. */
export const resolveMailboxAccentColor = (color: string | undefined, index: number): string =>
  color?.trim() ? color : pickMailboxAccentColor(index);

/** Shared constant or class token for mailbox presentation. */
export const normalizeMailboxAccounts = (accounts: MailboxAccount[]): MailboxAccount[] =>
  accounts.map((account, inboxIndex) => {
    const inboxColor = resolveMailboxAccentColor(account.color, inboxIndex);
    const connections = (account.connections ?? []).map((connection, connectionIndex) => ({
      ...connection,
      color: resolveMailboxAccentColor(connection.color, connectionIndex)
    }));
    return { ...account, color: inboxColor, connections };
  });

/** Accent colors for every selectable connection (system notifications included). */
export const selectableConnectionAccentColors = (connections: MailboxConnection[]): string[] =>
  connections.map((connection, index) => resolveMailboxAccentColor(connection.color, index));

/** Shared constant or class token for mailbox presentation. */
export const mailboxAccentBorderStyle = (
  color: string | null | undefined,
  enabled: boolean
): CSSProperties | undefined =>
  enabled && color
    ? {
        borderLeftWidth: MAILBOX_ACCENT_BORDER_WIDTH_PX,
        borderLeftStyle: "solid",
        borderLeftColor: color
      }
    : undefined;

/** Shared constant or class token for mailbox presentation. */
export const shouldShowMailboxAccents = (accounts: MailboxAccount[]): boolean => accounts.length > 1;

/** True when an inbox has multiple selectable connections (incl. system notifications). */
export const shouldShowConnectionAccents = (connections: MailboxConnection[]): boolean =>
  connections.length > 1;

/** Shared constant or class token for mailbox presentation. */
export const shouldShowMailboxSelectorAccents = (accounts: MailboxAccount[]): boolean =>
  shouldShowMailboxAccents(accounts) ||
  accounts.some((account) => shouldShowConnectionAccents(account.connections ?? []));

/** Shared constant or class token for mailbox presentation. */
export const connectionColorById = (
  connections: MailboxConnection[]
): Map<string, string> =>
  new Map(
    connections.map((connection, index) => [
      connection.id,
      resolveMailboxAccentColor(connection.color, index)
    ])
  );

const mailboxAccentBackground = (
  color: string | null | undefined,
  gradientColors: string[] | undefined
): string | undefined => {
  const stops = gradientColors?.filter(Boolean) ?? [];
  if (stops.length > 1) {
    return `linear-gradient(to bottom, ${stops.join(", ")})`;
  }
  if (stops.length === 1) return stops[0];
  return color?.trim() ? color : undefined;
};

type MailboxAccentStripeProps = {
  color?: string | null;
  gradientColors?: string[];
  show: boolean;
  className?: string;
  widthPx?: number;
};

/** Solid or multi-color gradient left stripe for mailbox / connection cues. */
export const MailboxAccentStripe = ({
  color,
  gradientColors,
  show,
  className = "",
  widthPx = MAILBOX_ACCENT_BORDER_WIDTH_PX
}: MailboxAccentStripeProps): ReactNode => {
  const background = mailboxAccentBackground(color, gradientColors);
  if (!show || !background) return null;
  return (
    <span
      className={`pointer-events-none shrink-0 self-stretch rounded-full ${className}`.trim()}
      style={{ width: widthPx, background }}
      aria-hidden
    />
  );
};

/** Shared constant or class token for mailbox presentation. */
export const resolveCalendarEventAccentColor = (
  event: { connectionId?: string | null; calendarColor?: string | null },
  connectionColors: Map<string, string>
): string | undefined =>
  (event.connectionId ? connectionColors.get(event.connectionId) : undefined) ??
  event.calendarColor ??
  undefined;
