/**
 * Mailbox Sync Actions.
 *
 * Reusable mailbox UI building block: mailbox Sync Actions.
 *
 * Responsibilities:
 * - Encapsulate a focused interaction or form segment
 * - Keep parent pages thin by isolating validation and presentation
 *
 * Related:
 * - Route: /admin/mailbox
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { MailboxAccountSyncStatus, MailboxConnection, MailboxSyncJobStatus } from "./mailboxTypes.js";

const POLL_MS = 4_000;
const FAST_POLL_MS = 1_500;
const FAST_POLL_DURATION_MS = 30_000;

/** React component for mailbox UI. */
export type MailboxSyncRequestResult = {
  ok: boolean;
  enqueued: boolean;
};

/** Shared constant or class token for mailbox presentation. */
export const isJobRunning = (job: MailboxSyncJobStatus): boolean =>
  job.state === "active" || job.state === "waiting" || job.state === "delayed";

/** Shared constant or class token for mailbox presentation. */
export const laneIsBusy = (lane: { syncStatus: string } | null | undefined): boolean =>
  lane?.syncStatus === "syncing";

/** Shared constant or class token for mailbox presentation. */
export const isMailboxAccountSyncBusy = (status: MailboxAccountSyncStatus): boolean => {
  const runningJobs = status.jobs.filter(isJobRunning);
  return laneIsBusy(status.account) || laneIsBusy(status.calendar) || runningJobs.length > 0;
};

/** Shared constant or class token for mailbox presentation. */
export const externalMailboxConnections = (connections: MailboxConnection[]): MailboxConnection[] =>
  connections.filter((connection) => !connection.isSystemNotifications);

/** Shared constant or class token for mailbox presentation. */
export const resolveMailboxSyncTargets = (
  connections: MailboxConnection[],
  connectionFilterId: string | null
): MailboxConnection[] => {
  const external = externalMailboxConnections(connections);
  if (connectionFilterId) {
    const match = external.find((connection) => connection.id === connectionFilterId);
    return match ? [match] : [];
  }
  return external;
};

/** Shared constant or class token for mailbox presentation. */
export const requestMailboxConnectionSync = async (
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>,
  connectionId: string
): Promise<MailboxSyncRequestResult> => {
  try {
    const res = await apiFetch(`/tenant/mailbox/accounts/${connectionId}/sync`, { method: "POST" });
    if (!res.ok) return { ok: false, enqueued: false };
    const body = (await res.json()) as { enqueued?: boolean };
    return { ok: true, enqueued: body.enqueued !== false };
  } catch {
    return { ok: false, enqueued: false };
  }
};

/** Shared constant or class token for mailbox presentation. */
export const requestMailboxConnectionReconnect = async (
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>,
  connectionId: string
): Promise<{ ok: boolean; message?: string }> => {
  try {
    const res = await apiFetch(`/tenant/mailbox/accounts/${connectionId}/reconnect/start`, {
      method: "POST"
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      return {
        ok: false,
        message: body?.message ?? "Could not start reconnect. Please try again."
      };
    }
    const body = (await res.json()) as { url: string };
    window.location.href = body.url;
    return { ok: true };
  } catch {
    return { ok: false, message: "Could not start reconnect. Please try again." };
  }
};

/** Shared constant or class token for mailbox presentation. */
export const fetchMailboxConnectionsSyncBusy = async (
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>,
  connections: MailboxConnection[]
): Promise<boolean> => {
  for (const connection of connections) {
    const res = await apiFetch(`/tenant/mailbox/accounts/${connection.id}/sync-status`);
    if (!res.ok) continue;
    const status = (await res.json()) as MailboxAccountSyncStatus;
    if (isMailboxAccountSyncBusy(status)) return true;
  }
  return false;
};

/** Poll tick while sync status should be observed (settings panel, inbox toolbar). */
export const useMailboxSyncPollTick = (enabled: boolean): { tick: number; requestFastPoll: () => void } => {
  const [tick, setTick] = useState(0);
  const fastUntilRef = useRef(0);

  const requestFastPoll = useCallback(() => {
    fastUntilRef.current = Date.now() + FAST_POLL_DURATION_MS;
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let timeoutId = 0;
    const schedule = () => {
      const delay = Date.now() < fastUntilRef.current ? FAST_POLL_MS : POLL_MS;
      timeoutId = window.setTimeout(() => {
        setTick((t) => t + 1);
        schedule();
      }, delay);
    };
    schedule();
    return () => window.clearTimeout(timeoutId);
  }, [enabled]);

  return { tick, requestFastPoll };
};
