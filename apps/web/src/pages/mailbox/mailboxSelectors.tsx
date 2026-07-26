/**
 * Mailbox Selectors.
 *
 * Supporting module for tenant mailbox: mailbox Selectors.
 *
 * Responsibilities:
 * - Provide types, helpers, or components consumed by mailbox pages
 *
 * Related:
 * - Route: /admin/mailbox
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, CircleAlert, User } from "lucide-react";

import type { MailboxAccount, MailboxFolderKey, MailboxSelectorOption } from "./mailboxTypes.js";
import {
  MailboxAccentStripe,
  resolveMailboxAccentColor,
  selectableConnectionAccentColors
} from "./mailboxAccent.js";
import { connectionHasSyncError } from "./mailboxSyncErrors.js";

/** Shared constant or class token for mailbox presentation. */
export const mailboxSelectTriggerClassName =
  "flex w-full min-w-0 items-center truncate rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-9 text-left text-base font-semibold text-slate-900 shadow-sm transition-colors hover:border-slate-300 hover:bg-white focus:border-indigo-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-60";

/** Matches the folder selector row in the thread list (select + compose button slot). */
export const MAILBOX_SELECTOR_ROW_CLASS = "flex w-[22rem] shrink-0 items-center gap-2 px-3 xl:w-[24rem]";

/** Width of the compose button slot beside folder/account selectors. */
export const MAILBOX_COMPOSE_SLOT_CLASS = "inline-flex h-8 w-8 shrink-0";

/** Shared constant or class token for mailbox presentation. */
export const buildMailboxSelectorOptions = (accounts: MailboxAccount[]): MailboxSelectorOption[] => {
  const options: MailboxSelectorOption[] = [];
  for (const [accountIndex, account] of accounts.entries()) {
    const inboxColor = resolveMailboxAccentColor(account.color, accountIndex);
    const connections = account.connections ?? [];
    const externalConnections = connections.filter((connection) => !connection.isSystemNotifications);
    const mergedHasSyncWarning = externalConnections.some(connectionHasSyncError);
    if (connections.length === 0) {
      options.push({
        value: account.id,
        label: account.displayName,
        inboxId: account.id,
        connectionId: null,
        accentColor: inboxColor
      });
      continue;
    }
    if (connections.length === 1) {
      const only = connections[0]!;
      options.push({
        value: `${account.id}:${only.id}`,
        label: only.displayName,
        inboxId: account.id,
        connectionId: only.id,
        accentColor: resolveMailboxAccentColor(only.color, 0),
        showSyncWarning: connectionHasSyncError(only)
      });
      continue;
    }
    const connectionColors = selectableConnectionAccentColors(connections);
    options.push({
      value: account.id,
      label: account.displayName,
      inboxId: account.id,
      connectionId: null,
      accentGradientColors: connectionColors,
      showSyncWarning: mergedHasSyncWarning
    });
    for (const [connectionIndex, connection] of connections.entries()) {
      options.push({
        value: `${account.id}:${connection.id}`,
        label: connection.displayName,
        inboxId: account.id,
        connectionId: connection.id,
        accentColor: connectionColors[connectionIndex],
        showSyncWarning: connectionHasSyncError(connection)
      });
    }
  }
  return options;
};

/** Shared constant or class token for mailbox presentation. */
export const parseMailboxViewKey = (
  value: string
): { inboxId: string; connectionId: string | null } => {
  const colon = value.indexOf(":");
  if (colon === -1) return { inboxId: value, connectionId: null };
  return { inboxId: value.slice(0, colon), connectionId: value.slice(colon + 1) };
};

type MailboxSelectOption = {
  value: string;
  label: string;
  icon?: ReactNode;
  accentColor?: string;
  accentGradientColors?: string[];
  showSyncWarning?: boolean;
};

const MailboxSyncWarningIcon = ({ title }: { title?: string }) => (
  <CircleAlert
    className="h-3.5 w-3.5 shrink-0 text-amber-500"
    aria-hidden={title ? undefined : true}
    {...(title ? { "aria-label": title } : {})}
  />
);

type ListBoxPosition = {
  top: number;
  left: number;
  width: number;
};

const MAILBOX_SELECT_LISTBOX_SELECTOR = "[data-mailbox-select-listbox]";

