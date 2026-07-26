/**
 * Mailbox Sync Settings panel.
 *
 * Settings or detail panel segment within mailbox admin screens.
 *
 * Responsibilities:
 * - Render a subsection of configuration or read-only detail
 * - Persist changes through tenant API where editable
 *
 * Related:
 * - Route: /admin/mailbox
 *
 * Security:
 * - Editable fields require appropriate tenant admin or module role
 */
import { useCallback, useEffect, useState } from "react";
import { AlertCircle, ChevronDown, ChevronUp, Loader2, RefreshCw } from "lucide-react";

import type { MailboxAccountSyncStatus, MailboxConnection, MailboxSyncJobStatus } from "./mailboxTypes.js";
import { MailboxAccentStripe } from "./mailboxAccent.js";
import {
  isJobRunning,
  laneIsBusy,
  requestMailboxConnectionSync,
  useMailboxSyncPollTick
} from "./mailboxSyncActions.js";
import { mailboxSyncErrorSettingsMessage, connectionSupportsGuidedReconnect } from "./mailboxSyncErrors.js";
import { MailboxReconnectButton } from "./MailboxSyncErrorUi.js";
import { useMailboxApi } from "./useMailboxApi.js";

const statusBadgeClass = (status: string): string => {
  switch (status) {
    case "syncing":
      return "bg-indigo-50 text-indigo-800 ring-indigo-100";
    case "error":
      return "bg-red-50 text-red-800 ring-red-100";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
};

const jobStateLabel = (state: MailboxSyncJobStatus["state"]): string => {
  switch (state) {
    case "active":
      return "Running";
    case "waiting":
      return "Queued";
    case "delayed":
      return "Retry scheduled";
    case "completed":
      return "Done";
    case "failed":
      return "Failed";
    default:
      return state;
  }
};

const jobStateDotClass = (state: MailboxSyncJobStatus["state"]): string => {
  switch (state) {
    case "active":
      return "bg-indigo-500";
    case "waiting":
    case "delayed":
      return "bg-amber-400";
    case "completed":
      return "bg-emerald-500";
    case "failed":
      return "bg-red-500";
    default:
      return "bg-slate-300";
  }
};

const collectErrors = (status: MailboxAccountSyncStatus): string[] => {
  const errors: string[] = [];
  if (status.account.syncError) errors.push(status.account.syncError);
  if (status.calendar?.syncError) errors.push(status.calendar.syncError);
  for (const job of status.jobs) {
    if (job.failedReason) errors.push(`${job.label}: ${job.failedReason}`);
  }
  return errors;
};

const SyncJobRow = ({ job }: { job: MailboxSyncJobStatus }) => (
  <li className="flex items-start gap-3 rounded-md border border-slate-100 bg-slate-50/80 px-3 py-2">
    <span
      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${jobStateDotClass(job.state)} ${
        job.state === "active" ? "animate-pulse" : ""
      }`}
      aria-hidden
    />
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-slate-900">{job.label}</span>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
          {jobStateLabel(job.state)}
        </span>
      </div>
      {job.detail ? <p className="mt-0.5 text-xs text-slate-600">{job.detail}</p> : null}
      {job.failedReason ? (
        <p className="mt-1 text-xs text-red-700">{job.failedReason}</p>
      ) : null}
    </div>
    {job.state === "active" ? (
      <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-indigo-600" aria-hidden />
    ) : null}
  </li>
);

const SyncConnectionCard = ({
  connection,
  showConnectionAccents,
  formatDateTime,
  pollTick,
  onRequestFastPoll
}: {
  connection: MailboxConnection;
  showConnectionAccents: boolean;
  formatDateTime: (iso: string) => string;
  pollTick: number;
  onRequestFastPoll: () => void;
}) => {
  const { apiFetch } = useMailboxApi();
  const [status, setStatus] = useState<MailboxAccountSyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionInfo, setActionInfo] = useState("");
  const [errorsOpen, setErrorsOpen] = useState(
    () => connection.syncStatus === "error" && Boolean(connection.syncError)
  );
  const [fetchError, setFetchError] = useState("");

  const loadStatus = useCallback(async () => {
    try {
      const res = await apiFetch(`/tenant/mailbox/accounts/${connection.id}/sync-status`);
      if (!res.ok) {
        setFetchError("Could not load sync status.");
        return;
      }
      const json = (await res.json()) as MailboxAccountSyncStatus;
      setStatus(json);
      setFetchError("");
    } catch {
      setFetchError("Could not load sync status.");
    } finally {
      setLoading(false);
    }
  }, [apiFetch, connection.id]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus, pollTick]);

  const errors = [
    ...(actionError ? [actionError] : []),
    ...(fetchError ? [fetchError] : []),
    ...(status ? collectErrors(status) : [])
  ];

  useEffect(() => {
    if (errors.length > 0) setErrorsOpen(true);
  }, [errors.join("\u0000")]);
  const runningJobs = status?.jobs.filter(isJobRunning) ?? [];
  const overallBusy =
    laneIsBusy(status?.account) ||
    laneIsBusy(status?.calendar) ||
    runningJobs.length > 0 ||
    syncing;
  const visibleJobs =
    status?.jobs.filter((job) => isJobRunning(job) || job.state === "failed") ?? [];
  const showJobs = visibleJobs.length > 0 || overallBusy;

  const overallStatus =
    status?.account.syncStatus === "error" || status?.calendar?.syncStatus === "error"
      ? "error"
      : overallBusy
        ? "syncing"
        : (status?.account.syncStatus ?? connection.syncStatus);

  const handleSync = async () => {
    if (overallBusy) return;
    setSyncing(true);
    setActionError("");
    setActionInfo("");
    try {
      const result = await requestMailboxConnectionSync(apiFetch, connection.id);
      if (!result.ok) {
        setActionError("Could not start sync.");
        return;
      }
      if (!result.enqueued) {
        setActionInfo("A sync is already running for this account. See background jobs below.");
      } else {
        onRequestFastPoll();
      }
      await loadStatus();
    } catch {
      setActionError("Could not start sync.");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <li className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex">
        <MailboxAccentStripe color={connection.color} show={showConnectionAccents} className="rounded-none" />
        <div className="min-w-0 flex-1 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-slate-900">{connection.displayName}</p>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${statusBadgeClass(overallStatus)}`}
            >
              {overallStatus === "syncing" ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              ) : null}
              {overallStatus === "error" ? <AlertCircle className="h-3 w-3" aria-hidden /> : null}
              {overallStatus}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {connection.connectionType}
            {connection.emailAddress ? ` · ${connection.emailAddress}` : ""}
          </p>
        </div>
        <button
          type="button"
          disabled={overallBusy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-indigo-700 shadow-sm transition-colors hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => void handleSync()}
        >
          {overallBusy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Syncing…
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4" aria-hidden />
              Sync now
            </>
          )}
        </button>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-slate-100 bg-slate-50/50 px-3 py-2">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Email last sync</dt>
          <dd className="mt-0.5 text-sm text-slate-900">
            {loading
              ? "…"
              : status?.account.lastSyncedAt
                ? formatDateTime(status.account.lastSyncedAt)
                : "Never"}
          </dd>
        </div>
        {connection.provider === "gmail" || connection.provider === "microsoft" ? (
          <div className="rounded-md border border-slate-100 bg-slate-50/50 px-3 py-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Calendar last sync</dt>
            <dd className="mt-0.5 text-sm text-slate-900">
              {loading
                ? "…"
                : status?.calendar?.lastSyncedAt
                  ? formatDateTime(status.calendar.lastSyncedAt)
                  : status?.calendar
                    ? "Not synced yet"
                    : "—"}
            </dd>
          </div>
        ) : null}
      </dl>

      {actionInfo ? <p className="mt-3 text-sm text-indigo-800">{actionInfo}</p> : null}

      {connection.syncStatus === "error" && connection.syncError ? (
        <div className="mt-4 rounded-md border border-amber-200/80 bg-amber-50 px-3 py-2.5 text-sm leading-relaxed text-amber-950" role="status">
          <p>{mailboxSyncErrorSettingsMessage(connection)}</p>
          {connectionSupportsGuidedReconnect(connection) ? (
            <div className="mt-2">
              <MailboxReconnectButton
                connection={connection}
                className="inline-flex items-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-950 shadow-sm transition-colors hover:bg-amber-100/80 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {fetchError && !errors.includes(fetchError) ? (
        <p className="mt-3 text-sm text-red-700">{fetchError}</p>
      ) : null}

      {showJobs ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Background jobs</p>
          {visibleJobs.length > 0 ? (
            <ul className="mt-2 space-y-2">
              {visibleJobs.map((job) => (
                <SyncJobRow key={job.jobId} job={job} />
              ))}
            </ul>
          ) : overallBusy ? (
            <p className="mt-2 text-xs text-slate-600">
              Sync is in progress for this account. Job details will appear here shortly.
            </p>
          ) : null}
        </div>
      ) : loading ? (
        <p className="mt-4 text-xs text-slate-500">Loading job status…</p>
      ) : (
        <p className="mt-4 text-xs text-slate-500">No background jobs queued for this account.</p>
      )}

      {errors.length > 0 ? (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50/60">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium text-red-900"
            onClick={() => setErrorsOpen((open) => !open)}
            aria-expanded={errorsOpen}
          >
            <span className="inline-flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
              {errors.length} sync {errors.length === 1 ? "error" : "errors"}
            </span>
            {errorsOpen ? (
              <ChevronUp className="h-4 w-4 shrink-0" aria-hidden />
            ) : (
              <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
            )}
          </button>
          {errorsOpen ? (
            <ul className="border-t border-red-200 px-3 py-2 text-xs text-red-800">
              {errors.map((error, index) => (
                <li key={`${index}-${error.slice(0, 24)}`} className="py-1">
                  {error}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
        </div>
      </div>
    </li>
  );
};

/** Panel segment within mailbox settings or detail screens. */
export const MailboxSyncSettingsPanel = ({
  connections,
  showConnectionAccents,
  formatDateTime,
  pollTick,
  onRequestFastPoll
}: {
  connections: MailboxConnection[];
  showConnectionAccents: boolean;
  formatDateTime: (iso: string) => string;
  pollTick: number;
  onRequestFastPoll: () => void;
}) => (
  <div className="mx-auto w-4/5 min-w-[80%] space-y-4">
    <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-4">
      <h3 className="text-sm font-semibold text-slate-900">Background sync</h3>
      <p className="mt-1 text-sm text-slate-600">
        Email and calendar sync runs automatically in the platform worker (about every 5 minutes per
        account). Use <strong>Sync now</strong> on a connection below to enqueue an immediate run.
      </p>
    </div>

    {connections.length === 0 ? (
      <p className="text-sm text-slate-500">Connect an email account to see background sync status.</p>
    ) : (
      <ul className="space-y-4">
        {connections.map((connection) => (
          <SyncConnectionCard
            key={connection.id}
            connection={connection}
            showConnectionAccents={showConnectionAccents}
            formatDateTime={formatDateTime}
            pollTick={pollTick}
            onRequestFastPoll={onRequestFastPoll}
          />
        ))}
      </ul>
    )}
  </div>
);

export { useMailboxSyncPollTick } from "./mailboxSyncActions.js";
