/**
 * Mailbox Inbox page.
 *
 * Tenant mailbox screen mounted under AppShell at /admin/mailbox.
 *
 * Responsibilities:
 * - Load and render primary mailbox data for the route
 * - Wire user actions to tenant API endpoints
 * - Compose shared module components and modals
 *
 * Related:
 * - Route: /admin/mailbox
 *
 * Security:
 * - Tenant-scoped API calls via authenticated session
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Archive,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Forward,
  Inbox,
  MoreHorizontal,
  Paperclip,
  Plus,
  RefreshCw,
  Reply,
  ReplyAll,
  Send,
  Trash,
  Trash2,
  X
} from "lucide-react";

import { calendarYmdInTimezone } from "@starter/shared";

import { useMailboxLayout } from "./MailboxLayout.js";
import type { MailboxFolderKey, MailboxMessage, MailboxThread } from "./mailboxTypes.js";
import { calendarEventAcceptsRsvp } from "./mailboxCalendarUtils.js";
import { MailboxAccentStripe } from "./mailboxAccent.js";
import { MAILBOX_INBOX_GRID_COLS, MAILBOX_VIEWPORT_COLUMN, MailboxAccountToolbar } from "./mailboxShell.js";
import { MAILBOX_COMPOSE_SLOT_CLASS, MailboxFolderSelect } from "./mailboxSelectors.js";
import { previousCalendarYmd } from "./mailboxDisplayDatetime.js";
import {
  MailboxAvatar,
  MailboxIsolatedEmailHtml,
  MailboxTag,
  internalSourceTag,
  mailboxMessageBodyHtml
} from "./mailboxUi.js";
import { useMailboxApi } from "./useMailboxApi.js";
import { useMailboxDisplayFormatters } from "./useMailboxDisplayFormatters.js";
import {
  fetchMailboxConnectionsSyncBusy,
  requestMailboxConnectionSync,
  resolveMailboxSyncTargets,
  useMailboxSyncPollTick
} from "./mailboxSyncActions.js";
import { MailboxInboxSyncNotice } from "./MailboxSyncErrorUi.js";

function groupThreads(threads: MailboxThread[], timezone: string): { label: string; threads: MailboxThread[] }[] {
  const now = new Date();
  const todayYmd = calendarYmdInTimezone(now, timezone);
  const yesterdayYmd = previousCalendarYmd(todayYmd);

  const priority = threads.filter((t) => t.isStarred);
  const rest = threads.filter((t) => !t.isStarred);

  const today: MailboxThread[] = [];
  const yesterday: MailboxThread[] = [];
  const earlier: MailboxThread[] = [];

  for (const t of rest) {
    const threadYmd = calendarYmdInTimezone(new Date(t.lastMessageAt), timezone);
    if (threadYmd === todayYmd) today.push(t);
    else if (threadYmd === yesterdayYmd) yesterday.push(t);
    else earlier.push(t);
  }

  const groups: { label: string; threads: MailboxThread[] }[] = [];
  if (priority.length > 0) groups.push({ label: `${priority.length} priority`, threads: priority });
  if (today.length > 0) groups.push({ label: "Today", threads: today });
  if (yesterday.length > 0) groups.push({ label: "Yesterday", threads: yesterday });
  if (earlier.length > 0) groups.push({ label: "Earlier", threads: earlier });
  return groups;
}

const toolbarBtn =
  "inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40";

type PendingBulkTrashAction = "permanent-delete" | "empty-trash";

const mailboxBulkConfirmBtnBase =
  "flex flex-1 items-center justify-center transition focus:outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-40";
const mailboxBulkConfirmBtnCancelClass = `${mailboxBulkConfirmBtnBase} bg-rose-100 text-rose-900 hover:bg-rose-200 focus-visible:ring-rose-400/80`;
const mailboxBulkConfirmBtnConfirmClass = `${mailboxBulkConfirmBtnBase} bg-emerald-100 text-emerald-900 hover:bg-emerald-200 focus-visible:ring-emerald-500/80`;

const MAILBOX_FOLDERS: { key: MailboxFolderKey; label: string; icon: ReactNode }[] = [
  { key: "inbox", label: "Inbox", icon: <Inbox className="h-4 w-4" aria-hidden /> },
  { key: "sent", label: "Sent", icon: <Send className="h-4 w-4" aria-hidden /> },
  { key: "drafts", label: "Drafts", icon: <FileText className="h-4 w-4" aria-hidden /> },
  { key: "archive", label: "Archive", icon: <Archive className="h-4 w-4" aria-hidden /> },
  { key: "trash", label: "Trash", icon: <Trash2 className="h-4 w-4" aria-hidden /> }
];

/** Route page component for tenant mailbox under AppShell. */
export const MailboxInboxPage = () => {
  const navigate = useNavigate();
  const { accountId, connectionFilterId, activeFolder, setActiveFolder, showConnectionAccents, connectionColors, connections } =
    useMailboxLayout();
  const { apiFetch } = useMailboxApi();
  const { formatListTime, formatRelativeTime, formatClockTime, timezone } = useMailboxDisplayFormatters();
  const [threads, setThreads] = useState<MailboxThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [selectedThreadIds, setSelectedThreadIds] = useState<Set<string>>(new Set());
  const [messages, setMessages] = useState<MailboxMessage[]>([]);
  const [error, setError] = useState("");
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [syncingMailbox, setSyncingMailbox] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [rsvpBusy, setRsvpBusy] = useState(false);
  const [pendingBulkTrashAction, setPendingBulkTrashAction] = useState<PendingBulkTrashAction | null>(null);

  const grouped = useMemo(() => groupThreads(threads, timezone), [threads, timezone]);
  const selectedThread = threads.find((t) => t.id === selectedThreadId) ?? null;
  const primaryMessage = messages[messages.length - 1] ?? null;
  const messageSubjectTag = primaryMessage
    ? internalSourceTag(primaryMessage.internalSource, primaryMessage.subject)
    : null;
  const userEmails = useMemo(
    () => connections.map((connection) => connection.emailAddress).filter(Boolean),
    [connections]
  );
  const inviteRsvpMessage = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index]!;
      if (!message.hasCalendarInvite && !message.calendarInvite) continue;
      if (message.internalSource) continue;
      const invite = message.calendarInvite;
      if (!invite) continue;
      if (
        calendarEventAcceptsRsvp(
          {
            id: invite.eventId,
            title: "",
            description: null,
            location: null,
            startsAt: "",
            endsAt: "",
            status: invite.status,
            organizer: invite.organizer,
            sourceMessageId: message.id
          },
          userEmails
        )
      ) {
        return message;
      }
    }
    return null;
  }, [messages, userEmails]);
  const inviteRsvpEventId = inviteRsvpMessage?.calendarInvite?.eventId ?? null;
  const threadShowsCalendarInvite =
    messages.some((message) => message.hasCalendarInvite) || Boolean(selectedThread?.hasCalendarInvite);

  const syncTargets = useMemo(
    () => resolveMailboxSyncTargets(connections, connectionFilterId),
    [connections, connectionFilterId]
  );
  const { tick: syncPollTick, requestFastPoll } = useMailboxSyncPollTick(syncTargets.length > 0);

  const loadThreads = useCallback(async () => {
    if (!accountId) return;
    setLoadingThreads(true);
    setError("");
    try {
      const connectionQuery = connectionFilterId ? `&connectionId=${connectionFilterId}` : "";
      const res = await apiFetch(
        `/tenant/mailbox/threads?accountId=${accountId}&folder=${activeFolder}${connectionQuery}`
      );
      if (!res.ok) throw new Error("Could not load threads");
      const json = (await res.json()) as { threads: MailboxThread[] };
      setThreads(json.threads);
      if (selectedThreadId && !json.threads.some((t) => t.id === selectedThreadId)) {
        setSelectedThreadId(null);
        setMessages([]);
      }
    } catch {
      setError("Could not load inbox.");
    } finally {
      setLoadingThreads(false);
    }
  }, [accountId, connectionFilterId, activeFolder, apiFetch, selectedThreadId]);

  const refreshInbox = useCallback(async () => {
    if (!accountId) return;
    setError("");
    if (syncTargets.length === 0) {
      await loadThreads();
      return;
    }
    setSyncingMailbox(true);
    try {
      let anyEnqueued = false;
      for (const connection of syncTargets) {
        const result = await requestMailboxConnectionSync(apiFetch, connection.id);
        if (!result.ok) {
          setError("Could not start mailbox sync.");
          return;
        }
        if (result.enqueued) anyEnqueued = true;
      }
      if (anyEnqueued) requestFastPoll();
      await loadThreads();
      const busy = await fetchMailboxConnectionsSyncBusy(apiFetch, syncTargets);
      setSyncingMailbox(busy);
    } catch {
      setError("Could not sync mailbox.");
      setSyncingMailbox(false);
    }
  }, [accountId, apiFetch, loadThreads, requestFastPoll, syncTargets]);

  const loadThread = useCallback(
    async (threadId: string) => {
      const res = await apiFetch(`/tenant/mailbox/threads/${threadId}`);
      if (!res.ok) throw new Error("Could not load thread");
      const json = (await res.json()) as { messages: MailboxMessage[] };
      setMessages(json.messages);
      await apiFetch(`/tenant/mailbox/threads/${threadId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isRead: true })
      });
      setThreads((prev) =>
        prev.map((t) => (t.id === threadId ? { ...t, unreadCount: 0 } : t))
      );
    },
    [apiFetch]
  );

  const patchThreads = useCallback(
    async (threadIds: string[], patch: { isRead?: boolean; folder?: MailboxFolderKey }) => {
      if (!accountId || threadIds.length === 0) return;
      setActionBusy(true);
      setError("");
      try {
        const res = await apiFetch("/tenant/mailbox/threads/bulk", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ accountId, threadIds, ...patch })
        });
        if (!res.ok) throw new Error("action_failed");
        await loadThreads();
        setSelectedThreadIds(new Set());
        if (patch.folder && selectedThreadId && threadIds.includes(selectedThreadId)) {
          setSelectedThreadId(null);
          setMessages([]);
        }
      } catch {
        setError("Could not update selected messages.");
      } finally {
        setActionBusy(false);
      }
    },
    [accountId, apiFetch, loadThreads, selectedThreadId]
  );

  const respondToCalendarInvite = useCallback(
    async (eventId: string, response: "accepted" | "declined" | "tentative") => {
      setRsvpBusy(true);
      setError("");
      try {
        const res = await apiFetch(`/tenant/mailbox/calendar/events/${eventId}/rsvp`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ response })
        });
        if (!res.ok) throw new Error("rsvp_failed");
        if (selectedThreadId) {
          await loadThread(selectedThreadId);
        }
      } catch {
        setError("Could not send your calendar response.");
      } finally {
        setRsvpBusy(false);
      }
    },
    [apiFetch, loadThread, selectedThreadId]
  );

  const deleteThreadsPermanently = useCallback(
    async (threadIds: string[]) => {
      if (!accountId || threadIds.length === 0) return;
      setActionBusy(true);
      setError("");
      try {
        const results = await Promise.all(
          threadIds.map((threadId) =>
            apiFetch(`/tenant/mailbox/threads/${threadId}`, { method: "DELETE" })
          )
        );
        if (results.some((res) => !res.ok)) throw new Error("delete_failed");
        await loadThreads();
        setSelectedThreadIds(new Set());
        if (selectedThreadId && threadIds.includes(selectedThreadId)) {
          setSelectedThreadId(null);
          setMessages([]);
        }
      } catch {
        setError("Could not delete messages permanently.");
      } finally {
        setActionBusy(false);
        setPendingBulkTrashAction(null);
      }
    },
    [accountId, apiFetch, loadThreads, selectedThreadId]
  );

  const emptyTrash = useCallback(async () => {
    if (!accountId) return;
    setActionBusy(true);
    setError("");
    try {
      const res = await apiFetch(`/tenant/mailbox/threads/trash?accountId=${accountId}`, {
        method: "DELETE"
      });
      if (!res.ok) throw new Error("empty_trash_failed");
      await loadThreads();
      setSelectedThreadIds(new Set());
      setSelectedThreadId(null);
      setMessages([]);
    } catch {
      setError("Could not empty trash.");
    } finally {
      setActionBusy(false);
      setPendingBulkTrashAction(null);
    }
  }, [accountId, apiFetch, loadThreads]);

  const targetThreadIds = useMemo(() => {
    if (selectedThreadIds.size > 0) return [...selectedThreadIds];
    return selectedThreadId ? [selectedThreadId] : [];
  }, [selectedThreadId, selectedThreadIds]);

  const requestPermanentDelete = useCallback(() => {
    if (targetThreadIds.length === 0) return;
    setPendingBulkTrashAction("permanent-delete");
  }, [targetThreadIds.length]);

  const requestEmptyTrash = useCallback(() => {
    if (threads.length === 0) return;
    setPendingBulkTrashAction("empty-trash");
  }, [threads.length]);

  const confirmPendingBulkTrashAction = useCallback(() => {
    if (pendingBulkTrashAction === "permanent-delete") {
      void deleteThreadsPermanently(targetThreadIds);
      return;
    }
    if (pendingBulkTrashAction === "empty-trash") {
      void emptyTrash();
    }
  }, [deleteThreadsPermanently, emptyTrash, pendingBulkTrashAction, targetThreadIds]);

  const openThread = useCallback(
    async (thread: MailboxThread) => {
      if (activeFolder === "drafts") {
        try {
          const res = await apiFetch(`/tenant/mailbox/threads/${thread.id}`);
          if (!res.ok) throw new Error("load_failed");
          const json = (await res.json()) as { messages: MailboxMessage[] };
          const draft = json.messages.find((m) => m.isDraft);
          if (draft) {
            navigate(`/admin/mailbox/compose/${draft.id}`);
            return;
          }
        } catch {
          setError("Could not open draft.");
          return;
        }
      }
      setSelectedThreadId(thread.id);
    },
    [activeFolder, apiFetch, navigate]
  );

  const toggleThreadSelection = (threadId: string) => {
    setSelectedThreadIds((prev) => {
      const next = new Set(prev);
      if (next.has(threadId)) next.delete(threadId);
      else next.add(threadId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedThreadIds.size === threads.length) {
      setSelectedThreadIds(new Set());
      return;
    }
    setSelectedThreadIds(new Set(threads.map((t) => t.id)));
  };

  useEffect(() => {
    if (!accountId) return;
    void loadThreads();
  }, [accountId, loadThreads]);

  useEffect(() => {
    if (syncTargets.length === 0) return;
    let cancelled = false;
    void (async () => {
      const busy = await fetchMailboxConnectionsSyncBusy(apiFetch, syncTargets);
      if (cancelled) return;
      setSyncingMailbox(busy);
      if (syncPollTick > 0) await loadThreads();
    })();
    return () => {
      cancelled = true;
    };
  }, [apiFetch, loadThreads, syncPollTick, syncTargets]);

  useEffect(() => {
    if (!selectedThreadId) return;
    void loadThread(selectedThreadId).catch(() => setError("Could not open message."));
  }, [selectedThreadId, loadThread]);

  const changeFolder = (folder: MailboxFolderKey) => {
    setActiveFolder(folder);
    setSelectedThreadId(null);
    setSelectedThreadIds(new Set());
    setMessages([]);
    setPendingBulkTrashAction(null);
  };

  return (
    <div className={MAILBOX_VIEWPORT_COLUMN}>
      <MailboxAccountToolbar
        onAccountChange={() => {
          setSelectedThreadId(null);
          setMessages([]);
        }}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className={`grid shrink-0 ${MAILBOX_INBOX_GRID_COLS}`}>
          <header className="flex items-center gap-2 border-b border-r border-slate-200 px-3 py-3">
            <MailboxFolderSelect value={activeFolder} folders={MAILBOX_FOLDERS} onChange={changeFolder} />
            <Link
              to="/admin/mailbox/compose"
              className={`${MAILBOX_COMPOSE_SLOT_CLASS} items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm transition-colors hover:bg-indigo-700`}
              title="Compose"
              aria-label="Compose"
            >
              <Plus className="h-4 w-4" aria-hidden />
            </Link>
          </header>

          <header className="relative z-10 flex min-w-0 items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
            {selectedThread && primaryMessage ? (
              <>
                <button
                  type="button"
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100 lg:hidden"
                  onClick={() => setSelectedThreadId(null)}
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                  Back
                </button>
                <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                  {inviteRsvpEventId ? (
                    <MailboxInviteRsvpButtons
                      disabled={actionBusy || rsvpBusy}
                      onRespond={(response) => void respondToCalendarInvite(inviteRsvpEventId, response)}
                    />
                  ) : (
                    <span className="min-w-0 flex-1" aria-hidden />
                  )}
                  <div className="flex shrink-0 items-center gap-1">
                    {activeFolder === "inbox" ? (
                      <ActionButton
                        icon={<Archive className="h-4 w-4" />}
                        label="Archive"
                        disabled={actionBusy || targetThreadIds.length === 0}
                        onClick={() => void patchThreads(targetThreadIds, { folder: "archive" })}
                      />
                    ) : null}
                    {(activeFolder === "archive" || activeFolder === "trash") && targetThreadIds.length > 0 ? (
                      <ActionButton
                        icon={<Inbox className="h-4 w-4" />}
                        label="Move to inbox"
                        disabled={actionBusy}
                        onClick={() => void patchThreads(targetThreadIds, { folder: "inbox" })}
                      />
                    ) : null}
                    {activeFolder === "trash" ? (
                      <ActionButton
                        icon={<Trash2 className="h-4 w-4" />}
                        label="Delete permanently"
                        disabled={actionBusy || targetThreadIds.length === 0 || pendingBulkTrashAction != null}
                        tone="danger"
                        onClick={requestPermanentDelete}
                      />
                    ) : (
                      <ActionButton
                        icon={<Trash2 className="h-4 w-4" />}
                        label="Delete"
                        disabled={actionBusy || targetThreadIds.length === 0}
                        onClick={() => void patchThreads(targetThreadIds, { folder: "trash" })}
                      />
                    )}
                  </div>
                </div>
              </>
            ) : null}
          </header>

          {pendingBulkTrashAction ? (
            <MailboxBulkTrashConfirmBar
              action={pendingBulkTrashAction}
              busy={actionBusy}
              onCancel={() => setPendingBulkTrashAction(null)}
              onConfirm={confirmPendingBulkTrashAction}
            />
          ) : (
          <div className="flex items-center gap-0.5 border-b border-r border-slate-200 px-2 py-1.5">
            <button
              type="button"
              className={toolbarBtn}
              title="Select all"
              disabled={threads.length === 0}
              onClick={toggleSelectAll}
            >
              <span
                className={[
                  "h-3.5 w-3.5 rounded border",
                  selectedThreadIds.size === threads.length && threads.length > 0
                    ? "border-indigo-600 bg-indigo-600"
                    : "border-slate-300"
                ].join(" ")}
                aria-hidden
              />
            </button>
            <button
              type="button"
              className={toolbarBtn}
              title={syncTargets.length > 0 ? "Sync now" : "Refresh"}
              disabled={syncingMailbox}
              onClick={() => void refreshInbox()}
            >
              <RefreshCw
                className={`h-4 w-4 ${loadingThreads || syncingMailbox ? "animate-spin" : ""}`}
                aria-hidden
              />
            </button>
            {activeFolder === "inbox" ? (
              <button
                type="button"
                className={toolbarBtn}
                title="Archive"
                disabled={actionBusy || targetThreadIds.length === 0}
                onClick={() => void patchThreads(targetThreadIds, { folder: "archive" })}
              >
                <Archive className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
            {activeFolder === "trash" ? (
              <>
                <button
                  type="button"
                  className={`${toolbarBtn} text-rose-600 hover:bg-rose-50`}
                  title="Delete selected messages permanently"
                  disabled={actionBusy || targetThreadIds.length === 0}
                  onClick={requestPermanentDelete}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  className={`${toolbarBtn} text-rose-600 hover:bg-rose-50`}
                  title="Empty trash"
                  disabled={actionBusy || threads.length === 0}
                  onClick={requestEmptyTrash}
                >
                  <Trash className="h-4 w-4" aria-hidden strokeWidth={2} />
                </button>
              </>
            ) : (
              <button
                type="button"
                className={toolbarBtn}
                title="Delete"
                disabled={actionBusy || targetThreadIds.length === 0}
                onClick={() => void patchThreads(targetThreadIds, { folder: "trash" })}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            )}
            <button
              type="button"
              className={toolbarBtn}
              title="Mark read"
              disabled={actionBusy || targetThreadIds.length === 0}
              onClick={() => void patchThreads(targetThreadIds, { isRead: true })}
            >
              <MailReadIcon />
            </button>
            <button
              type="button"
              className={toolbarBtn}
              title="Mark unread"
              disabled={actionBusy || targetThreadIds.length === 0}
              onClick={() => void patchThreads(targetThreadIds, { isRead: false })}
            >
              <MailUnreadIcon />
            </button>
          </div>
          )}
        </div>

        <div className={`grid min-h-0 flex-1 ${MAILBOX_INBOX_GRID_COLS}`}>
      {/* Thread list */}
      <section className="flex min-h-0 flex-col overflow-hidden border-r border-slate-200">
        <MailboxInboxSyncNotice connections={connections} connectionFilterId={connectionFilterId} />

        {error ? <p className="px-4 py-2 text-sm text-red-700">{error}</p> : null}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loadingThreads && threads.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">Loading messages…</p>
          ) : threads.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">No messages in this folder.</p>
          ) : (
            grouped.map((group, groupIndex) => (
              <div key={group.label}>
                <p
                  className={[
                    "sticky top-0 z-10 bg-slate-50/95 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 backdrop-blur-sm",
                    groupIndex === 0 ? "border-b border-slate-200" : "border-y border-slate-200"
                  ].join(" ")}
                >
                  {group.label}
                </p>
                <ul>
                  {group.threads.map((t) => {
                    const subjectTag = internalSourceTag(
                      t.subject.toLowerCase().includes("quote") ||
                        t.subject.toLowerCase().includes("invoice") ||
                        t.subject.toLowerCase().includes("offer")
                        ? "invoicing"
                        : null,
                      t.subject
                    );
                    const selected = selectedThreadId === t.id;
                    const checked = selectedThreadIds.has(t.id);
                    const threadAccentColor = connectionColors.get(t.accountId);
                    const showThreadAccent = showConnectionAccents && !connectionFilterId;
                    return (
                      <li key={t.id}>
                        <div
                          className={[
                            "relative flex w-full gap-2 border-b border-slate-100 py-3 pl-2 pr-2 transition-colors",
                            selected ? "bg-indigo-50/80" : "hover:bg-slate-50"
                          ].join(" ")}
                        >
                          <MailboxAccentStripe
                            color={threadAccentColor}
                            show={showThreadAccent}
                            className="absolute bottom-0 left-0 top-0 rounded-none"
                          />
                          <button
                            type="button"
                            className="mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center"
                            onClick={() => toggleThreadSelection(t.id)}
                            aria-label={checked ? "Deselect thread" : "Select thread"}
                          >
                            <span
                              className={[
                                "h-3.5 w-3.5 rounded border",
                                checked ? "border-indigo-600 bg-indigo-600" : "border-slate-300"
                              ].join(" ")}
                            />
                          </button>
                          <button
                            type="button"
                            className="flex min-w-0 flex-1 gap-3 text-left"
                            onClick={() => void openThread(t)}
                          >
                          <MailboxAvatar
                            name={t.from?.name}
                            email={t.from?.email ?? "?"}
                            size="sm"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-center gap-2">
                              {t.unreadCount > 0 ? (
                                <span
                                  className="h-2 w-2 shrink-0 rounded-full bg-blue-500"
                                  aria-hidden
                                />
                              ) : null}
                              <span
                                className={`flex min-w-0 items-center gap-1.5 text-sm ${t.unreadCount > 0 ? "font-semibold text-slate-900" : "font-medium text-slate-800"}`}
                              >
                                {t.hasCalendarInvite ? (
                                  <Calendar className="h-3.5 w-3.5 shrink-0 text-indigo-600" aria-hidden />
                                ) : null}
                                <span className="min-w-0 truncate">
                                  {(t.subject || "(no subject)").slice(0, 56)}
                                </span>
                              </span>
                              <span className="ml-auto shrink-0 text-xs text-slate-400">
                                {formatListTime(t.lastMessageAt)}
                              </span>
                            </div>
                            <p className="mt-0.5 truncate text-xs text-slate-500">{t.snippet}</p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              {subjectTag ? <MailboxTag tone={subjectTag.tone}>{subjectTag.label}</MailboxTag> : null}
                              {t.isStarred ? <MailboxTag tone="amber">Priority</MailboxTag> : null}
                              {activeFolder === "drafts" ? <MailboxTag tone="sky">Draft</MailboxTag> : null}
                            </div>
                          </div>
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between border-t border-slate-200 px-4 py-2 text-xs text-slate-500">
          <span>
            1–{Math.min(threads.length, 25)} of {threads.length || 0}
          </span>
          <div className="flex items-center gap-1">
            <button type="button" className={toolbarBtn} disabled title="Previous page (coming soon)">
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <button type="button" className={toolbarBtn} disabled title="Next page (coming soon)">
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </footer>
      </section>

      {/* Message detail — offset upward into the empty header grid cell beside the thread toolbar */}
      <section className="-mt-11 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white">
        {!selectedThread || !primaryMessage ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-slate-500">
            <MailEmptyIcon />
            <p className="text-sm">Select a message to read</p>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <header className="shrink-0 border-b border-slate-100 px-6 pb-5 pt-3">
              <div className="flex items-center gap-3">
                <h2 className="flex min-w-0 flex-1 items-center gap-2 text-xl font-semibold text-slate-900">
                  {threadShowsCalendarInvite ? (
                    <Calendar className="h-5 w-5 shrink-0 text-indigo-600" aria-hidden />
                  ) : null}
                  <span className="min-w-0 truncate">
                    {primaryMessage.subject || selectedThread.subject || "(no subject)"}
                  </span>
                </h2>
                {messageSubjectTag ? (
                  <span className="shrink-0">
                    <MailboxTag tone={messageSubjectTag.tone}>{messageSubjectTag.label}</MailboxTag>
                  </span>
                ) : null}
              </div>

              <div className="mt-5 grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3">
                <div className="row-span-2 self-center">
                  <MailboxAvatar
                    name={primaryMessage.from.name}
                    email={primaryMessage.from.email}
                    size="lg"
                  />
                </div>
                <div className="flex min-w-0 flex-col justify-center gap-0.5 self-center">
                  <p className="font-semibold text-slate-900">
                    {primaryMessage.from.name ?? primaryMessage.from.email}
                  </p>
                  <p className="text-sm text-slate-500">{primaryMessage.from.email}</p>
                </div>
                <div className="row-span-2 flex flex-col items-end justify-center gap-1 self-center">
                  <div className="flex items-center gap-1">
                    <Link
                      to="/admin/mailbox/compose"
                      className={toolbarBtn}
                      title="Reply"
                    >
                      <Reply className="h-4 w-4" aria-hidden />
                    </Link>
                    <button type="button" className={toolbarBtn} disabled title="Reply all (coming soon)">
                      <ReplyAll className="h-4 w-4" aria-hidden />
                    </button>
                    <button type="button" className={toolbarBtn} disabled title="Forward (coming soon)">
                      <Forward className="h-4 w-4" aria-hidden />
                    </button>
                    <button type="button" className={toolbarBtn} disabled title="More (coming soon)">
                      <MoreHorizontal className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                  <p className="whitespace-nowrap text-xs text-slate-400">
                    {formatClockTime(primaryMessage.receivedAt)} ({formatRelativeTime(primaryMessage.receivedAt)})
                  </p>
                </div>
              </div>
            </header>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-6">
              {messages.length === 1 ? (
                <article className="flex min-h-0 flex-1 flex-col overflow-hidden pt-5">
                  <MailboxMessageBody message={messages[0]!} fill />
                  <MessageExtras message={messages[0]!} />
                </article>
              ) : (
                <div className="min-h-0 flex-1 space-y-6 overflow-y-auto py-5">
                  {messages.map((m) => (
                    <article key={m.id} className="space-y-3">
                      <p className="text-xs font-medium text-slate-500">
                        {m.from.name ?? m.from.email} · {formatListTime(m.receivedAt)}
                      </p>
                      <MailboxMessageBody message={m} />
                      <MessageExtras message={m} />
                    </article>
                  ))}
                </div>
              )}

              <div className="shrink-0 pb-5">
                <AttachmentsPanel message={primaryMessage} apiFetch={apiFetch} />
              </div>
            </div>
          </div>
        )}
      </section>
        </div>
      </div>
    </div>
  );
};

const MailboxMessageBody = ({ message, fill = false }: { message: MailboxMessage; fill?: boolean }) => {
  const html = mailboxMessageBodyHtml(message);
  if (html) {
    return (
      <MailboxIsolatedEmailHtml
        html={html}
        title={`Email from ${message.from.name ?? message.from.email}`}
        senderEmail={message.from.email}
        trustRemoteResources={message.internalSource != null}
        fill={fill}
        className="w-full"
        heightClass="h-[min(32rem,55vh)]"
      />
    );
  }

  return (
    <div className={fill ? "min-h-0 flex-1 overflow-y-auto" : undefined}>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{message.bodyText ?? message.snippet}</p>
    </div>
  );
};

const MessageExtras = ({ message }: { message: MailboxMessage }) => {
  const hasExtras = message.actionUrl != null || message.hasCalendarInvite;
  if (!hasExtras) return null;

  return (
    <div className="mt-3 shrink-0 space-y-3">
      {message.actionUrl ? (
        <Link to={message.actionUrl} className="inline-flex text-sm font-medium text-indigo-700 hover:underline">
          Open related record →
        </Link>
      ) : null}
      {message.hasCalendarInvite ? (
        <Link
          to="/admin/mailbox/calendar"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-700 hover:underline"
        >
          <Calendar className="h-4 w-4" aria-hidden />
          View in calendar
        </Link>
      ) : null}
    </div>
  );
};

const ActionButton = ({
  icon,
  label,
  disabled,
  tone = "default",
  onClick
}: {
  icon: ReactNode;
  label: string;
  disabled?: boolean;
  tone?: "default" | "danger" | "accept" | "tentative" | "decline";
  onClick?: () => void;
}) => (
  <button
    type="button"
    className={[
      "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40",
      tone === "danger" || tone === "decline"
        ? "text-rose-700 hover:bg-rose-50"
        : tone === "accept"
          ? "text-green-700 hover:bg-green-50"
          : tone === "tentative"
            ? "text-amber-700 hover:bg-amber-50"
            : "text-slate-600 hover:bg-slate-100"
    ].join(" ")}
    disabled={disabled}
    onClick={onClick}
  >
    {icon}
    <span>{label}</span>
  </button>
);

const MailboxInviteRsvpButtons = ({
  disabled,
  onRespond
}: {
  disabled?: boolean;
  onRespond: (response: "accepted" | "declined" | "tentative") => void;
}) => (
  <div className="flex min-w-0 shrink items-center gap-1">
    <ActionButton
      icon={<Check className="h-4 w-4" />}
      label="Accept"
      tone="accept"
      disabled={disabled}
      onClick={() => onRespond("accepted")}
    />
    <ActionButton
      icon={<Calendar className="h-4 w-4" />}
      label="Tentative"
      tone="tentative"
      disabled={disabled}
      onClick={() => onRespond("tentative")}
    />
    <ActionButton
      icon={<X className="h-4 w-4" />}
      label="Decline"
      tone="decline"
      disabled={disabled}
      onClick={() => onRespond("declined")}
    />
  </div>
);

const MailboxBulkTrashConfirmBar = ({
  action,
  busy,
  onCancel,
  onConfirm
}: {
  action: PendingBulkTrashAction;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) => {
  const message =
    action === "empty-trash" ? "Empty trash permanently" : "Delete items permanently";

  return (
    <div className="relative z-[1] flex min-h-[2.75rem] items-stretch border-b border-r border-slate-200 bg-amber-50">
      <div className="relative min-w-0 flex-1 border-r border-slate-200">
        <p className="flex min-h-[2.75rem] items-center px-3 text-sm font-medium text-slate-800 sm:px-4">
          {message}
        </p>
      </div>
      <div className="flex w-[9rem] shrink-0 self-stretch">
        <button
          type="button"
          title="Cancel"
          aria-label="Cancel"
          disabled={busy}
          onClick={onCancel}
          className={mailboxBulkConfirmBtnCancelClass}
        >
          <X className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2} />
        </button>
        <button
          type="button"
          title={action === "empty-trash" ? "Confirm empty trash" : "Confirm permanent delete"}
          aria-label={action === "empty-trash" ? "Confirm empty trash" : "Confirm permanent delete"}
          disabled={busy}
          onClick={onConfirm}
          className={mailboxBulkConfirmBtnConfirmClass}
        >
          <Check className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2} />
        </button>
      </div>
    </div>
  );
};

const formatAttachmentSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const AttachmentsPanel = ({
  message,
  apiFetch
}: {
  message: MailboxMessage;
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>;
}) => {
  const attachments = message.attachments ?? [];
  if (!message.hasAttachments && attachments.length === 0) return null;

  const download = async (attachmentId: string, filename: string) => {
    const res = await apiFetch(
      `/tenant/mailbox/messages/${message.id}/attachments/${attachmentId}`
    );
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50/40 p-4">
      <div className="flex items-center gap-2">
        <Paperclip className="h-4 w-4 text-slate-400" aria-hidden />
        <p className="text-sm font-medium text-slate-700">Attachments</p>
      </div>
      {attachments.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">This message has attachments.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {attachments.map((attachment) => (
            <li key={attachment.id}>
              <button
                type="button"
                className="inline-flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs hover:bg-slate-50"
                onClick={() => void download(attachment.id, attachment.filename)}
              >
                <span className="truncate font-medium text-slate-800">{attachment.filename}</span>
                <span className="shrink-0 text-slate-500">{formatAttachmentSize(attachment.sizeBytes)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const MailReadIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8" />
    <path d="M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);

const MailUnreadIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8" />
    <path d="M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    <circle cx="18" cy="6" r="3" fill="currentColor" stroke="none" />
  </svg>
);

const MailEmptyIcon = () => (
  <svg className="h-12 w-12 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
    <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8" />
    <path d="M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);
