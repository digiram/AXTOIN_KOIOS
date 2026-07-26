/**
 * Super Jobs page.
 *
 * Tenant super-admin screen mounted under AppShell at /super-admin.
 *
 * Responsibilities:
 * - Load and render primary super-admin data for the route
 * - Wire user actions to tenant API endpoints
 * - Compose shared module components and modals
 *
 * Related:
 * - Route: /super-admin
 *
 * Security:
 * - Tenant-scoped API calls via authenticated session
 */
import type { PlatformJobConcreteState, PlatformJobQueuesResponse, PlatformJobState } from "@starter/shared";
import { Activity, Filter, FlaskConical, List, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext.js";
import { useUserDisplayDatetime } from "../../hooks/useUserDisplayDatetime.js";
import { API_BASE_URL, apiWebSocketBaseUrl, formatApiUnreachableMessage } from "../../lib/api.js";
import { bindTableRowPrimaryAction, tableRowClickableClass } from "../../lib/tableRowAction.js";
import {
  fetchWithDevProxyWarmup,
  isViteDevProxyUpstreamDownStatus
} from "../../lib/dev-api-proxy-warmup.js";

const JOB_STATES: PlatformJobState[] = [
  "all",
  "waiting",
  "active",
  "delayed",
  "completed",
  "failed",
  "paused"
];

type QueueCounts = {
  waiting: number;
  active: number;
  delayed: number;
  completed: number;
  failed: number;
  paused: number;
  prioritized: number;
  waitingChildren: number;
};

type QueueSummary = {
  id: string;
  bullmqName: string;
  counts: QueueCounts;
};

type QueuesResponse = PlatformJobQueuesResponse;

type AdminJobRow = {
  id: string | number | undefined;
  name: string;
  state: PlatformJobConcreteState;
  timestamp: number;
  processedOn: number | null;
  finishedOn: number | null;
  attemptsMade: number;
  data: unknown;
  returnvalue: unknown;
  failedReason: string | null;
};

type JobsResponse = {
  jobs: AdminJobRow[];
  meta: { queueId: string; state: PlatformJobState; start: number; limit: number };
};

const stateLabel = (s: PlatformJobState): string => {
  switch (s) {
    case "all":
      return "All";
    case "waiting":
      return "Waiting";
    case "active":
      return "Active";
    case "delayed":
      return "Delayed";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "paused":
      return "Paused";
    default:
      return s;
  }
};

const filterSelectClass =
  "w-full min-w-[10rem] rounded-lg border border-stone-200/90 bg-white px-3 py-2.5 pr-9 text-sm text-stone-900 shadow-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/25";

/** Background poll when `QUEUE_STRATEGY=local` (no BullMQ WebSocket push). */
const LOCAL_QUEUE_JOBS_POLL_MS = 10_000;

/** Route page component for tenant super-admin under AppShell. */
export const SuperJobsPage = () => {
  const { getAccessToken, refreshSession, logout } = useAuth();
  const { formatDateTime } = useUserDisplayDatetime();
  const [searchParams, setSearchParams] = useSearchParams();

  /** Single queue today; URL `queue` reserved for future workers. */
  const queueId = "email" as const;
  const stateParam = searchParams.get("state");
  const state: PlatformJobState = JOB_STATES.includes(stateParam as PlatformJobState)
    ? (stateParam as PlatformJobState)
    : "all";
  const start = Math.max(0, Number(searchParams.get("start") ?? "0") || 0);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? "25") || 25));

  const [queuesData, setQueuesData] = useState<QueuesResponse | null>(null);
  const [queuesError, setQueuesError] = useState("");
  const [queuesLoading, setQueuesLoading] = useState(true);
  const [queueStrategy, setQueueStrategy] = useState<QueuesResponse["queueStrategy"] | null>(null);

  const [jobsData, setJobsData] = useState<JobsResponse | null>(null);
  const [jobsError, setJobsError] = useState("");
  const [jobsLoading, setJobsLoading] = useState(true);

  const [detailJob, setDetailJob] = useState<AdminJobRow | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [pollToken, setPollToken] = useState(0);
  const [testJobBusy, setTestJobBusy] = useState(false);
  const [testJobNotice, setTestJobNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const authHeaders = useCallback(() => {
    const token = getAccessToken();
    const h: Record<string, string> = {};
    if (token) h.authorization = `Bearer ${token}`;
    return h;
  }, [getAccessToken]);

  useEffect(() => {
    if (queueStrategy !== "external") return;

    const token = getAccessToken()?.trim();
    if (!token) return;

    let cancelled = false;
    let ws: WebSocket | undefined;

    void (async () => {
      try {
        const ticketRes = await fetch(`${API_BASE_URL}/platform/ws/ticket`, {
          method: "POST",
          headers: { ...authHeaders(), "content-type": "application/json" }
        });
        if (!ticketRes.ok || cancelled) return;
        const { ticket } = (await ticketRes.json()) as { ticket?: string };
        if (!ticket?.trim()) return;

        const url = `${apiWebSocketBaseUrl()}/platform/ws/job-queues?ticket=${encodeURIComponent(ticket)}`;
        ws = new WebSocket(url);
      } catch {
        return;
      }

      ws.onopen = () => {
        if (cancelled) {
          ws?.close(1000, "unmounted");
        }
      };

      ws.onmessage = (ev) => {
        try {
          const j = JSON.parse(String(ev.data)) as { type?: string };
          if (j.type === "job_queues_activity") {
            setRefreshToken((t) => t + 1);
          }
        } catch {
          /* ignore non-JSON */
        }
      };
    })();

    return () => {
      cancelled = true;
      if (ws?.readyState === WebSocket.OPEN) {
        try {
          ws.close(1000, "page leave");
        } catch {
          /* ignore */
        }
      }
    };
  }, [authHeaders, getAccessToken, queueStrategy]);

  useEffect(() => {
    if (queueStrategy !== "local") return;
    const id = window.setInterval(() => {
      setPollToken((t) => t + 1);
    }, LOCAL_QUEUE_JOBS_POLL_MS);
    return () => window.clearInterval(id);
  }, [queueStrategy]);

  const enqueueTestJob = useCallback(async () => {
    setTestJobNotice(null);
    setTestJobBusy(true);
    try {
      const url = `${API_BASE_URL}/platform/job-queues/${queueId}/test-job`;
      const postInit: RequestInit = {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: "{}"
      };
      let res = await fetchWithDevProxyWarmup(url, postInit);
      if (res.status === 401) {
        const ok = await refreshSession();
        if (!ok) {
          logout();
          setTestJobNotice({ kind: "err", text: "Session expired. Sign in again." });
          return;
        }
        res = await fetchWithDevProxyWarmup(url, postInit);
      }
      const raw = await res.text();
      let body: { jobId?: string; message?: string } = {};
      try {
        body = raw ? (JSON.parse(raw) as typeof body) : {};
      } catch {
        body = {};
      }
      if (!res.ok) {
        setTestJobNotice({
          kind: "err",
          text: body.message ?? `Enqueue failed (${res.status})`
        });
        return;
      }
      const jobId = body.jobId ? String(body.jobId) : "";
      setTestJobNotice({
        kind: "ok",
        text: jobId ? `Test job enqueued (id ${jobId}). Refresh lists or watch Active → Completed.` : "Test job enqueued."
      });
      setRefreshToken((t) => t + 1);
    } catch {
      setTestJobNotice({ kind: "err", text: "Could not reach the API." });
    } finally {
      setTestJobBusy(false);
    }
  }, [authHeaders, logout, queueId, refreshSession]);

  const jobsQueryString = useMemo(() => {
    const p = new URLSearchParams();
    p.set("state", state);
    p.set("start", String(start));
    p.set("limit", String(limit));
    return p.toString();
  }, [state, start, limit]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setQueuesError("");
      setQueuesLoading(true);
      try {
        const queuesUrl = `${API_BASE_URL}/platform/job-queues`;
        const queuesInit: RequestInit = { headers: authHeaders() };
        let res = await fetchWithDevProxyWarmup(queuesUrl, queuesInit);
        if (res.status === 401) {
          const ok = await refreshSession();
          if (!ok) {
            logout();
            return;
          }
          res = await fetchWithDevProxyWarmup(queuesUrl, queuesInit);
        }
        if (!res.ok) {
          if (isViteDevProxyUpstreamDownStatus(res.status)) {
            if (!cancelled) setQueuesError(formatApiUnreachableMessage(API_BASE_URL, res.status));
            return;
          }
          const body = (await res.json().catch(() => null)) as { message?: string } | null;
          if (!cancelled) setQueuesError(body?.message ?? "Could not load queue counts.");
          return;
        }
        const json = (await res.json()) as QueuesResponse;
        if (!cancelled) {
          setQueuesData(json);
          setQueueStrategy(json.queueStrategy);
        }
      } catch {
        if (!cancelled) setQueuesError("Could not load queue counts.");
      } finally {
        if (!cancelled) setQueuesLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [authHeaders, refreshSession, logout, refreshToken]);

  useEffect(() => {
    if (pollToken === 0) return;
    let cancelled = false;
    const load = async () => {
      try {
        const queuesUrl = `${API_BASE_URL}/platform/job-queues`;
        const queuesInit: RequestInit = { headers: authHeaders() };
        let res = await fetchWithDevProxyWarmup(queuesUrl, queuesInit);
        if (res.status === 401) {
          const ok = await refreshSession();
          if (!ok) {
            logout();
            return;
          }
          res = await fetchWithDevProxyWarmup(queuesUrl, queuesInit);
        }
        if (!res.ok) return;
        const json = (await res.json()) as QueuesResponse;
        if (!cancelled) {
          setQueuesData(json);
          setQueueStrategy(json.queueStrategy);
        }
      } catch {
        /* keep last good snapshot during background poll */
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [authHeaders, refreshSession, logout, pollToken]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setJobsError("");
      setJobsLoading(true);
      try {
        const url = `${API_BASE_URL}/platform/job-queues/${queueId}/jobs?${jobsQueryString}`;
        const jobsInit: RequestInit = { headers: authHeaders() };
        let res = await fetchWithDevProxyWarmup(url, jobsInit);
        if (res.status === 401) {
          const ok = await refreshSession();
          if (!ok) {
            logout();
            return;
          }
          res = await fetchWithDevProxyWarmup(url, jobsInit);
        }
        if (!res.ok) {
          if (isViteDevProxyUpstreamDownStatus(res.status)) {
            if (!cancelled) setJobsError(formatApiUnreachableMessage(API_BASE_URL, res.status));
            return;
          }
          const body = (await res.json().catch(() => null)) as { message?: string } | null;
          if (!cancelled) setJobsError(body?.message ?? "Could not load jobs.");
          return;
        }
        const json = (await res.json()) as JobsResponse;
        if (!cancelled) setJobsData(json);
      } catch {
        if (!cancelled) setJobsError("Could not load jobs.");
      } finally {
        if (!cancelled) setJobsLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [authHeaders, refreshSession, logout, queueId, jobsQueryString, refreshToken]);

  useEffect(() => {
    if (pollToken === 0) return;
    let cancelled = false;
    const load = async () => {
      try {
        const url = `${API_BASE_URL}/platform/job-queues/${queueId}/jobs?${jobsQueryString}`;
        const jobsInit: RequestInit = { headers: authHeaders() };
        let res = await fetchWithDevProxyWarmup(url, jobsInit);
        if (res.status === 401) {
          const ok = await refreshSession();
          if (!ok) {
            logout();
            return;
          }
          res = await fetchWithDevProxyWarmup(url, jobsInit);
        }
        if (!res.ok) return;
        const json = (await res.json()) as JobsResponse;
        if (!cancelled) setJobsData(json);
      } catch {
        /* keep last good snapshot during background poll */
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [authHeaders, refreshSession, logout, queueId, jobsQueryString, pollToken]);

  const setParam = useCallback(
    (updates: Record<string, string | undefined>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(updates)) {
            if (v === undefined || v === "") next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const selectedQueue = queuesData?.queues.find((q) => q.id === queueId) ?? null;

  const totalJobsForFilter = useMemo(() => {
    if (!selectedQueue) return 0;
    const c = selectedQueue.counts;
    if (state === "all") {
      return (
        c.waiting +
        c.active +
        c.delayed +
        c.completed +
        c.failed +
        c.paused +
        c.prioritized
      );
    }
    return c[state];
  }, [selectedQueue, state]);

  const slicePage = Math.floor(start / limit) + 1;
  const sliceTotalPages = Math.max(1, Math.ceil(totalJobsForFilter / limit));

  const jobsCountLabel = useMemo(() => {
    if (queuesLoading && !queuesData) return "Loading…";
    if (!selectedQueue) return "—";
    const n = totalJobsForFilter;
    return `${n.toLocaleString()} ${n === 1 ? "job" : "jobs"}`;
  }, [queuesLoading, queuesData, selectedQueue, totalJobsForFilter]);

  const formatTs = (ts: number | null | undefined) => {
    if (ts == null || ts <= 0) return "—";
    return formatDateTime(new Date(ts).toISOString());
  };

  useEffect(() => {
    if (!detailJob) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDetailJob(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [detailJob]);

  return (
    <div className="w-full min-w-0 max-w-none">
      <section className="rounded-2xl border border-amber-200/60 bg-amber-50/50 px-4 py-3 text-sm text-amber-950 sm:px-5">
        <p className="leading-relaxed">
          {queueStrategy === "local" ? (
            <>
              This view reads the SQL-backed job queue (<code className="rounded bg-amber-100/90 px-1 py-0.5 font-mono text-xs">QUEUE_STRATEGY=local</code>
              ). Queue counts and the job table refresh when you use Refresh, and automatically every{" "}
              {LOCAL_QUEUE_JOBS_POLL_MS / 1000} seconds while this page is open.
            </>
          ) : (
            <>
              This view reads BullMQ directly from Redis. Jobs enqueued with{" "}
              <code className="rounded bg-amber-100/90 px-1 py-0.5 font-mono text-xs">removeOnComplete</code> may not
              appear under Completed for long (or at all) after they finish. Queue counts and the job table refresh when
              you use Refresh, and also when BullMQ emits activity over the live WebSocket (same tab, super-admin
              session).
            </>
          )}
        </p>
      </section>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-stone-900">Queue overview</h2>
          {selectedQueue ? (
            <p className="mt-0.5 font-mono text-xs text-stone-500">{selectedQueue.bullmqName}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setRefreshToken((t) => t + 1)}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-stone-200 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 shadow-sm transition hover:bg-stone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/45"
          >
            <RefreshCw className="h-4 w-4 shrink-0 text-amber-800/90" aria-hidden strokeWidth={2} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void enqueueTestJob()}
            disabled={testJobBusy}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-stone-200 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 shadow-sm transition hover:bg-stone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/45 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <FlaskConical className="h-4 w-4 shrink-0 text-amber-800/90" aria-hidden strokeWidth={2} />
            {testJobBusy ? "Enqueueing…" : "Test"}
          </button>
        </div>
      </div>

      {testJobNotice ? (
        <p
          className={`mt-3 text-sm ${testJobNotice.kind === "ok" ? "text-emerald-800" : "text-rose-600"}`}
          role="status"
        >
          {testJobNotice.text}
        </p>
      ) : null}

      {queuesError ? (
        <p className="mt-3 text-sm text-rose-600" role="alert">
          {queuesError}
        </p>
      ) : null}

      {queuesLoading && !queuesData ? (
        <p className="mt-4 text-sm text-stone-500">Loading counts…</p>
      ) : selectedQueue ? (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {(
            [
              ["waiting", selectedQueue.counts.waiting],
              ["active", selectedQueue.counts.active],
              ["delayed", selectedQueue.counts.delayed],
              ["completed", selectedQueue.counts.completed],
              ["failed", selectedQueue.counts.failed],
              ["paused", selectedQueue.counts.paused],
              ["prioritized", selectedQueue.counts.prioritized]
            ] as const
          ).map(([key, n]) => (
            <div
              key={key}
              className="rounded-xl border border-stone-200/90 bg-white px-3 py-2 shadow-sm"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{key}</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums text-stone-900">{n.toLocaleString()}</p>
            </div>
          ))}
        </div>
      ) : null}

      <section
        className="mt-8 rounded-2xl border border-stone-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,15,15,0.06)] sm:p-6"
        aria-labelledby="super-jobs-filters-heading"
      >
        <div className="flex items-center gap-2 text-stone-800">
          <Filter className="h-5 w-5 text-amber-800/90" aria-hidden strokeWidth={2} />
          <h2 id="super-jobs-filters-heading" className="text-base font-semibold tracking-tight">
            Filters
          </h2>
        </div>

        <div className="mt-5 min-w-0 w-full">
          <label htmlFor="super-jobs-state" className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-stone-600">
            <Activity className="h-3.5 w-3.5 shrink-0 text-stone-500" aria-hidden strokeWidth={2} />
            Job state
          </label>
          <select
            id="super-jobs-state"
            value={state}
            onChange={(e) =>
              setParam({
                state: e.target.value,
                start: "0"
              })
            }
            className={filterSelectClass}
          >
            {JOB_STATES.map((s) => (
              <option key={s} value={s}>
                {stateLabel(s)}
              </option>
            ))}
          </select>
        </div>
      </section>

      {jobsError ? (
        <p className="mt-4 text-sm text-rose-600" role="alert">
          {jobsError}
        </p>
      ) : null}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium text-stone-600">{jobsCountLabel}</p>
        <div className="flex w-full justify-end sm:w-auto">
          <label htmlFor="super-jobs-pagesize" className="sr-only">
            Rows per page
          </label>
          <div
            className="inline-flex min-h-8 shrink-0 items-stretch overflow-hidden rounded-md border border-stone-200 bg-white text-xs shadow-sm"
            title="Rows per page"
          >
            <span
              className="flex items-center gap-1 border-r border-stone-200 bg-stone-50 px-2 py-1 font-medium text-stone-600"
              aria-hidden
            >
              <List className="h-3 w-3 shrink-0 text-stone-400" strokeWidth={2} aria-hidden />
              Rows
            </span>
            <select
              id="super-jobs-pagesize"
              value={String(limit)}
              onChange={(e) => setParam({ limit: e.target.value, start: "0" })}
              className="min-w-[4.25rem] cursor-pointer border-0 bg-white py-1 pl-2 pr-8 text-xs font-semibold tabular-nums text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400/45"
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="mt-3 w-full min-w-0 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[720px] table-auto border-collapse text-left text-sm divide-y divide-slate-200">
          <caption className="sr-only">
            {stateLabel(state)} jobs for queue {queueId}
          </caption>
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-slate-500">Job ID</th>
              <th className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-slate-500">Name</th>
              <th className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-slate-500">Attempts</th>
              <th className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-slate-500">Created</th>
              <th className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-slate-500">Finished</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {jobsLoading ? (
              <tr>
                <td colSpan={5} className="px-3 py-12 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : !jobsData?.jobs.length ? (
              <tr>
                <td colSpan={5} className="px-3 py-12 text-center text-slate-500">
                  No jobs in this slice. Try another state or offset.
                </td>
              </tr>
            ) : (
              jobsData.jobs.map((job, idx) => (
                <tr
                  key={String(job.id ?? idx)}
                  className={[idx % 2 === 0 ? "bg-white" : "bg-slate-50/40", "hover:bg-slate-100/80", tableRowClickableClass].join(
                    " "
                  )}
                  {...bindTableRowPrimaryAction({
                    onAction: () => setDetailJob(job),
                    ariaLabel: `View job ${String(job.id ?? "")}`,
                    role: "button"
                  })}
                >
                  <td className="max-w-[10rem] truncate px-3 py-2 font-mono text-xs" title={String(job.id ?? "")}>
                    {String(job.id ?? "—")}
                  </td>
                  <td className="max-w-[12rem] truncate px-3 py-2" title={job.name}>
                    {job.name}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{job.attemptsMade}</td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-600">
                    {formatTs(job.timestamp)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-600">
                    {formatTs(job.finishedOn)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!jobsLoading && jobsData ? (
        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-stone-600">
            {selectedQueue ? (
              <>
                Page <span className="font-medium text-stone-900">{slicePage}</span> of{" "}
                <span className="font-medium text-stone-900">{sliceTotalPages}</span>
                {jobsData.jobs.length === limit && start + limit < totalJobsForFilter ? (
                  <span className="text-stone-500">
                    {" · "}
                    {state === "all" ? "more jobs may exist — use Next" : "more in this state — use Next"}
                  </span>
                ) : null}
              </>
            ) : (
              "Browse jobs by offset."
            )}
          </p>
          <nav className="flex flex-wrap items-center gap-2" aria-label="Job list pagination">
            <button
              type="button"
              disabled={start <= 0 || jobsLoading}
              onClick={() => setParam({ start: String(Math.max(0, start - limit)) })}
              className="rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-800 shadow-sm transition hover:border-stone-300 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={jobsLoading || !jobsData.jobs.length || jobsData.jobs.length < limit}
              onClick={() => setParam({ start: String(start + limit) })}
              className="rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-800 shadow-sm transition hover:border-stone-300 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </nav>
        </div>
      ) : null}

      {detailJob ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          <div
            role="presentation"
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-[1px]"
            onClick={() => setDetailJob(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="super-job-detail-title"
            className="relative z-10 flex max-h-[min(90vh,40rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-[0_18px_50px_rgba(15,15,15,0.18)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-stone-100 px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <h2 id="super-job-detail-title" className="text-lg font-semibold tracking-tight text-stone-900">
                  Job detail
                </h2>
                <p className="mt-0.5 truncate font-mono text-xs text-stone-500" title={String(detailJob.id)}>
                  {detailJob.name} · ID {String(detailJob.id)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailJob(null)}
                className="shrink-0 rounded-lg border border-transparent p-2 text-stone-500 transition hover:border-stone-200 hover:bg-stone-50 hover:text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
              >
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-stone-500">State</dt>
                  <dd className="mt-0.5 font-medium text-stone-900">{stateLabel(detailJob.state)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-stone-500">Attempts</dt>
                  <dd className="mt-0.5 tabular-nums text-stone-900">{detailJob.attemptsMade}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-stone-500">Created</dt>
                  <dd className="mt-0.5 tabular-nums text-stone-800">{formatTs(detailJob.timestamp)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-stone-500">Processed</dt>
                  <dd className="mt-0.5 tabular-nums text-stone-800">{formatTs(detailJob.processedOn)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-stone-500">Finished</dt>
                  <dd className="mt-0.5 tabular-nums text-stone-800">{formatTs(detailJob.finishedOn)}</dd>
                </div>
              </dl>
              {detailJob.failedReason ? (
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">Failure</p>
                  <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-rose-200 bg-rose-50 p-3 font-mono text-xs text-rose-950">
                    {detailJob.failedReason}
                  </pre>
                </div>
              ) : null}
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Data</p>
                <pre className="mt-1 max-h-52 overflow-auto rounded-lg border border-stone-200 bg-stone-50 p-3 font-mono text-xs text-stone-800">
                  {JSON.stringify(detailJob.data, null, 2)}
                </pre>
              </div>
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Return value</p>
                <pre className="mt-1 max-h-40 overflow-auto rounded-lg border border-stone-200 bg-stone-50 p-3 font-mono text-xs text-stone-800">
                  {JSON.stringify(detailJob.returnvalue, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
