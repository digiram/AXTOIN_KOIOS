/**
 * Mailbox Shell.
 *
 * Layout shell providing shared navigation, context, or grid structure for mailbox sub-routes.
 *
 * Responsibilities:
 * - Host nested router outlets and module-wide UI chrome
 * - Share module state across child routes where applicable
 *
 * Related:
 * - Route: /admin/mailbox
 */
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Calendar, Inbox, Settings } from "lucide-react";

import { useMailboxLayout } from "./MailboxLayout.js";
import {
  MAILBOX_COMPOSE_SLOT_CLASS,
  MAILBOX_SELECTOR_ROW_CLASS,
  MailboxAccountSelect
} from "./mailboxSelectors.js";

/** Fills AppShell content column; inner panes scroll independently. */
export const MAILBOX_VIEWPORT_COLUMN =
  "flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden -mb-5 sm:-mb-6";

/** Two-column inbox/calendar split: thread list (fixed) + detail pane. */
export const MAILBOX_INBOX_GRID_COLS =
  "grid-cols-[22rem_minmax(0,1fr)] xl:grid-cols-[24rem_minmax(0,1fr)]";

/** Calendar split: month grid (flex) + day detail pane (fixed). */
export const MAILBOX_CALENDAR_GRID_COLS =
  "grid-cols-1 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]";

/** Settings split: section nav (fixed) + settings panel. */
export const MAILBOX_SETTINGS_GRID_COLS =
  "grid-cols-[14rem_minmax(0,1fr)] xl:grid-cols-[16rem_minmax(0,1fr)]";

const NAV_ITEMS: {
  key: string;
  to: string;
  end: boolean;
  label: string;
  icon: ReactNode;
}[] = [
  { key: "inbox", to: "/admin/mailbox", end: true, label: "Inbox", icon: <Inbox className="h-4 w-4" aria-hidden /> },
  {
    key: "calendar",
    to: "/admin/mailbox/calendar",
    end: false,
    label: "Calendar",
    icon: <Calendar className="h-4 w-4" aria-hidden />
  },
  {
    key: "accounts",
    to: "/admin/mailbox/accounts",
    end: false,
    label: "Settings",
    icon: <Settings className="h-4 w-4" aria-hidden />
  }
];

function isNavActive(pathname: string, to: string, end: boolean): boolean {
  if (end) return pathname === to || pathname === `${to}/`;
  return pathname === to || pathname.startsWith(`${to}/`);
}

/** Shared account selector and mailbox section navigation (inbox, calendar, accounts). */
export const MailboxAccountToolbar = ({
  onAccountChange
}: {
  onAccountChange?: (accountId: string) => void;
}) => {
  const { pathname } = useLocation();
  const {
    mailboxViewKey,
    setMailboxViewKey,
    mailboxSelectorOptions,
    loadingAccounts,
    showMailboxSelectorAccents
  } = useMailboxLayout();

  return (
    <div className="relative z-20 mb-4 flex shrink-0 overflow-visible rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className={`${MAILBOX_SELECTOR_ROW_CLASS} border-r border-slate-200 py-3`}>
        <MailboxAccountSelect
          value={mailboxViewKey}
          options={mailboxSelectorOptions}
          loading={loadingAccounts}
          showAccents={showMailboxSelectorAccents}
          onChange={(nextViewKey) => {
            setMailboxViewKey(nextViewKey);
            onAccountChange?.(nextViewKey);
          }}
        />
        <span className={MAILBOX_COMPOSE_SLOT_CLASS} aria-hidden />
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 px-4 py-3">
        {NAV_ITEMS.map((item) => {
          const active = isNavActive(pathname, item.to, item.end);
          return (
            <Link
              key={item.key}
              to={item.to}
              aria-current={active ? "page" : undefined}
              className={[
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium shadow-sm transition-colors",
                active
                  ? "border border-indigo-200 bg-indigo-50 text-indigo-800 ring-1 ring-indigo-100"
                  : "border border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
              ].join(" ")}
            >
              <span className={active ? "text-indigo-600" : "text-slate-400"}>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
};