const MailboxStyledSelect = ({
  label,
  icon,
  value,
  disabled,
  onChange,
  options,
  showAccents = false
}: {
  label: string;
  icon: ReactNode;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  options: MailboxSelectOption[];
  showAccents?: boolean;
}) => {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [listBoxStyle, setListBoxStyle] = useState<ListBoxPosition | null>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];
  const showTriggerAccent =
    showAccents &&
    Boolean(
      selected?.accentColor ||
        (selected?.accentGradientColors && selected.accentGradientColors.length > 0)
    );

  const syncListBoxPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger || !open) {
      setListBoxStyle(null);
      return;
    }
    const rect = trigger.getBoundingClientRect();
    setListBoxStyle({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width
    });
  }, [open]);

  useLayoutEffect(() => {
    syncListBoxPosition();
  }, [syncListBoxPosition, options.length, selected?.label]);

  useEffect(() => {
    if (!open) return;
    syncListBoxPosition();
    window.addEventListener("resize", syncListBoxPosition);
    window.addEventListener("scroll", syncListBoxPosition, true);
    return () => {
      window.removeEventListener("resize", syncListBoxPosition);
      window.removeEventListener("scroll", syncListBoxPosition, true);
    };
  }, [open, syncListBoxPosition]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if ((event.target as Element | null)?.closest?.(MAILBOX_SELECT_LISTBOX_SELECTOR)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const pick = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <span className="sr-only" id={`${listboxId}-label`}>
        {label}
      </span>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${listboxId}-label`}
        className={`${mailboxSelectTriggerClassName} relative overflow-hidden`}
        onClick={() => !disabled && setOpen((current) => !current)}
      >
        <MailboxAccentStripe
          color={selected?.accentColor}
          gradientColors={selected?.accentGradientColors}
          show={showTriggerAccent}
          className="absolute bottom-0 left-0 top-0 rounded-none"
        />
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-indigo-600">{icon}</span>
        <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
          {selected?.showSyncWarning ? (
            <MailboxSyncWarningIcon title="This mailbox has a sync issue" />
          ) : null}
          <span className="truncate">{selected?.label ?? label}</span>
        </span>
        <ChevronDown
          className={`pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open && !disabled && listBoxStyle && typeof document !== "undefined"
        ? createPortal(
            <ul
              id={listboxId}
              role="listbox"
              data-mailbox-select-listbox=""
              aria-labelledby={`${listboxId}-label`}
              className="fixed z-[3000] max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-slate-100"
              style={{
                top: listBoxStyle.top,
                left: listBoxStyle.left,
                width: listBoxStyle.width
              }}
            >
              {options.map((option) => {
                const active = option.value === value;
                const showOptionAccent =
                  showAccents &&
                  Boolean(
                    option.accentColor ||
                      (option.accentGradientColors && option.accentGradientColors.length > 0)
                  );
                return (
                  <li key={option.value} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={[
                        "flex w-full items-center gap-2 py-2 pl-1 pr-3 text-left text-sm transition-colors",
                        active
                          ? "bg-indigo-50 font-semibold text-indigo-900"
                          : "text-slate-800 hover:bg-slate-50"
                      ].join(" ")}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => pick(option.value)}
                    >
                      <MailboxAccentStripe
                        color={option.accentColor}
                        gradientColors={option.accentGradientColors}
                        show={showOptionAccent}
                      />
                      {option.icon ? (
                        <span className={active ? "text-indigo-600" : "text-slate-400"}>{option.icon}</span>
                      ) : null}
                      {option.showSyncWarning ? <MailboxSyncWarningIcon /> : null}
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>,
            document.body
          )
        : null}
    </div>
  );
};

/** React component for mailbox UI. */
export const MailboxAccountSelect = ({
  value,
  options,
  loading,
  showAccents,
  onChange
}: {
  value: string;
  options: MailboxSelectorOption[];
  loading?: boolean;
  showAccents?: boolean;
  onChange: (viewKey: string) => void;
}) => (
  <MailboxStyledSelect
    label="Mailbox"
    icon={<User className="h-4 w-4" aria-hidden />}
    value={value}
    disabled={loading || options.length === 0}
    showAccents={showAccents}
    onChange={onChange}
    options={
      options.length === 0
        ? [{ value: "", label: "No accounts" }]
        : options.map((option) => ({
            value: option.value,
            label: option.label,
            accentColor: option.accentColor,
            accentGradientColors: option.accentGradientColors,
            showSyncWarning: option.showSyncWarning
          }))
    }
  />
);

/** React component for mailbox UI. */
export const MailboxFolderSelect = ({
  value,
  onChange,
  folders
}: {
  value: MailboxFolderKey;
  onChange: (folder: MailboxFolderKey) => void;
  folders: { key: MailboxFolderKey; label: string; icon: ReactNode }[];
}) => {
  const activeFolderMeta = folders.find((f) => f.key === value) ?? folders[0]!;

  return (
    <MailboxStyledSelect
      label="Folder"
      icon={activeFolderMeta.icon}
      value={value}
      onChange={(next) => onChange(next as MailboxFolderKey)}
      options={folders.map((folder) => ({
        value: folder.key,
        label: folder.label,
        icon: folder.icon
      }))}
    />
  );
};
