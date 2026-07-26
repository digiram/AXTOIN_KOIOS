/**
 * Mailbox Layout.
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
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Outlet } from "react-router-dom";

import type { MailboxAccount, MailboxConnection, MailboxFolderKey, MailboxSelectorOption } from "./mailboxTypes.js";
import { buildMailboxSelectorOptions, parseMailboxViewKey } from "./mailboxSelectors.js";
import {
  connectionColorById,
  normalizeMailboxAccounts,
  shouldShowConnectionAccents,
  shouldShowMailboxSelectorAccents
} from "./mailboxAccent.js";
import { useMailboxApi } from "./useMailboxApi.js";

type MailboxLayoutContextValue = {
  accounts: MailboxAccount[];
  connections: MailboxConnection[];
  mailboxSelectorOptions: MailboxSelectorOption[];
  mailboxViewKey: string;
  setMailboxViewKey: (viewKey: string) => void;
  accountId: string;
  connectionFilterId: string | null;
  setAccountId: (id: string) => void;
  activeFolder: MailboxFolderKey;
  setActiveFolder: (folder: MailboxFolderKey) => void;
  loadingAccounts: boolean;
  reloadAccounts: () => Promise<void>;
  showMailboxSelectorAccents: boolean;
  showConnectionAccents: boolean;
  connectionColors: Map<string, string>;
};

const MailboxLayoutContext = createContext<MailboxLayoutContextValue | null>(null);

/** Hook for mailbox screens; see implementation for inputs and return shape. */
export const useMailboxLayout = () => {
  const ctx = useContext(MailboxLayoutContext);
  if (!ctx) throw new Error("useMailboxLayout must be used within MailboxLayout");
  return ctx;
};

/** Shared mailbox account + folder state for inbox and sub-routes. */
export const MailboxLayout = () => {
  const { apiFetch } = useMailboxApi();
  const [accounts, setAccounts] = useState<MailboxAccount[]>([]);
  const [mailboxViewKey, setMailboxViewKey] = useState("");
  const [activeFolder, setActiveFolder] = useState<MailboxFolderKey>("inbox");
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  const mailboxSelectorOptions = useMemo(() => buildMailboxSelectorOptions(accounts), [accounts]);
  const { inboxId: accountId, connectionId: connectionFilterId } = useMemo(
    () => parseMailboxViewKey(mailboxViewKey),
    [mailboxViewKey]
  );
  const connections = useMemo(
    () => accounts.find((account) => account.id === accountId)?.connections ?? [],
    [accounts, accountId]
  );
  const showMailboxSelectorAccents = useMemo(() => shouldShowMailboxSelectorAccents(accounts), [accounts]);
  const showConnectionAccents = useMemo(
    () => shouldShowConnectionAccents(connections),
    [connections]
  );
  const connectionColors = useMemo(() => connectionColorById(connections), [connections]);

  const reloadAccounts = useCallback(async () => {
    const res = await apiFetch("/tenant/mailbox/accounts");
    if (!res.ok) throw new Error("Could not load accounts");
    const json = (await res.json()) as { accounts: MailboxAccount[] };
    const normalized = normalizeMailboxAccounts(json.accounts);
    setAccounts(normalized);
    const nextOptions = buildMailboxSelectorOptions(normalized);
    setMailboxViewKey((current) => {
      if (current && nextOptions.some((option) => option.value === current)) return current;
      return nextOptions[0]?.value ?? "";
    });
  }, [apiFetch]);

  useEffect(() => {
    void (async () => {
      setLoadingAccounts(true);
      try {
        await reloadAccounts();
      } catch {
        setAccounts([]);
      } finally {
        setLoadingAccounts(false);
      }
    })();
  }, [reloadAccounts]);

  useEffect(() => {
    const hasExternalConnections = accounts.some((account) =>
      (account.connections ?? []).some((connection) => connection.provider !== "internal")
    );
    if (!hasExternalConnections) return;
    const intervalId = window.setInterval(() => {
      void reloadAccounts().catch(() => {});
    }, 12_000);
    return () => window.clearInterval(intervalId);
  }, [accounts, reloadAccounts]);

  const setAccountId = useCallback(
    (inboxId: string) => {
      const merged = mailboxSelectorOptions.find(
        (option) => option.inboxId === inboxId && option.connectionId == null
      );
      const firstForInbox = mailboxSelectorOptions.find((option) => option.inboxId === inboxId);
      setMailboxViewKey(merged?.value ?? firstForInbox?.value ?? inboxId);
    },
    [mailboxSelectorOptions]
  );

  const ctx = useMemo(
    () => ({
      accounts,
      connections,
      mailboxSelectorOptions,
      mailboxViewKey,
      setMailboxViewKey,
      accountId,
      connectionFilterId,
      setAccountId,
      activeFolder,
      setActiveFolder,
      loadingAccounts,
      reloadAccounts,
      showMailboxSelectorAccents,
      showConnectionAccents,
      connectionColors
    }),
    [
      accounts,
      connections,
      mailboxSelectorOptions,
      mailboxViewKey,
      accountId,
      connectionFilterId,
      setAccountId,
      activeFolder,
      loadingAccounts,
      reloadAccounts,
      showMailboxSelectorAccents,
      showConnectionAccents,
      connectionColors
    ]
  );

  return (
    <MailboxLayoutContext.Provider value={ctx}>
      <Outlet />
    </MailboxLayoutContext.Provider>
  );
};
